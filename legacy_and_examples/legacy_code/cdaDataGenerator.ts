import { faker } from '@faker-js/faker';
import { Pool, PoolClient } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import path from 'path';
import { fileURLToPath } from 'url';
import { GenerationConfig, ProviderType } from './dataGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Oracle Thick mode client if config provided
if (process.env.ORACLE_CLIENT_LIB) {
  try {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB });
  } catch (err: any) {
    if (err.message && !err.message.includes('already been initialized')) {
      console.warn('Oracle Thick mode init failed:', err.message);
    }
  }
} else {
  try {
    const libDir = path.resolve(__dirname, '..', 'electron', 'oracle_instantclient_18_5');
    oracledb.initOracleClient({ libDir });
  } catch (err: any) {
    if (err.message && !err.message.includes('already been initialized')) {
      if (process.env.ORACLE_DEBUG === '1') {
        console.warn('Oracle Thick mode unavailable, using Thin mode:', err.message);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CONSTANTS = {
  DOCUMENT_ID: '30511223344557',
  PROVIDER_NPHIES_ID: '15000000112233',
  PHYSICIAN_ID: '00TEST1980',
} as const;

const HOSPITAL_DISCHARGE_DISPOSITION_LOV: string[] = [
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

const EMERGENCY_DEPARTMENT_DISPOSITION_LOV: string[] = [
  'Admitted to this hospital',
  'Non-admitted patient ED episode completed-departed',
  'Non-admitted patient ED episode completed-referred',
  'Did Not Wait',
  'Left at Own Risk',
  'Died in ED',
  'Dead on Arrival',
  'Registered',
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type CdaEventType =
  | 'DISCHARGE_SUMMARY'
  | 'OUTPATIENT_ENCOUNTER_SUMMARY'
  | 'OPERATIVE_NOTE'
  | 'NEWBORN_DISCHARGE'
  | 'MATERNAL_DISCHARGE'
  | 'LAB_ORDER'
  | 'LAB_RESULT'
  | 'RADIOLOGY_ORDER'
  | 'RADIOLOGY_RESULT';

export type CdaSubType = 'institutional' | 'professional';

export interface CdaGenerationResult {
  success: boolean;
  message: string;
  eventsCreated: number;
  generatedProvClaimNos: string[];
  payload?: any;
}

interface CdaGeneratedRecord {
  beneficiary: any;
  claiminfo: any;
  claimItem: any;
  careTeam: any;
  encounter: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB client interfaces
// ─────────────────────────────────────────────────────────────────────────────
interface IDbClient {
  query(sql: string, params?: any[]): Promise<any>;
  release(): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

class PostgresClient implements IDbClient {
  constructor(private client: PoolClient) { }
  async query(sql: string, params?: any[]) { return this.client.query(sql, params); }
  async release() { this.client.release(); }
  async beginTransaction() { await this.client.query('BEGIN'); }
  async commit() { await this.client.query('COMMIT'); }
  async rollback() { await this.client.query('ROLLBACK'); }
}

class OracleClient implements IDbClient {
  constructor(private connection: oracledb.Connection) { }

  private formatDate(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} `
      + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  }

  private convertParams(params: any[]): any[] {
    return params.map(p => {
      if (p instanceof Date) return this.formatDate(p);
      if (typeof p === 'boolean') return p ? 1 : 0;
      return p;
    });
  }

  async query(sql: string, params?: any[]) {
    let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    const converted = params ? this.convertParams(params) : [];
    const dateIndices = params
      ? params.reduce<number[]>((acc, p, i) => { if (p instanceof Date) acc.push(i + 1); return acc; }, [])
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

class SqlServerClient implements IDbClient {
  private transaction: mssql.Transaction | null = null;
  constructor(private pool: mssql.ConnectionPool) { }

  async query(sql: string, params?: any[]) {
    const req = this.transaction ? this.transaction.request() : this.pool.request();
    if (params) params.forEach((p, i) => req.input(`p${i}`, p));
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

// ─────────────────────────────────────────────────────────────────────────────
// CdaDataGenerator
// ─────────────────────────────────────────────────────────────────────────────
export class CdaDataGenerator {
  private dbConfig: GenerationConfig['dbConfig'];
  private pgPool: Pool | null = null;
  private mssqlPool: mssql.ConnectionPool | null = null;
  private oracleConn: oracledb.Connection | null = null;
  private schemaPrefix: string;
  private providerType: ProviderType = 'default';

  constructor(dbConfig: GenerationConfig['dbConfig']) {
    this.dbConfig = dbConfig;
    if (this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql') {
      this.schemaPrefix = '';
    } else {
      this.schemaPrefix = 'midtable_nphies.';
    }
    if (this.dbConfig.type === 'postgres' || !this.dbConfig.type) {
      this.pgPool = new Pool(dbConfig as any);
    }
  }

  private get tablePrefix(): string {
    return this.isEnhancedMode() ? 'uhr_' : 'nphies_';
  }

  private isAutoMode(): boolean {
    return this.providerType === 'default_auto' || this.providerType === 'enhanced_auto';
  }

  private isEnhancedMode(): boolean {
    return this.providerType === 'enhanced' || this.providerType === 'enhanced_auto';
  }

  private tbl(name: string): string {
    const prefix = this.tablePrefix;
    if (name === 'encounterhospitalization') {
      return `${this.schemaPrefix}${prefix === 'nphies_' ? 'nphiesencounterhospitalization' : 'uhr_encounterhospitalization'}`;
    }
    return `${this.schemaPrefix}${prefix}${name}`;
  }

  private truncate(value: string | undefined | null, maxLength: number): string {
    const v = value ?? '';
    return v.length > maxLength ? v.substring(0, maxLength) : v;
  }

  private generateId(prefix: string, length: number = 15): string {
    const numeric = faker.string.numeric(Math.max(1, length - prefix.length));
    return `${prefix}${numeric}`.substring(0, length);
  }

  private generateProvClaimNo(scenarioId: string = ''): string {
    const base = scenarioId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const random = faker.string.alphanumeric(5).toUpperCase();
    const timestamp = Date.now().toString().slice(-7);
    return `CLM${base}${random}${timestamp}`.substring(0, 40);
  }

  private async getClient(): Promise<IDbClient> {
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

    if (!this.pgPool) this.pgPool = new Pool(this.dbConfig as any);
    return new PostgresClient(await this.pgPool.connect());
  }

  async testConnection(): Promise<boolean> {
    let client: IDbClient | null = null;
    try {
      client = await this.getClient();
      await client.query(this.dbConfig.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1');
      await client.release();
      return true;
    } catch (err: any) {
      console.error('CDA DB connection failed:', err.message);
      if (client) try { await client.release(); } catch (_) {}
      return false;
    }
  }

  async generateData(config: GenerationConfig): Promise<CdaGenerationResult> {
    this.providerType = config.providerType || 'default';
    const selectedCdaEvents = config.eventTypes || [];
    const scenarioId = config.scenario?.id || '';

    let client: IDbClient | null = null;
    let eventsCreated = 0;
    let failedEvents = 0;
    let lastError: any = null;
    let payload: any = undefined;
    const generatedProvClaimNos: string[] = [];

    try {
      client = await this.getClient();

      if (config.customPayload) {
        return await this.insertCustomPayload(client, config);
      }

      for (let i = 0; i < config.numberOfEvents; i++) {
        try {
          await client.beginTransaction();
          const provClaimNo = this.generateProvClaimNo(scenarioId);
          const cdaEventType = selectedCdaEvents[Math.floor(Math.random() * selectedCdaEvents.length)] as CdaEventType;

          // Determine subType (Institutional IMP path by default)
          const subType: CdaSubType = 'institutional';
          console.log(`[CDA] ${cdaEventType} — PROVCLAIMNO: ${provClaimNo}`);

          // ── 1. Create Event Row (if not auto mode) ──
          if (!this.isAutoMode()) {
            await this.createEvent(client, provClaimNo, cdaEventType);
          }

          // ── 2. Run Generation ──
          const record = await this.insertForEvent(client, provClaimNo, cdaEventType, subType);

          if (config.isDraft) {
            payload = this.buildCdaPayload(cdaEventType, provClaimNo, record);
            await client.rollback();
            eventsCreated++;
            continue;
          }

          await client.commit();
          eventsCreated++;
          generatedProvClaimNos.push(provClaimNo);

          if (config.numberOfEvents === 1 && !config.skipWritePayload) {
            payload = this.buildCdaPayload(cdaEventType, provClaimNo, record);
          } else {
            payload = 'you can show sample json for 1 event only at a time';
          }
        } catch (iterErr: any) {
          try { await client!.rollback(); } catch (_) {}
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
    } catch (fatalErr: any) {
      console.error('[CDA] Fatal error:', fatalErr.message);
      return { success: false, message: `Fatal Error: ${fatalErr.message}`, eventsCreated: 0, generatedProvClaimNos: [] };
    } finally {
      if (client) await client.release();
    }
  }

  private async insertForEvent(
    client: IDbClient,
    provClaimNo: string,
    cdaEventType: CdaEventType,
    subType: CdaSubType,
  ): Promise<CdaGeneratedRecord> {
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

  // ─────────────────────────────────────────────────────────────────────────
  // CDA Event insertions
  // ─────────────────────────────────────────────────────────────────────────

  private async insertDischargeSummary(
    client: IDbClient,
    provClaimNo: string,
    subType: CdaSubType,
  ): Promise<CdaGeneratedRecord> {
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

  private async insertOutpatientEncounterSummary(
    client: IDbClient,
    provClaimNo: string,
  ): Promise<CdaGeneratedRecord> {
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

  private async insertOperativeNote(
    client: IDbClient,
    provClaimNo: string,
  ): Promise<CdaGeneratedRecord> {
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

  private async insertNewbornDischarge(
    client: IDbClient,
    provClaimNo: string,
    subType: CdaSubType,
  ): Promise<CdaGeneratedRecord> {
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

  private async insertMaternalDischarge(
    client: IDbClient,
    provClaimNo: string,
    subType: CdaSubType,
  ): Promise<CdaGeneratedRecord> {
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
      });
    } else {
      await this.createEncounterEmergency(client, encounter.encounterId, {
        emergencyDepartmentDisposition: faker.helpers.arrayElement(EMERGENCY_DEPARTMENT_DISPOSITION_LOV),
      });
    }

    return { beneficiary, claiminfo, claimItem, careTeam, encounter };
  }

  private async insertLabOrder(client: IDbClient, provClaimNo: string): Promise<CdaGeneratedRecord> {
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

  private async insertLabResult(client: IDbClient, provClaimNo: string): Promise<CdaGeneratedRecord> {
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

  private async insertRadiologyOrder(client: IDbClient, provClaimNo: string): Promise<CdaGeneratedRecord> {
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

  private async insertRadiologyResult(client: IDbClient, provClaimNo: string): Promise<CdaGeneratedRecord> {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Helper inserts
  // ─────────────────────────────────────────────────────────────────────────

  private async createEvent(client: IDbClient, provClaimNo: string, eventType: string): Promise<void> {
    const eventId = this.generateId('EVT', 47);
    await client.query(`
      INSERT INTO ${this.tbl('events')} 
        (eventid, provclaimno, eventtype, createddate, issubmitted)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, provClaimNo, eventType, new Date(), false]);
  }

  private async createBeneficiary(
    client: IDbClient,
    opts: { gender?: string } = {},
  ): Promise<any> {
    const beneficiaryId = this.generateId('BEN', 17);
    const patientFileNo = this.truncate(`PF${faker.string.alphanumeric(8).toUpperCase()}`, 30);
    const firstName = this.truncate(faker.person.firstName(), 50);
    const middleName = this.truncate(faker.person.middleName(), 50);
    const lastName = this.truncate(faker.person.lastName(), 50);
    const fullName = this.truncate(`${firstName} ${middleName} ${lastName}`, 200);
    const dob = faker.date.birthdate({ min: 1940, max: 2020, mode: 'year' });
    const gender = opts.gender ?? faker.helpers.arrayElement(['male', 'female']);

    await client.query(`
      INSERT INTO ${this.tbl('beneficiary')}
        (beneficiaryid, patientfileno, firstname, middlename, lastname, fullname,
         dob, gender, nationality, documenttype, documentid, contactnumber, ehealthid,
         residencytype, maritalstatus, bloodgroup, preferredlanguage, email,
         addressline, addressstreetname, addresscity, addressdistrict, addressstate,
         addresspostalcode, addresscountry, occupation, religion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    `, [
      beneficiaryId, patientFileNo, firstName, middleName, lastName, fullName,
      dob, gender, 'SA', 'National-ID', CONSTANTS.DOCUMENT_ID, '+966-501234567', '30000999999999',
      'Citizen', 'Married', 'O+', 'en', 'patient@email.sa',
      'King Fahd Road', 'King Fahd Road', 'Riyadh', 'Al Olaya', 'Riyadh Region',
      '12345', 'SA', 'Engineer', 'Islam'
    ]);

    return { beneficiaryId, patientFileNo, firstName, lastName, fullName, dob, gender };
  }

  private async createCoverage(
    client: IDbClient,
    beneficiaryId: string,
  ): Promise<string> {
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

  private async createClaimInfo(
    client: IDbClient,
    provClaimNo: string,
    beneficiaryId: string,
    coverageId: string,
    opts: { claimType: string; claimSubtype: string; isNewborn: string },
  ): Promise<any> {
    const { claimType, claimSubtype, isNewborn } = opts;
    const billableStart = faker.date.recent({ days: 30 });
    const billableEnd = faker.date.soon({ days: 7, refDate: billableStart });
    const claimCreatedDate = new Date();

    await client.query(`
      INSERT INTO ${this.tbl('claiminfo')}
        (provclaimno, episodeid, isnewborn, isreferral, claimtype, claimsubtype,
         providernphiesid, claimcreateddate, accountingperiod, billableperiodstart, billableperiodend,
         payeetype, payeeid, coverageid, beneficiaryid, total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
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
    ]);

    return { provClaimNo, claimCreatedDate };
  }

  private async createClaimDiagnosis(
    client: IDbClient,
    provClaimNo: string,
    sequenceNo: number,
  ): Promise<void> {
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

  private async createClaimCareTeam(
    client: IDbClient,
    provClaimNo: string,
    sequenceNo: number,
  ): Promise<any> {
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

  private async createClaimItem(
    client: IDbClient,
    provClaimNo: string,
    sequenceNo: number,
    opts: { serviceType: string; serviceCode: string; serviceDesc: string; withServiceCode?: boolean; withEndDate?: boolean; isMaternity?: string },
  ): Promise<any> {
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

    return { serviceCode, serviceDesc, net };
  }

  private async createClaimEncounter(
    client: IDbClient,
    provClaimNo: string,
    opts: { encounterClass: string; withEndDate: boolean; encounterStatus: string },
  ): Promise<any> {
    const { encounterClass, withEndDate, encounterStatus } = opts;
    const encounterId = this.generateId('ENC', 17);
    const startDate = faker.date.recent({ days: 30 });
    const endDate = withEndDate ? faker.date.soon({ days: 7, refDate: startDate }) : new Date();

    await client.query(`
      INSERT INTO ${this.tbl('claimencounters')}
        (provclaimno, encounterid, encounterstartdate, encounterenddate, encounterclass,
         encounterservicetype, priority, serviceprovider, encounterstatus)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      provClaimNo,
      encounterId,
      startDate,
      endDate,
      encounterClass,
      'consultation',
      'routine',
      CONSTANTS.PROVIDER_NPHIES_ID,
      encounterStatus,
    ]);

    return { encounterId, encounterClass, encounterStatus, startDate, endDate };
  }

  private async createEncounterHospitalization(
    client: IDbClient,
    encounterId: string,
    opts: { hospitalDischargeDisposition: string },
  ): Promise<void> {
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

  private async createEncounterEmergency(
    client: IDbClient,
    encounterId: string,
    opts: { emergencyDepartmentDisposition: string },
  ): Promise<void> {
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

  private async createClaimItemDetails(
    client: IDbClient,
    provClaimNo: string,
    itemSequenceNo: number,
    sequenceNo: number,
    serviceType: string,
    serviceCode: string,
    serviceDesc: string
  ): Promise<void> {
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

  private async createClaimSupportingInfo(
    client: IDbClient,
    provClaimNo: string,
    sequenceNo: number,
    category: string,
    supportingValue: string | null,
    hasAttachment: boolean
  ): Promise<void> {
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

  private async createItemCareTeam(
    client: IDbClient,
    provClaimNo: string,
    careTeamSeq: number,
    itemSeq: number
  ): Promise<void> {
    let query = `
      INSERT INTO ${this.tbl('itemcareteam')} 
        (provclaimno, careteamsequenceno, itemsequenceno)
      VALUES ($1,$2,$3)
    `;
    if (this.dbConfig.type === 'postgres') query += ' ON CONFLICT DO NOTHING';
    try { await client.query(query, [provClaimNo, careTeamSeq, itemSeq]); } catch (e) { }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Payload builder
  // ─────────────────────────────────────────────────────────────────────────────
  private buildCdaPayload(
    eventType: string,
    provClaimNo: string,
    record: CdaGeneratedRecord,
  ): any {
    const createdDate = record.claiminfo.claimCreatedDate.toISOString();
    const age = new Date().getFullYear() - new Date(record.beneficiary.dob).getFullYear();

    const request: any = {
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
      const service: any = {
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

  private parseDateIfNeeded(val: any): any {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return new Date(val);
    }
    return val;
  }

  // Custom Payload insertion
  private async insertCustomPayload(client: IDbClient, config: GenerationConfig): Promise<CdaGenerationResult> {
    const data = config.customPayload.generatedData;
    if (!data) {
      return { success: false, message: 'Invalid custom payload structure', eventsCreated: 0, generatedProvClaimNos: [] };
    }

    const ID_GENERATORS: Record<string, () => string> = {
      PROVCLAIMNO:   () => this.generateProvClaimNo(),
      BENEFICIARYID: () => this.generateId('BEN', 17),
      EPISODEID:     () => this.generateId('EP',  17),
      COVERAGEID:    () => this.generateId('COV', 17),
      PAYEEID:       () => this.generateId('PYE', 17),
      ENCOUNTERID:   () => this.generateId('ENC', 17),
      EVENTID:       () => this.generateId('EVT', 47),
      INVOICENO:     () => faker.string.alphanumeric(10).toUpperCase(),
    };

    const idMap = new Map<string, string>();

    const remapRow = (row: Record<string, any>): Record<string, any> => {
      const remapped: Record<string, any> = {};
      for (const [col, val] of Object.entries(row)) {
        const generator = ID_GENERATORS[col.toUpperCase()];
        if (generator && val && typeof val === 'string') {
          if (!idMap.has(val)) {
            idMap.set(val, generator());
          }
          remapped[col] = idMap.get(val);
        } else {
          remapped[col] = val;
        }
      }
      return remapped;
    };

    let eventsCreated = 0;
    try {
      await client.beginTransaction();

      const tableMapping: Array<[string, string]> = [
        ['beneficiary',              `${this.schemaPrefix}${this.tablePrefix}beneficiary`],
        ['coverage',                 `${this.schemaPrefix}${this.tablePrefix}coverage`],
        ['claiminfo',                `${this.schemaPrefix}${this.tablePrefix}claiminfo`],
        ['claimitems',               `${this.schemaPrefix}${this.tablePrefix}claimitem`],
        ['claimitemdetails',         `${this.schemaPrefix}${this.tablePrefix}claimitemdetails`],
        ['claimdiagnosis',           `${this.schemaPrefix}${this.tablePrefix}claimdiagnosis`],
        ['claimcareteam',            `${this.schemaPrefix}${this.tablePrefix}claimcareteam`],
        ['claimencounters',          `${this.schemaPrefix}${this.tablePrefix}claimencounters`],
        ['claimsupportinginfo',      `${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo`],
        ['encounterhospitalization', `${this.tbl('encounterhospitalization')}`],
        ['encounteremergency',       `${this.schemaPrefix}${this.tablePrefix}encounteremergency`],
        ...(!this.isAutoMode() ? [['events', `${this.schemaPrefix}${this.tablePrefix}events`] as [string, string]] : []),
      ];

      const payloadEventType: string = (config.customPayload as any)?.eventType ?? '';

      for (const [key, actualTableName] of tableMapping) {
        const rows = data[key];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        for (const rawRow of rows) {
          const row = remapRow(rawRow);

          if (key === 'events' && payloadEventType) {
            const etKey = Object.keys(row).find(k => k.toUpperCase() === 'EVENTTYPE');
            if (etKey) row[etKey] = payloadEventType;
          }

          const columns = Object.keys(row);
          const values = Object.values(row).map(v => this.parseDateIfNeeded(v));
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const sql = `INSERT INTO ${actualTableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          await client.query(sql, values);
        }
      }

      await client.commit();
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
    } catch (err: any) {
      await client.rollback();
      console.error('Failed to insert custom CDA payload:', err);
      return { success: false, message: `Failed to insert custom CDA payload: ${err.message}`, eventsCreated: 0, generatedProvClaimNos: [] };
    }
  }

  async close(): Promise<void> {
    if (this.pgPool) { await this.pgPool.end(); this.pgPool = null; }
    if (this.mssqlPool) { await this.mssqlPool.close(); this.mssqlPool = null; }
    if (this.oracleConn) { await this.oracleConn.close(); this.oracleConn = null; }
  }
}
