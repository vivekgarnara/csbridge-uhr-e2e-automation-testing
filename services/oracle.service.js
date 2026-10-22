/**
 * oracle.service.js
 *
 * Oracle DB service for UHR end-to-end automation.
 * Handles all Stage 1 (event existence) and Stage 2 (processing status)
 * validations against the local Oracle database.
 *
 * Depends on: oracledb (already installed), dotenv
 */

import oracledb from 'oracledb';

// ---------------------------------------------------------------------------
// Optional Thick-mode init (Oracle 11g / 12c without native thin support).
// Uncomment and set libDir if your environment needs it.
// ---------------------------------------------------------------------------
try {
  oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient_19_3' });
} catch (err) {
  if (!err.message?.includes('already been initialized')) {
    console.warn('[OracleService] Thick-mode init skipped:', err.message);
  }
}

export class OracleService {
  /** @type {import('oracledb').Connection | null} */
  #conn = null;

  /**
   * @param {object} config
   * @param {string} config.user
   * @param {string} config.password
   * @param {string} config.connectString  e.g. "localhost:1521/XE" or "localhost/XEPDB1"
   */
  constructor(config) {
    this.config = config ?? {
      user:          process.env.ORACLE_USER,
      password:      process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECTION,
    };
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /** Opens (or reuses) a single connection for the lifetime of this instance. */
  async connect() {
    if (!this.#conn) {
      this.#conn = await oracledb.getConnection({
        user:          this.config.user,
        password:      this.config.password,
        connectString: this.config.connectString,
      });
    }
    return this.#conn;
  }

  /** Closes the connection. Call in test teardown / afterAll. */
  async close() {
    if (this.#conn) {
      try { await this.#conn.close(); } catch (_) {}
      this.#conn = null;
    }
  }

  /**
   * Execute a SELECT and return rows as plain objects.
   * Converts $1/$2 placeholders to Oracle :1/:2 automatically.
   *
   * @param {string}   sql
   * @param {any[]}    [params=[]]
   * @returns {Promise<object[]>}
   */
  async query(sql, params = []) {
    const conn = await this.connect();
    const oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    const result = await conn.execute(oracleSql, params, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return result.rows ?? [];
  }

  // -------------------------------------------------------------------------
  // Stage 1 — Event existence
  // -------------------------------------------------------------------------

  /**
   * Verify that a PATIENT_EVENTS row exists for the given beneficiary.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object[]>}
   */
  async checkEventGenerated(beneficiaryId) {
    return this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1`,
      [beneficiaryId]
    );
  }

  /**
   * Verify that an event of the correct type exists for the beneficiary.
   *
   * @param {string} beneficiaryId
   * @param {string} eventType  e.g. 'A01'
   * @returns {Promise<object[]>}
   */
  async checkEventType(beneficiaryId, eventType) {
    return this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1
          AND UPPER(EVENT_TYPE)  = UPPER($2)`,
      [beneficiaryId, eventType]
    );
  }

  /**
   * Confirm the event is in PENDING status (not yet picked up by the desktop app).
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object[]>}
   */
  async checkEventPending(beneficiaryId) {
    return this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1
          AND UPPER(STATUS) = 'PENDING'`,
      [beneficiaryId]
    );
  }

  // -------------------------------------------------------------------------
  // Stage 2 — Desktop App processing
  // -------------------------------------------------------------------------

  /**
   * Confirm that the desktop app has marked the event as submitted.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object[]>}
   */
  async checkEventSubmitted(beneficiaryId) {
    return this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1
          AND UPPER(STATUS) = 'SUBMITTED'`,
      [beneficiaryId]
    );
  }

  /**
   * Check that the processing timestamp has been updated, confirming the
   * desktop app touched the record.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object[]>}
   */
  async checkProcessingTimestamp(beneficiaryId) {
    return this.query(
      `SELECT BENEFICIARY_ID, STATUS, PROCESSING_TIMESTAMP, RETRY_COUNT
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1
          AND PROCESSING_TIMESTAMP IS NOT NULL`,
      [beneficiaryId]
    );
  }

  /**
   * Retrieve the current retry count for an event.
   * A value > 0 indicates the desktop app encountered processing issues.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<number>}
   */
  async getRetryCount(beneficiaryId) {
    const rows = await this.query(
      `SELECT RETRY_COUNT
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID = $1`,
      [beneficiaryId]
    );
    return rows[0]?.RETRY_COUNT ?? 0;
  }

  /**
   * Full Stage 1 assertion: event exists, has the right type, and is PENDING.
   * Returns the matched row or throws if any check fails.
   *
   * @param {string} beneficiaryId
   * @param {string} eventType
   * @returns {Promise<object>}  the matched row
   */
  async assertStage1(beneficiaryId, eventType) {
    const rows = await this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID  = $1
          AND UPPER(EVENT_TYPE) = UPPER($2)
          AND UPPER(STATUS)     = 'PENDING'`,
      [beneficiaryId, eventType]
    );

    if (!rows.length) {
      throw new Error(
        `[OracleService] Stage 1 FAILED — no PENDING ${eventType} event found for beneficiary ${beneficiaryId}`
      );
    }
    return rows[0];
  }

  /**
   * Full Stage 2 assertion: event has been submitted and timestamp updated.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object>}  the matched row
   */
  async assertStage2(beneficiaryId) {
    const rows = await this.query(
      `SELECT *
         FROM PATIENT_EVENTS
        WHERE BENEFICIARY_ID        = $1
          AND UPPER(STATUS)         = 'SUBMITTED'
          AND PROCESSING_TIMESTAMP IS NOT NULL`,
      [beneficiaryId]
    );

    if (!rows.length) {
      throw new Error(
        `[OracleService] Stage 2 FAILED — event for ${beneficiaryId} has not been submitted yet`
      );
    }
    return rows[0];
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Delete all automation-generated test records.
   * Safe to run in afterAll — only removes rows whose BENEFICIARY_ID starts
   * with 'AUTO_'.
   */
  async cleanupTestData() {
    await this.query(
      `DELETE FROM PATIENT_EVENTS WHERE BENEFICIARY_ID LIKE 'AUTO_%'`,
      []
    );
    console.log('[OracleService] Test data cleaned up.');
  }
}
