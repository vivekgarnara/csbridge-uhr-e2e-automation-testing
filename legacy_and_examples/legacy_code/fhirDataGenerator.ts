import { faker } from '@faker-js/faker';
import { Pool, PoolClient } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Oracle Client in Thick mode for Oracle 11g support
try {
  const libDir = path.resolve(__dirname, '..', 'electron', 'oracle_instantclient_18_5');
  console.log('Oracle: Attempting to initialize Thick mode with libDir:', libDir);
  oracledb.initOracleClient({ libDir });
  console.log('Oracle: Client initialized in Thick mode successfully');
} catch (err: any) {
  if (err.message && !err.message.includes('already been initialized')) {
    console.error('Oracle Thick mode initialization failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const CONSTANTS = {
  DOCUMENT_ID: '30511223344557',
  PROVIDER_NPHIES_ID: '15000000112233',
  PHYSICIAN_ID: '00TEST1980'
};

export type ProviderType = 'default' | 'default_auto' | 'enhanced' | 'enhanced_auto';

export interface GenerationConfig {
  numberOfEvents: number;
  eventTypes: string[];
  dbConfig: {
    type: 'postgres' | 'oracle' | 'mssql';
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  providerType: ProviderType;
  skipWritePayload?: boolean;
  isDraft?: boolean;
  customPayload?: any;
  encounterClassOverride?: string;
  scenario?: {
    id: string;
    title: string;
    category: string;
    generationDescription: string;
  };
}

interface IDbClient {
  query(sql: string, params?: any[]): Promise<any>;
  release(): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB CLIENTS
// ─────────────────────────────────────────────────────────────────────────────
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

  private formatDateForOracle(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private convertParams(params: any[]): any[] {
    return params.map(param => {
      if (param instanceof Date) return this.formatDateForOracle(param);
      if (typeof param === 'boolean') return param ? 1 : 0;
      return param;
    });
  }

  async query(sql: string, params?: any[]) {
    let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    const convertedParams = params ? this.convertParams(params) : [];
    const dateParamIndices: number[] = [];
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

class SqlServerClient implements IDbClient {
  private transaction: mssql.Transaction | null = null;
  constructor(private pool: mssql.ConnectionPool) { }

  async query(sql: string, params?: any[]) {
    const request = this.transaction ? this.transaction.request() : this.pool.request();
    if (params) {
      params.forEach((param, index) => { request.input(`p${index}`, param); });
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

// ─────────────────────────────────────────────────────────────────────────────
// FHIR DATA GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export class FhirDataGenerator {
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
      this.pgPool = new Pool(dbConfig);
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

  private async getClient(): Promise<IDbClient> {
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
    } else {
      if (!this.pgPool) this.pgPool = new Pool(this.dbConfig);
      const client = await this.pgPool.connect();
      return new PostgresClient(client);
    }
  }

  async testConnection(): Promise<boolean> {
    let client: IDbClient | null = null;
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

  async generateData(config: GenerationConfig): Promise<{
    success: boolean; message: string; eventsCreated: number; payload?: any
  }> {
    let client: IDbClient | null = null;
    let eventsCreated = 0;
    let failedEvents = 0;
    let lastError: any = null;
    let payload: any = undefined;

    try {
      client = await this.getClient();
      this.providerType = config.providerType || 'default';

      if (config.customPayload) {
        return await this.insertCustomPayload(client, config);
      }

      console.log(`Starting FHIR generation of ${config.numberOfEvents} events...`);

      for (let i = 0; i < config.numberOfEvents; i++) {
        try {
          await client.beginTransaction();

          const eventType = config.eventTypes[Math.floor(Math.random() * config.eventTypes.length)];
          const provClaimNo = this.generateProvClaimNo();

          console.log(`[FHIR Event ${i + 1}] Generating ${eventType}`);

          // Determine encounter settings based on event types
          const isResult = eventType.endsWith('_RESULT');

          // ── 1. Insert Event Row (if not auto mode) ──
          if (!this.isAutoMode()) {
            await this.createEvent(client, provClaimNo, eventType);
          }

          // ── 2. Create Beneficiary ──
          const beneficiary = await this.createBeneficiary(client);

          // ── 3. Create Coverage ──
          const coverageId = await this.createCoverage(client, beneficiary.beneficiaryId);
          await this.createCoverageClass(client, coverageId);

          // ── 4. Create Claim Info ──
          const claiminfo = await this.createClaimInfo(client, provClaimNo, beneficiary.beneficiaryId, coverageId, eventType);

          // ── 5. Create Claim Items / Services ──
          const items: any[] = [];
          const serviceCode = eventType.startsWith('MEDICATION') ? '010203-0101-5406-02-11' : (eventType.startsWith('LAB') ? 'CBC' : 'CT-HEAD-WO-CONTRAST');
          const serviceDesc = eventType.startsWith('MEDICATION') ? "otozol clotrimazole '1 % solution/ drops" : (eventType.startsWith('LAB') ? 'Complete Blood Count' : 'CT head without contrast');
          const serviceType = eventType.startsWith('MEDICATION') ? 'drug' : (eventType.startsWith('LAB') ? 'lab' : 'service');

          const claimItem = await this.createClaimItem(client, provClaimNo, 1, serviceType, serviceCode, serviceDesc);
          items.push(claimItem);

          // Create Claim Item Details (to satisfy event detection logic)
          let detailsServiceType = 'service';
          if (eventType.startsWith('LAB')) {
            detailsServiceType = 'LAB';
          } else if (eventType.startsWith('RADIOLOGY')) {
            detailsServiceType = 'IMAGING';
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
            continue;
          }

          await client.commit();
          eventsCreated++;

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
        }
      }

      return {
        success: eventsCreated > 0,
        message: `Successfully created ${eventsCreated} FHIR events.${failedEvents > 0 ? ` Failed: ${failedEvents}. Last error: ${lastError?.message || 'Unknown'}` : ''}`,
        eventsCreated,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  private truncate(value: string | undefined | null, maxLength: number): string {
    const val = value || '';
    return val.length > maxLength ? val.substring(0, maxLength) : val;
  }

  private generateProvClaimNo(): string {
    return `CLM${faker.string.alphanumeric(10).toUpperCase()}${Date.now().toString().slice(-7)}`;
  }

  private generateId(prefix: string, length: number = 15): string {
    const numericPart = faker.string.numeric(Math.max(1, length - prefix.length));
    return `${prefix}${numericPart}`.substring(0, length);
  }

  // Event Row
  private async createEvent(client: IDbClient, provClaimNo: string, eventType: string): Promise<void> {
    const eventId = this.generateId('EVT', 47);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}events 
      (eventid, provclaimno, eventtype, createddate, issubmitted)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, provClaimNo, eventType, new Date(), false]);
  }

  // Beneficiary
  private async createBeneficiary(client: IDbClient): Promise<any> {
    const beneficiaryId = this.generateId('BEN', 17);
    const patientFileNo = this.truncate(`PF${faker.string.alphanumeric(8).toUpperCase()}`, 30);
    const firstName = this.truncate(faker.person.firstName(), 50);
    const middleName = this.truncate(faker.person.middleName(), 50);
    const lastName = this.truncate(faker.person.lastName(), 50);
    const fullName = this.truncate(`${firstName} ${middleName} ${lastName}`, 200);
    const dob = faker.date.birthdate({ min: 1940, max: 2020, mode: 'year' });
    const gender = faker.helpers.arrayElement(['male', 'female']);
    const documentId = CONSTANTS.DOCUMENT_ID;

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}beneficiary
      (beneficiaryid, patientfileno, firstname, middlename, lastname, fullname,
       dob, gender, nationality, documenttype, documentid, contactnumber, ehealthid,
       residencytype, maritalstatus, bloodgroup, preferredlanguage, email,
       addressline, addressstreetname, addresscity, addressdistrict, addressstate,
       addresspostalcode, addresscountry, occupation, religion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    `, [
      beneficiaryId, patientFileNo, firstName, middleName, lastName, fullName,
      dob, gender, 'SA', 'National-ID', documentId, '+966-501234567', '30000999999999',
      'Citizen', 'Married', 'O+', 'en', 'patient@email.sa',
      'King Fahd Road', 'King Fahd Road', 'Riyadh', 'Al Olaya', 'Riyadh Region',
      '12345', 'SA', 'Engineer', 'Islam'
    ]);

    return {
      beneficiaryId, patientFileNo, firstName, middleName, lastName, fullName, dob, gender, documentId
    };
  }

  // Coverage
  private async createCoverage(client: IDbClient, beneficiaryId: string): Promise<string> {
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

  private async createCoverageClass(client: IDbClient, coverageId: string): Promise<void> {
    const coverageClassId = this.generateId('CLS', 17);
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}coverage_class 
      (coverageclassid, type, value, name, coverageid)
      VALUES ($1,$2,$3,$4,$5)
    `, [coverageClassId, 'plan', 'PLAN-UHR', 'UHR Coverage Plan', coverageId]);
  }

  // Claim Info
  private async createClaimInfo(client: IDbClient, provClaimNo: string, beneficiaryId: string, coverageId: string, eventType: string): Promise<any> {
    const billableStart = faker.date.recent({ days: 30 });
    const billableEnd = faker.date.soon({ days: 7, refDate: billableStart });
    const claimCreatedDate = new Date();
    const episodeId = this.generateId('EP', 17);
    const payeeId = this.generateId('PYE', 17);

    const isMedication = eventType.startsWith('MEDICATION');
    const claimSubtype = isMedication ? 'ip' : 'op';

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claiminfo 
      (provclaimno, episodeid, isnewborn, isreferral, claimtype, claimsubtype,
       providernphiesid, claimcreateddate, accountingperiod, billableperiodstart, billableperiodend,
       payeetype, payeeid, coverageid, beneficiaryid, total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      provClaimNo, episodeId, 'false', 'false', '01.08', claimSubtype,
      CONSTANTS.PROVIDER_NPHIES_ID, claimCreatedDate, new Date(), billableStart, billableEnd,
      'provider', payeeId, coverageId, beneficiaryId, 1500.00
    ]);

    return { provClaimNo, claimCreatedDate, billableStart, billableEnd, episodeId };
  }

  // Claim Item
  private async createClaimItem(client: IDbClient, provClaimNo: string, sequenceNo: number, serviceType: string, serviceCode: string, serviceDesc: string): Promise<any> {
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

  // Claim Care Team
  private async createClaimCareTeam(client: IDbClient, provClaimNo: string): Promise<any> {
    const physicianName = 'Dr. Aditya Khan';
    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimcareteam 
      (provclaimno, sequenceno, physicianid, physicianname, practitionerrole, careteamrole, careteamqualification)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [provClaimNo, 1, CONSTANTS.PHYSICIAN_ID, physicianName, 'doctor', 'primary', 'MD']);

    return { physicianId: CONSTANTS.PHYSICIAN_ID, physicianName };
  }

  // Link Care Team
  private async createItemCareTeam(client: IDbClient, provClaimNo: string, careTeamSeq: number, itemSeq: number): Promise<void> {
    let query = `
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}itemcareteam 
      (provclaimno, careteamsequenceno, itemsequenceno)
      VALUES ($1,$2,$3)
    `;
    if (this.dbConfig.type === 'postgres') query += ' ON CONFLICT DO NOTHING';
    try { await client.query(query, [provClaimNo, careTeamSeq, itemSeq]); } catch (e) { }
  }

  // Claim Encounter
  private async createClaimEncounter(client: IDbClient, provClaimNo: string, encounterClass: string, encounterStatus: string): Promise<any> {
    const encounterId = this.generateId('ENC', 17);
    const startDate = faker.date.recent({ days: 30 });
    const endDate = faker.date.soon({ days: 7, refDate: startDate });

    await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimencounters
      (provclaimno, encounterid, encounterstartdate, encounterenddate, encounterclass,
       encounterservicetype, priority, serviceprovider, encounterstatus)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      provClaimNo, encounterId, startDate, endDate, encounterClass,
      'consultation', 'routine', CONSTANTS.PROVIDER_NPHIES_ID, encounterStatus
    ]);

    return { encounterId, encounterClass, encounterStatus, startDate, endDate };
  }

  // Claim Item Details
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

  // Claim Supporting Info
  private async createClaimSupportingInfo(
    client: IDbClient,
    provClaimNo: string,
    sequenceNo: number,
    category: string,
    supportingValue: string | null,
    hasAttachment: boolean
  ): Promise<void> {
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

  // FHIR Payload builder
  private buildFhirPayload(
    eventType: string,
    provClaimNo: string,
    beneficiary: any,
    claiminfo: any,
    claimItem: any,
    careTeam: any,
    encounter: any
  ): any {
    const createdDate = claiminfo.claimCreatedDate.toISOString();
    const age = new Date().getFullYear() - new Date(beneficiary.dob).getFullYear();
    const isDispense = eventType === 'MEDICATION_DISPENSE';

    const uhrRequest: any = {
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
              priority: "ROUTINE",
              serviceRequestStatus: "COMPLETED",
              sampleReceivedDate: createdDate,
              specimenCollection: {
                specimenType: "BLD",
                specimenSource: "BLD",
                collectionDate: createdDate,
                specimenCollectionMethodEnum: "VENIP"
              },
              sampleOperations: {
                priority: "ROUTINE",
                title: "Blood Sample Processing",
                text: "Sample received and processed"
              },
              device: {
                deviceIdentifier: "DEVICE-HEMA-XN1000",
                modelName: "Sysmex XN-1000 Automated Hematology Analyzer",
                softwareName: "XN-MASTER v2.5"
              },
              sampleObservation: {
                sampleObservationStartTime: createdDate,
                sampleObservationEndTime: createdDate,
                status: "FINAL",
                observationNote: "Test results within reference range.",
                sampleResult: {
                  valueQuantity: {
                    value: "14.8",
                    unit: "GRAM_PER_DECILITER"
                  },
                  valueRange: {
                    low: "13.5",
                    unitLow: "GRAM_PER_DECILITER",
                    high: "17.5",
                    unitHigh: "GRAM_PER_DECILITER"
                  },
                  sampleResultInterpretation: "NORMAL",
                  text: "Normal reference range"
                }
              }
            }
          ]
        };
      } else if (eventType === 'RADIOLOGY_ORDER') {
        uhrRequest.services[0].serviceInfo = {
          radiologyProcedures: [
            {
              procedure: "CS-Rad-Procedure",
              procedureDescription: claimItem.serviceDesc,
              modality: "COMPUTED_TOMOGRAPHY",
              modalityDescription: "Computed Tomography",
              bodySite: "HEAD_STRUCTURE",
              bodySiteDescription: "Head",
              orderIdentifier: `RAD-ORD-${faker.string.numeric(4)}`,
              accessionNumber: `RAD-ACC-${faker.string.numeric(4)}`,
              priority: "ROUTINE",
              serviceRequestStatus: "ACTIVE",
              requestedDate: createdDate
            }
          ]
        };
      } else if (eventType === 'RADIOLOGY_RESULT') {
        uhrRequest.services[0].serviceInfo = {
          radiologyProcedures: [
            {
              procedure: "X-RAY",
              procedureDescription: claimItem.serviceDesc,
              modality: "COMPUTED_TOMOGRAPHY",
              modalityDescription: "Computed Tomography",
              bodySite: "HEAD_STRUCTURE",
              bodySiteDescription: "Head",
              orderIdentifier: `RAD-ORD-${faker.string.numeric(4)}`,
              accessionNumber: `RAD-ACC-${faker.string.numeric(4)}`,
              priority: "ROUTINE",
              serviceRequestStatus: "COMPLETED",
              requestedDate: createdDate,
              procedureStartTime: createdDate,
              procedureEndTime: createdDate,
              resultReceivedDate: createdDate,
              radiologyStatus: "FINAL",
              device: {
                deviceIdentifier: "DEV-CT-001",
                modelName: "CT Scanner Pro",
                manufacturer: "Medical Devices Co",
                serialNumber: "CT-SN-20240101"
              }
            }
          ]
        };
      }
    }

    return {
      eventId: faker.number.int({ min: 1000, max: 9999 }).toString(),
      eventType,
      uhrRequest
    };
  }

  private parseDateIfNeeded(val: any): any {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return new Date(val);
    }
    return val;
  }

  // Custom Payload insertion
  private async insertCustomPayload(client: IDbClient, config: GenerationConfig): Promise<{
    success: boolean; message: string; eventsCreated: number; payload?: any
  }> {
    const data = config.customPayload.generatedData;
    if (!data) {
      return { success: false, message: 'Invalid custom payload structure', eventsCreated: 0 };
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
        ['beneficiary',         `${this.schemaPrefix}${this.tablePrefix}beneficiary`],
        ['coverage',            `${this.schemaPrefix}${this.tablePrefix}coverage`],
        ['claiminfo',           `${this.schemaPrefix}${this.tablePrefix}claiminfo`],
        ['claimitems',          `${this.schemaPrefix}${this.tablePrefix}claimitem`],
        ['claimdiagnosis',      `${this.schemaPrefix}${this.tablePrefix}claimdiagnosis`],
        ['claimcareteam',       `${this.schemaPrefix}${this.tablePrefix}claimcareteam`],
        ['claimencounters',     `${this.schemaPrefix}${this.tablePrefix}claimencounters`],
        ['claimsupportinginfo', `${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo`],
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
        message: `FHIR Custom payload inserted successfully. New claim: ${newProvClaimNo}`,
        eventsCreated,
        payload: config.customPayload
      };
    } catch (err: any) {
      await client.rollback();
      console.error('Failed to insert custom FHIR payload:', err);
      return { success: false, message: `Failed to insert custom FHIR payload: ${err.message}`, eventsCreated: 0 };
    }
  }

  async close(): Promise<void> {
    if (this.pgPool) await this.pgPool.end();
    if (this.mssqlPool) await this.mssqlPool.close();
    if (this.oracleConn) { await this.oracleConn.close(); this.oracleConn = null; }
  }
}
