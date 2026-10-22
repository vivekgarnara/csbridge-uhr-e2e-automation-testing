import { faker } from '@faker-js/faker';
import { Pool } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getScenarioConfig } from '../eventRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Oracle Thick mode client if config provided
if (process.env.ORACLE_CLIENT_LIB) {
  try {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB });
  } catch (err) {
    if (err.message && !err.message.includes('already been initialized')) {
      console.warn('Oracle Thick mode init failed:', err.message);
    }
  }
} else {
  try {
    const libDir = path.resolve(__dirname, '..', 'electron', 'oracle_instantclient_18_5');
    oracledb.initOracleClient({ libDir });
  } catch (err) {
    if (err.message && !err.message.includes('already been initialized')) {
      if (process.env.ORACLE_DEBUG === '1') {
        console.warn('Oracle Thick mode unavailable, using Thin mode:', err.message);
      }
    }
  }
}

// Constants
const CONSTANTS = {
  DOCUMENT_ID: '30511223344557',
  PROVIDER_NPHIES_ID: '15000000112233',
  PHYSICIAN_ID: '00TEST1980',
};

const HOSPITAL_DISCHARGE_DISPOSITION_LOV = [
  'Discharge/transfer to an Acute Hospital',
  'Statistical Discharge-Type Change',
  'Statistical discharge from leave',
  'Home/Other',
  'Discharge/Transfer to a Residential Ageing Service',
  'Discharge/Transfer to a Psychiatric Hospital',
  'Discharge/Transfer to Other Health Care Accommodation',
  'Left Against Medical Advice',
  'Died',
  'Patient still in hospital',
];

const EMERGENCY_DEPARTMENT_DISPOSITION_LOV = [
  'Admitted to this hospital',
  'Non-admitted patient ED episode completed-departed',
  'Non-admitted patient ED episode completed-referred',
  'Did Not Wait',
  'Left at Own Risk',
  'Died in ED',
  'Dead on Arrival',
  'Registered',
];

class PostgresClient {
  constructor(client) {
    this.client = client;
  }
  async query(sql, params) { return this.client.query(sql, params); }
  async release() { this.client.release(); }
  async beginTransaction() { await this.client.query('BEGIN'); }
  async commit() { await this.client.query('COMMIT'); }
  async rollback() { await this.client.query('ROLLBACK'); }
}

class OracleClient {
  constructor(connection) {
    this.connection = connection;
  }

  formatDate(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} `
      + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  }

  convertParams(params) {
    return params.map(p => {
      if (p instanceof Date) return this.formatDate(p);
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }

  async query(sql, params) {
    let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    const converted = params ? this.convertParams(params) : [];
    const dateIndices = params
      ? params.reduce((acc, p, i) => { if (p instanceof Date) acc.push(i + 1); return acc; }, [])
      : [];
    for (const idx of dateIndices) {
      oracleSql = oracleSql.replace(
        new RegExp(`:${idx}(?![0-9])`, 'g'),
        `TO_TIMESTAMP(:${idx}, 'YYYY-MM-DD HH24:MI:SS')`
      );
    }
    return this.connection.execute(oracleSql, converted, { autoCommit: false });
  }

  async release() { }
  async beginTransaction() { }
  async commit() { await this.connection.commit(); }
  async rollback() { await this.connection.rollback(); }
}

class SqlServerClient {
  transaction = null;
  constructor(pool) {
    this.pool = pool;
  }

  async query(sql, params) {
    const req = this.transaction ? this.transaction.request() : this.pool.request();
    if (params) {
      // Find the index of 'supportingattachment' if inserting into claimsupportinginfo
      let supportingAttachmentIndex = -1;
      const insertMatch = sql.match(/insert\s+into\s+[^(]+\(([^)]+)\)/i);
      if (insertMatch) {
        const columns = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
        supportingAttachmentIndex = columns.indexOf('supportingattachment');
      }

      params.forEach((p, i) => {
        if (i === supportingAttachmentIndex) {
          req.input(`p${i}`, mssql.VarBinary, p);
        } else {
          req.input(`p${i}`, p);
        }
      });
    }
    return req.query(sql.replace(/\$(\d+)/g, (_, n) => `@p${parseInt(n) - 1}`));
  }

  async release() { }
  async beginTransaction() {
    this.transaction = new mssql.Transaction(this.pool);
    await this.transaction.begin();
  }
  async commit() {
    if (this.transaction) { await this.transaction.commit(); this.transaction = null; }
  }
  async rollback() {
    if (this.transaction) { await this.transaction.rollback(); this.transaction = null; }
  }
}

class MysqlClient {
  constructor(connection) {
    this.connection = connection;
  }
  async query(sql, params) {
    let mysqlSql = sql.replace(/\$(\d+)/g, '?');
    mysqlSql = mysqlSql.replace(
      /(nphies_[a-z0-9_]+|uhr_[a-z0-9_]+|nphiesencounterhospitalization|uhr_encounterhospitalization)/gi,
      match => match.toUpperCase()
    );
    const [rows] = await this.connection.execute(mysqlSql, params || []);
    return { rows };
  }
  async release() {
    if (typeof this.connection.release === 'function') {
      await this.connection.release();
    } else {
      await this.connection.end();
    }
  }
  async beginTransaction() {
    await this.connection.beginTransaction();
  }
  async commit() {
    await this.connection.commit();
  }
  async rollback() {
    await this.connection.rollback();
  }
}

export class CdaDataGenerator {
  pgPool = null;
  mssqlPool = null;
  oracleConn = null;
  mysqlPool = null;
  providerType = 'default';

  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    if (this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql') {
      this.schemaPrefix = '';
    } else {
      this.schemaPrefix = 'midtable_nphies.';
    }
    if (this.dbConfig.type === 'postgres' || !this.dbConfig.type) {
      this.pgPool = new Pool(dbConfig);
    }
  }

  get tablePrefix() {
    return this.isEnhancedMode() ? 'uhr_' : 'nphies_';
  }

  isAutoMode() {
    return this.providerType === 'default_auto' || this.providerType === 'enhanced_auto';
  }

  isEnhancedMode() {
    return this.providerType === 'enhanced' || this.providerType === 'enhanced_auto';
  }

  isDefaultPlusMode() {
    return this.providerType === 'default_plus' || this.providerType === 'default-plus';
  }

  tbl(name) {
    const prefix = this.tablePrefix;
    if (name === 'encounterhospitalization') {
      return `${this.schemaPrefix}${prefix === 'nphies_' ? 'nphiesencounterhospitalization' : 'uhr_encounterhospitalization'}`;
    }
    return `${this.schemaPrefix}${prefix}${name}`;
  }

  truncate(value, maxLength) {
    const v = value ?? '';
    return v.length > maxLength ? v.substring(0, maxLength) : v;
  }

  generateId(prefix, length = 15) {
    const numeric = faker.string.numeric(Math.max(1, length - prefix.length));
    return `${prefix}${numeric}`.substring(0, length);
  }

  generateProvClaimNo(scenarioId = '') {
    const base = scenarioId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const random = faker.string.alphanumeric(5).toUpperCase();
    const timestamp = Date.now().toString().slice(-7);
    return `CLM${base}${random}${timestamp}`.substring(0, 40);
  }

  async getClient() {
    if (this.dbConfig.type === 'oracle') {
      if (!this.oracleConn) {
        this.oracleConn = await oracledb.getConnection({
          user: this.dbConfig.user,
          password: this.dbConfig.password,
          connectString: `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`,
        });
      }
      return new OracleClient(this.oracleConn);
    }

    if (this.dbConfig.type === 'mssql') {
      if (!this.mssqlPool) {
        const parts = this.dbConfig.host.split('\\');
        this.mssqlPool = new mssql.ConnectionPool({
          user: this.dbConfig.user, password: this.dbConfig.password,
          server: parts[0], port: this.dbConfig.port, database: this.dbConfig.database,
          options: { encrypt: false, trustServerCertificate: true, instanceName: parts[1] },
        });
        await this.mssqlPool.connect();
      }
      return new SqlServerClient(this.mssqlPool);
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
          connectionLimit: 10,
          queueLimit: 0
        });
      }
      const connection = await this.mysqlPool.getConnection();
      return new MysqlClient(connection);
    }

    if (!this.pgPool) this.pgPool = new Pool(this.dbConfig);
    return new PostgresClient(await this.pgPool.connect());
  }

  async testConnection() {
    let client = null;
    try {
      client = await this.getClient();
      await client.query(this.dbConfig.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1');
      await client.release();
      return true;
    } catch (err) {
      console.error('CDA DB connection failed:', err.message);
      if (client) try { await client.release(); } catch (_) { }
      return false;
    }
  }

  async generateData(config) {
    this.providerType = config.providerType || 'default';
    const selectedCdaEvents = config.eventTypes || [];
    const scenarioId = config.scenario?.id || '';

    let client = null;
    let eventsCreated = 0;
    let failedEvents = 0;
    let lastError = null;
    let payload = undefined;
    const generatedProvClaimNos = [];

    try {
      client = await this.getClient();

      if (config.customPayload) {
        if (config.numberOfEvents > 1) {
          let eventsCreated = 0;
          const generatedProvClaimNos = [];
          for (let i = 0; i < config.numberOfEvents; i++) {
            const res = await this.insertCustomPayload(client, {
              ...config,
              customPayload: JSON.parse(JSON.stringify(config.customPayload))
            });
            if (res.success) {
              eventsCreated++;
              console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);
              if (res.generatedProvClaimNos) {
                generatedProvClaimNos.push(...res.generatedProvClaimNos);
              }
            }
          }
          return {
            success: eventsCreated > 0,
            message: `Successfully created ${eventsCreated} CDA custom record(s) in bulk.`,
            eventsCreated,
            generatedProvClaimNos
          };
        } else {
          return await this.insertCustomPayload(client, config);
        }
      }

      const firstEventType = config.eventTypes?.[0];
      if (firstEventType) {
        this.scenarioRules = getScenarioConfig(
          firstEventType,
          config.scenarioId,
          config.scenarioDescription || ''
        );
        this.scenarioId = config.scenarioId;
        this.scenarioDescription = config.scenarioDescription;
        const customPayload = this.loadTemplateAsCustomPayload(firstEventType, config.scenarioId, config.scenarioDescription);
        if (customPayload) {
          this.applyScenarioOverridesToCustomPayload(customPayload, firstEventType);
          if (config.numberOfEvents > 1) {
            let eventsCreated = 0;
            const generatedProvClaimNos = [];
            const batchSize = 1000;
            await client.beginTransaction();
            try {
              for (let i = 0; i < config.numberOfEvents; i++) {
                const res = await this.insertCustomPayload(client, {
                  ...config,
                  insertEventRow: this.scenarioRules?.insertEventRow,
                  skipTransaction: true,
                  customPayload: JSON.parse(JSON.stringify(customPayload))
                });
                if (res.success) {
                  eventsCreated++;
                  console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);
                  if (res.generatedProvClaimNos) {
                    generatedProvClaimNos.push(...res.generatedProvClaimNos);
                  }
                }
                if ((i + 1) % batchSize === 0 && (i + 1) < config.numberOfEvents) {
                  await client.commit();
                  await client.beginTransaction();
                }
              }
              await client.commit();
            } catch (err) {
              await client.rollback();
              throw err;
            }
            return {
              success: eventsCreated > 0,
              message: `Successfully created ${eventsCreated} CDA record(s) in bulk.`,
              eventsCreated,
              generatedProvClaimNos
            };
          } else {
            return await this.insertCustomPayload(client, {
              ...config,
              insertEventRow: this.scenarioRules?.insertEventRow,
              customPayload
            });
          }
        }
      }

      for (let i = 0; i < config.numberOfEvents; i++) {
        try {
          await client.beginTransaction();
          const provClaimNo = this.generateProvClaimNo(scenarioId);
          const cdaEventType = selectedCdaEvents[Math.floor(Math.random() * selectedCdaEvents.length)];

          // Determine subType (Institutional IMP path by default)
          const subType = 'institutional';

          // ── 1. Create Event Row (if not auto mode) ──
          if (!this.isAutoMode()) {
            const rules = getScenarioConfig(cdaEventType, scenarioId, config.scenario?.description || '');
            const shouldInsertEventRow = rules.insertEventRow !== false;
            if (shouldInsertEventRow) {
              await this.createEvent(client, provClaimNo, cdaEventType);
            }
          }

          // ── 2. Run Generation ──
          const record = await this.insertForEvent(client, provClaimNo, cdaEventType, subType);

          if (config.isDraft) {
            payload = this.buildCdaPayload(cdaEventType, provClaimNo, record);
            await client.rollback();
            eventsCreated++;
            generatedProvClaimNos.push(provClaimNo);
            console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);
            continue;
          }

          await client.commit();
          eventsCreated++;
          generatedProvClaimNos.push(provClaimNo);
          console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);

          if (config.numberOfEvents === 1 && !config.skipWritePayload) {
            payload = this.buildCdaPayload(cdaEventType, provClaimNo, record);
          } else {
            payload = 'you can show sample json for 1 event only at a time';
          }
        } catch (iterErr) {
          try { await client.rollback(); } catch (_) { }
          console.error(`[CDA] Error generating event ${i + 1}:`, iterErr.message);
          lastError = iterErr;
          failedEvents++;
        }
      }

      return {
        success: eventsCreated > 0,
        message: `Successfully created ${eventsCreated} CDA record(s).`
          + (failedEvents > 0 ? ` Failed: ${failedEvents}. Last error: ${lastError?.message}` : ''),
        eventsCreated,
        generatedProvClaimNos,
        payload,
      };
    } catch (fatalErr) {
      console.error('[CDA] Fatal error:', fatalErr.message);
      return { success: false, message: `Fatal Error: ${fatalErr.message}`, eventsCreated: 0, generatedProvClaimNos: [] };
    } finally {
      if (client) await client.release();
    }
  }

  async insertForEvent(client, provClaimNo, cdaEventType, subType) {
    const record = await this._insertForEventRaw(client, provClaimNo, cdaEventType, subType);

    if (this.isDefaultPlusMode() && record) {
      // 30% chance for pregnancy details
      if (Math.random() < 0.3) {
        await this.createPregnancyDetails(client, provClaimNo, new Date());
      }
      // Populate medication/dosage or procedure child tables based on the claim item
      if (record.claimItem) {
        const item = record.claimItem;
        if (item.serviceType === 'drug') {
          await this.createClaimItemMedication(client, provClaimNo, 1, item.serviceCode, item.serviceDesc);
          await this.createClaimItemDosage(client, provClaimNo, 1);
        } else {
          await this.createClaimItemProcedure(client, provClaimNo, 1, item.serviceCode, item.serviceDesc);
        }
      }
    }

    return record;
  }

  async _insertForEventRaw(client, provClaimNo, cdaEventType, subType) {
    switch (cdaEventType) {
      case 'DISCHARGE_SUMMARY':
        return await this.insertDischargeSummary(client, provClaimNo, subType);
      case 'OUTPATIENT_ENCOUNTER_SUMMARY':
        return await this.insertOutpatientEncounterSummary(client, provClaimNo);
      case 'OPERATIVE_NOTE':
        return await this.insertOperativeNote(client, provClaimNo);
      case 'NEWBORN_DISCHARGE':
        return await this.insertNewbornDischarge(client, provClaimNo, subType);
      case 'MATERNAL_DISCHARGE':
        return await this.insertMaternalDischarge(client, provClaimNo, subType);
      case 'LAB_ORDER':
        return await this.insertLabOrder(client, provClaimNo);
      case 'LAB_RESULT':
        return await this.insertLabResult(client, provClaimNo);
      case 'RADIOLOGY_ORDER':
        return await this.insertRadiologyOrder(client, provClaimNo);
      case 'RADIOLOGY_RESULT':
        return await this.insertRadiologyResult(client, provClaimNo);
      default:
        throw new Error(`Unhandled CDA event type: ${cdaEventType}`);
    }
  }

  async insertDischargeSummary(client, provClaimNo, subType) {
    const isInstitutional = subType !== 'professional';
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: isInstitutional ? 'Institutional' : 'Professional',
      claimSubtype: isInstitutional ? 'IMP' : 'Emergency',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'SVC001',
      serviceDesc: 'Discharge Summary Consultation',
    });

    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: isInstitutional ? 'IMP' : 'EMER',
      withEndDate: true,
      encounterStatus: 'finished',
    });

    if (isInstitutional) {
      await this.createEncounterHospitalization(client, encounter.encounterId, {
        hospitalDischargeDisposition: faker.helpers.arrayElement(HOSPITAL_DISCHARGE_DISPOSITION_LOV),
      });
    } else {
      await this.createEncounterEmergency(client, encounter.encounterId, {
        emergencyDepartmentDisposition: faker.helpers.arrayElement(EMERGENCY_DEPARTMENT_DISPOSITION_LOV),
      });
    }

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertOutpatientEncounterSummary(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'op',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'SVC001',
      serviceDesc: 'Outpatient Encounter Services',
      withServiceCode: true,
      withEndDate: true,
    });

    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: faker.helpers.arrayElement(['AMB', 'HH', 'VR']),
      withEndDate: true,
      encounterStatus: faker.helpers.arrayElement(['planned', 'arrived', 'in-progress', 'finished', 'cancelled']),
    });

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertOperativeNote(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'ip',
      isNewborn: 'false',
    });

    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'PROCEDURE',
      serviceCode: 'PROC001',
      serviceDesc: 'Surgical Operative Procedure',
      withServiceCode: true,
      withEndDate: true,
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);

    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: 'IMP',
      withEndDate: false,
      encounterStatus: faker.helpers.arrayElement(['planned', 'arrived', 'in-progress', 'finished']),
    });

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertNewbornDischarge(client, provClaimNo, subType) {
    const isInstitutional = subType !== 'professional';
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: isInstitutional ? 'Institutional' : 'Professional',
      claimSubtype: isInstitutional ? 'IMP' : 'Emergency',
      isNewborn: 'Y',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'SVC002',
      serviceDesc: 'Newborn Neonatal Service',
    });

    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: isInstitutional ? 'IMP' : 'EMER',
      withEndDate: true,
      encounterStatus: 'finished',
    });

    if (isInstitutional) {
      await this.createEncounterHospitalization(client, encounter.encounterId, {
        hospitalDischargeDisposition: faker.helpers.arrayElement(HOSPITAL_DISCHARGE_DISPOSITION_LOV),
      });
    } else {
      await this.createEncounterEmergency(client, encounter.encounterId, {
        emergencyDepartmentDisposition: faker.helpers.arrayElement(EMERGENCY_DEPARTMENT_DISPOSITION_LOV),
      });
    }

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertMaternalDischarge(client, provClaimNo, subType) {
    const isInstitutional = subType !== 'professional';
    const beneficiary = await this.createBeneficiary(client, { gender: 'female' });
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: isInstitutional ? 'Institutional' : 'Professional',
      claimSubtype: isInstitutional ? 'IMP' : 'Emergency',
      isNewborn: 'false',
    });

    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'SVC003',
      serviceDesc: 'Obstetrics Maternity Service',
      isMaternity: 'Y',
      withEndDate: true,
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);

    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: isInstitutional ? 'IMP' : 'EMER',
      withEndDate: true,
      encounterStatus: 'finished',
    });

    if (isInstitutional) {
      await this.createEncounterHospitalization(client, encounter.encounterId, {
        hospitalDischargeDisposition: faker.helpers.arrayElement(HOSPITAL_DISCHARGE_DISPOSITION_LOV),
        hospitaladmissionspeciality: 'obstetrics'
      });
    } else {
      await this.createEncounterEmergency(client, encounter.encounterId, {
        emergencyDepartmentDisposition: faker.helpers.arrayElement(EMERGENCY_DEPARTMENT_DISPOSITION_LOV),
      });
    }

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertLabOrder(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'op',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'lab',
      serviceCode: 'CBC',
      serviceDesc: 'Complete Blood Count',
    });
    await this.createClaimItemDetails(client, provClaimNo, 1, 1, 'LAB', 'CBC', 'Complete Blood Count');
    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: 'AMB',
      withEndDate: true,
      encounterStatus: 'finished',
    });
    await this.createItemCareTeam(client, provClaimNo, 1, 1);

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertLabResult(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'op',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'lab',
      serviceCode: 'CBC',
      serviceDesc: 'Complete Blood Count - Result',
    });
    await this.createClaimItemDetails(client, provClaimNo, 1, 1, 'LAB', 'CBC', 'Complete Blood Count');
    await this.createClaimSupportingInfo(client, provClaimNo, 1, 'attachment', 'Lab Report', true);
    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: 'AMB',
      withEndDate: true,
      encounterStatus: 'finished',
    });
    await this.createItemCareTeam(client, provClaimNo, 1, 1);

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertRadiologyOrder(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'op',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'CT-HEAD',
      serviceDesc: 'CT Head without Contrast',
    });
    await this.createClaimItemDetails(client, provClaimNo, 1, 1, 'IMAGING', 'CT-HEAD', 'CT Head without Contrast');
    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: 'AMB',
      withEndDate: true,
      encounterStatus: 'finished',
    });
    await this.createItemCareTeam(client, provClaimNo, 1, 1);

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async insertRadiologyResult(client, provClaimNo) {
    const beneficiary = await this.createBeneficiary(client);
    const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);

    const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, {
      claimType: 'Institutional',
      claimSubtype: 'op',
      isNewborn: 'false',
    });

    await this.createClaimDiagnosis(client, provClaimNo, 1);
    const careTeam = await this.createClaimCareTeam(client, provClaimNo, 1);
    const claimItem = await this.createClaimItem(client, provClaimNo, 1, {
      serviceType: 'service',
      serviceCode: 'CT-HEAD',
      serviceDesc: 'CT Head without Contrast - Result',
    });
    await this.createClaimItemDetails(client, provClaimNo, 1, 1, 'IMAGING', 'CT-HEAD', 'CT Head without Contrast');
    await this.createClaimSupportingInfo(client, provClaimNo, 1, 'attachment', 'Radiology Report', true);
    const encounter = await this.createClaimEncounter(client, provClaimNo, {
      encounterClass: 'AMB',
      withEndDate: true,
      encounterStatus: 'finished',
    });
    await this.createItemCareTeam(client, provClaimNo, 1, 1);

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  async createEvent(client, provClaimNo, eventType) {
    const eventId = this.generateId('EVT', 47);
    const isUhr = this.isEnhancedMode();
    const colCreatedDate = isUhr || this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql'
      ? 'CREATED_DATE'
      : 'createddate';
    await client.query(`
      INSERT INTO ${this.tbl('events')} 
        (eventid, provclaimno, eventtype, ${colCreatedDate}, issubmitted)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, provClaimNo, eventType, new Date(), false]);
  }

  async createBeneficiary(client, opts = {}) {
    const beneficiaryId = this.generateId('BEN', 17);
    const patientFileNo = this.truncate(`PF${faker.string.alphanumeric(8).toUpperCase()}`, 30);
    const firstName = this.truncate(faker.person.firstName(), 50);
    const middleName = this.truncate(faker.person.middleName(), 50);
    const lastName = this.truncate(faker.person.lastName(), 50);
    const fullName = this.truncate(`${firstName} ${middleName} ${lastName}`, 200);
    const dob = faker.date.birthdate({ min: 1940, max: 2020, mode: 'year' });
    const gender = opts.gender ?? faker.helpers.arrayElement(['male', 'female']);
    const isDefaultPlus = this.isDefaultPlusMode();

    const cols = [
      'beneficiaryid', 'patientfileno', 'firstname', 'middlename', 'lastname', 'fullname',
      'dob', 'gender', 'nationality', 'documenttype', 'documentid', 'contactnumber', 'ehealthid',
      'residencytype', 'maritalstatus', 'bloodgroup', 'preferredlanguage', 'email',
      'addressline', 'addressstreetname', 'addresscity', 'addressdistrict', 'addressstate',
      'addresspostalcode', 'addresscountry', 'occupation', 'religion'
    ];
    const vals = [
      beneficiaryId, patientFileNo, firstName, middleName, lastName, fullName,
      dob, gender, 'SA', 'National-ID', CONSTANTS.DOCUMENT_ID, '+966-501234567', '30000999999999',
      'Citizen', 'Married', 'O+', 'en', 'patient@email.sa',
      'King Fahd Road', 'King Fahd Road', 'Riyadh', 'Al Olaya', 'Riyadh Region',
      '12345', 'SA', 'Engineer', 'Islam'
    ];

    if (isDefaultPlus) {
      cols.push('prior_patient_id');
      vals.push(this.truncate(faker.string.alphanumeric(10).toUpperCase(), 50));
    }

    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(`
      INSERT INTO ${this.tbl('beneficiary')}
        (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return { beneficiaryId, patientFileNo, firstName, lastName, fullName, dob, gender };
  }

  async createCoverage(client, beneficiaryId) {
    const coverageId = this.generateId('COV', 17);

    await client.query(`
      INSERT INTO ${this.tbl('coverage')}
        (coverageid, memberid, expirydate, payernphiesid, relationwithsubscriber,
         policyholder, coveragetype, beneficiaryid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      coverageId,
      this.truncate(faker.string.alphanumeric(15).toUpperCase(), 50),
      faker.date.future({ years: 1 }),
      this.generateId('PAY', 17),
      faker.helpers.arrayElement(['self', 'spouse', 'child', 'parent']),
      this.truncate(faker.company.name(), 250),
      faker.helpers.arrayElement(['EHCPOL', 'PUBLICPOL']),
      beneficiaryId,
    ]);

    return coverageId;
  }

  async createClaimInfo(client, provClaimNo, beneficiaryId, coverageId, opts) {
    const { claimType, claimSubtype, isNewborn } = opts;
    const billableStart = faker.date.recent({ days: 30 });
    const billableEnd = faker.date.soon({ days: 7, refDate: billableStart });
    const claimCreatedDate = new Date();
    const isDefaultPlus = this.isDefaultPlusMode();

    const cols = [
      'provclaimno', 'episodeid', 'isnewborn', 'isreferral', 'claimtype', 'claimsubtype',
      'providernphiesid', 'claimcreateddate', 'accountingperiod', 'billableperiodstart', 'billableperiodend',
      'payeetype', 'payeeid', 'coverageid', 'beneficiaryid', 'total'
    ];
    const vals = [
      provClaimNo,
      this.generateId('EP', 17),
      isNewborn,
      'false',
      claimType,
      claimSubtype,
      CONSTANTS.PROVIDER_NPHIES_ID,
      claimCreatedDate,
      faker.date.recent({ days: 30 }),
      billableStart,
      billableEnd,
      'provider',
      this.generateId('PYE', 17),
      coverageId,
      beneficiaryId,
      1500.00
    ];

    if (isDefaultPlus) {
      cols.push('providernphiesname', 'prescription', 'prior_visit_number');
      vals.push(
        this.truncate('International University Hospital', 200),
        this.truncate(`RX-${faker.string.alphanumeric(8).toUpperCase()}`, 255),
        this.truncate(`PRIOR-${faker.string.numeric(7)}`, 50)
      );
    }

    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(`
      INSERT INTO ${this.tbl('claiminfo')}
        (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return { provClaimNo, claimCreatedDate };
  }

  async createClaimDiagnosis(client, provClaimNo, sequenceNo) {
    await client.query(`
      INSERT INTO ${this.tbl('claimdiagnosis')}
        (provclaimno, sequenceno, diagnosiscode, diagnosistype)
      VALUES ($1,$2,$3,$4)
    `, [
      provClaimNo,
      sequenceNo,
      'M25.46',
      'PRINCIPAL',
    ]);
  }

  async createClaimCareTeam(client, provClaimNo, sequenceNo) {
    const physicianName = 'Dr. Aditya Khan';
    await client.query(`
      INSERT INTO ${this.tbl('claimcareteam')}
        (provclaimno, sequenceno, physicianid, physicianname, practitionerrole, careteamrole, careteamqualification)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      provClaimNo,
      sequenceNo,
      CONSTANTS.PHYSICIAN_ID,
      physicianName,
      'doctor',
      'primary',
      'MD',
    ]);

    return { physicianId: CONSTANTS.PHYSICIAN_ID, physicianName };
  }

  async createClaimItem(client, provClaimNo, sequenceNo, opts) {
    const {
      serviceType,
      serviceCode,
      serviceDesc,
      withEndDate = true,
      isMaternity = 'false',
    } = opts;

    const quantity = parseFloat(faker.finance.amount({ min: 1, max: 10, dec: 2 }));
    const unitPrice = parseFloat(faker.finance.amount({ min: 10, max: 5000, dec: 2 }));
    const discount = parseFloat(faker.finance.amount({ min: 0, max: unitPrice * 0.1, dec: 2 }));
    const factor = 1.0;
    const subtotal = unitPrice * quantity * factor - discount;
    const tax = subtotal * 0.15;
    const net = subtotal + tax;
    const pShare = net * 0.2;
    const payShare = net - pShare;

    const invoiceNo = this.truncate(faker.string.alphanumeric(10).toUpperCase(), 20);
    const startDate = faker.date.recent({ days: 7 });
    const endDate = withEndDate ? faker.date.soon({ days: 3, refDate: startDate }) : new Date();

    await client.query(`
      INSERT INTO ${this.tbl('claimitem')}
        (provclaimno, invoiceno, sequenceno, servicetype, servicecode, servicedesc,
         ispackage, quantity, unitprice, discount, factor, patientshare, payershare, tax, net,
         startdate, enddate, ismaternity)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [
      provClaimNo,
      invoiceNo,
      sequenceNo,
      serviceType,
      serviceCode,
      serviceDesc,
      'false',
      quantity,
      unitPrice,
      discount,
      factor,
      pShare,
      payShare,
      tax,
      net,
      startDate,
      endDate,
      isMaternity,
    ]);

    return { serviceType, serviceCode, serviceDesc, net };
  }

  async createClaimEncounter(client, provClaimNo, opts) {
    const { encounterClass, withEndDate, encounterStatus } = opts;
    const encounterId = this.generateId('ENC', 17);
    const startDate = faker.date.recent({ days: 30 });
    const endDate = withEndDate ? faker.date.soon({ days: 7, refDate: startDate }) : new Date();
    const isDefaultPlus = this.isDefaultPlusMode();

    const cols = [
      'provclaimno', 'encounterid', 'encounterstartdate', 'encounterenddate', 'encounterclass',
      'encounterservicetype', 'priority', 'serviceprovider', 'encounterstatus'
    ];
    const vals = [
      provClaimNo,
      encounterId,
      startDate,
      endDate,
      encounterClass,
      'consultation',
      'routine',
      CONSTANTS.PROVIDER_NPHIES_ID,
      encounterStatus,
    ];

    if (isDefaultPlus) {
      cols.push('room', 'bed', 'point_of_care', 'facility_id');
      vals.push(
        encounterClass === 'IMP' ? this.truncate('101', 50) : null,
        encounterClass === 'IMP' ? this.truncate('Bed-A', 50) : null,
        encounterClass === 'IMP' ? this.truncate('ICU', 100) : null,
        this.truncate('FAC-999', 100)
      );
    }

    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(`
      INSERT INTO ${this.tbl('claimencounters')}
        (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return { encounterId, encounterClass, encounterStatus, startDate, endDate };
  }

  async createEncounterHospitalization(client, encounterId, opts) {
    const { hospitalDischargeDisposition } = opts;
    const hospId = this.generateId('HOS', 17);

    await client.query(`
      INSERT INTO ${this.tbl('encounterhospitalization')}
        (encounterhospitalizationid, hospitaladmissionspeciality, hospitalintendedlengthofstay,
         hospitaladmissionsource, hospitaldischargedisposition, encounterid)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [
      hospId,
      faker.helpers.arrayElement(['cardiology', 'surgery', 'internal', 'obstetrics']),
      faker.helpers.arrayElement(['1-3', '4-7', '8-14', '15+']),
      faker.helpers.arrayElement(['emergency', 'referral', 'direct']),
      hospitalDischargeDisposition,
      encounterId,
    ]);
  }

  async createEncounterEmergency(client, encounterId, opts) {
    const { emergencyDepartmentDisposition } = opts;
    const emergencyId = this.generateId('EMG', 17);

    await client.query(`
      INSERT INTO ${this.tbl('encounteremergency')}
        (encounteremergencyid, emergencyarrivalcode, emergencyservicestart,
         emergencydepartmentdisposition, triagecategory, triagedate, encounterid)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      emergencyId,
      faker.helpers.arrayElement(['A', 'P', 'O']),
      faker.date.recent({ days: 1 }),
      emergencyDepartmentDisposition,
      faker.helpers.arrayElement(['immediate', 'urgent', 'standard']),
      faker.date.recent({ days: 1 }),
      encounterId,
    ]);
  }

  async createPregnancyDetails(client, provClaimNo, startDate) {
    console.log(`[DataGenerator] createPregnancyDetails → table: ${this.tbl('pregnancy_details')}`);
    await client.query(`
      INSERT INTO ${this.tbl('pregnancy_details')} (provclaimno, start_date)
      VALUES ($1, $2)
    `, [provClaimNo, startDate]);
  }

  async createClaimItemMedication(client, provClaimNo, itemSeq, code, desc) {
    console.log(`[DataGenerator] createClaimItemMedication[item=${itemSeq}] → table: ${this.tbl('claimitem_medication')}`);
    await client.query(`
      INSERT INTO ${this.tbl('claimitem_medication')}
        (provclaimno, item_sequenceno, medicine_code, medicine_display_name, ingredient,
         strength_value, strength_unit, day_supply, refills, receiver_healthid,
         category, reasonformedicine, handover_date_time, packaging_code,
         packaging_display_name, dispense_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      provClaimNo,
      itemSeq,
      this.truncate(code, 70),
      this.truncate(desc, 256),
      this.truncate('paracetamol', 256),
      this.truncate('500', 100),
      this.truncate('mg', 100),
      30,
      0,
      this.generateId('BEN', 17),
      this.truncate('general', 50),
      this.truncate('Fever relief', 256),
      new Date(),
      this.truncate('box', 50),
      this.truncate('box of 20 tablets', 256),
      this.truncate('FF', 50)
    ]);
  }

  async createClaimItemDosage(client, provClaimNo, itemSeq) {
    console.log(`[DataGenerator] createClaimItemDosage[item=${itemSeq}] → table: ${this.tbl('claimitem_dosage')}`);
    await client.query(`
      INSERT INTO ${this.tbl('claimitem_dosage')}
        (provclaimno, item_sequenceno, form_code, form_display_name, duration_unit,
         duration_value, period_start, period_end, instruction, route, as_needed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      provClaimNo,
      itemSeq,
      this.truncate('TAB', 50),
      this.truncate('Tablet', 256),
      this.truncate('d', 20),
      30,
      new Date(),
      faker.date.soon({ days: 30 }),
      this.truncate('Take one tablet daily', 1000),
      this.truncate('Oral', 100),
      0
    ]);
  }

  async createClaimItemProcedure(client, provClaimNo, itemSeq, code, desc) {
    console.log(`[DataGenerator] createClaimItemProcedure[item=${itemSeq}] → table: ${this.tbl('claimitem_procedure')}`);
    await client.query(`
      INSERT INTO ${this.tbl('claimitem_procedure')}
        (provclaimno, item_sequenceno, procedure_code, procedure_description, modality_code,
         modality_description, bodysite_code, bodysite_description, order_identifier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      provClaimNo,
      itemSeq,
      this.truncate(code, 70),
      this.truncate(desc, 256),
      this.truncate('CT', 50),
      this.truncate('Computed Tomography', 256),
      this.truncate('HEAD', 50),
      this.truncate('Head structure', 256),
      this.generateId('ORD', 17)
    ]);
  }

  async createClaimItemDetails(client, provClaimNo, itemSequenceNo, sequenceNo, serviceType, serviceCode, serviceDesc) {
    const quantity = parseInt(faker.finance.amount({ min: 1, max: 5, dec: 0 }));
    const unitPrice = parseFloat(faker.finance.amount({ min: 10, max: 1000, dec: 2 }));
    const tax = unitPrice * quantity * 0.15;
    const net = unitPrice * quantity + tax;

    await client.query(`
      INSERT INTO ${this.tbl('claimitemdetails')}
        (itemsequenceno, provclaimno, sequenceno, servicetype, servicecode, servicedesc,
         quantity, quantitycode, unitprice, tax, net)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      itemSequenceNo, provClaimNo, sequenceNo,
      serviceType, serviceCode, serviceDesc,
      quantity, 'unit', unitPrice, tax, net
    ]);
  }

  async createClaimSupportingInfo(client, provClaimNo, sequenceNo, category, supportingValue, hasAttachment) {
    const attachmentBuffer = hasAttachment ? Buffer.from('mock-attachment-content-for-cda') : null;
    const filename = hasAttachment ? 'report.pdf' : null;
    const mimeType = hasAttachment ? 'application/pdf' : null;

    await client.query(`
      INSERT INTO ${this.tbl('claimsupportinginfo')}
        (provclaimno, sequenceno, category, supportingvalue,
         supportingattachment, attachmentfilename, attachmenttype)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      provClaimNo, sequenceNo, category, supportingValue,
      attachmentBuffer, filename, mimeType
    ]);
  }

  async createItemCareTeam(client, provClaimNo, careTeamSeq, itemSeq) {
    let query = `
      INSERT INTO ${this.tbl('itemcareteam')} 
        (provclaimno, careteamsequenceno, itemsequenceno)
      VALUES ($1,$2,$3)
    `;
    if (this.dbConfig.type === 'postgres') query += ' ON CONFLICT DO NOTHING';
    try { await client.query(query, [provClaimNo, careTeamSeq, itemSeq]); } catch (e) { }
  }

  buildCdaPayload(eventType, provClaimNo, record) {
    const createdDate = record.claiminfo.claimCreatedDate.toISOString();
    const age = new Date().getFullYear() - new Date(record.beneficiary.dob).getFullYear();

    const request = {
      id: faker.number.int({ min: 1000, max: 9999 }),
      midtableId: faker.number.int({ min: 2000, max: 9999 }),
      source: 'CDA_SYSTEM',
      createdDate,
      visitNumber: provClaimNo,
      provider: {
        providerID: CONSTANTS.PROVIDER_NPHIES_ID,
        providerName: "International University Hospital",
        nphiesOrganizationName: "International University Hospital",
        nphiesOrganizationID: CONSTANTS.PROVIDER_NPHIES_ID,
        contactInfo: {
          phoneNumber: "+966112345678",
          email: "info@nhicclinic.sa",
          address: {
            street: "3920 Mathar Alshibani St",
            city: "Riyadh",
            postalCode: "12629",
            country: "Saudi Arabia"
          }
        }
      },
      caseInfo: {
        visitType: record.encounter.encounterClass === 'IMP' ? 'INPATIENT' : 'OUTPATIENT',
        patientLocation: {
          room: "101",
          bed: "A",
          pointOfCare: "MED-UNIT-1",
          facilityId: "2.16.840.1.113883.3.3731.1.2.2"
        },
        admissionMethod: "OTHER",
        visitNumber: provClaimNo,
        admitDate: record.encounter.startDate.toISOString().substring(0, 10),
        dischargeDate: record.encounter.encounterStatus === 'finished' ? record.encounter.endDate.toISOString().substring(0, 10) : "",
        lengthOfStay: 3,
        department: {
          key: "MT28",
          value: "Pediatrics Gastroenterology"
        },
        observations: {
          height: { unit: "CENTIMETER", value: 175 },
          weight: { unit: "KILOGRAM", value: 70 },
          fasting: "FASTING",
          medicalHistory: "Chronic pain before 2 years ago"
        }
      },
      patient: {
        id: record.beneficiary.beneficiaryId,
        healthId: record.beneficiary.beneficiaryId,
        age,
        gender: record.beneficiary.gender.toUpperCase(),
        dateOfBirth: record.beneficiary.dob.toISOString().substring(0, 10),
        nationality: "SAU",
        contactInfo: {
          fullName: record.beneficiary.fullName,
          firstName: record.beneficiary.firstName,
          lastName: record.beneficiary.lastName,
          phoneNumber: "+966501234567",
          address: {
            street: "2448 Zarga Alyamamah St",
            city: "Riyadh",
            postalCode: "13337",
            country: "Saudi Arabia"
          }
        },
        maritalStatus: "MARRIED",
        guardianContactInfo: {
          fullName: "Mohammed Al-Ghamdi",
          firstName: "Mohammed",
          lastName: "Al-Ghamdi",
          phoneNumber: "+966501234567",
          address: {
            street: "1234 Guardian St",
            city: "Riyadh",
            postalCode: "13337",
            country: "Saudi Arabia"
          }
        }
      },
      careTeam: [
        {
          id: record.careTeam.physicianId,
          nationalId: record.careTeam.physicianId,
          contactInfo: {
            fullName: record.careTeam.physicianName,
            firstName: "Aditya",
            lastName: "Khan",
            phoneNumber: "+966509876543",
            email: "attending.physician@nhicclinic.sa",
            address: {
              street: "3920 Mathar Alshibani St",
              city: "Riyadh",
              postalCode: "12629",
              country: "Saudi Arabia"
            }
          },
          type: "doctor",
          speciality: "CE9D7C6B-62F9-E811-B80F-005056AD2FD8",
          notes: "Attending physician",
          role: "Attending Doctor"
        }
      ],
      diagnosis: [
        {
          id: 1,
          code: "PREOPERATIVE_DIAGNOSIS",
          priority: "PRINCIPAL",
          info: [
            {
              diagnosisProcedureCode: "M25.46",
              description: "Effusion of joint, lower leg",
              dateFrom: record.encounter.startDate.toISOString().substring(0, 10),
              dateTo: record.encounter.endDate.toISOString().substring(0, 10),
              status: "ACTIVE"
            }
          ]
        }
      ],
      services: [],
      medication: [],
      allergy: [
        {
          code: 123,
          severity: "SEVERE",
          type: "DRUG_ALLERGY",
          notes: "Food allergy noted"
        }
      ]
    };

    if (eventType === 'OPERATIVE_NOTE') {
      request.operativeNotes = [
        {
          key: "SURGICAL_PROCEDURE",
          description: "This is the narrative description of the surgical procedure(s) performed for this encounter"
        },
        {
          key: "CHIEF_COMPLAINT",
          description: "Patient feels pressure on the lungs"
        }
      ];
    }

    if (eventType.startsWith('LAB') || eventType.startsWith('RADIOLOGY')) {
      const isLab = eventType.startsWith('LAB');
      const service = {
        id: 1001,
        code: record.claimItem.serviceCode,
        date: createdDate,
        isLab,
        priority: "ROUTINE",
        isFasting: false,
        serviceInfo: {}
      };

      if (eventType === 'LAB_ORDER') {
        service.serviceInfo = {
          laboratoryOrders: [
            {
              specimenCollection: {
                specimenType: "FBLOOD",
                specimenSource: "FBLOOD",
                collectionDate: createdDate
              },
              sampleOperations: [
                {
                  priority: "ROUTINE",
                  title: "CBC",
                  text: "Complete blood count analysis"
                }
              ]
            }
          ]
        };
      } else if (eventType === 'LAB_RESULT') {
        service.serviceInfo = {
          laboratoryResults: [
            {
              accessionNumber: `ACC-2026-${faker.string.numeric(3)}`,
              status: "FINAL",
              observationNote: "Test results normal.",
              sampleResult: {
                valueQuantity: { value: "14.8", unit: "GRAM_PER_DECILITER" },
                sampleResultInterpretation: "NORMAL",
                text: "Normal reference range"
              }
            }
          ]
        };
      } else if (eventType === 'RADIOLOGY_ORDER') {
        service.serviceInfo = {
          radiologyProcedures: [
            {
              procedure: record.claimItem.serviceCode,
              procedureDescription: record.claimItem.serviceDesc,
              modality: "COMPUTED_TOMOGRAPHY",
              modalityDescription: "Computed Tomography",
              bodySite: "HEAD_STRUCTURE",
              bodySiteDescription: "Head",
              orderIdentifier: `RAD-ORD-${faker.string.numeric(4)}`,
              accessionNumber: `RAD-ACC-${faker.string.numeric(4)}`,
              priority: "ROUTINE",
              requestedDate: createdDate
            }
          ]
        };
      } else if (eventType === 'RADIOLOGY_RESULT') {
        service.serviceInfo = {
          radiologyProcedures: [
            {
              procedure: record.claimItem.serviceCode,
              procedureDescription: record.claimItem.serviceDesc,
              modality: "COMPUTED_TOMOGRAPHY",
              modalityDescription: "Computed Tomography",
              bodySite: "HEAD_STRUCTURE",
              bodySiteDescription: "Head",
              orderIdentifier: `RAD-ORD-${faker.string.numeric(4)}`,
              accessionNumber: `RAD-ACC-${faker.string.numeric(4)}`,
              priority: "ROUTINE",
              requestedDate: createdDate,
              radiologyStatus: "FINAL"
            }
          ]
        };
      }

      request.services = [service];
    }

    return {
      eventId: faker.number.int({ min: 1000, max: 9999 }).toString(),
      eventType,
      uhrRequest: request
    };
  }

  loadTemplateAsCustomPayload(eventType, scenarioId = '', description = '') {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    let filePath = '';
    if (eventType === 'OUTPATIENT_ENCOUNTER_SUMMARY') {
      filePath = path.join(projectRoot, 'CDA', 'Outpatient Encounter Summary.json');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Outpatient encounter summary.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'outpatient_encounter_summary_payload.json');
      }
    } else if (eventType === 'DISCHARGE_SUMMARY') {
      filePath = path.join(projectRoot, 'CDA', 'Discharge Summary.json');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Discharge summary.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'discharge_summary_payload.json');
      }
    } else if (eventType === 'OPERATIVE_NOTE') {
      filePath = path.join(projectRoot, 'CDA', 'Operative notes.json');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Operative Note.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Operative note.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'operative_note_payload.json');
      }
    } else if (eventType === 'NEWBORN_DISCHARGE') {
      filePath = path.join(projectRoot, 'CDA', 'Newborn Discharge.json');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Newborn discharge.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'newborn_discharge_payload.json');
      }
    } else if (eventType === 'MATERNAL_DISCHARGE') {
      filePath = path.join(projectRoot, 'CDA', 'Maternal Discharge.json');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'CDA', 'Maternal discharge.json');
      }
      if (!fs.existsSync(filePath)) {
        filePath = path.join(projectRoot, 'maternal_discharge_payload.json');
      }
    } else {
      return null;
    }

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const payloadJson = JSON.parse(content);

    const generatedData = {};
    for (const entry of payloadJson.results) {
      const normalizedTableName = entry.tableName.replace(/^(nphies_?|uhr_?)/i, '').toLowerCase();
      let key = normalizedTableName;
      if (normalizedTableName === 'claimitem') {
        key = 'claimitems';
      }
      generatedData[key] = entry.result;
    }

    return {
      eventType,
      generatedData
    };
  }

  applyScenarioOverridesToCustomPayload(customPayload, eventType) {
    const data = customPayload.generatedData;
    const rules = this.scenarioRules || {};

    // Ensure coverage record exists to satisfy foreign key constraint in claiminfo
    if (!data.coverage || data.coverage.length === 0) {
      let claimCovId = null;
      if (data.claiminfo && data.claiminfo.length > 0) {
        const claim = data.claiminfo[0];
        const covKey = Object.keys(claim).find(k => k.toLowerCase() === 'coverageid');
        if (covKey) claimCovId = claim[covKey];
      }

      if (!claimCovId) {
        claimCovId = 'cov_temp_id_123';
        if (data.claiminfo && data.claiminfo.length > 0) {
          const claim = data.claiminfo[0];
          const covKey = Object.keys(claim).find(k => k.toLowerCase() === 'coverageid');
          if (covKey) claim[covKey] = claimCovId;
          else claim['coverageid'] = claimCovId;
        }
      }

      const beneficiaryId = data.beneficiary?.[0]?.beneficiaryid || 'ben_temp_id_123';

      data.coverage = [{
        coverageid: claimCovId,
        memberid: beneficiaryId,
        expirydate: '2030-12-31T00:00:00.000Z',
        payernphiesid: 'TPA01',
        tpanphiesid: 'TPA01',
        relationwithsubscriber: 'Self',
        policyholder: 'Self',
        policynumber: 'POL123',
        coveragetype: 'EHCP',
        beneficiaryid: beneficiaryId,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      }];
    }

    // 1. Override claiminfo
    if (data.claiminfo && data.claiminfo.length > 0) {
      const claim = data.claiminfo[0];
      if (rules.claimType !== undefined) {
        const key = Object.keys(claim).find(k => k.toLowerCase() === 'claimtype');
        if (key) claim[key] = rules.claimType;
      }
      if (rules.claimSubType !== undefined) {
        const key = Object.keys(claim).find(k => k.toLowerCase() === 'claimsubtype');
        if (key) claim[key] = rules.claimSubType;
      }
      if (rules.isNewborn !== undefined) {
        const key = Object.keys(claim).find(k => k.toLowerCase() === 'isnewborn');
        if (key) claim[key] = rules.isNewborn;
      }
    }

    // 2. Override beneficiary
    if (data.beneficiary && data.beneficiary.length > 0) {
      const ben = data.beneficiary[0];
      if (rules.documentId !== undefined) {
        const key = Object.keys(ben).find(k => k.toLowerCase() === 'documentid');
        if (key) ben[key] = rules.documentId;
      }
      if (rules.gender !== undefined) {
        const key = Object.keys(ben).find(k => k.toLowerCase() === 'gender');
        if (key) ben[key] = rules.gender === 'F' ? 'Female' : rules.gender === 'M' ? 'Male' : rules.gender;
      }
    }

    // 3. Override claimencounters
    if (data.claimencounters && data.claimencounters.length > 0) {
      const enc = data.claimencounters[0];
      if (rules.encounterClass !== undefined) {
        const key = Object.keys(enc).find(k => k.toLowerCase() === 'encounterclass');
        if (key) enc[key] = rules.encounterClass;
      }
      if (rules.encounterEndDate !== undefined) {
        const key = Object.keys(enc).find(k => k.toLowerCase() === 'encounterenddate');
        if (key) enc[key] = rules.encounterEndDate;
      }
      if (rules.encounterStatus !== undefined) {
        const key = Object.keys(enc).find(k => k.toLowerCase() === 'encounterstatus');
        if (key) enc[key] = rules.encounterStatus;
      }
    }

    // 4. Override claimitems and claimitemdetails
    if (rules.serviceType !== undefined || rules.serviceCode !== undefined || rules.serviceDesc !== undefined || rules.isMaternity !== undefined) {
      if (data.claimitems) {
        for (const item of data.claimitems) {
          if (rules.serviceType !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicetype');
            if (key) item[key] = rules.serviceType;
          }
          if (rules.serviceCode !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicecode');
            if (key) item[key] = rules.serviceCode;
          }
          if (rules.serviceDesc !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicedesc');
            if (key) item[key] = rules.serviceDesc;
          }
          if (rules.isMaternity !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'ismaternity');
            if (key) item[key] = rules.isMaternity;
            else item['ismaternity'] = rules.isMaternity;
          }
        }
      }
      if (data.claimitemdetails) {
        for (const detail of data.claimitemdetails) {
          if (rules.serviceType !== undefined) {
            const key = Object.keys(detail).find(k => k.toLowerCase() === 'servicetype');
            if (key) detail[key] = rules.serviceType;
          }
          if (rules.serviceCode !== undefined) {
            const key = Object.keys(detail).find(k => k.toLowerCase() === 'servicecode');
            if (key) detail[key] = rules.serviceCode;
          }
          if (rules.serviceDesc !== undefined) {
            const key = Object.keys(detail).find(k => k.toLowerCase() === 'servicedesc');
            if (key) detail[key] = rules.serviceDesc;
          }
        }
      }
    }

    // 5. Override/Ensure encounterhospitalization
    if ((!data.encounterhospitalization || data.encounterhospitalization.length === 0) &&
      (eventType === 'NEWBORN_DISCHARGE' || eventType === 'DISCHARGE_SUMMARY' || eventType === 'MATERNAL_DISCHARGE' || rules.hospitalDischargeDisposition !== undefined)) {
      const encounterId = data.claimencounters?.[0]?.encounterid || data.claimencounters?.[0]?.ENCOUNTERID || 'enc_temp_id_123';
      const speciality = eventType === 'MATERNAL_DISCHARGE' ? 'obstetrics' : (eventType === 'NEWBORN_DISCHARGE' ? 'pediatrics' : 'internal');
      data.encounterhospitalization = [{
        encounterhospitalizationid: 'hos_temp_id_123',
        hospitaladmissionspeciality: speciality,
        hospitalintendedlengthofstay: '1-3',
        hospitaladmissionsource: 'direct',
        hospitaldischargedisposition: rules.hospitalDischargeDisposition || 'Discharged home with parents in stable condition.',
        encounterid: encounterId,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      }];
    } else if (data.encounterhospitalization && data.encounterhospitalization.length > 0) {
      const hosp = data.encounterhospitalization[0];
      if (rules.hospitalDischargeDisposition !== undefined) {
        const key = Object.keys(hosp).find(k => k.toLowerCase() === 'hospitaldischargedisposition');
        if (key) hosp[key] = rules.hospitalDischargeDisposition;
        else hosp['hospitaldischargedisposition'] = rules.hospitalDischargeDisposition;
      }
    }

    // 6. Apply event status overrides
    if (data.events && data.events.length > 0) {
      const ev = data.events[0];
      const subKey = Object.keys(ev).find(k => k.toLowerCase() === 'issubmitted');
      if (subKey) {
        ev[subKey] = (rules.isSubmitted ?? false) ? 1 : 0;
      }
    }
  }

  parseDateIfNeeded(val) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return new Date(val);
    }
    return val;
  }

  async insertCustomPayload(client, config) {
    const data = config.customPayload.generatedData;
    if (!data) {
      return { success: false, message: 'Invalid custom payload structure', eventsCreated: 0, generatedProvClaimNos: [] };
    }

    // Sanitize child table rows to prevent foreign key violations with missing parent records
    // 1. Filter by valid claim items
    if (data.claimitems && data.claimitems.length > 0) {
      const validItemSeqs = new Set();
      for (const item of data.claimitems) {
        const seqKey = Object.keys(item).find(k => k.toLowerCase() === 'sequenceno');
        if (seqKey && item[seqKey]) validItemSeqs.add(String(item[seqKey]));
      }

      const childTables = ['claimitemdetails', 'itemdiagnosis', 'itemsupportinginfo', 'itemcareteam', 'claimitem_dosage', 'claimitem_medication', 'claimitem_procedure'];
      for (const tableKey of childTables) {
        if (data[tableKey] && Array.isArray(data[tableKey])) {
          data[tableKey] = data[tableKey].filter(row => {
            const seqKey = Object.keys(row).find(k => k.toLowerCase() === 'itemsequenceno' || k.toLowerCase() === 'item_sequenceno');
            if (seqKey) {
              return validItemSeqs.has(String(row[seqKey]));
            }
            return true;
          });
        }
      }
    }

    // 2. Filter by valid claim careteam sequences
    if (data.claimcareteam && data.claimcareteam.length > 0) {
      const validCareteamSeqs = new Set(data.claimcareteam.map(ct => {
        const seqKey = Object.keys(ct).find(k => k.toLowerCase() === 'sequenceno');
        return seqKey ? String(ct[seqKey]) : null;
      }).filter(Boolean));

      if (data.itemcareteam && Array.isArray(data.itemcareteam)) {
        data.itemcareteam = data.itemcareteam.filter(row => {
          const seqKey = Object.keys(row).find(k => k.toLowerCase() === 'careteamsequenceno');
          if (seqKey) {
            return validCareteamSeqs.has(String(row[seqKey]));
          }
          return true;
        });
      }
    }

    // 3. Filter by valid claim diagnosis sequences
    if (data.claimdiagnosis && data.claimdiagnosis.length > 0) {
      const validDiagSeqs = new Set(data.claimdiagnosis.map(d => {
        const seqKey = Object.keys(d).find(k => k.toLowerCase() === 'sequenceno');
        return seqKey ? String(d[seqKey]) : null;
      }).filter(Boolean));

      if (data.itemdiagnosis && Array.isArray(data.itemdiagnosis)) {
        data.itemdiagnosis = data.itemdiagnosis.filter(row => {
          const seqKey = Object.keys(row).find(k => k.toLowerCase() === 'diagnosissequenceno');
          if (seqKey) {
            return validDiagSeqs.has(String(row[seqKey]));
          }
          return true;
        });
      }
    }

    // 4. Filter by valid claim supporting info sequences
    if (data.claimsupportinginfo && data.claimsupportinginfo.length > 0) {
      const validSupportSeqs = new Set(data.claimsupportinginfo.map(s => {
        const seqKey = Object.keys(s).find(k => k.toLowerCase() === 'sequenceno');
        return seqKey ? String(s[seqKey]) : null;
      }).filter(Boolean));

      if (data.itemsupportinginfo && Array.isArray(data.itemsupportinginfo)) {
        data.itemsupportinginfo = data.itemsupportinginfo.filter(row => {
          const seqKey = Object.keys(row).find(k => k.toLowerCase() === 'supportinginfosequenceno');
          if (seqKey) {
            return validSupportSeqs.has(String(row[seqKey]));
          }
          return true;
        });
      }
    }

    const ID_GENERATORS = {
      PROVCLAIMNO: () => this.generateProvClaimNo(),
      BENEFICIARYID: () => this.generateId('BEN', 17),
      SUBSCRIBERID: () => this.generateId('BEN', 17),
      MEMBERID: () => this.generateId('BEN', 17),
      EPISODEID: () => this.generateId('EP', 17),
      COVERAGEID: () => this.generateId('COV', 17),
      PAYEEID: () => this.generateId('PYE', 17),
      ENCOUNTERID: () => this.generateId('ENC', 17),
      EVENTID: () => this.generateId('EVT', 47),
      INVOICENO: () => faker.string.alphanumeric(10).toUpperCase(),
      SEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      ITEMSEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      ITEM_SEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      SUPPORTINGINFOSEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      CARETEAMSEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      CARETEAMSEQUENCE: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
      DIAGNOSISSEQUENCENO: () => faker.number.int({ min: 10000000, max: 99999999 }).toString(),
    };

    const idMap = new Map();

    const remapRow = (row) => {
      const remapped = {};
      for (const [col, val] of Object.entries(row)) {
        const colUpper = col.toUpperCase();
        const generator = ID_GENERATORS[colUpper];

        if (colUpper === 'CREATED_DATE' || colUpper === 'CREATEDDATE' ||
          colUpper === 'UPDATED_DATE' || colUpper === 'UPDATEDDATE' ||
          colUpper === 'CREATED_DATE_TIME' || colUpper === 'CREATEDDATETIME' ||
          colUpper === 'UPDATED_DATE_TIME' || colUpper === 'UPDATEDDATETIME' ||
          colUpper === 'CLAIMCREATEDDATE' || colUpper === 'ACCOUNTINGPERIOD') {
          remapped[col] = new Date();
        } else if (val && (typeof val === 'string' || typeof val === 'number')) {
          const valStr = String(val);
          if (idMap.has(valStr)) {
            remapped[col] = idMap.get(valStr);
          } else if (generator) {
            idMap.set(valStr, generator());
            remapped[col] = idMap.get(valStr);
          } else {
            remapped[col] = val;
          }
        } else if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
          remapped[col] = Buffer.from(val.data);
        } else {
          remapped[col] = val;
        }
      }
      return remapped;
    };

    let eventsCreated = 0;
    try {
      if (!config.skipTransaction) {
        await client.beginTransaction();
      }

      const tableMapping = [
        ['beneficiary', `${this.schemaPrefix}${this.tablePrefix}beneficiary`],
        ['coverage', `${this.schemaPrefix}${this.tablePrefix}coverage`],
        ['coverage_class', `${this.schemaPrefix}${this.tablePrefix}coverage_class`],
        ['claiminfo', `${this.schemaPrefix}${this.tablePrefix}claiminfo`],
        ['claimitems', `${this.schemaPrefix}${this.tablePrefix}claimitem`],
        ['claimitemdetails', `${this.schemaPrefix}${this.tablePrefix}claimitemdetails`],
        ['claimdiagnosis', `${this.schemaPrefix}${this.tablePrefix}claimdiagnosis`],
        ['claimcareteam', `${this.schemaPrefix}${this.tablePrefix}claimcareteam`],
        ['claimencounters', `${this.schemaPrefix}${this.tablePrefix}claimencounters`],
        ['claimsupportinginfo', `${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo`],
        ['itemcareteam', `${this.schemaPrefix}${this.tablePrefix}itemcareteam`],
        ['itemdiagnosis', `${this.schemaPrefix}${this.tablePrefix}itemdiagnosis`],
        ['itemsupportinginfo', `${this.schemaPrefix}${this.tablePrefix}itemsupportinginfo`],
        ['claimaccidentdetail', `${this.schemaPrefix}${this.tablePrefix}claimaccidentdetail`],
        ['claimpreauthdetails', `${this.schemaPrefix}${this.tablePrefix}claimpreauthdetails`],
        ['claimvisionprescription', `${this.schemaPrefix}${this.tablePrefix}claimvisionprescription`],
        ['encounteremergency', `${this.schemaPrefix}${this.tablePrefix}encounteremergency`],
        ['encounterhospitalization', `${this.tbl('encounterhospitalization')}`],
        ['claimitem_dosage', `${this.schemaPrefix}${this.tablePrefix}claimitem_dosage`],
        ['claimitem_medication', `${this.schemaPrefix}${this.tablePrefix}claimitem_medication`],
        ['claimitem_procedure', `${this.schemaPrefix}${this.tablePrefix}claimitem_procedure`],
        ...(!this.isAutoMode() && config.insertEventRow !== false ? [['events', `${this.schemaPrefix}${this.tablePrefix}events`]] : []),
      ];

      const payloadEventType = config.customPayload?.eventType ?? '';
      // Counter used to prevent duplicate event rows (templates may contain multiple
      // event rows from the source DB snapshot; only one should be inserted per call).
      let eventsInsertedForThisPayload = 0;
      const tablesWithoutProvclaimno = new Set([
        'beneficiary',
        'coverage',
        'coverage_class',
        'encounteremergency',
        'encounterhospitalization'
      ]);

      for (const [key, actualTableName] of tableMapping) {
        const rows = data[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        for (const rawRow of rows) {
          const row = remapRow(rawRow);

          if (tablesWithoutProvclaimno.has(key.toLowerCase())) {
            for (const colKey of Object.keys(row)) {
              if (colKey.toLowerCase() === 'provclaimno') {
                delete row[colKey];
              }
            }
          }

          if (key === 'events' && payloadEventType) {
            const etKey = Object.keys(row).find(k => k.toUpperCase() === 'EVENTTYPE');
            if (etKey) row[etKey] = payloadEventType;
          }

          // Only insert ONE event row per payload — skip any extra rows that
          // the template contains from the original source DB snapshot.
          if (key === 'events' && eventsInsertedForThisPayload > 0) {
            continue;
          }
          if (key === 'events') {
            eventsInsertedForThisPayload++;
          }

          const columns = Object.keys(row);
          const values = Object.values(row).map(v => this.parseDateIfNeeded(v));
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `INSERT INTO ${actualTableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          await client.query(sql, values);
        }
      }

      if (!config.skipTransaction) {
        await client.commit();
      }
      eventsCreated++;
      const oldProvClaimNo = data.claiminfo?.[0]?.PROVCLAIMNO ?? data.claiminfo?.[0]?.provclaimno ?? '';
      const newProvClaimNo = idMap.get(oldProvClaimNo) ?? oldProvClaimNo;
      return {
        success: true,
        message: `CDA Custom payload inserted successfully. New claim: ${newProvClaimNo}`,
        eventsCreated,
        generatedProvClaimNos: [newProvClaimNo],
        payload: config.customPayload
      };
    } catch (err) {
      if (!config.skipTransaction) {
        await client.rollback();
      }
      console.error('Failed to insert custom CDA payload:', err);
      return { success: false, message: `Failed to insert custom CDA payload: ${err.message}`, eventsCreated: 0, generatedProvClaimNos: [] };
    }
  }

  async close() {
    if (this.pgPool) { await this.pgPool.end(); this.pgPool = null; }
    if (this.mssqlPool) { await this.mssqlPool.close(); this.mssqlPool = null; }
    if (this.oracleConn) { await this.oracleConn.close(); this.oracleConn = null; }
    if (this.mysqlPool) { await this.mysqlPool.end(); this.mysqlPool = null; }
  }
}
