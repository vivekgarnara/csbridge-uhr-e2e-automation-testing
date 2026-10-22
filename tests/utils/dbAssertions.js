import { Pool } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import { buildFullTableName } from './eventTestHelper.js';

try {
  oracledb.initOracleClient({ libDir: 'D:\\instantclient-basic-windows.x64-19.30.0.0.0dbru\\instantclient_19_30' });
} catch (err) {
  if (!err.message?.includes('already been initialized')) {
    console.warn('[OracleService] Thick-mode init skipped:', err.Message);
  }
}

/**
 * Oracle counts each :placeholder separately; repeated $1 must map to one named bind.
 */
export function toOracleBinds(sql, params = []) {
  const indexToName = new Map();
  const oracleSql = sql.replace(/\$(\d+)/g, (_, num) => {
    const idx = parseInt(num, 10) - 1;
    if (!indexToName.has(idx)) {
      indexToName.set(idx, `p${idx}`);
    }
    return `:${indexToName.get(idx)}`;
  });
  const binds = {};
  for (const [idx, name] of indexToName.entries()) {
    binds[name] = params[idx];
  }
  return { oracleSql, binds };
}

export class DbAssertions {
  constructor(dbConfig, providerType = 'default') {
    this.dbConfig = dbConfig;
    this.providerType = providerType;
    this.pgPool = null;
    this.mssqlPool = null;
    this.oracleConn = null;
    this.mysqlPool = null;
  }

  isEnhancedMode() {
    const pt = (this.providerType || 'default').toLowerCase();
    return pt === 'enhanced' || pt === 'enhanced_auto';
  }

  async connect() {
    if (this.dbConfig.type === 'oracle') {
      if (!this.oracleConn) {
        this.oracleConn = await oracledb.getConnection({
          user: this.dbConfig.user,
          password: this.dbConfig.password,
          connectString: `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`
        });
      }
      return;
    }

    if (this.dbConfig.type === 'mssql') {
      if (!this.mssqlPool) {
        const hostParts = this.dbConfig.host.split('\\');
        const server = hostParts[0];
        const instanceName = hostParts[1];
        this.mssqlPool = new mssql.ConnectionPool({
          user: this.dbConfig.user,
          password: this.dbConfig.password,
          server,
          port: this.dbConfig.port,
          database: this.dbConfig.database,
          options: {
            encrypt: false,
            trustServerCertificate: true,
            instanceName
          }
        });
        await this.mssqlPool.connect();
      }
      return;
    }

    if (this.dbConfig.type === 'mysql') {
      if (!this.mysqlPool) {
        const mysql = await import('mysql2/promise');
        this.mysqlPool = mysql.createPool({
          host: this.dbConfig.host,
          port: this.dbConfig.port,
          database: this.dbConfig.database,
          user: this.dbConfig.user,
          password: this.dbConfig.password,
          waitForConnections: true,
          connectionLimit: 5,
          queueLimit: 0
        });
      }
      return;
    }

    if (!this.pgPool) {
      this.pgPool = new Pool(this.dbConfig);
    }
  }

  async close() {
    if (this.oracleConn) {
      await this.oracleConn.close();
      this.oracleConn = null;
    }
    if (this.mssqlPool) {
      await this.mssqlPool.close();
      this.mssqlPool = null;
    }
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.mysqlPool) {
      await this.mysqlPool.end();
      this.mysqlPool = null;
    }
  }

  async query(sql, params = []) {
    await this.connect();

    if (this.dbConfig.type === 'oracle') {
      const { oracleSql, binds } = toOracleBinds(sql, params);
      const result = await this.oracleConn.execute(oracleSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true
      });
      return result.rows || [];
    }

    if (this.dbConfig.type === 'mssql') {
      const request = this.mssqlPool.request();
      params.forEach((param, index) => {
        request.input(`p${index}`, param);
      });
      const mssqlSql = sql.replace(/\$(\d+)/g, (_, n) => `@p${parseInt(n, 10) - 1}`);
      const result = await request.query(mssqlSql);
      return result.recordset || [];
    }

    if (this.dbConfig.type === 'mysql') {
      let mysqlSql = sql.replace(/\$(\d+)/g, '?');
      mysqlSql = mysqlSql.replace(
        /(nphies_[a-z0-9_]+|uhr_[a-z0-9_]+|nphiesencounterhospitalization|uhr_encounterhospitalization)/gi,
        match => match.toUpperCase()
      );
      const [rows] = await this.mysqlPool.execute(mysqlSql, params);
      return rows || [];
    }

    const client = await this.pgPool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async verifyEventByProvClaimNo(provClaimNo, eventType, limit = 1) {
    const eventsTable = buildFullTableName(this.dbConfig, this.providerType, 'events');
    const idCol = this.isEnhancedMode() ? 'visitID' : 'provclaimno';
    const isUhr = this.isEnhancedMode();
    const colCreatedDate = isUhr || this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql'
      ? 'CREATED_DATE'
      : 'createddate';

    if (this.dbConfig.type === 'oracle') {
      // Oracle requires a distinct bind for each :N placeholder (no reuse).
      const sql = `
        SELECT * FROM (
          SELECT * FROM ${eventsTable}
          WHERE UPPER(eventtype) = UPPER(:eventType)
            AND ${idCol} = :provClaimNo
          ORDER BY ${colCreatedDate} DESC
        ) WHERE ROWNUM <= :maxRows`;
      await this.connect();
      const result = await this.oracleConn.execute(
        sql,
        { eventType, provClaimNo, maxRows: limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows || [];
    }

    if (this.dbConfig.type === 'mssql') {
      const sql = `
        SELECT TOP ($3) * FROM ${eventsTable}
        WHERE UPPER(eventtype) = UPPER($1)
          AND (${idCol} = $2 OR provclaimno = $2 OR PROVCLAIMNO = $2)
        ORDER BY ${colCreatedDate} DESC`;
      return this.query(sql, [eventType, provClaimNo, limit]);
    }

    const sql = `
      SELECT * FROM ${eventsTable}
      WHERE UPPER(eventtype) = UPPER($1)
        AND (provclaimno = $2 OR PROVCLAIMNO = $2)
      ORDER BY ${colCreatedDate} DESC
      LIMIT $3`;
    return this.query(sql, [eventType, provClaimNo, limit]);
  }

  async verifyEventCreated(eventType, limit = 1) {
    const eventsTable = buildFullTableName(this.dbConfig, this.providerType, 'events');
    const isUhr = this.isEnhancedMode();
    const colCreatedDate = isUhr || this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql'
      ? 'CREATED_DATE'
      : 'createddate';

    if (this.dbConfig.type === 'oracle') {
      const sql = `
        SELECT * FROM (
          SELECT * FROM ${eventsTable}
          WHERE eventtype = :eventType
          ORDER BY ${colCreatedDate} DESC
        ) WHERE ROWNUM <= :maxRows`;
      await this.connect();
      const result = await this.oracleConn.execute(
        sql,
        { eventType, maxRows: limit },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows || [];
    }

    if (this.dbConfig.type === 'mssql') {
      const sql = `
        SELECT TOP ($2) * FROM ${eventsTable}
        WHERE eventtype = $1
        ORDER BY ${colCreatedDate} DESC`;
      return this.query(sql, [eventType, limit]);
    }

    const sql = `
      SELECT * FROM ${eventsTable}
      WHERE eventtype = $1
      ORDER BY ${colCreatedDate} DESC
      LIMIT $2`;
    return this.query(sql, [eventType, limit]);
  }
}
