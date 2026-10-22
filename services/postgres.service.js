/**
 * postgres.service.js
 *
 * PostgreSQL / NPHIES service for UHR end-to-end automation.
 * Handles all Stage 3 validations — confirming that events have been
 * transformed to HL7, submitted to NPHIES, and recorded in the
 * midtable_nphies schema.
 *
 * Depends on: pg (already installed)
 */

import { Pool } from 'pg';

/** Schema prefix used for all NPHIES tables in PostgreSQL. */
const SCHEMA = 'midtable_nphies';

export class PostgresService {
  /** @type {import('pg').Pool | null} */
  #pool = null;

  /**
   * @param {object} [config]
   * @param {string} [config.host]
   * @param {number} [config.port]
   * @param {string} [config.database]
   * @param {string} [config.user]
   * @param {string} [config.password]
   */
  constructor(config) {
    this.config = config ?? {
      host:     process.env.POSTGRES_HOST     ?? 'localhost',
      port:     Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB       ?? 'nphies',
      user:     process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    };
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /** Returns the shared connection pool, creating it on first call. */
  #getPool() {
    if (!this.#pool) {
      this.#pool = new Pool(this.config);
    }
    return this.#pool;
  }

  /** Tear down the pool. Call in afterAll. */
  async close() {
    if (this.#pool) {
      try { await this.#pool.end(); } catch (_) {}
      this.#pool = null;
    }
  }

  /**
   * Execute a parameterised query and return rows.
   *
   * @param {string}   sql
   * @param {any[]}    [params=[]]
   * @returns {Promise<object[]>}
   */
  async query(sql, params = []) {
    const client = await this.#getPool().connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Stage 3 — NPHIES submission checks
  // -------------------------------------------------------------------------

  /**
   * Confirm that an NPHIES event row exists for the beneficiary.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<object[]>}
   */
  async checkNphiesSubmission(beneficiaryId) {
    return this.query(
      `SELECT *
         FROM ${SCHEMA}.nphies_events
        WHERE beneficiary_id = $1`,
      [beneficiaryId]
    );
  }

  /**
   * Confirm that an event of the correct type was submitted.
   *
   * @param {string} beneficiaryId
   * @param {string} eventType  e.g. 'A01'
   * @returns {Promise<object[]>}
   */
  async checkNphiesEventType(beneficiaryId, eventType) {
    return this.query(
      `SELECT *
         FROM ${SCHEMA}.nphies_events
        WHERE beneficiary_id          = $1
          AND UPPER(eventtype)        = UPPER($2)`,
      [beneficiaryId, eventType]
    );
  }

  /**
   * Retrieve the HL7 message payload stored alongside the NPHIES record.
   * Returns null if no row found.
   *
   * @param {string} beneficiaryId
   * @returns {Promise<string | null>}
   */
  async getHl7Payload(beneficiaryId) {
    const rows = await this.query(
      `SELECT hl7_message
         FROM ${SCHEMA}.nphies_events
        WHERE beneficiary_id = $1
        ORDER BY createddate DESC
        LIMIT 1`,
      [beneficiaryId]
    );
    return rows[0]?.hl7_message ?? null;
  }

  /**
   * Confirm the patient data (e.g. name, gender, DOB) was correctly mapped
   * in the NPHIES record.
   *
   * @param {string} beneficiaryId
   * @param {object} expected
   * @param {string} [expected.gender]
   * @param {string} [expected.dob]
   * @returns {Promise<object[]>}
   */
  async checkPatientData(beneficiaryId, expected = {}) {
    const conditions = ['beneficiary_id = $1'];
    const params = [beneficiaryId];

    if (expected.gender) {
      params.push(expected.gender);
      conditions.push(`UPPER(gender) = UPPER($${params.length})`);
    }
    if (expected.dob) {
      params.push(expected.dob);
      conditions.push(`date_of_birth::date = $${params.length}::date`);
    }

    const where = conditions.join(' AND ');
    return this.query(
      `SELECT *
         FROM ${SCHEMA}.nphies_events
        WHERE ${where}`,
      params
    );
  }

  /**
   * Retrieve the N most recent NPHIES events for an event type.
   * Useful for smoke checks and regression runs.
   *
   * @param {string} eventType
   * @param {number} [limit=5]
   * @returns {Promise<object[]>}
   */
  async getRecentEvents(eventType, limit = 5) {
    return this.query(
      `SELECT *
         FROM ${SCHEMA}.nphies_events
        WHERE UPPER(eventtype) = UPPER($1)
        ORDER BY createddate DESC
        LIMIT $2`,
      [eventType, limit]
    );
  }

  // -------------------------------------------------------------------------
  // Full Stage 3 assertion
  // -------------------------------------------------------------------------

  /**
   * Asserts that a correctly-typed NPHIES submission row exists for the
   * beneficiary.  Throws with a descriptive message if not.
   *
   * @param {string} beneficiaryId
   * @param {string} eventType
   * @returns {Promise<object>}  the matched row
   */
  async assertStage3(beneficiaryId, eventType) {
    const rows = await this.checkNphiesEventType(beneficiaryId, eventType);

    if (!rows.length) {
      throw new Error(
        `[PostgresService] Stage 3 FAILED — no ${eventType} NPHIES record found for beneficiary ${beneficiaryId}`
      );
    }
    return rows[0];
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Remove all test-generated NPHIES records.
   * Only deletes rows whose beneficiary_id starts with 'AUTO_'.
   */
  async cleanupTestData() {
    await this.query(
      `DELETE FROM ${SCHEMA}.nphies_events WHERE beneficiary_id LIKE 'AUTO_%'`,
      []
    );
    console.log('[PostgresService] Test data cleaned up.');
  }
}
