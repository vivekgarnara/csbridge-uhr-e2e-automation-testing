import { faker } from '@faker-js/faker';
import { Pool } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getScenarioConfig } from '../eventRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Oracle Client in Thick mode for Oracle 11g support
try {
  const libDir = path.resolve(__dirname, '..', 'electron', 'oracle_instantclient_18_5');
  console.log('Oracle: Attempting to initialize Thick mode with libDir:', libDir);
  oracledb.initOracleClient({ libDir });
  console.log('Oracle: Client initialized in Thick mode successfully');
} catch (err) {
  if (err.message && !err.message.includes('already been initialized')) {
    console.error('Oracle Thick mode initialization failed:', err.message);
  }
}

// CONSTANTS
const CONSTANTS = {
  DOCUMENT_ID: '30511223344557',
  PROVIDER_NPHIES_ID: '15000000112233',
  PHYSICIAN_ID: '00TEST1980'
};

const LAB_SPECIMEN_TYPES = [
  "ABS", "ACNE", "ACNFLD", "AIRS", "ALL", "AMN", "AMP", "ANGI", "ARTC", "ASERU",
  "ASP", "ATTE", "AUTOA", "AUTOC", "AUTP", "BBL", "BCYST", "BDY", "BIFL", "BITE",
  "BLD", "BLDA", "BLDCO", "BLDV", "BLEB", "BLIST", "BOIL", "BON", "BOWL", "BPH",
  "BPU", "BRN", "BRSH", "BRTH", "BRUS", "BUB", "BULLA", "BX", "CALC", "BONE",
  "CARBU", "CAT", "CBITE", "CDM", "CLIPP", "CNJT", "CNL", "COL", "CONE", "CSCR",
  "CSERU", "CSF", "CSITE", "CSMY", "CST", "CSVR", "CTP", "CUR", "CVM", "CVPS",
  "CVPT", "CYN", "CYST", "DBITE", "DCS", "DEC", "DEION", "DIA", "DIAF", "DISCHG",
  "DIV", "DRN", "DRNG", "DRNGP", "DUFL", "EARW", "EBRUSH", "EEYE", "EFF", "EFFUS",
  "EFOD", "EISO", "ELT", "ENVIR", "EOS", "EOTH", "ESOI", "ESOS", "ETA", "ETTP",
  "ETTUB", "EWHI", "EXG", "EXS", "EXUDTE", "FAW", "FBLOOD", "FGA", "FIB", "FIST",
  "FLD", "FLT", "FLU", "FLUID", "FOLEY", "FRS", "FSCLP", "FUR", "GAS", "GASA",
  "GASAN", "GASBR", "GASD", "GAST", "GENL", "GENV", "GRAFT", "GRAFTS", "GRANU",
  "GROSH", "GSOL", "GSPEC", "GT", "GTUBE", "HAR", "HBITE", "HBLUD", "HEMAQ",
  "HEMO", "HERNI", "HEV", "HIC", "HYDC", "IBITE", "ICYST", "IDC", "IHG", "ILEO",
  "ILLEG", "IMP", "INCI", "INFIL", "INS", "INTRD", "ISLT", "IT", "IUD", "IVCAT",
  "IVFLD", "IVTIP", "JEJU", "JNTFLD", "JP", "KELOI", "KIDFLD", "LAVG", "LAVGG",
  "LAVGP", "LAVPG", "LENS1", "LENS2", "LESN", "LIQ", "LIQO", "LNA", "LNV",
  "LSAC", "LYM", "MAC", "MAHUR", "MAR", "MASS", "MBLD", "MEC", "MILK", "MLK",
  "MUCOS", "MUCUS", "NAIL", "NASDR", "NEDL", "NEPH", "NGASP", "NGAST", "NGS",
  "NODUL", "NSECR", "ORH", "ORL", "OTH", "PACEM", "PAFL", "PCFL", "PDSIT",
  "PDTS", "PELVA", "PENIL", "PERIA", "PILOC", "PINS", "PIS", "PLAN", "PLAS",
  "PLB", "PLC", "PLEVS", "PLR", "PMN", "PND", "POL", "POPGS", "POPLG", "POPLV",
  "PORTA", "PPP", "PROST", "PRP", "PSC", "PUNCT", "PUS", "PUSFR", "PUST",
  "QC3", "RANDU", "RBC", "RBITE", "RECT", "RECTA", "RENALC", "RENC", "RES",
  "SAL", "SCAR", "SCLV", "SCROA", "SECRE", "SER", "SHU", "SHUNF", "SHUNT",
  "SITE", "SKBP", "SKN", "SMM", "SMN", "SNV", "SPRM", "SPRP", "SPRPB", "SPS",
  "SPT", "SPTC", "SPTT", "SPUT1", "SPUTIN", "SPUTSP", "STER", "STL", "STONE",
  "SUBMA", "SUBMX", "SUMP", "SUP", "SUTUR", "SWGZ", "SWT", "TASP", "TEAR",
  "THRB", "TISS", "TISU", "TLC", "TRAC", "TRANS", "TSERU", "TSTES", "TTRA",
  "TUBES", "TUMOR", "TZANC", "UDENT", "UMED", "UR", "URC", "URINB", "URINC",
  "URINM", "URINN", "URINP", "URNS", "URT", "USCOP", "USPEC", "USUB",
  "VASTIP", "VENT", "VITF", "VOM", "WASH", "WASI", "WAT", "WB", "WBC", "WEN",
  "WICK", "WND", "WNDA", "WNDD", "WNDE", "WORM", "WRT", "WWA", "WWO", "WWT"
];

const LAB_DEPARTMENTS = [
  "27898-6", "18717-9", "18719-5", "26438-2", "18727-8", "18725-2", "26435-8",
  "18728-6", "26436-6", "18767-4", "18768-2", "18718-7", "26437-4", "18720-3",
  "18722-9", "18723-7", "18724-5", "18769-0", "18721-1", "18729-4"
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

  formatDateForOracle(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  convertParams(params) {
    return params.map(param => {
      if (param instanceof Date) return this.formatDateForOracle(param);
      if (typeof param === 'boolean') return param ? 1 : 0;
      return param;
    });
  }

  async query(sql, params) {
    let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    const convertedParams = params ? this.convertParams(params) : [];
    const dateParamIndices = [];
    if (params) {
      params.forEach((param, idx) => {
        if (param instanceof Date) dateParamIndices.push(idx + 1);
      });
    }
    for (const idx of dateParamIndices) {
      const regex = new RegExp(`:${idx}(?![0-9])`, 'g');
      oracleSql = oracleSql.replace(regex, `TO_TIMESTAMP(:${idx}, 'YYYY-MM-DD HH24:MI:SS')`);
    }
    return this.connection.execute(oracleSql, convertedParams, {
      autoCommit: false,
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
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
    const request = this.transaction ? this.transaction.request() : this.pool.request();
    if (params) {
      // Find the index of 'supportingattachment' if inserting into claimsupportinginfo
      let supportingAttachmentIndex = -1;
      const insertMatch = sql.match(/insert\s+into\s+[^(]+\(([^)]+)\)/i);
      if (insertMatch) {
        const columns = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
        supportingAttachmentIndex = columns.indexOf('supportingattachment');
      }

      params.forEach((param, index) => {
        if (index === supportingAttachmentIndex) {
          request.input(`p${index}`, mssql.VarBinary, param);
        } else {
          request.input(`p${index}`, param);
        }
      });
    }
    const mssqlSql = sql.replace(/\$(\d+)/g, (_, n) => `@p${parseInt(n) - 1}`);
    return request.query(mssqlSql);
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

export class FhirDataGenerator {
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

  async getClient() {
    if (this.dbConfig.type === 'oracle') {
      if (!this.oracleConn) {
        this.oracleConn = await oracledb.getConnection({
          user: this.dbConfig.user,
          password: this.dbConfig.password,
          connectString: `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`
        });
      }
      return new OracleClient(this.oracleConn);
    } else if (this.dbConfig.type === 'mssql') {
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
          options: { encrypt: false, trustServerCertificate: true, instanceName }
        });
        await this.mssqlPool.connect();
      }
      return new SqlServerClient(this.mssqlPool);
    } else if (this.dbConfig.type === 'mysql') {
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
    } else {
      if (!this.pgPool) this.pgPool = new Pool(this.dbConfig);
      const client = await this.pgPool.connect();
      return new PostgresClient(client);
    }
  }

  async testConnection() {
    let client = null;
    try {
      client = await this.getClient();
      await client.query(this.dbConfig.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1');
      await client.release();
      return true;
    } catch (error) {
      console.error('FHIR Database connection failed:', error);
      if (client) { try { await client.release(); } catch (e) { } }
      return false;
    }
  }

  async generateData(config) {
    let client = null;
    let eventsCreated = 0;
    let failedEvents = 0;
    let lastError = null;
    let payload = undefined;
    const generatedProvClaimNos = [];

    try {
      client = await this.getClient();
      this.providerType = config.providerType || 'default';

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
            message: `Successfully created ${eventsCreated} FHIR custom record(s) in bulk.`,
            eventsCreated,
            generatedProvClaimNos
          };
        } else {
          return await this.insertCustomPayload(client, config);
        }
      }

      const firstEventType = config.eventTypes?.[0];
      if (firstEventType === 'LAB_ORDER' || firstEventType === 'LAB_RESULT' || firstEventType === 'RADIOLOGY_ORDER' || firstEventType === 'RADIOLOGY_RESULT' || firstEventType === 'MEDICATION_REQUEST' || firstEventType === 'MEDICATION_DISPENSE') {
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
              message: `Successfully created ${eventsCreated} FHIR record(s) in bulk.`,
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

      console.log(`Starting FHIR generation of ${config.numberOfEvents} events...`);

      const batchSize = 1000;
      if (config.numberOfEvents > 1) {
        await client.beginTransaction();
      }

      for (let i = 0; i < config.numberOfEvents; i++) {
        try {
          if (config.numberOfEvents === 1) {
            await client.beginTransaction();
          }

          const eventType = config.eventTypes[Math.floor(Math.random() * config.eventTypes.length)];
          const provClaimNo = this.generateProvClaimNo();

          if (config.numberOfEvents <= 10 || i % 1000 === 0) {
            console.log(`[FHIR Event ${i + 1}] Generating ${eventType}`);
          }

          // Determine encounter settings based on event types
          const isResult = eventType.endsWith('_RESULT');

          // ── 1. Insert Event Row (if not auto mode) ──
          if (!this.isAutoMode()) {
            const shouldInsertEventRow = this.scenarioRules?.insertEventRow !== false;
            if (shouldInsertEventRow) {
              await this.createEvent(client, provClaimNo, eventType);
            }
          }

          // ── 2. Create Beneficiary ──
          const beneficiary = await this.createBeneficiary(client);

          // ── 3. Create Coverage ──
          const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);
          await this.createCoverageClass(client, coverageId);

          // ── 4. Create Claim Info ──
          const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, eventType);

          if (this.isDefaultPlusMode()) {
            // 30% chance for pregnancy details
            if (Math.random() < 0.3) {
              await this.createPregnancyDetails(client, provClaimNo, new Date());
            }
          }

          // ── 5. Create Claim Items / Services ──
          const items = [];
          const serviceCode = eventType.startsWith('MEDICATION') ? '010203-0101-5406-02-11' : (eventType.startsWith('LAB') ? 'CBC' : 'CT-HEAD-WO-CONTRAST');
          const serviceDesc = eventType.startsWith('MEDICATION') ? "otozol clotrimazole '1 % solution/ drops" : (eventType.startsWith('LAB') ? 'Complete Blood Count' : 'CT head without contrast');
          let serviceType = 'service';
          if (eventType.startsWith('MEDICATION')) {
            serviceType = 'drug';
          } else if (eventType.startsWith('LAB')) {
            serviceType = 'lab';
          } else if (eventType === 'RADIOLOGY_ORDER') {
            serviceType = 'RADIOLOGY-ORDER';
          } else if (eventType === 'RADIOLOGY_RESULT') {
            serviceType = 'RADIOLOGY-RESULT';
          }

          const claimItem = await this.createClaimItem(client, provClaimNo, 1, serviceType, serviceCode, serviceDesc);
          items.push(claimItem);

          if (this.isDefaultPlusMode()) {
            if (serviceType === 'drug') {
              await this.createClaimItemMedication(client, provClaimNo, 1, serviceCode, serviceDesc);
              await this.createClaimItemDosage(client, provClaimNo, 1);
            } else {
              await this.createClaimItemProcedure(client, provClaimNo, 1, serviceCode, serviceDesc);
            }
          }

          // Create Claim Item Details (to satisfy event detection logic)
          let detailsServiceType = 'service';
          if (eventType.startsWith('LAB')) {
            detailsServiceType = 'LAB';
          } else if (eventType === 'RADIOLOGY_ORDER') {
            detailsServiceType = 'RADIOLOGY-ORDER';
          } else if (eventType === 'RADIOLOGY_RESULT') {
            detailsServiceType = 'RADIOLOGY-RESULT';
          } else if (eventType.startsWith('MEDICATION')) {
            detailsServiceType = 'Medication Codes';
          }
          await this.createClaimItemDetails(client, provClaimNo, 1, 1, detailsServiceType, serviceCode, serviceDesc);

          // Create Claim Supporting Info (if it is a RESULT event to satisfy event detection logic)
          if (eventType === 'LAB_RESULT' || eventType === 'RADIOLOGY_RESULT') {
            await this.createClaimSupportingInfo(client, provClaimNo, 1, 'attachment', 'Lab/Radiology report attachment', true);
          }

          // ── 6. Create Care Team ──
          const careTeam = await this.createClaimCareTeam(client, provClaimNo);

          // ── 7. Create Claim Encounters ──
          const encounterClass = eventType.startsWith('MEDICATION') ? 'IMP' : 'AMB';
          const encounter = await this.createClaimEncounter(client, provClaimNo, encounterClass, isResult ? 'finished' : 'in-progress');

          // Links
          await this.createItemCareTeam(client, provClaimNo, 1, 1);

          if (config.isDraft) {
            payload = this.buildFhirPayload(eventType, provClaimNo, beneficiary, claiminfo, claimItem, careTeam, encounter);
            await client.rollback();
            eventsCreated++;
            generatedProvClaimNos.push(provClaimNo);
            console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);
            if (config.numberOfEvents > 1 && (i + 1) < config.numberOfEvents) {
              await client.beginTransaction();
            }
            continue;
          }

          if (config.numberOfEvents === 1) {
            await client.commit();
          }
          eventsCreated++;
          generatedProvClaimNos.push(provClaimNo);
          console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);

          if (config.numberOfEvents > 1 && (i + 1) % batchSize === 0 && (i + 1) < config.numberOfEvents) {
            await client.commit();
            await client.beginTransaction();
          }

          if (config.numberOfEvents === 1 && !config.skipWritePayload) {
            payload = this.buildFhirPayload(eventType, provClaimNo, beneficiary, claiminfo, claimItem, careTeam, encounter);
          } else {
            payload = 'you can show sample json for 1 event only at a time';
          }
        } catch (iterationError) {
          if (client) await client.rollback();
          console.error(`Error generating FHIR event ${i + 1}:`, iterationError);
          lastError = iterationError;
          failedEvents++;
          if (config.numberOfEvents > 1 && (i + 1) < config.numberOfEvents) {
            await client.beginTransaction();
          }
        }
      }

      if (config.numberOfEvents > 1) {
        await client.commit();
      }

      return {
        success: eventsCreated > 0,
        message: `Successfully created ${eventsCreated} FHIR events.${failedEvents > 0 ? ` Failed: ${failedEvents}. Last error: ${lastError?.message || 'Unknown'}` : ''}`,
        eventsCreated,
        generatedProvClaimNos,
        payload
      };
    } catch (error) {
      console.error('FHIR Data generation fatal error:', error);
      return {
        success: false,
        message: `Fatal Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        eventsCreated: 0
      };
    } finally {
      if (client) await client.release();
    }
  }

  truncate(value, maxLength) {
    const val = value || '';
    return val.length > maxLength ? val.substring(0, maxLength) : val;
  }

  generateProvClaimNo() {
    return `CLM${faker.string.alphanumeric(10).toUpperCase()}${Date.now().toString().slice(-7)}`;
  }

  generateId(prefix, length = 15) {
    const numericPart = faker.string.numeric(Math.max(1, length - prefix.length));
    return `${prefix}${numericPart}`.substring(0, length);
  }

  async createEvent(client, provClaimNo, eventType) {
    const eventId = this.generateId('EVT', 47);
    const isUhr = this.isEnhancedMode();
    const colCreatedDate = isUhr || this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql'
      ? 'CREATED_DATE'
      : 'createddate';
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}events 
      (eventid, provclaimno, eventtype, ${colCreatedDate}, issubmitted)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, provClaimNo, eventType, new Date(), false]);
  }

  async createBeneficiary(client) {
    const beneficiaryId = this.generateId('BEN', 17);
    const patientFileNo = this.truncate(`PF${faker.string.alphanumeric(8).toUpperCase()}`, 30);
    const firstName = this.truncate(faker.person.firstName(), 50);
    const middleName = this.truncate(faker.person.middleName(), 50);
    const lastName = this.truncate(faker.person.lastName(), 50);
    const fullName = this.truncate(`${firstName} ${middleName} ${lastName}`, 200);
    const dob = faker.date.birthdate({ min: 1940, max: 2020, mode: 'year' });
    const gender = faker.helpers.arrayElement(['male', 'female']);
    const documentId = CONSTANTS.DOCUMENT_ID;
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
      dob, gender, 'SA', 'National-ID', documentId, '+966-501234567', '30000999999999',
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
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}beneficiary
      (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return {
      beneficiaryId, patientFileNo, firstName, middleName, lastName, fullName, dob, gender, documentId
    };
  }

  async createCoverage(client, beneficiaryId) {
    const coverageId = this.generateId('COV', 17);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}coverage 
      (coverageid, memberid, expirydate, payernphiesid, relationwithsubscriber,
       policyholder, coveragetype, beneficiaryid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      coverageId, 'MEM987654321', faker.date.future({ years: 1 }), 'PAY10000000000001', 'self',
      'Waseel Provider Organization', 'EHCPOL', beneficiaryId
    ]);
    return coverageId;
  }

  async createCoverageClass(client, coverageId) {
    const coverageClassId = this.generateId('CLS', 17);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}coverage_class 
      (coverageclassid, type, value, name, coverageid)
      VALUES ($1,$2,$3,$4,$5)
    `, [coverageClassId, 'plan', 'PLAN-UHR', 'UHR Coverage Plan', coverageId]);
  }

  async createClaimInfo(client, provClaimNo, beneficiaryId, coverageId, eventType) {
    const billableStart = faker.date.recent({ days: 30 });
    const billableEnd = faker.date.soon({ days: 7, refDate: billableStart });
    const claimCreatedDate = new Date();
    const episodeId = this.generateId('EP', 17);
    const payeeId = this.generateId('PYE', 17);

    const isMedication = eventType.startsWith('MEDICATION');
    const claimSubtype = isMedication ? 'ip' : 'op';
    const isDefaultPlus = this.isDefaultPlusMode();

    const cols = [
      'provclaimno', 'episodeid', 'isnewborn', 'isreferral', 'claimtype', 'claimsubtype',
      'providernphiesid', 'claimcreateddate', 'accountingperiod', 'billableperiodstart', 'billableperiodend',
      'payeetype', 'payeeid', 'coverageid', 'beneficiaryid', 'total'
    ];
    const vals = [
      provClaimNo, episodeId, 'false', 'false', '01.08', claimSubtype,
      CONSTANTS.PROVIDER_NPHIES_ID, claimCreatedDate, new Date(), billableStart, billableEnd,
      'provider', payeeId, coverageId, beneficiaryId, 1500.00
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
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claiminfo 
      (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return { provClaimNo, claimCreatedDate, billableStart, billableEnd, episodeId };
  }

  async createClaimItem(client, provClaimNo, sequenceNo, serviceType, serviceCode, serviceDesc) {
    const invoiceNo = this.truncate(faker.string.alphanumeric(10).toUpperCase(), 20);
    const startDate = faker.date.recent({ days: 7 });
    const endDate = faker.date.recent({ days: 1 });

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem
      (provclaimno, invoiceno, sequenceno, servicetype, servicecode, servicedesc,
       ispackage, quantity, unitprice, discount, factor, patientshare, payershare, tax, net,
       startdate, enddate)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, [
      provClaimNo, invoiceNo, sequenceNo, serviceType, serviceCode, serviceDesc,
      'false', 1.00, 150.00, 0.00, 1.00, 22.50, 127.50, 22.50, 172.50,
      startDate, endDate
    ]);

    return { serviceCode, serviceDesc, startDate, endDate, serviceType };
  }

  async createClaimCareTeam(client, provClaimNo) {
    const physicianName = 'Dr. Aditya Khan';
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimcareteam 
      (provclaimno, sequenceno, physicianid, physicianname, practitionerrole, careteamrole, careteamqualification)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [provClaimNo, 1, CONSTANTS.PHYSICIAN_ID, physicianName, 'doctor', 'primary', 'MD']);

    return { physicianId: CONSTANTS.PHYSICIAN_ID, physicianName };
  }

  async createItemCareTeam(client, provClaimNo, careTeamSeq, itemSeq) {
    let query = `
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}itemcareteam 
      (provclaimno, careteamsequenceno, itemsequenceno)
      VALUES ($1,$2,$3)
    `;
    if (this.dbConfig.type === 'postgres') query += ' ON CONFLICT DO NOTHING';
    try { await client.query(query, [provClaimNo, careTeamSeq, itemSeq]); } catch (e) { }
  }

  async createClaimEncounter(client, provClaimNo, encounterClass, encounterStatus) {
    const encounterId = this.generateId('ENC', 17);
    const startDate = faker.date.recent({ days: 30 });
    const endDate = faker.date.soon({ days: 7, refDate: startDate });
    const isDefaultPlus = this.isDefaultPlusMode();

    const cols = [
      'provclaimno', 'encounterid', 'encounterstartdate', 'encounterenddate', 'encounterclass',
      'encounterservicetype', 'priority', 'serviceprovider', 'encounterstatus'
    ];
    const vals = [
      provClaimNo, encounterId, startDate, endDate, encounterClass,
      'consultation', 'routine', CONSTANTS.PROVIDER_NPHIES_ID, encounterStatus
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
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimencounters
      (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);

    return { encounterId, encounterClass, encounterStatus, startDate, endDate };
  }

  async createClaimItemDetails(client, provClaimNo, itemSequenceNo, sequenceNo, serviceType, serviceCode, serviceDesc) {
    const quantity = parseInt(faker.finance.amount({ min: 1, max: 5, dec: 0 }));
    const unitPrice = parseFloat(faker.finance.amount({ min: 10, max: 1000, dec: 2 }));
    const tax = unitPrice * quantity * 0.15;
    const net = unitPrice * quantity + tax;

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitemdetails
      (itemsequenceno, provclaimno, sequenceno, servicetype, servicecode, servicedesc,
       nonstandardcode, nonstandarddesc, udi, quantity, quantitycode, unitprice,
       tax, net, prescribeddrugcode, pharmacistselectionreason, pharmacistsubstitute,
       reasonpharmacistsubstitute)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [
      itemSequenceNo, provClaimNo, sequenceNo,
      serviceType, serviceCode, serviceDesc,
      null, null, null, quantity, 'unit', unitPrice,
      tax, net, null, null, null, null
    ]);
  }

  async createPregnancyDetails(client, provClaimNo, startDate) {
    console.log(`[DataGenerator] createPregnancyDetails → table: ${this.schemaPrefix}${this.tablePrefix}pregnancy_details`);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}pregnancy_details (provclaimno, start_date)
      VALUES ($1, $2)
    `, [provClaimNo, startDate]);
  }

  async createClaimItemMedication(client, provClaimNo, itemSeq, code, desc) {
    console.log(`[DataGenerator] createClaimItemMedication[item=${itemSeq}] → table: ${this.schemaPrefix}${this.tablePrefix}claimitem_medication`);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem_medication
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
    console.log(`[DataGenerator] createClaimItemDosage[item=${itemSeq}] → table: ${this.schemaPrefix}${this.tablePrefix}claimitem_dosage`);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem_dosage
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
    console.log(`[DataGenerator] createClaimItemProcedure[item=${itemSeq}] → table: ${this.schemaPrefix}${this.tablePrefix}claimitem_procedure`);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem_procedure
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

  async createClaimSupportingInfo(client, provClaimNo, sequenceNo, category, supportingValue, hasAttachment) {
    const attachmentBuffer = hasAttachment ? Buffer.from('mock-attachment-content-for-fhir') : null;
    const filename = hasAttachment ? 'attachment.pdf' : null;
    const mimeType = hasAttachment ? 'application/pdf' : null;

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo
      (provclaimno, sequenceno, category, reason, supportingvalue,
       supportingattachment, attachmentfilename, attachmenttype, code, unit,
       timingperiodfrom, timingperiodto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      provClaimNo, sequenceNo, category, null, supportingValue,
      attachmentBuffer, filename, mimeType, null, null, null, null
    ]);
  }

  buildFhirPayload(eventType, provClaimNo, beneficiary, claiminfo, claimItem, careTeam, encounter) {
    const createdDate = claiminfo.claimCreatedDate.toISOString();
    const age = new Date().getFullYear() - new Date(beneficiary.dob).getFullYear();
    const isDispense = eventType === 'MEDICATION_DISPENSE';

    const uhrRequest = {
      id: faker.number.int({ min: 1000, max: 9999 }),
      midtableId: faker.number.int({ min: 2000, max: 9999 }),
      source: eventType.startsWith('MEDICATION') ? 'MEDICATION_SYSTEM' : (eventType.startsWith('LAB') ? 'LAB_ORDER_SYSTEM' : 'RADIOLOGY_SYSTEM'),
      createdDate,
      visitNumber: provClaimNo,
      compositionIdentifier: `COMP-2026-02-${faker.string.numeric(2)}-001`,
      provider: {
        providerID: CONSTANTS.PROVIDER_NPHIES_ID,
        providerName: "International University Hospital",
        nphiesOrganizationID: "2.16.840.1.113883.3.3731.5.1",
        nphiesOrganizationName: "International University Hospital",
        contactInfo: {
          phoneNumber: "+966500000001"
        }
      },
      caseInfo: {
        visitType: encounter.encounterClass === 'IMP' ? 'INPATIENT' : 'OUTPATIENT',
        admissionMethod: "OTHER",
        visitNumber: provClaimNo,
        admitDate: encounter.startDate.toISOString().substring(0, 10),
        dischargeDate: encounter.encounterStatus === 'finished' ? encounter.endDate.toISOString().substring(0, 10) : "",
        lengthOfStay: 3,
        chiefComplaints: "General checkup",
        patientLocation: {
          room: encounter.encounterClass === 'IMP' ? '101' : null,
          bed: encounter.encounterClass === 'IMP' ? 'A' : null,
          pointOfCare: encounter.encounterClass === 'IMP' ? 'MED-UNIT-1' : null,
          facilityId: "2.16.840.1.113883.3.3731.1.2.2"
        }
      },
      patient: {
        id: "30000999999999",
        healthId: "30000999999999",
        documentId: beneficiary.documentId,
        age,
        gender: beneficiary.gender.toUpperCase(),
        dateOfBirth: beneficiary.dob.toISOString().substring(0, 10),
        nationality: "saudi",
        maritalStatus: "MARRIED",
        contactInfo: {
          fullName: beneficiary.fullName,
          firstName: beneficiary.firstName,
          lastName: beneficiary.lastName,
          phoneNumber: "+966501234567",
          email: beneficiary.email || "mohammed@email.sa",
          address: {
            street: "King Fahd Road",
            city: "Riyadh",
            postalCode: "12345",
            country: "Saudi Arabia"
          }
        }
      },
      careTeam: [
        {
          id: careTeam.physicianId,
          nationalId: careTeam.physicianId,
          contactInfo: {
            fullName: careTeam.physicianName,
            firstName: "Aditya",
            lastName: "Khan",
            phoneNumber: "+966500000002"
          },
          type: "doctor",
          role: "100000003",
          speciality: "CE9D7C6B-62F9-E811-B80F-005056AD2FD8",
          notes: "Physician in charge"
        }
      ],
      diagnosis: [
        {
          id: 1,
          code: "ACTIVE_PROBLEMS",
          priority: "PRINCIPAL",
          info: [
            {
              diagnosisProcedureCode: "A25.0",
              description: "Effusion of joint, lower leg",
              dateFrom: encounter.startDate.toISOString().substring(0, 10),
              status: "COMPLETED"
            }
          ]
        }
      ],
      services: [],
      medication: [],
      allergy: [
        {
          code: 442441000124101,
          severity: "MODERATE",
          type: "FOOD_ALLERGY",
          notes: "Food allergy noted"
        }
      ]
    };

    if (eventType.startsWith('MEDICATION')) {
      uhrRequest.medication = [
        {
          id: 1,
          medicine: {
            code: claimItem.serviceCode,
            displayName: claimItem.serviceDesc
          },
          packaging: {
            code: "27",
            displayName: "bottle, spray"
          },
          dosage: {
            form: {
              code: "0601",
              displayName: "gel"
            },
            prescriptionValidityPeriod: {
              start: createdDate.substring(0, 10),
              end: claimItem.endDate.toISOString().substring(0, 10)
            },
            quantity: {
              unit: "MILLIGRAM",
              value: "30"
            },
            duration: {
              unit: "DAY",
              value: "30"
            },
            dosagePeriod: {
              start: createdDate.substring(0, 10),
              end: claimItem.endDate.toISOString().substring(0, 10)
            },
            instruction: "Take medicine before lunch and dinner",
            route: "26643006",
            asNeeded: true,
            doseAndRate: {
              unit: "MILLIGRAM",
              value: "30"
            }
          },
          prescriptionType: "CONTROLLED",
          dispenseType: isDispense ? "FF" : undefined,
          notes: "Take 5mg medicine direct.",
          receiver: {
            healthId: "30000999999999"
          },
          dosageTiming: {
            code: "422114001",
            displayName: "Once"
          },
          ...(isDispense ? {
            whenHandedOver: createdDate.substring(0, 10),
            batchInfo: {
              lotNumber: "LOT-" + faker.string.alphanumeric(8).toUpperCase(),
              expirationDate: "2027-12-31"
            }
          } : {})
        }
      ];
    } else {
      const isLab = eventType.startsWith('LAB');
      const priority = "routine";

      uhrRequest.services = [
        {
          id: 1,
          code: claimItem.serviceCode,
          date: createdDate,
          isLab,
          priority,
          isFasting: false,
          type: isLab ? "Laboratory" : "radiology",
          description: claimItem.serviceDesc,
          serviceInfo: {}
        }
      ];

      if (eventType === 'LAB_ORDER') {
        uhrRequest.services[0].serviceInfo = {
          laboratoryOrders: [
            {
              orderIdentifier: `ORD-${claimItem.serviceCode}-2026-001`,
              labDepartment: "HEMATOLOGY_STUDIES",
              priority: "ROUTINE",
              serviceRequestStatus: "ACTIVE",
              specimenCollection: {
                specimenType: "BLD",
                specimenSource: "BLD",
                collectionDate: createdDate,
                specimenCollectionMethodEnum: "VENIP"
              },
              sampleOperations: [
                {
                  priority: "ROUTINE",
                  title: "Blood Sample Collection",
                  text: "Venous blood sample collected for analysis"
                }
              ],
              specimenHandlingNote: "Handle with standard precautions"
            }
          ]
        };
      } else if (eventType === 'LAB_RESULT') {
        uhrRequest.services[0].serviceInfo = {
          laboratoryResults: [
            {
              accessionNumber: `ACC-2026-${faker.string.numeric(3)}`,
              labDepartment: "HEMATOLOGY_STUDIES",
              status: "FINAL",
              observationNote: "Normal values.",
              sampleResult: {
                valueQuantity: { value: "14.8", unit: "g/dL" },
                sampleResultInterpretation: "NORMAL",
                text: "Complete blood count results within standard reference ranges."
              }
            }
          ]
        };
      } else if (eventType === 'RADIOLOGY_ORDER') {
        uhrRequest.services[0].serviceInfo = {
          radiologyProcedures: [
            {
              procedure: claimItem.serviceCode,
              procedureDescription: claimItem.serviceDesc,
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
        uhrRequest.services[0].serviceInfo = {
          radiologyProcedures: [
            {
              procedure: claimItem.serviceCode,
              procedureDescription: claimItem.serviceDesc,
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

  parseDateIfNeeded(val) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return new Date(val);
    }
    return val;
  }

  getMedicationPayloadFilePath(projectRoot, scenarioId = '', description = '', eventType = '') {
    const sId = (scenarioId || '').toUpperCase();
    const desc = (description || '').toLowerCase();

    const baseDir = path.join(projectRoot, 'Medication Prescription Payloads');
    const candidates = [];

    if (sId === 'TC-MED-REQ-01' || (desc.includes('non-raqeeb') && desc.includes('normal') && desc.includes('generic'))) {
      candidates.push(
        path.join(baseDir, 'Non Raqeeb', 'non_raqeeb_normal_generic.txt'),
        path.join(baseDir, 'Non Raqeeb', 'Medication Prescrition Event - Non- Raqeeb - Normal Dosage (Generic medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-02' || (desc.includes('non-raqeeb') && desc.includes('split') && desc.includes('generic'))) {
      candidates.push(
        path.join(baseDir, 'Non Raqeeb', 'non_raqeeb_split_generic.txt'),
        path.join(baseDir, 'Non Raqeeb', 'Medication Prescrition Event - Non- Raqeeb - Split Dosage (Generic medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-03' || (desc.includes('non-raqeeb') && desc.includes('normal') && (desc.includes('compound') || desc.includes('compounded')))) {
      candidates.push(
        path.join(baseDir, 'Non Raqeeb', 'non_raqeeb_normal_generic.txt'),
        path.join(baseDir, 'Non Raqeeb', 'Medication Prescrition Event - Non- Raqeeb - Normal Dosage (Compounded medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-04' || (desc.includes('non-raqeeb') && desc.includes('split') && (desc.includes('compound') || desc.includes('compounded')))) {
      candidates.push(
        path.join(baseDir, 'Non Raqeeb', 'non_raqeeb_split_compound.txt'),
        path.join(baseDir, 'Non Raqeeb', 'Medication Prescrition Event - Non- Raqeeb - Split Dosage (Compounded medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-05' || (desc.includes('raqeeb') && desc.includes('normal'))) {
      candidates.push(
        path.join(baseDir, 'Raqeeb', 'raqeeb_normal_generic.txt'),
        path.join(baseDir, 'Raqeeb', 'Medication Prescrition Event - Raqeeb - Normal Dosage (Generic medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-06' || (desc.includes('raqeeb') && desc.includes('split'))) {
      candidates.push(
        path.join(baseDir, 'Raqeeb', 'raqeeb_split_generic.txt'),
        path.join(baseDir, 'Raqeeb', 'Medication Prescrition Event - Raqeeb - Split Dosage (Generic medicine).txt')
      );
    } else if (sId === 'TC-MED-REQ-07' || (desc.includes('raqeeb') && desc.includes('tapered'))) {
      candidates.push(
        path.join(baseDir, 'Raqeeb', 'raqeeb_tapered_generic.txt'),
        path.join(baseDir, 'Raqeeb', 'Medication Prescrition Event - Raqeeb - Tapered Dosage (Generic medicine).txt')
      );
    }

    for (const fileCandidate of candidates) {
      if (fs.existsSync(fileCandidate)) {
        return fileCandidate;
      }
    }

    // Dynamic search in Medication Prescription Payloads directory if candidates didn't match exact path
    if (fs.existsSync(baseDir)) {
      try {
        const findMatchingFile = (dir) => {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              const res = findMatchingFile(fullPath);
              if (res) return res;
            } else if (item.isFile() && item.name.endsWith('.txt')) {
              const nameLower = item.name.toLowerCase();
              if (desc.includes('raqeeb') && !desc.includes('non-raqeeb') && nameLower.includes('raqeeb') && !nameLower.includes('non')) {
                if (desc.includes('tapered') && nameLower.includes('tapered')) return fullPath;
                if (desc.includes('split') && nameLower.includes('split')) return fullPath;
                if (desc.includes('normal') && nameLower.includes('normal')) return fullPath;
              } else if (desc.includes('non-raqeeb') || nameLower.includes('non')) {
                if (desc.includes('compound') && nameLower.includes('compound')) return fullPath;
                if (desc.includes('split') && nameLower.includes('split')) return fullPath;
                if (desc.includes('normal') && nameLower.includes('normal')) return fullPath;
              }
            }
          }
          return null;
        };
        const dynamicMatch = findMatchingFile(baseDir);
        if (dynamicMatch) return dynamicMatch;
      } catch (e) {
        // Fallthrough to root template
      }
    }

    // Default fallback root template file
    if (eventType === 'MEDICATION_DISPENSE' || sId.includes('DISP')) {
      const dispenseFile = path.join(projectRoot, 'medication_dispense_payload.json');
      if (fs.existsSync(dispenseFile)) return dispenseFile;
    }
    return path.join(projectRoot, 'medication_request_payload.json');
  }

  loadTemplateAsCustomPayload(eventType, scenarioId = '', description = '') {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    let filePath = '';
    if (eventType === 'LAB_ORDER') {
      filePath = path.join(projectRoot, 'lab_order_payload.json');
    } else if (eventType === 'LAB_RESULT') {
      filePath = path.join(projectRoot, 'lab_result_payload.json');
    } else if (eventType === 'RADIOLOGY_ORDER') {
      filePath = path.join(projectRoot, 'radiology_order_payload.json');
    } else if (eventType === 'RADIOLOGY_RESULT') {
      filePath = path.join(projectRoot, 'radiology_result_payload.json');
    } else if (eventType === 'MEDICATION_REQUEST' || eventType === 'MEDICATION_DISPENSE') {
      filePath = this.getMedicationPayloadFilePath(projectRoot, scenarioId, description, eventType);
    } else {
      return null;
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Template payload file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const payloadJson = JSON.parse(content);

    const generatedData = {};
    for (const entry of payloadJson.results) {
      const normalizedTableName = entry.tableName.replace(/^(nphies_|uhr_)/i, '').toLowerCase();
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
    if (rules.serviceType !== undefined || rules.serviceCode !== undefined || rules.serviceDesc !== undefined || eventType === 'RADIOLOGY_ORDER' || eventType === 'RADIOLOGY_RESULT') {
      const defaultRadServiceType = eventType === 'RADIOLOGY_ORDER' ? 'RADIOLOGY-ORDER' : eventType === 'RADIOLOGY_RESULT' ? 'RADIOLOGY-RESULT' : undefined;
      const effectiveServiceType = (rules.serviceType === undefined || rules.serviceType === 'IMAGING' || rules.serviceType === 'imaging')
        ? (defaultRadServiceType || rules.serviceType)
        : rules.serviceType;

      if (data.claimitems) {
        for (const item of data.claimitems) {
          if (effectiveServiceType !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicetype');
            if (key) item[key] = effectiveServiceType;
          }
          if (rules.serviceCode !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicecode');
            if (key) {
              if (eventType === 'MEDICATION_DISPENSE') {
                const origCode = item[key] || '';
                const isDispenseItem = /-\d{2}-\d{2}$/.test(origCode);
                const hasSuffix = /-\d{2}-\d{2}$/.test(rules.serviceCode);

                if (isDispenseItem) {
                  item[key] = hasSuffix ? rules.serviceCode : `${rules.serviceCode}-04-03`;
                } else {
                  item[key] = hasSuffix ? rules.serviceCode.replace(/(-\d{2})+$/, '') : rules.serviceCode;
                }
              } else {
                item[key] = rules.serviceCode;
              }
            }
          }
          if (rules.serviceDesc !== undefined) {
            const key = Object.keys(item).find(k => k.toLowerCase() === 'servicedesc');
            if (key) item[key] = rules.serviceDesc;
          }
        }
      }
      if (data.claimitemdetails) {
        for (const detail of data.claimitemdetails) {
          if (effectiveServiceType !== undefined) {
            const key = Object.keys(detail).find(k => k.toLowerCase() === 'servicetype');
            if (key) detail[key] = effectiveServiceType;
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

    // 5. Override claimsupportinginfo attachment if requested
    if (rules.supportingAttachment !== undefined && data.claimsupportinginfo) {
      for (const info of data.claimsupportinginfo) {
        const catKey = Object.keys(info).find(k => k.toLowerCase() === 'category');
        if (catKey && info[catKey] === 'attachment') {
          if (rules.supportingAttachment === '' || rules.supportingAttachment === null) {
            const attKey = Object.keys(info).find(k => k.toLowerCase() === 'supportingattachment');
            const fnKey = Object.keys(info).find(k => k.toLowerCase() === 'attachmentfilename');
            const typeKey = Object.keys(info).find(k => k.toLowerCase() === 'attachmenttype');
            if (attKey) info[attKey] = null;
            if (fnKey) info[fnKey] = null;
            if (typeKey) info[typeKey] = null;
          }
        }
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

    // 7. Enforce specific categories and values for LAB_ORDER and LAB_RESULT claimsupportinginfo
    if (data.claimsupportinginfo) {
      for (const info of data.claimsupportinginfo) {
        const catKey = Object.keys(info).find(k => k.toLowerCase() === 'category');
        const valKey = Object.keys(info).find(k => k.toLowerCase() === 'supportingvalue');
        if (catKey && valKey) {
          const category = info[catKey];
          if (eventType === 'LAB_ORDER') {
            if (category === 'lab-specimen-type') {
              info[valKey] = faker.helpers.arrayElement(LAB_SPECIMEN_TYPES);
            }
          } else if (eventType === 'LAB_RESULT') {
            if (category === 'lab-department') {
              info[valKey] = faker.helpers.arrayElement(LAB_DEPARTMENTS);
            } else if (category === 'lab-result-range') {
              const low = faker.number.int({ min: 10, max: 50 });
              const high = low + faker.number.int({ min: 5, max: 35 });
              const unit = faker.helpers.arrayElement(["g/dL", "cm[Hg]", "mmol/L", "mg/dL"]);
              info[valKey] = `${low};;${unit};;${high};;${unit}`;
            }
          }
        }
      }
    }

    // 8. For LAB_RESULT and RADIOLOGY_RESULT, make sure attachment is positioned correctly
    if ((eventType === 'LAB_RESULT' || eventType === 'RADIOLOGY_RESULT') && data.claimsupportinginfo) {
      const attachmentRowIdx = data.claimsupportinginfo.findIndex(info => {
        const catKey = Object.keys(info).find(k => k.toLowerCase() === 'category');
        return catKey && info[catKey] === 'attachment';
      });

      if (rules.supportingAttachment === '' || rules.supportingAttachment === null) {
        // Negative scenario: remove any attachment row
        if (attachmentRowIdx !== -1) {
          data.claimsupportinginfo.splice(attachmentRowIdx, 1);
        }
        // Remove supportingattachment property from all remaining rows so they are inserted as NULL/omitted
        for (const row of data.claimsupportinginfo) {
          const attKey = Object.keys(row).find(k => k.toLowerCase() === 'supportingattachment');
          if (attKey) delete row[attKey];
        }
      } else {
        // Calculate the smallest sequence number among all other rows to make sure this row is sorted first in DB
        let minSeq = 999999999;
        for (const info of data.claimsupportinginfo) {
          const catKey = Object.keys(info).find(k => k.toLowerCase() === 'category');
          if (catKey && info[catKey] === 'attachment') continue;
          const seqKey = Object.keys(info).find(k => k.toLowerCase() === 'sequenceno');
          if (seqKey && info[seqKey]) {
            const seqVal = parseInt(info[seqKey]);
            if (seqVal < minSeq) minSeq = seqVal;
          }
        }
        if (minSeq === 999999999) minSeq = 2;
        const newSeq = String(minSeq - 1);

        // Positive scenario: ensure attachment row exists and is at the front (index 0)
        let attachmentRow;
        if (attachmentRowIdx !== -1) {
          attachmentRow = data.claimsupportinginfo.splice(attachmentRowIdx, 1)[0];
          const seqKey = Object.keys(attachmentRow).find(k => k.toLowerCase() === 'sequenceno');
          if (seqKey) attachmentRow[seqKey] = newSeq;
          else attachmentRow['sequenceno'] = newSeq;

          const attKey = Object.keys(attachmentRow).find(k => k.toLowerCase() === 'supportingattachment');
          if (attKey) attachmentRow[attKey] = Buffer.from('mock-attachment-content-for-fhir');
          else attachmentRow['supportingattachment'] = Buffer.from('mock-attachment-content-for-fhir');
        } else {
          attachmentRow = {
            provclaimno: data.claiminfo?.[0]?.provclaimno || data.claiminfo?.[0]?.PROVCLAIMNO || '',
            sequenceno: newSeq,
            category: 'attachment',
            reason: 'Lab/Radiology report attachment',
            supportingvalue: 'Lab/Radiology report attachment',
            supportingattachment: Buffer.from('mock-attachment-content-for-fhir'),
            attachmentfilename: 'attachment.pdf',
            attachmenttype: 'application/pdf',
            code: null,
            unit: null,
            timingperiodfrom: null,
            timingperiodto: null
          };

          // Link in itemsupportinginfo as well
          if (data.itemsupportinginfo && data.claimitems) {
            for (const item of data.claimitems) {
              const itemSeqKey = Object.keys(item).find(k => k.toLowerCase() === 'sequenceno');
              if (itemSeqKey && item[itemSeqKey]) {
                data.itemsupportinginfo.push({
                  provclaimno: data.claiminfo?.[0]?.provclaimno || data.claiminfo?.[0]?.PROVCLAIMNO || '',
                  supportinginfosequenceno: newSeq,
                  itemsequenceno: item[itemSeqKey]
                });
              }
            }
          }
        }

        // Prepend it to the beginning of the array so it is inserted first and becomes supportRows[0]
        data.claimsupportinginfo.unshift(attachmentRow);
      }
    }

    // 9. For MEDICATION_REQUEST and MEDICATION_DISPENSE
    if ((eventType === 'MEDICATION_REQUEST' || eventType === 'MEDICATION_DISPENSE') && data.claimsupportinginfo) {
      const desc = (this.scenarioDescription || '').toLowerCase();
      const sId = (this.scenarioId || '').toUpperCase();
      if (sId === 'TC-MED-REQ-03' || (desc.includes('compound') && desc.includes('normal'))) {
        let infoRow = data.claimsupportinginfo.find(i => {
          const catKey = Object.keys(i).find(k => k.toLowerCase() === 'category');
          return catKey && i[catKey] === 'medication-prescription-info';
        });
        if (infoRow) {
          const reasonKey = Object.keys(infoRow).find(k => k.toLowerCase() === 'reason');
          if (reasonKey) infoRow[reasonKey] = 'Mix 2 ingrident and make this spesific medicine';
        }
      }

      // Ensure sequence no. in itemcareteam is the SAME as sequence no. of record with category medication-practitioner-info of claimsupportinginfo
      const claimItemSeq = data.claimitems?.[0] ? String(data.claimitems[0].sequenceno || data.claimitems[0].SEQUENCENO || '') : null;
      if (claimItemSeq) {
        const pracRow = data.claimsupportinginfo.find(i => {
          const catKey = Object.keys(i).find(k => k.toLowerCase() === 'category');
          return catKey && i[catKey] === 'medication-practitioner-info';
        });

        if (pracRow) {
          const seqKey = Object.keys(pracRow).find(k => k.toLowerCase() === 'sequenceno');
          if (seqKey) {
            pracRow[seqKey] = claimItemSeq;
          }
        }

        if (data.itemcareteam && Array.isArray(data.itemcareteam)) {
          for (const ict of data.itemcareteam) {
            const itemSeqKey = Object.keys(ict).find(k => k.toLowerCase() === 'itemsequenceno');
            if (itemSeqKey) {
              ict[itemSeqKey] = claimItemSeq;
            }
          }
        }
      }

      // Ensure MEDICATION_DISPENSE flow includes corresponding prescription event (MEDICATION_REQUEST)
      if (eventType === 'MEDICATION_DISPENSE') {
        const provClaimNo = data.claiminfo?.[0]?.provclaimno || data.claiminfo?.[0]?.PROVCLAIMNO || '';
        if (!data.events || data.events.length === 0) {
          data.events = [
            {
              eventid: '1',
              provclaimno: provClaimNo,
              eventtype: 'MEDICATION_REQUEST',
              createddate: new Date(Date.now() - 300000).toISOString(),
              issubmitted: 'false',
              created_date: new Date(Date.now() - 300000).toISOString()
            },
            {
              eventid: '2',
              provclaimno: provClaimNo,
              eventtype: 'MEDICATION_DISPENSE',
              createddate: new Date().toISOString(),
              issubmitted: 'false',
              created_date: new Date().toISOString()
            }
          ];
        } else {
          // Retain MEDICATION_REQUEST and MEDICATION_DISPENSE in data.events
          data.events = data.events.filter(e => {
            const type = e.eventtype || e.EVENTTYPE;
            return type === 'MEDICATION_REQUEST' || type === 'MEDICATION_DISPENSE';
          });

          const hasReq = data.events.some(e => (e.eventtype || e.EVENTTYPE) === 'MEDICATION_REQUEST');
          const hasDisp = data.events.some(e => (e.eventtype || e.EVENTTYPE) === 'MEDICATION_DISPENSE');

          if (!hasReq) {
            data.events.unshift({
              eventid: '1',
              provclaimno: provClaimNo,
              eventtype: 'MEDICATION_REQUEST',
              createddate: new Date(Date.now() - 300000).toISOString(),
              issubmitted: 'false',
              created_date: new Date(Date.now() - 300000).toISOString()
            });
          }

          if (!hasDisp) {
            data.events.push({
              eventid: '2',
              provclaimno: provClaimNo,
              eventtype: 'MEDICATION_DISPENSE',
              createddate: new Date().toISOString(),
              issubmitted: 'false',
              created_date: new Date().toISOString()
            });
          }

          // Ensure MEDICATION_REQUEST is ordered before MEDICATION_DISPENSE
          data.events.sort((a) => {
            const typeA = a.eventtype || a.EVENTTYPE;
            if (typeA === 'MEDICATION_REQUEST') return -1;
            return 1;
          });
        }
      }
    }
  }

  async insertCustomPayload(client, config) {
    const data = config.customPayload.generatedData;
    if (!data) {
      return { success: false, message: 'Invalid custom payload structure', eventsCreated: 0, generatedProvClaimNos: [] };
    }

    // Sanitize child table rows to prevent foreign key violations with missing parent records
    // 1. Filter by valid claim items (including claimitemdetails)
    if ((data.claimitems && data.claimitems.length > 0) || (data.claimitemdetails && data.claimitemdetails.length > 0)) {
      const validItemSeqs = new Set();
      if (data.claimitems) {
        for (const item of data.claimitems) {
          const seqKey = Object.keys(item).find(k => k.toLowerCase() === 'sequenceno');
          if (seqKey && item[seqKey]) validItemSeqs.add(String(item[seqKey]));
        }
      }
      if (data.claimitemdetails) {
        for (const detail of data.claimitemdetails) {
          const seqKey = Object.keys(detail).find(k => k.toLowerCase() === 'sequenceno');
          const itemSeqKey = Object.keys(detail).find(k => k.toLowerCase() === 'itemsequenceno');
          if (seqKey && detail[seqKey]) validItemSeqs.add(String(detail[seqKey]));
          if (itemSeqKey && detail[itemSeqKey]) validItemSeqs.add(String(detail[itemSeqKey]));
        }
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
        ['encounterhospitalization', `${this.schemaPrefix}${this.tablePrefix}encounterhospitalization`],
        ['claimitem_dosage', `${this.schemaPrefix}${this.tablePrefix}claimitem_dosage`],
        ['claimitem_medication', `${this.schemaPrefix}${this.tablePrefix}claimitem_medication`],
        ['claimitem_procedure', `${this.schemaPrefix}${this.tablePrefix}claimitem_procedure`],
        ...(!this.isAutoMode() && config.insertEventRow !== false ? [['events', `${this.schemaPrefix}${this.tablePrefix}events`]] : []),
      ];

      const payloadEventType = config.customPayload?.eventType ?? '';

      for (const [key, actualTableName] of tableMapping) {
        const rows = data[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        for (const rawRow of rows) {
          const row = remapRow(rawRow);

          if (key === 'events') {
            const etKey = Object.keys(row).find(k => k.toUpperCase() === 'EVENTTYPE');
            const originalType = rawRow[etKey] || rawRow[Object.keys(rawRow).find(k => k.toUpperCase() === 'EVENTTYPE')];
            if (etKey && originalType) {
              row[etKey] = originalType;
            } else if (etKey && payloadEventType) {
              row[etKey] = payloadEventType;
            }
          }

          if (key === 'beneficiary') {
            // Override created_date and updated_date with a different random date for each beneficiary
            const randomDate = faker.date.past({ years: 1 });
            const createdKey = Object.keys(row).find(k => k.toLowerCase() === 'created_date' || k.toLowerCase() === 'createddate');
            const updatedKey = Object.keys(row).find(k => k.toLowerCase() === 'updated_date' || k.toLowerCase() === 'updateddate');
            if (createdKey) row[createdKey] = randomDate;
            if (updatedKey) row[updatedKey] = randomDate;

            // Generate a random unique documentid if it is the default template ID
            const docIdKey = Object.keys(row).find(k => k.toLowerCase() === 'documentid');
            if (docIdKey && (row[docIdKey] === '250039448' || row[docIdKey] === '1016030643' || row[docIdKey] === '30000999999999')) {
              row[docIdKey] = faker.helpers.arrayElement(['1', '2']) + faker.string.numeric(9);
            }
          }

          // Filter out columns that are not in the database table (e.g. provclaimno from beneficiary/coverage/etc.)
          const tablesWithoutProvClaimNo = ['beneficiary', 'coverage', 'coverage_class', 'encounteremergency', 'encounterhospitalization'];
          if (tablesWithoutProvClaimNo.includes(key)) {
            const provClaimNoKey = Object.keys(row).find(k => k.toLowerCase() === 'provclaimno');
            if (provClaimNoKey) {
              delete row[provClaimNoKey];
            }
          }

          if (key === 'claimitems') {
            const invalidItemCols = ['order_identifier', 'accessionnumber', 'modalitycode', 'modality_code'];
            for (const invCol of invalidItemCols) {
              const matchedKey = Object.keys(row).find(k => k.toLowerCase() === invCol);
              if (matchedKey) delete row[matchedKey];
            }
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
        message: `FHIR Custom payload inserted successfully. New claim: ${newProvClaimNo}`,
        eventsCreated,
        generatedProvClaimNos: [newProvClaimNo],
        payload: config.customPayload
      };
    } catch (err) {
      if (!config.skipTransaction) {
        await client.rollback();
      }
      console.error('Failed to insert custom FHIR payload:', err);
      return { success: false, message: `Failed to insert custom FHIR payload: ${err.message}`, eventsCreated: 0, generatedProvClaimNos: [] };
    }
  }

  async close() {
    if (this.pgPool) { await this.pgPool.end(); this.pgPool = null; }
    if (this.mssqlPool) { await this.mssqlPool.close(); this.mssqlPool = null; }
    if (this.oracleConn) { await this.oracleConn.close(); this.oracleConn = null; }
    if (this.mysqlPool) { await this.mysqlPool.end(); this.mysqlPool = null; }
  }
}
