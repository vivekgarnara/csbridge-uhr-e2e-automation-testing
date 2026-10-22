/**
 * mockGenerator.service.js
 *
 * Healthcare event generator for UHR automation.
 * Supports three integration strategies — pick the one that matches
 * how your mock generator is deployed:
 *
 *   STRATEGY_API  — POST to a running HTTP generator service  (preferred)
 *   STRATEGY_CLI  — spawn the generator as a child process
 *   STRATEGY_DB   — insert directly into Oracle (last resort)
 *
 * Set the MOCK_GENERATOR_STRATEGY env var to 'api', 'cli', or 'db'.
 * Defaults to 'cli' if unset.
 *
 * Depends on: oracledb (for STRATEGY_DB), node built-ins
 */

import { execSync, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Strategy constants
// ---------------------------------------------------------------------------
export const STRATEGY_API = 'api';
export const STRATEGY_CLI = 'cli';
export const STRATEGY_DB  = 'db';

export class MockGeneratorService {
  /**
   * @param {object} [options]
   * @param {'api'|'cli'|'db'} [options.strategy]        - override MOCK_GENERATOR_STRATEGY
   * @param {string}           [options.apiBaseUrl]       - base URL for STRATEGY_API
   * @param {string}           [options.cliPath]          - executable path for STRATEGY_CLI
   * @param {object}           [options.oracleConfig]     - Oracle config for STRATEGY_DB
   */
  constructor(options = {}) {
    this.strategy   = options.strategy   ?? process.env.MOCK_GENERATOR_STRATEGY ?? STRATEGY_CLI;
    this.apiBaseUrl = options.apiBaseUrl ?? process.env.MOCK_GENERATOR_API_URL  ?? 'http://localhost:3000';
    this.cliPath    = options.cliPath    ?? process.env.MOCK_GENERATOR_CLI      ?? 'generate-event';
    this.oracleConfig = options.oracleConfig ?? null; // only needed for STRATEGY_DB
  }

  // -------------------------------------------------------------------------
  // Public API — event type helpers
  // -------------------------------------------------------------------------

  /** Generate an A01 (Inpatient Admission) event. */
  async generateA01(beneficiaryId) {
    return this.#generate('A01', beneficiaryId);
  }

  /** Generate an A02 (Transfer) event. */
  async generateA02(beneficiaryId) {
    return this.#generate('A02', beneficiaryId);
  }

  /** Generate an A03 (Discharge) event. */
  async generateA03(beneficiaryId) {
    return this.#generate('A03', beneficiaryId);
  }

  /** Generate an A04 (Outpatient Registration) event. */
  async generateA04(beneficiaryId) {
    return this.#generate('A04', beneficiaryId);
  }

  /** Generate an A08 (Update Patient Info) event. */
  async generateA08(beneficiaryId) {
    return this.#generate('A08', beneficiaryId);
  }

  /**
   * Generate any event type.
   *
   * @param {string} eventType  e.g. 'A01'
   * @param {string} beneficiaryId
   * @param {object} [extra={}]  additional payload fields (API strategy only)
   * @returns {Promise<{ eventType: string, beneficiaryId: string, generatedAt: string }>}
   */
  async generate(eventType, beneficiaryId, extra = {}) {
    return this.#generate(eventType, beneficiaryId, extra);
  }

  // -------------------------------------------------------------------------
  // Internal dispatcher
  // -------------------------------------------------------------------------

  /**
   * @param {string} eventType
   * @param {string} beneficiaryId
   * @param {object} [extra={}]
   */
  async #generate(eventType, beneficiaryId, extra = {}) {
    console.log(`[MockGenerator] Generating ${eventType} for ${beneficiaryId} via strategy: ${this.strategy}`);

    switch (this.strategy) {
      case STRATEGY_API:
        return this.#generateViaApi(eventType, beneficiaryId, extra);

      case STRATEGY_CLI:
        return this.#generateViaCli(eventType, beneficiaryId);

      case STRATEGY_DB:
        return this.#generateViaDb(eventType, beneficiaryId);

      default:
        throw new Error(`[MockGenerator] Unknown strategy: "${this.strategy}". Use 'api', 'cli', or 'db'.`);
    }
  }

  // -------------------------------------------------------------------------
  // Strategy: API
  // -------------------------------------------------------------------------

  /**
   * POST to a running mock-generator HTTP service.
   *
   * Expected request body:  { eventType, beneficiaryId, ...extra }
   * Expected response body: { success: true, ... }
   *
   * @param {string} eventType
   * @param {string} beneficiaryId
   * @param {object} extra
   */
  async #generateViaApi(eventType, beneficiaryId, extra) {
    const url = `${this.apiBaseUrl}/generate-event`;
    const body = JSON.stringify({ eventType, beneficiaryId, ...extra });

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[MockGenerator] API returned ${response.status}: ${text}`
      );
    }

    const json = await response.json();
    console.log(`[MockGenerator] API response:`, json);

    return { eventType, beneficiaryId, generatedAt: new Date().toISOString() };
  }

  // -------------------------------------------------------------------------
  // Strategy: CLI
  // -------------------------------------------------------------------------

  /**
   * Spawn the generator executable as a child process.
   *
   * @param {string} eventType
   * @param {string} beneficiaryId
   */
  async #generateViaCli(eventType, beneficiaryId) {
    try {
      const { stdout, stderr } = await execFileAsync(
        this.cliPath,
        [eventType, beneficiaryId],
        { timeout: 30_000 }
      );
      if (stdout) console.log(`[MockGenerator] CLI stdout: ${stdout.trim()}`);
      if (stderr) console.warn(`[MockGenerator] CLI stderr: ${stderr.trim()}`);
    } catch (err) {
      throw new Error(
        `[MockGenerator] CLI execution failed: ${err.message}`
      );
    }

    return { eventType, beneficiaryId, generatedAt: new Date().toISOString() };
  }

  // -------------------------------------------------------------------------
  // Strategy: DB (direct Oracle insert — last resort)
  // -------------------------------------------------------------------------

  /**
   * Insert a minimal PATIENT_EVENTS row directly into Oracle.
   * Use only when no API or CLI is available.
   *
   * You will almost certainly need to add mandatory columns that are
   * specific to your schema — adjust the INSERT below accordingly.
   *
   * @param {string} eventType
   * @param {string} beneficiaryId
   */
  async #generateViaDb(eventType, beneficiaryId) {
    // Lazy-import oracledb only when this strategy is actually used
    const oracledb = (await import('oracledb')).default;

    const cfg = this.oracleConfig ?? {
      user:          process.env.ORACLE_USER,
      password:      process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECTION,
    };

    const conn = await oracledb.getConnection(cfg);

    try {
      await conn.execute(
        `INSERT INTO PATIENT_EVENTS
           (EVENT_ID, EVENT_TYPE, BENEFICIARY_ID, STATUS, CREATED_DATE)
         VALUES
           (SYS_GUID(), :eventType, :beneficiaryId, 'PENDING', SYSDATE)`,
        { eventType, beneficiaryId }
      );
      await conn.commit();
      console.log(`[MockGenerator] DB insert committed for ${beneficiaryId}`);
    } catch (err) {
      await conn.rollback();
      throw new Error(`[MockGenerator] DB insert failed: ${err.message}`);
    } finally {
      await conn.close();
    }

    return { eventType, beneficiaryId, generatedAt: new Date().toISOString() };
  }
}
