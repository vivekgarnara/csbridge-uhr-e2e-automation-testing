import { faker } from '@faker-js/faker';
import { Pool } from 'pg';
import oracledb from 'oracledb';
import mssql from 'mssql';
import path from 'path';
import { fileURLToPath } from 'url';
import { getScenarioConfig } from '../eventRules.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Initialize Oracle Client in Thick mode for Oracle 11g support
// Thick mode is required for databases older than Oracle 12.1
if (process.env.ORACLE_CLIENT_LIB) {
    try {
        oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB });
    }
    catch (err) {
        if (err.message && !err.message.includes('already been initialized')) {
            console.warn('Oracle Thick mode init failed:', err.message);
        }
    }
}
else {
    try {
        const libDir = path.resolve(__dirname, '..', 'electron', 'oracle_instantclient_18_5');
        oracledb.initOracleClient({ libDir });
    }
    catch (err) {
        if (err.message && !err.message.includes('already been initialized')) {
            // Thin mode works for Oracle 12.1+ without Instant Client — only log once at debug
            if (process.env.ORACLE_DEBUG === '1') {
                console.warn('Oracle Thick mode unavailable, using Thin mode:', err.message);
            }
        }
    }
}
// Constants as per requirements
const CONSTANTS = {
    DOCUMENT_ID: '30511223344557',
    PROVIDER_NPHIES_ID: '15000000112233',
    PHYSICIAN_ID: '00TEST1980'
};
class PostgresClient {
    client;
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
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    // Helper to convert JavaScript Date to Oracle-compatible string format
    formatDateForOracle(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    // Convert parameters - dates and booleans to Oracle-compatible types
    convertParams(params) {
        return params.map(param => {
            if (param instanceof Date) {
                return this.formatDateForOracle(param);
            }
            // Convert JavaScript booleans to Oracle-compatible format
            if (typeof param === 'boolean') {
                return param ? 1 : 0;
            }
            return param;
        });
    }
    async query(sql, params) {
        // Convert $1, $2 to :1, :2
        let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
        // Convert date parameters for Oracle 11g compatibility
        const convertedParams = params ? this.convertParams(params) : [];
        // For Oracle, wrap date string parameters with TO_TIMESTAMP
        // Detect which parameters are date strings and modify the SQL accordingly
        const dateParamIndices = [];
        if (params) {
            params.forEach((param, idx) => {
                if (param instanceof Date) {
                    dateParamIndices.push(idx + 1); // Oracle params are 1-indexed
                }
            });
        }
        // Replace :N with TO_TIMESTAMP(:N, 'YYYY-MM-DD HH24:MI:SS') for date parameters
        for (const idx of dateParamIndices) {
            const regex = new RegExp(`:${idx}(?![0-9])`, 'g');
            oracleSql = oracleSql.replace(regex, `TO_TIMESTAMP(:${idx}, 'YYYY-MM-DD HH24:MI:SS')`);
        }
        // Debug logging
        console.log('[OracleClient] SQL:', oracleSql.trim().substring(0, 200));
        // console.log('Date param indices:', dateParamIndices);
        return this.connection.execute(oracleSql, convertedParams, { autoCommit: false });
    }
    async release() { /* no-op — connection is cached in DataGenerator, closed via DataGenerator.close() */ }
    async beginTransaction() { }
    async commit() { await this.connection.commit(); }
    async rollback() { await this.connection.rollback(); }
}
class SqlServerClient {
    pool;
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
        // Convert $1, $2 to @p0, @p1
        const mssqlSql = sql.replace(/\$(\d+)/g, (_, n) => `@p${parseInt(n) - 1}`);
        return request.query(mssqlSql);
    }
    async release() {
        // Connection should be closed by calling pool.close() in DataGenerator.close()
        // or if this is a single connection, we might close it here.
        // However, the pattern seems to be that release() is called after each generation cycle or test.
    }
    async beginTransaction() {
        this.transaction = new mssql.Transaction(this.pool);
        await this.transaction.begin();
    }
    async commit() {
        if (this.transaction) {
            await this.transaction.commit();
            this.transaction = null;
        }
    }
    async rollback() {
        if (this.transaction) {
            await this.transaction.rollback();
            this.transaction = null;
        }
    }
}
class MysqlClient {
    connection;
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
export class DataGenerator {
    dbConfig;
    pgPool = null;
    mssqlPool = null;
    oracleConn = null;
    mysqlPool = null;
    schemaPrefix;
    tablePrefix;
    constructor(dbConfig, providerType = 'default') {
        this.dbConfig = dbConfig;
        this.providerType = providerType;
        const isUhr = providerType.toLowerCase().includes('enhanced');

        // Determine schema and table prefix
        if (this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql') {
            this.schemaPrefix = '';
            this.tablePrefix = isUhr ? 'UHR_' : 'nphies_';
        }
        else {
            this.schemaPrefix = 'midtable_nphies.';
            this.tablePrefix = isUhr ? 'uhr_' : 'nphies_';
        }

        if (this.dbConfig.type === 'postgres' || !this.dbConfig.type) {
            this.pgPool = new Pool(dbConfig);
        }
    }
    /**
     * Check if current provider type is an AUTO mode (timestamp-based sync)
     */
    isAutoMode() {
        return this.providerType === 'default_auto' || this.providerType === 'enhanced_auto';
    }
    /**
     * Check if current provider type is an ENHANCED mode (uses UHR schema)
     */
    isEnhancedMode() {
        return this.providerType === 'enhanced' || this.providerType === 'enhanced_auto';
    }
    isDefaultPlusMode() {
        return this.providerType === 'default_plus' || this.providerType === 'default-plus';
    }
    async getClient() {
        if (this.dbConfig.type === 'oracle') {
            if (!this.oracleConn) {
                try {
                    this.oracleConn = await oracledb.getConnection({
                        user: this.dbConfig.user,
                        password: this.dbConfig.password,
                        connectString: `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`
                    });
                } catch (err) {
                    this.oracleConn = null;
                    throw new Error(
                        `DataGenerator: Oracle connection failed ` +
                        `[${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}] — ${err.message}`
                    );
                }
            }
            return new OracleClient(this.oracleConn);
        }
        else if (this.dbConfig.type === 'mssql') {
            if (!this.mssqlPool) {
                // Handle instance name if present in host (e.g. 172.16.10.6\SQL2019)
                const hostParts = this.dbConfig.host.split('\\');
                const server = hostParts[0];
                const instanceName = hostParts[1];
                this.mssqlPool = new mssql.ConnectionPool({
                    user: this.dbConfig.user,
                    password: this.dbConfig.password,
                    server: server,
                    port: this.dbConfig.port,
                    database: this.dbConfig.database,
                    options: {
                        encrypt: false,
                        trustServerCertificate: true,
                        instanceName: instanceName
                    }
                });
                await this.mssqlPool.connect();
            }
            return new SqlServerClient(this.mssqlPool);
        }
        else if (this.dbConfig.type === 'mysql') {
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
        else {
            if (!this.pgPool) {
                this.pgPool = new Pool(this.dbConfig);
            }
            const client = await this.pgPool.connect();
            return new PostgresClient(client);
        }
    }
    async testConnection() {
        let client = null;
        try {
            client = await this.getClient();
            // For Oracle, we might need 'SELECT 1 FROM DUAL' vs 'SELECT 1'
            if (this.dbConfig.type === 'oracle') {
                await client.query('SELECT 1 FROM DUAL');
            }
            else {
                await client.query('SELECT 1');
            }
            await client.release();
            return true;
        }
        catch (error) {
            console.error('Database connection failed:', error);
            if (client) {
                try {
                    await client.release();
                }
                catch (e) { }
            }
            return false;
        }
    }
    async generateData(config) {
        let client = null;
        let eventsCreated = 0;
        let failedEvents = 0;
        let lastError = null;

        try {
            client = await this.getClient();
            this.providerType = config.providerType || 'default';
            // console.log(`Starting generation of ${config.numberOfEvents} events...`);
            const generatedProvClaimNos = [];
            for (let i = 0; i < config.numberOfEvents; i++) {
                try {
                    await client.beginTransaction();
                    const eventType = config.eventTypes?.length ? config.eventTypes[Math.floor(Math.random() * config.eventTypes.length)] : 'A01';
                    this.scenarioRules = getScenarioConfig(
                        eventType,
                        config.scenarioId,
                        config.scenarioDescription || ''
                    );
                    const provClaimNo = this.scenarioRules?.provClaimNo !== undefined
                        ? this.scenarioRules.provClaimNo
                        : this.generateProvClaimNo(config.scenarioId);
                    generatedProvClaimNos.push(provClaimNo);

                    if (provClaimNo === null || provClaimNo === '') {
                        throw new Error(
                            `Invalid PROVCLAIMNO for scenario ${config.scenarioId}: ${provClaimNo === null ? 'null' : 'empty'}`
                        );
                    }
                    if (config.numberOfEvents <= 10 || i % 1000 === 0) {
                        console.log(`Generating event ${i + 1}/${config.numberOfEvents} with PROVCLAIMNO: ${provClaimNo} and event type: ${eventType}`);
                    }
                    // Create beneficiary
                    const beneficiaryId = await this.createBeneficiary(client);
                    // Create claim info (both default and enhanced use the same tables, just different prefix)
                    const coverageId = await this.createCoverage(client, beneficiaryId);
                    // Create coverage classes (0-3 per coverage)
                    const classCount = Math.floor(Math.random() * 4);
                    for (let k = 0; k < classCount; k++) {
                        await this.createCoverageClass(client, coverageId);
                    }
                    await this.createClaimInfo(client, provClaimNo, beneficiaryId, coverageId);
                    if (this.isDefaultPlusMode()) {
                        // 30% chance to insert pregnancy details
                        if (Math.random() < 0.3) {
                            await this.createPregnancyDetails(client, provClaimNo, new Date());
                        }
                    }
                    // Create claim items (1-5)
                    const itemCount = Math.floor(Math.random() * 5) + 1;
                    const itemSequences = [];
                    for (let j = 1; j <= itemCount; j++) {
                        const itemDetails = await this.createClaimItem(client, provClaimNo, j);
                        itemSequences.push(j);
                        if (this.isDefaultPlusMode()) {
                            if (itemDetails.serviceType === 'drug') {
                                await this.createClaimItemMedication(client, provClaimNo, j, itemDetails.serviceCode, itemDetails.serviceDesc);
                                await this.createClaimItemDosage(client, provClaimNo, j);
                            } else {
                                await this.createClaimItemProcedure(client, provClaimNo, j, itemDetails.serviceCode, itemDetails.serviceDesc);
                            }
                        }
                        // Some items have details (30% chance)
                        if (Math.random() < 0.3) {
                            const detailSequence = j + 1000; // Offset to avoid conflicts
                            await this.createClaimItemDetails(client, provClaimNo, j, detailSequence);
                        }
                    }
                    // Create diagnoses (1-3)
                    const diagnosisCount = Math.floor(Math.random() * 3) + 1;
                    const diagnosisSequences = [];
                    for (let j = 1; j <= diagnosisCount; j++) {
                        await this.createClaimDiagnosis(client, provClaimNo, j);
                        diagnosisSequences.push(j);
                    }
                    // Create care team (1-3 members)
                    const careTeamCount = Math.floor(Math.random() * 3) + 1;
                    const careTeamSequences = [];
                    for (let j = 1; j <= careTeamCount; j++) {
                        await this.createClaimCareTeam(client, provClaimNo, j);
                        careTeamSequences.push(j);
                    }
                    // Link items to diagnoses
                    for (const itemSeq of itemSequences) {
                        const linkedDiagnosesCount = Math.floor(Math.random() * diagnosisSequences.length) + 1;
                        const shuffled = [...diagnosisSequences].sort(() => 0.5 - Math.random());
                        for (let j = 0; j < linkedDiagnosesCount; j++) {
                            await this.createItemDiagnosis(client, provClaimNo, shuffled[j], itemSeq);
                        }
                    }
                    // Link items to care team
                    for (const itemSeq of itemSequences) {
                        const linkedCareTeamCount = Math.floor(Math.random() * careTeamSequences.length) + 1;
                        const shuffled = [...careTeamSequences].sort(() => 0.5 - Math.random());
                        for (let j = 0; j < linkedCareTeamCount; j++) {
                            await this.createItemCareTeam(client, provClaimNo, shuffled[j], itemSeq);
                        }
                    }
                    // Create supporting info (0-3), but always create at least one row when the scenario defines override values
                    let supportingInfoCount = Math.floor(Math.random() * 4);
                    if ((this.scenarioRules?.category !== null && this.scenarioRules?.category !== undefined) ||
                        (this.scenarioRules?.supportingValue !== null && this.scenarioRules?.supportingValue !== undefined) ||
                        (this.scenarioRules?.supportingAttachment !== null && this.scenarioRules?.supportingAttachment !== undefined)) {
                        supportingInfoCount = Math.max(supportingInfoCount, 1);
                    }
                    const supportingInfoSequences = [];
                    for (let j = 1; j <= supportingInfoCount; j++) {
                        await this.createClaimSupportingInfo(client, provClaimNo, j);
                        supportingInfoSequences.push(j);
                    }
                    // Link items to supporting info
                    for (const itemSeq of itemSequences) {
                        for (const supportingSeq of supportingInfoSequences) {
                            if (Math.random() < 0.5) { // 50% chance to link
                                await this.createItemSupportingInfo(client, provClaimNo, supportingSeq, itemSeq);
                            }
                        }
                    }
                    // Create preauth details (0-2)
                    const preauthCount = Math.floor(Math.random() * 3);
                    for (let j = 0; j < preauthCount; j++) {
                        await this.createClaimPreauthDetails(client, provClaimNo);
                    }
                    // Create encounter (1 per claim)
                    const encounterId = await this.createClaimEncounter(client, provClaimNo, config.scenarioId);
                    // 20% chance for emergency encounter OR if emergencyDepartmentDisposition override exists
                    if (Math.random() < 0.2 || this.scenarioRules?.emergencyDepartmentDisposition !== undefined) {
                        await this.createEncounterEmergency(client, encounterId);
                    }
                    // 30% chance for hospitalization OR if hospitalDischargeDisposition override exists OR if we are doing a DISCHARGE event
                    const isDischargeEvent = eventType === 'DISCHARGE_SUMMARY' || eventType === 'NEWBORN_DISCHARGE' || eventType === 'MATERNAL_DISCHARGE';
                    if (Math.random() < 0.3 || this.scenarioRules?.hospitalDischargeDisposition !== undefined || isDischargeEvent) {
                        await this.createEncounterHospitalization(client, encounterId);
                    }
                    // 10% chance for accident details
                    if (Math.random() < 0.1) {
                        await this.createClaimAccidentDetail(client, provClaimNo);
                    }
                    // 5% chance for vision prescription (only if care team exists)
                    if (Math.random() < 0.05 && careTeamSequences.length > 0) {
                        await this.createClaimVisionPrescription(client, provClaimNo, careTeamSequences[0]);
                    }

                    if (this.isAutoMode()) {
                        // Auto mode: CS Bridge polls CLAIMINFO by PROVCLAIMNO — no events table needed.
                        // Bump updated_date so the bridge picks up the claim.
                        await this.triggerAutoSync(client, provClaimNo);
                    } else {
                        // Non-auto mode: explicitly write a row to the events table.
                        const shouldInsertEventRow = this.scenarioRules.insertEventRow !== false;
                        if (shouldInsertEventRow) {
                            await this.createEvent(client, provClaimNo, eventType);
                        }
                    }

                    await client.commit();
                    eventsCreated++;
                    console.log(`Event ${i + 1} generated out of ${config.numberOfEvents}`);
                }
                catch (iterationError) {
                    if (client)
                        await client.rollback();
                    console.error(`Error generating event ${i + 1}:`, iterationError);
                    lastError = iterationError;
                    failedEvents++;
                }
            }
            return {
                success: eventsCreated > 0,
                message: `Successfully created ${eventsCreated} events.${failedEvents > 0 ? ` Failed: ${failedEvents}. Last error: ${lastError?.message || 'Unknown'}` : ''}`,
                eventsCreated,
                generatedProvClaimNos
            };
        }
        catch (error) {
            console.error('Data generation fatal error:', error);
            return {
                success: false,
                message: `Fatal Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                eventsCreated: 0
            };
        }
        finally {
            if (client)
                await client.release();
        }
    }
    // Helper to ensure strings don't exceed VARCHAR limits
    truncate(value, maxLength) {
        const val = value || '';
        return val.length > maxLength ? val.substring(0, maxLength) : val;
    }
    /**
     * Oracle treats '' (empty string) identically to NULL.
     * For NOT NULL VARCHAR columns that intentionally receive an empty value
     * (e.g. negative test scenarios), convert '' to ' ' (single space) so the
     * row can be inserted and downstream business logic can evaluate it.
     * No-op for Postgres and MSSQL — they store '' as a real empty string.
     *
     * @param {string|null|undefined} value
     * @returns {string|null|undefined}
     */
    oracleNotNull(value) {
        if (this.dbConfig.type !== 'oracle') return value;
        if (value === '') return ' ';
        return value;
    }
    generateProvClaimNo(scenarioId = '') {
        const baseId = scenarioId ? scenarioId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) : '';
        const randomPart = faker.string.alphanumeric(5).toUpperCase();
        const timestampPart = Date.now().toString().slice(-7);
        return `CLM${baseId}${randomPart}${timestampPart}`.substring(0, 40);
    }
    generateId(prefix, length = 15) {
        // Ensure total length doesn't exceed expected limits
        const numericPart = faker.string.numeric(Math.max(1, length - prefix.length));
        return `${prefix}${numericPart}`.substring(0, length);
    }
    /**
     * Bump updated_date so CS Bridge (default_auto) picks up the claim for sync.
     */
    async triggerAutoSync(client, provClaimNo) {
        const tables = ['claimencounters', 'claiminfo', 'claimsupportinginfo'];
        for (const table of tables) {
            const fullTable = `${this.schemaPrefix}${this.tablePrefix}${table}`;
            console.log(`[DataGenerator] triggerAutoSync → UPDATE ${fullTable}`);
            try {
                if (this.dbConfig.type === 'oracle') {
                    await client.query(
                        `UPDATE ${fullTable} SET updated_date = SYSTIMESTAMP WHERE provclaimno = $1`,
                        [provClaimNo]
                    );
                } else if (this.dbConfig.type === 'postgres') {
                    await client.query(
                        `UPDATE ${fullTable} SET updated_date = NOW() WHERE provclaimno = $1`,
                        [provClaimNo]
                    );
                } else {
                    await client.query(
                        `UPDATE ${fullTable} SET updated_date = GETDATE() WHERE provclaimno = $1`,
                        [provClaimNo]
                    );
                }
            } catch {
                // Table may lack updated_date in some environments — encounter update is enough
            }
        }
    }
    async createEvent(client, provClaimNo, eventType) {
        const eventId = this.generateId('EVT', 47); // Max 50 for eventid
        const isUhr = this.providerType.toLowerCase().includes('enhanced');
        const _eventTable = isUhr ? 'UHR_EVENTS' : `${this.tablePrefix}events`;
        console.log(`[DataGenerator] createEvent → table: ${this.schemaPrefix}${_eventTable}`);
        const tableName = isUhr ? 'UHR_EVENTS' : `${this.tablePrefix}events`;
        const colCreatedDate = isUhr
            ? 'CREATED_DATE'
            : this.dbConfig.type === 'oracle' || this.dbConfig.type === 'mssql' || this.dbConfig.type === 'mysql'
                ? 'CREATED_DATE'
                : 'createddate';
        const colEventType = isUhr ? 'EVENTTYPE' : 'eventtype';
        const isSubmitted = this.scenarioRules?.isSubmitted ?? true;
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${tableName} 
      (eventid, provclaimno, ${colEventType}, ${colCreatedDate}, issubmitted)
      VALUES ($1, $2, $3, $4, $5)
    `, [eventId, provClaimNo, eventType, new Date(), isSubmitted ? 1 : 0]);
    }
    async createBeneficiary(client) {
        console.log(`[DataGenerator] createBeneficiary → table: ${this.schemaPrefix}${this.tablePrefix.toLocaleUpperCase()}beneficiary`);
        const beneficiaryId = this.generateId('BEN', 17); // Max 20
        const firstName = this.truncate(faker.person.firstName(), 50);
        const middleName = this.truncate(faker.person.middleName(), 50);
        const lastName = this.truncate(faker.person.lastName(), 50);
        const fullName = this.truncate(`${firstName} ${middleName} ${lastName}`, 200);
        // Use real eHealthIDs from the provided list
        const eHealthIds = ['30511223344557']; 
        const eHealthId = faker.helpers.arrayElement(eHealthIds);
        const rules = this.scenarioRules || {};
        const documentId = rules.documentId !== undefined ? rules.documentId : CONSTANTS.DOCUMENT_ID;
        const normalizedDocumentId = documentId === null ? null : this.truncate(String(this.oracleNotNull(documentId) ?? documentId), 50);
        const isDefaultPlus = this.isDefaultPlusMode();

        const cols = [
            'beneficiaryid', 'patientfileno', 'firstname', 'middlename', 'lastname', 'fullname', 
            'dob', 'gender', 'nationality', 'documenttype', 'documentid', 'contactnumber', 'ehealthid',
            'residencytype', 'maritalstatus', 'bloodgroup', 'preferredlanguage', 'email',
            'addressline', 'addressstreetname', 'addresscity', 'addressdistrict', 'addressstate',
            'addresspostalcode', 'addresscountry', 'occupation', 'religion'
        ];
        const vals = [
            beneficiaryId,
            this.truncate(faker.string.alphanumeric(10).toUpperCase(), 30),
            firstName,
            middleName,
            lastName,
            fullName,
            faker.date.birthdate({ min: 1940, max: 2020, mode: 'year' }),
            rules.gender !== undefined
                ? (rules.gender === 'F' ? 'female' : rules.gender === 'M' ? 'male' : rules.gender)
                : faker.helpers.arrayElement(['male', 'female']),
            this.truncate('SA', 30),
            this.truncate('National-ID', 30),
            normalizedDocumentId,
            this.truncate(`+966-5${faker.string.numeric(8)}`, 50),
            eHealthId,
            this.truncate(faker.helpers.arrayElement(['Citizen', 'Resident']), 50),
            faker.helpers.arrayElement(['Married', 'Single']),
            faker.helpers.arrayElement(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']),
            'en',
            this.truncate(faker.internet.email(), 50),
            this.truncate(faker.location.streetAddress(), 250),
            this.truncate(faker.location.street(), 250),
            this.truncate(faker.location.city(), 250),
            this.truncate(faker.location.county(), 250),
            this.truncate(faker.location.state(), 250),
            this.truncate(faker.location.zipCode() || '12345', 100),
            'SA',
            this.truncate(faker.person.jobTitle(), 20),
            this.truncate(faker.helpers.arrayElement(['Islam', 'Other']), 5)
        ];

        if (isDefaultPlus) {
            cols.push('prior_patient_id');
            vals.push(this.truncate(faker.string.alphanumeric(10).toUpperCase(), 50));
        }

        const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');

        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix.toLocaleUpperCase()}beneficiary 
      (${cols.join(', ')})
      VALUES (${placeholders})
    `, vals);
        return beneficiaryId;
    }
    async createCoverage(client, beneficiaryId) {
        console.log(`[DataGenerator] createCoverage → table: ${this.schemaPrefix}${this.tablePrefix}coverage`);
        const coverageId = this.generateId('COV', 17);
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}coverage 
      (coverageid, memberid, expirydate, payernphiesid, tpanphiesid,
       relationwithsubscriber, policyholder, policynumber, coveragetype, beneficiaryid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
            coverageId,
            this.truncate(faker.string.alphanumeric(15).toUpperCase(), 50),
            faker.date.future({ years: 1 }),
            this.generateId('PAY', 17),
            Math.random() < 0.3 ? this.generateId('TPA', 17) : null,
            this.truncate(faker.helpers.arrayElement(['self', 'spouse', 'child', 'parent']), 20),
            this.truncate(faker.company.name(), 250),
            this.truncate(faker.string.alphanumeric(10).toUpperCase(), 30),
            this.truncate(faker.helpers.arrayElement(['EHCPOL', 'PUBLICPOL']), 20),
            beneficiaryId
        ]);
        return coverageId;
    }
    async createCoverageClass(client, coverageId) {
        console.log(`[DataGenerator] createCoverageClass → table: ${this.schemaPrefix}${this.tablePrefix}coverage_class`);
        const coverageClassId = this.generateId('CLS', 17);
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}coverage_class 
      (coverageclassid, type, value, name, coverageid)
      VALUES ($1, $2, $3, $4, $5)
    `, [
            coverageClassId,
            this.truncate(faker.helpers.arrayElement(['group', 'plan', 'class']) || 'group', 20),
            this.truncate((faker.string.alphanumeric(10) || 'ABC123').toUpperCase(), 50),
            this.truncate(faker.commerce.productName() || 'Coverage Plan', 250),
            coverageId
        ]);
    }
    async createClaimInfo(client, provClaimNo, beneficiaryId, coverageId) {
        console.log(`[DataGenerator] createClaimInfo → table: ${this.schemaPrefix}${this.tablePrefix}claiminfo`);
        const billableStart = faker.date.recent({ days: 30 });
        const billableEnd = faker.date.soon({ days: 7, refDate: billableStart });
        const rules = this.scenarioRules || {};
        const isDefaultPlus = this.isDefaultPlusMode();

        const cols = [
            'provclaimno', 'episodeid', 'isnewborn', 'isreferral', 'referringprovidername',
            'claimtype', 'claimsubtype', 'providernphiesid', 'claimcreateddate', 'accountingperiod',
            'billableperiodstart', 'billableperiodend', 'eligibilityresponseid', 'eligibilityidentifierurl',
            'eligibilityofflineid', 'eligibilityofflinedate', 'preauthofflinedate', 'preauthresponseid',
            'preauthidentifierurl', 'payeetype', 'payeeid', 'coverageid', 'beneficiaryid', 'subscriberid', 'total'
        ];
        const vals = [
            provClaimNo,
            this.generateId('EP', 17), // Max 20
            rules.isNewborn !== undefined ? rules.isNewborn : faker.helpers.arrayElement(['true', 'false']),
            faker.helpers.arrayElement(['true', 'false']),
            Math.random() < 0.3 ? this.truncate(faker.company.name() || 'Provider', 250) : null,
            rules.claimType !== undefined ? rules.claimType : this.truncate(faker.helpers.arrayElement(['01.08']) || '01.08', 50),
            rules.claimSubType !== undefined ? rules.claimSubType : this.truncate(faker.helpers.arrayElement(['ip', 'op', 'emergency']) || 'op', 50),
            CONSTANTS.PROVIDER_NPHIES_ID,
            new Date(),
            faker.date.recent({ days: 30 }),
            billableStart,
            billableEnd,
            this.truncate(faker.string.alphanumeric(15) || 'ELIG123', 50),
            this.truncate(faker.internet.url() || 'https://example.com', 250),
            Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(15) || 'OFF123', 50) : null,
            Math.random() < 0.2 ? faker.date.recent({ days: 10 }) : null,
            Math.random() < 0.2 ? faker.date.recent({ days: 10 }) : null,
            Math.random() < 0.3 ? this.truncate(faker.string.alphanumeric(15) || 'PRE123', 50) : null,
            Math.random() < 0.3 ? this.truncate(faker.internet.url() || 'https://example.com', 250) : null,
            this.truncate(faker.helpers.arrayElement(['provider', 'subscriber']) || 'provider', 20),
            this.generateId('PYE', 17), // Max 20
            coverageId,
            beneficiaryId,
            Math.random() < 0.3 ? beneficiaryId : null,
            parseFloat(faker.finance.amount({ min: 100, max: 50000, dec: 2 }))
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
    }

    async createClaimItem(client, provClaimNo, sequenceNo) {
        console.log(`[DataGenerator] createClaimItem[${sequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}claimitem`);
        const quantity = parseFloat(faker.finance.amount({ min: 1, max: 10, dec: 2 }));
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        const rules = this.scenarioRules || {};
        const serviceType = rules.serviceType !== undefined ? rules.serviceType : this.truncate(faker.helpers.arrayElement(['service', 'drug', 'device', 'lab']), 50);
        const serviceCode = rules.serviceCode !== undefined ? rules.serviceCode : this.truncate(faker.string.numeric(8), 50);
        const serviceDesc = rules.serviceDesc !== undefined ? rules.serviceDesc : this.truncate(faker.commerce.productName(), 250);

        if (this.providerType === 'abha') {
            await client.query(`
        INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem 
        (${idCol}, sequenceno, servicetype, servicecode, servicedesc,
         nonstandardcode, nonstandarddesc, udi, ispackage, quantity, quantitycode,
         startdate, enddate, bodysitecode, subsitecode, drugselectionreason,
         prescribeddrugcode, pharmacistselectionreason, pharmacistsubstitute,
         reasonpharmacistsubstitute, ismaternity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `, [
                provClaimNo,
                sequenceNo,
                serviceType,
                serviceCode,
                serviceDesc,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.commerce.productDescription(), 250) : null,
                Math.random() < 0.1 ? this.truncate(faker.string.alphanumeric(15), 50) : null,
                faker.helpers.arrayElement(['true', 'false']),
                quantity,
                this.truncate('unit', 20),
                faker.date.recent({ days: 7 }),
                faker.date.recent({ days: 1 }),
                Math.random() < 0.3 ? this.truncate(faker.string.numeric(3), 50) : null,
                Math.random() < 0.3 ? this.truncate(faker.string.numeric(3), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['formatting', 'allergy']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['out-of-stock', 'cheaper']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.lorem.sentence(), 250) : null,
                rules.isMaternity !== undefined ? rules.isMaternity : faker.helpers.arrayElement(['true', 'false'])
            ]);
        }
        else {
            const unitPrice = parseFloat(faker.finance.amount({ min: 10, max: 5000, dec: 2 }));
            const factor = parseFloat(faker.finance.amount({ min: 0.8, max: 1.2, dec: 6 }));
            const discount = parseFloat(faker.finance.amount({ min: 0, max: unitPrice * 0.2, dec: 2 }));
            const subtotal = unitPrice * quantity * factor - discount;
            const tax = subtotal * 0.15;
            const net = subtotal + tax;
            const patientShare = net * parseFloat(faker.finance.amount({ min: 0.1, max: 0.3, dec: 2 }));
            const payerShare = net - patientShare;
            await client.query(`
        INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitem 
        (${idCol}, invoiceno, sequenceno, servicetype, servicecode, servicedesc,
         nonstandardcode, nonstandarddesc, udi, ispackage, quantity, quantitycode,
         unitprice, discount, factor, patientshare, payershare, tax, net,
         startdate, enddate, bodysitecode, subsitecode, drugselectionreason,
         prescribeddrugcode, pharmacistselectionreason, pharmacistsubstitute,
         reasonpharmacistsubstitute, ismaternity)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
      `, [
                provClaimNo,
                this.truncate(faker.string.alphanumeric(10).toUpperCase(), 50),
                sequenceNo,
                serviceType,
                serviceCode,
                serviceDesc,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.commerce.productDescription(), 250) : null,
                Math.random() < 0.1 ? this.truncate(faker.string.alphanumeric(15), 50) : null,
                faker.helpers.arrayElement(['true', 'false']),
                quantity,
                this.truncate('unit', 20),
                unitPrice,
                discount,
                factor,
                patientShare,
                payerShare,
                tax,
                net,
                faker.date.recent({ days: 7 }),
                faker.date.recent({ days: 1 }),
                Math.random() < 0.3 ? this.truncate(faker.string.numeric(3), 50) : null,
                Math.random() < 0.3 ? this.truncate(faker.string.numeric(3), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['formatting', 'allergy']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['out-of-stock', 'cheaper']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.lorem.sentence(), 250) : null,
                rules.isMaternity !== undefined ? rules.isMaternity : faker.helpers.arrayElement(['true', 'false'])
            ]);
        }
        return { serviceType, serviceCode, serviceDesc };
    }

    async createPregnancyDetails(client, provClaimNo, startDate) {
        console.log(`[DataGenerator] createPregnancyDetails → table: ${this.schemaPrefix}${this.tablePrefix}pregnancy_details`);
        await client.query(`
            INSERT INTO ${this.schemaPrefix}${this.tablePrefix}pregnancy_details
            (provclaimno, start_date)
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

    async createClaimItemDetails(client, provClaimNo, itemSequenceNo, sequenceNo) {
        console.log(`[DataGenerator] createClaimItemDetails[item=${itemSequenceNo},seq=${sequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}claimitemdetails`);
        const quantity = parseInt(faker.finance.amount({ min: 1, max: 5, dec: 0 }));
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        const rules = this.scenarioRules || {};
        if (this.providerType === 'abha') {
            await client.query(`
        INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitemdetails 
        (itemsequenceno, ${idCol}, sequenceno, servicetype, servicecode, servicedesc,
         nonstandardcode, nonstandarddesc, udi, quantity, quantitycode,
         prescribeddrugcode, pharmacistselectionreason, pharmacistsubstitute,
         reasonpharmacistsubstitute)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
                itemSequenceNo,
                provClaimNo,
                sequenceNo,
                rules.serviceType !== undefined ? rules.serviceType : this.truncate(faker.helpers.arrayElement(['service', 'drug', 'device']), 50),
                rules.serviceCode !== undefined ? rules.serviceCode : this.truncate(faker.string.numeric(8), 50),
                rules.serviceDesc !== undefined ? rules.serviceDesc : this.truncate(faker.commerce.productName(), 250),
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.commerce.productDescription(), 250) : null,
                Math.random() < 0.1 ? this.truncate(faker.string.alphanumeric(15), 50) : null,
                quantity,
                this.truncate('unit', 20),
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['out-of-stock', 'cheaper']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.lorem.sentence(), 250) : null
            ]);
        }
        else {
            const unitPrice = parseFloat(faker.finance.amount({ min: 10, max: 1000, dec: 2 }));
            const tax = unitPrice * quantity * 0.15;
            const net = unitPrice * quantity + tax;
            await client.query(`
        INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimitemdetails 
        (itemsequenceno, ${idCol}, sequenceno, servicetype, servicecode, servicedesc,
         nonstandardcode, nonstandarddesc, udi, quantity, quantitycode, unitprice,
         tax, net, prescribeddrugcode, pharmacistselectionreason, pharmacistsubstitute,
         reasonpharmacistsubstitute)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
                itemSequenceNo,
                provClaimNo,
                sequenceNo,
                rules.serviceType !== undefined ? rules.serviceType : this.truncate(faker.helpers.arrayElement(['service', 'drug', 'device']), 50),
                rules.serviceCode !== undefined ? rules.serviceCode : this.truncate(faker.string.numeric(8), 50),
                rules.serviceDesc !== undefined ? rules.serviceDesc : this.truncate(faker.commerce.productName(), 250),
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.commerce.productDescription(), 250) : null,
                Math.random() < 0.1 ? this.truncate(faker.string.alphanumeric(15), 50) : null,
                quantity,
                this.truncate('unit', 20),
                unitPrice,
                tax,
                net,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['out-of-stock', 'cheaper']), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.string.alphanumeric(10), 50) : null,
                Math.random() < 0.2 ? this.truncate(faker.lorem.sentence(), 250) : null
            ]);
        }
    }
    async createClaimDiagnosis(client, provClaimNo, sequenceNo) {
        console.log(`[DataGenerator] createClaimDiagnosis[${sequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}claimdiagnosis`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimdiagnosis 
      (${idCol}, sequenceno, diagnosiscode, diagnosisdesc, diagnosistype,
       onadmission, conditiononset)
      VALUES ($1, $2, $3, $4, $5, $6, $7)

    `, [
            provClaimNo,
            sequenceNo,
            "M25.46",
            this.truncate(faker.string.alphanumeric(8).toUpperCase(), 50),
            this.truncate(faker.helpers.arrayElement(['PRINCIPAL', 'SECONDARY']), 50),
            this.truncate(faker.helpers.arrayElement(['y', 'n', 'u']), 5),
            faker.helpers.arrayElement(['true', 'false'])
        ]);
    }
    async createClaimCareTeam(client, provClaimNo, sequenceNo) {
        console.log(`[DataGenerator] createClaimCareTeam[${sequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}claimcareteam`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimcareteam 
      (${idCol}, sequenceno, physicianid, physicianname, practitionerrole,
       careteamrole, careteamqualification)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
            provClaimNo,
            sequenceNo,
            CONSTANTS.PHYSICIAN_ID,
            this.truncate(faker.person.fullName() + ', MD', 250),
            this.truncate(faker.helpers.arrayElement(['doctor', 'nurse', 'specialist']), 50),
            this.truncate(faker.helpers.arrayElement(['primary', 'assist', 'supervisor']), 50),
            this.truncate(faker.helpers.arrayElement(['MD']), 50)
        ]);
    }
    async createItemDiagnosis(client, provClaimNo, diagnosisSequenceNo, itemSequenceNo) {
        console.log(`[DataGenerator] createItemDiagnosis[diag=${diagnosisSequenceNo},item=${itemSequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}itemdiagnosis`);
        // Note: ON CONFLICT is PostgreSQL specific, Oracle uses MERGE or simple INSERT with exception handling
        // For simplicity sake in this mock generator and given Oracle limitation with simple SQL execution:
        // We will use standard INSERT and ignore duplicate errors in the catch block if needed,
        // or we can remove ON CONFLICT for Postgres too if we are sure IDs are unique.
        // However, the original code had ON CONFLICT DO NOTHING.
        // Oracle 21c+ supports syntax like INSERT ... ON DUPLICATE KEY IGNORE equivalent or similar via hints but standard way is MERGE.
        // To keep it simple and compatible, we will remove ON CONFLICT and let the outer try/catch/rollback handle it?
        // No, duplicate keys shouldn't fail the whole event generation if possible.
        // But since this is a sequence we control, duplicates shouldn't happen often unless random puts them there.
        // Let's rely on probability.
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        let query = `
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}itemdiagnosis 
      (${idCol}, diagnosissequenceno, itemsequenceno)
      VALUES ($1, $2, $3)
    `;
        if (this.dbConfig.type === 'postgres') {
            query += ' ON CONFLICT DO NOTHING';
        }
        try {
            await client.query(query, [provClaimNo, diagnosisSequenceNo, itemSequenceNo]);
        }
        catch (e) {
            // Ignore duplicate key errors for Oracle (ORA-00001)
            // If Postgres fails despite ON CONFLICT (unlikely), we also catch it.
            //console.warn('Ignored error in createItemDiagnosis:', e);
        }
    }
    async createItemCareTeam(client, provClaimNo, careTeamSequenceNo, itemSequenceNo) {
        console.log(`[DataGenerator] createItemCareTeam[ct=${careTeamSequenceNo},item=${itemSequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}itemcareteam`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        let query = `
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}itemcareteam 
      (${idCol}, careteamsequenceno, itemsequenceno)
      VALUES ($1, $2, $3)
    `;
        if (this.dbConfig.type === 'postgres') {
            query += ' ON CONFLICT DO NOTHING';
        }
        try {
            await client.query(query, [provClaimNo, careTeamSequenceNo, itemSequenceNo]);
        }
        catch (e) {
            // Ignore duplicate key errors
        }
    }
    async createClaimSupportingInfo(client, provClaimNo, sequenceNo) {
        console.log(`[DataGenerator] createClaimSupportingInfo[${sequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        const rules = this.scenarioRules || {};
        const category = rules.category !== undefined ? rules.category : faker.helpers.arrayElement(['info', 'attachment', 'missingtooth']);
        let supportingValue = rules.supportingValue !== undefined ? rules.supportingValue : faker.lorem.sentence();
        if (rules.supportingValueMustNotContain && rules.supportingValue === undefined) {
            supportingValue = 'Patient clinical note without location change';
        }

        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimsupportinginfo 
      (${idCol}, sequenceno, category, reason, supportingvalue, supportingattachment,
       attachmentfilename, attachmenttype, code, unit, timingperiodfrom, timingperiodto)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
            provClaimNo,
            sequenceNo,
            category === null ? null : this.truncate(category, 50),
            Math.random() < 0.3 ? this.truncate(faker.helpers.arrayElement(['new-visit', 'emergency']), 50) : null,
            supportingValue === null ? null : this.truncate(supportingValue, 250),
            rules.supportingAttachment !== undefined ? (rules.supportingAttachment === 'exists' ? Buffer.from('mock_attachment') : rules.supportingAttachment) : null, // BYTEA - support override
            Math.random() < 0.2 ? this.truncate(faker.system.fileName(), 250) : null,
            Math.random() < 0.2 ? this.truncate(faker.system.mimeType(), 50) : null,
            Math.random() < 0.3 ? this.truncate(faker.string.alphanumeric(8), 50) : null,
            Math.random() < 0.3 ? this.truncate(faker.helpers.arrayElement(['day', 'week', 'month']), 20) : null,
            Math.random() < 0.3 ? faker.date.recent({ days: 30 }) : null,
            Math.random() < 0.3 ? faker.date.recent({ days: 1 }) : null
        ]);
    }
    async createItemSupportingInfo(client, provClaimNo, supportingInfoSequenceNo, itemSequenceNo) {
        console.log(`[DataGenerator] createItemSupportingInfo[sup=${supportingInfoSequenceNo},item=${itemSequenceNo}] → table: ${this.schemaPrefix}${this.tablePrefix}itemsupportinginfo`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        let query = `
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}itemsupportinginfo 
      (${idCol}, supportinginfosequenceno, itemsequenceno)
      VALUES ($1, $2, $3)
    `;
        if (this.dbConfig.type === 'postgres') {
            query += ' ON CONFLICT DO NOTHING';
        }
        try {
            await client.query(query, [provClaimNo, supportingInfoSequenceNo, itemSequenceNo]);
        }
        catch (e) {
            // Ignore duplicate key errors
        }
    }
    async createClaimEncounter(client, provClaimNo, scenarioId) {
        console.log(`[DataGenerator] createClaimEncounter → table: ${this.schemaPrefix}${this.tablePrefix}claimencounters`);
        const encounterId = this.generateId('ENC', 17); // Max 20
        const rules = this.scenarioRules || {};
        const startDate = rules.encounterStartDate ?? faker.date.recent({ days: 30 });
        // ENCOUNTERENDDATE is set only if the isolation rule specifies it (e.g. for A03)
        const endDate = this.scenarioRules.setEncounterEndDate
            ? faker.date.soon({ days: 7, refDate: startDate })
            : null;
        // const endDate = rules.encounterEndDate !== undefined
        //     ? rules.encounterEndDate
        //     : faker.date.soon({ days: 7, refDate: startDate });
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        const encounterClass = rules.encounterClass !== undefined ? rules.encounterClass : faker.helpers.arrayElement(['IMP', 'SS']);
        const encounterStatus = rules.encounterStatus !== undefined ? rules.encounterStatus : faker.helpers.arrayElement(['planned', 'arrived', 'in-progress', 'finished']);
        const isDefaultPlus = this.isDefaultPlusMode();

        const cols = [
            idCol, 'encounterid', 'encounterstartdate', 'encounterenddate', 'encounterclass',
            'encounterservicetype', 'priority', 'serviceprovider', 'encounterstatus', 'causeofdeath',
            'serviceeventtype'
        ];
        const vals = [
            provClaimNo,
            encounterId,
            startDate,
            endDate,
            encounterClass === null ? null : this.truncate(encounterClass, 50),
            this.truncate(faker.helpers.arrayElement(['consultation', 'surgery', 'therapy']), 50),
            this.truncate(faker.helpers.arrayElement(['routine', 'urgent', 'asap']), 50),
            CONSTANTS.PROVIDER_NPHIES_ID,
            this.truncate(encounterStatus, 50),
            Math.random() < 0.05 ? this.truncate(faker.helpers.arrayElement(['y', 'n']), 5) : null,
            Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['admission', 'discharge']), 50) : null
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
        return encounterId;
    }
    async createEncounterEmergency(client, encounterId) {
        console.log(`[DataGenerator] createEncounterEmergency → table: ${this.schemaPrefix}${this.tablePrefix}encounteremergency`);
        const emergencyId = this.generateId('EMG', 17); // Max 20
        const rules = this.scenarioRules || {};
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}encounteremergency 
      (encounteremergencyid, emergencyarrivalcode, emergencyservicestart,
       emergencydepartmentdisposition, triagecategory, triagedate, encounterid)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
            emergencyId,
            this.truncate(faker.helpers.arrayElement(['A', 'P', 'O']), 50),
            faker.date.recent({ days: 1 }),
            rules.emergencyDepartmentDisposition !== undefined ? rules.emergencyDepartmentDisposition : this.truncate(faker.helpers.arrayElement(['admitted', 'discharged', 'transferred']), 50),
            this.truncate(faker.helpers.arrayElement(['immediate', 'urgent', 'standard']), 50),
            faker.date.recent({ days: 1 }),
            encounterId
        ]);
    }
    async createEncounterHospitalization(client, encounterId) {
        const hospitalizationId = this.generateId('HOS', 17); // Max 20
        const rules = this.scenarioRules || {};
        // Oracle schema defines this table without the nphies_ prefix separator
        const prefix = this.tablePrefix;
        const hospitalizationTable = this.isEnhancedMode()
            ? `${this.schemaPrefix}${prefix}encounterhospitalization`
            : `${this.schemaPrefix}nphiesencounterhospitalization`;
        console.log(`[DataGenerator] createEncounterHospitalization → table: ${hospitalizationTable}`);
        await client.query(`
      INSERT INTO ${hospitalizationTable}
      (encounterhospitalizationid, hospitaladmissionspeciality, hospitaldischargespeciality,
       hospitalintendedlengthofstay, hospitalizationorigin, hospitaladmissionsource,
       hospitalreadmission, hospitaldischargedisposition, encounterid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
            hospitalizationId,
            this.truncate(faker.helpers.arrayElement(['cardiology', 'surgery', 'internal']), 50),
            Math.random() < 0.7 ? this.truncate(faker.helpers.arrayElement(['cardiology', 'surgery', 'internal']), 50) : null,
            this.truncate(faker.helpers.arrayElement(['1-3', '4-7', '8-14', '15+']), 50),
            Math.random() < 0.3 ? this.truncate(faker.helpers.arrayElement(['home', 'facility']), 50) : null,
            this.truncate(faker.helpers.arrayElement(['emergency', 'referral', 'direct']), 50),
            Math.random() < 0.2 ? this.truncate(faker.helpers.arrayElement(['y', 'n']), 5) : null,
            rules.hospitalDischargeDisposition !== undefined ? rules.hospitalDischargeDisposition : (Math.random() < 0.7 ? this.truncate(faker.helpers.arrayElement(['home', 'other-facility', 'rehab']), 50) : null),
            encounterId
        ]);
    }
    async createClaimPreauthDetails(client, provClaimNo) {
        console.log(`[DataGenerator] createClaimPreauthDetails → table: ${this.schemaPrefix}${this.tablePrefix}claimpreauthdetails`);
        const idCol = this.providerType === 'abha' ? 'visitID' : 'provclaimno';
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimpreauthdetails 
      (${idCol}, preauthrefno)
      VALUES ($1, $2)
    `, [
            provClaimNo,
            this.truncate(faker.string.alphanumeric(15).toUpperCase(), 50)
        ]);
    }
    async createClaimAccidentDetail(client, provClaimNo) {
        console.log(`[DataGenerator] createClaimAccidentDetail → table: ${this.schemaPrefix}${this.tablePrefix}claimaccidentdetail`);

        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimaccidentdetail 
      (provclaimno, accidenttype, accidentdate, addressstreetname, addresscity,
       addressstate, addresscountry)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
            provClaimNo,
            this.truncate(faker.helpers.arrayElement(['MVA', 'work', 'home', 'sports']), 50),
            faker.date.recent({ days: 30 }),
            this.truncate(faker.location.street(), 250),
            this.truncate(faker.location.city(), 100),
            this.truncate(faker.location.state(), 100),
            'SA'
        ]);
    }
    async createClaimVisionPrescription(client, provClaimNo, careTeamSequence) {
        console.log(`[DataGenerator] createClaimVisionPrescription → table: ${this.schemaPrefix}${this.tablePrefix}claimvisionprescription`);
        const visionPrescriptionId = this.generateId('VIS', 17);
        await client.query(`
      INSERT INTO ${this.schemaPrefix}${this.tablePrefix}claimvisionprescription 
      (provclaimno, visionprescriptionid, datewritten, careteamsequence, product, eye,
       sphere, cylinder, axis, prismamount, prismbase, multifocalpower, lenspower,
       lensbackcurve, lensdiameter, lensduration, lenscolor, lensbrand, lensnote,
       lensdurationunit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    `, [
            provClaimNo,
            visionPrescriptionId,
            faker.date.recent({ days: 30 }),
            careTeamSequence,
            this.truncate(faker.helpers.arrayElement(['lens', 'contact']), 50),
            this.truncate(faker.helpers.arrayElement(['right', 'left']), 20),
            parseFloat(faker.finance.amount({ min: -10, max: 10, dec: 2 })),
            parseFloat(faker.finance.amount({ min: -5, max: 5, dec: 2 })),
            parseInt(faker.finance.amount({ min: 0, max: 180, dec: 0 })),
            Math.random() < 0.3 ? parseFloat(faker.finance.amount({ min: 0, max: 5, dec: 2 })) : null,
            Math.random() < 0.3 ? this.truncate(faker.helpers.arrayElement(['up', 'down', 'in', 'out']), 20) : null,
            Math.random() < 0.3 ? parseFloat(faker.finance.amount({ min: 1, max: 3, dec: 2 })) : null,
            parseFloat(faker.finance.amount({ min: -10, max: 10, dec: 2 })),
            parseFloat(faker.finance.amount({ min: 8, max: 10, dec: 2 })),
            parseFloat(faker.finance.amount({ min: 13, max: 15, dec: 2 })),
            parseInt(faker.finance.amount({ min: 1, max: 12, dec: 0 })),
            Math.random() < 0.3 ? this.truncate(faker.color.human(), 50) : null,
            this.truncate(faker.company.name(), 100),
            Math.random() < 0.3 ? this.truncate(faker.lorem.sentence(), 250) : null,
            this.truncate('month', 20)
        ]);
    }

    async close() {
        if (this.pgPool) {
            await this.pgPool.end();
        }
        if (this.mssqlPool) {
            await this.mssqlPool.close();
        }
        if (this.oracleConn) {
            await this.oracleConn.close();
            this.oracleConn = null;
        }
        if (this.mysqlPool) {
            await this.mysqlPool.end();
            this.mysqlPool = null;
        }
    }
}
