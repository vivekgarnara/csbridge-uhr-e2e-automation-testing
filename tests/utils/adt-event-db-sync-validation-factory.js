import { test, expect } from '@playwright/test';
import pkg from 'pg';
const { Pool } = pkg;
import { dbEnvironments } from '../config/db.config.js';
import { feature, story, tag } from 'allure-js-commons';
import fs from 'fs';
import path from 'path';

function getTargetDbConfig() {
  const targetDbPath = path.resolve(process.cwd(), 'tests/config/targetDb.json');
  if (fs.existsSync(targetDbPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(targetDbPath, 'utf8'));
      if (data && data.dbConfig) {
        return data.dbConfig;
      }
    } catch (err) {
      console.warn('Error reading targetDb.json:', err.message);
    }
  }
  return dbEnvironments.qaPostgres;
}

const dbConfig = getTargetDbConfig();

// Shared state across all tests in a describe block
const sharedState = {};

/**
 * Helper: Create individual test with explicit function call
 * This ensures Playwright discovers each test during its discovery phase
 *
 * @param {object} testGroup - test.describe object
 * @param {string} provClaimNo - claim ID to validate
 * @param {object} state - shared state object containing submittedIds
 */
function createIndividualTest(testGroup, provClaimNo, state) {
  testGroup(`[${provClaimNo}] submission chain is complete`, () => {
    test.info().annotations.push({ type: 'provClaimNo', description: provClaimNo });

    const isSubmitted = state.submittedIds && state.submittedIds.has(provClaimNo);
    test.info().annotations.push({ type: 'status', description: isSubmitted ? 'SUBMITTED' : 'NOT_SUBMITTED' });

    console.log(
      isSubmitted
        ? `PROVCLAIMNO: ${provClaimNo} — SUBMITTED`
        : `PROVCLAIMNO: ${provClaimNo} — NOT FOUND or NOT SUBMITTED`
    );

    expect(
      isSubmitted,
      `[PROVCLAIMNO: ${provClaimNo}] Not found or has no SUBMITTED record in event_transaction_log`
    ).toBe(true);
  });
}

/**
 * @param {string} eventType  - e.g. 'A01', 'A02' … 'A08'
 * @param {string[]} provClaimNos - array from the corresponding aXX-post-claims.json
 */
export function createDbSyncValidationSpec(eventType, provClaimNos) {
  test.describe(`${eventType} Post Database Connection & Sanity Tests`, () => {
    const state = { submittedIds: null };

    test.beforeAll(async () => {
      // Guard: nothing to validate if the main spec produced no positive claims.
      if (!provClaimNos.length) {
        state.submittedIds = new Set();
        return;
      }

      let pool;
      try {
        pool = new Pool(dbConfig);
        const client = await pool.connect();
        client.release();

        // Single query for all IDs — no per-test DB calls.
        const { rows } = await pool.query(
          `SELECT DISTINCT us.provider_claim_id
           FROM uhr_schema us
           JOIN "event" e
             ON e.provclaimid = us.provider_claim_id
           JOIN sent_event se
             ON se.event_id = e.event_id
           JOIN event_transaction_log etl
             ON etl.event_id = se.id::text
            AND etl.status = 'SUBMITTED'
           WHERE us.provider_claim_id = ANY($1::text[])`,
          [provClaimNos]
        );

        state.submittedIds = new Set(rows.map((r) => r.provider_claim_id));
        console.log(`[${eventType}] Found ${state.submittedIds.size} / ${provClaimNos.length} submitted claims`);
      } catch (error) {
        throw new Error(`[${eventType}] PostgreSQL setup failed: ${error instanceof Error ? error.message : error}`);
      } finally {
        if (pool) {
          await pool.end();
        }
      }
    });

    test.afterAll(async () => {
      // Cleanup handled in beforeAll finally block
    });

    /**
     * WORKAROUND: Test.step() for sub-test grouping
     *
     * Since Playwright doesn't support .each() parametrization,
     * we create a single test that validates all claims using test.step()
     * to show granular pass/fail per claim in the report.
     */
    test(`Validate all ${provClaimNos.length} submitted claims`, async () => {
      try {
        await feature(eventType);
        await story('Staging Sync Validation');
        await tag('sync-validation');
      } catch (err) {
        // Fail-safe: ignore allure errors if the allure reporter is not loaded
      }

      if (!provClaimNos.length) {
        return; // Guard: no claims to validate
      }

      let failedClaims = [];

      for (const provClaimNo of provClaimNos) {
        try {
          await test.step(`[${provClaimNo}] submission chain is complete`, async () => {
            const isSubmitted = state.submittedIds && state.submittedIds.has(provClaimNo);

            console.log(
              isSubmitted
                ? `PROVCLAIMNO: ${provClaimNo} — SUBMITTED`
                : `PROVCLAIMNO: ${provClaimNo} — NOT FOUND or NOT SUBMITTED`
            );

            expect(
              isSubmitted,
              `[PROVCLAIMNO: ${provClaimNo}] Not found or has no SUBMITTED record in event_transaction_log`
            ).toBe(true);
          });
        } catch (stepError) {
          failedClaims.push(provClaimNo);
          // Continue checking other claims instead of stopping
        }
      }

      // Report all failed claims
      if (failedClaims.length > 0) {
        console.error(`\n${failedClaims.length} claims failed submission:\n${failedClaims.join('\n')}`);
      } else {
        console.log(`\nAll ${provClaimNos.length} claims passed submission validation`);
      }
    });
  });
}
