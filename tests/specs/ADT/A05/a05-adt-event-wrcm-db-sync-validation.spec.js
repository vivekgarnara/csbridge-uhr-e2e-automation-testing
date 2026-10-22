import { test, expect } from '@playwright/test';
import pkg from 'pg';
const { Pool } = pkg;
import { dbEnvironments } from '../../../config/db.config.js';
import { feature, story, tag, parameter } from 'allure-js-commons';

const wrcmConfig = dbEnvironments.stagingWrcm;
const stgConfig = dbEnvironments.stagingPostgres;

test.describe('A05 WRCM Database Sync Validation Tests', () => {
    let wrcmPool;
    let stgPool;

    test.beforeAll(async () => {
        wrcmPool = new Pool(wrcmConfig);
        stgPool = new Pool(stgConfig);
    });

    test.afterAll(async () => {
        if (wrcmPool) await wrcmPool.end();
        if (stgPool) await stgPool.end();
    });

    test('Verify ADT A05 event sync from WRCM database to CSBRIDGE_STG database', async () => {
        try {
            await feature('A05');
            await story('WRCM Sync Validation');
            await tag('sync-validation');
        } catch (err) {
            // Ignore allure errors
        }

        console.log('--- Step 1: Connecting to WRCM database ---');
        const wrcmClient = await wrcmPool.connect();
        let latestWrcmRecord;
        try {
            const wrcmQuery = `
        SELECT
          cr.request_id,
          cr.claim_type,
          cr.request_type,
          cr.request_subtype,
          cr.provclaimno,
          cr.providerid,
          cr.beneficiary_claim_id,
          cr.last_updated_date,
          cresp.response_id,
          cresp.response_outcome,
          cresp.adjudication_outcome,
          cresp.response_date_time,
          cresp.preauth_ref_number,
          cresp.preauth_period_start_date,
          cresp.preauth_period_end_date
        FROM providers_nphies.claim_request cr
        JOIN providers_nphies.claim_response cresp
          ON cresp.claim_request_id = cr.request_id
        WHERE LOWER(cr.claim_type)      = LOWER('priorauth-request')
          AND LOWER(cr.request_type)    = LOWER('institutional')
          AND LOWER(cr.request_subtype) = LOWER('ip')
          AND (
               UPPER(cresp.response_outcome) IN ('APPROVED', 'PARTIAL')
            OR UPPER(COALESCE(cresp.adjudication_outcome, '')) IN ('APPROVED', 'PARTIAL')
          )
        ORDER BY GREATEST(
          COALESCE(cr.last_updated_date, '1970-01-01'::timestamptz),
          COALESCE(cresp.response_date_time, '1970-01-01'::timestamptz)
        ) DESC
        LIMIT 1;
      `;
            const res = await wrcmClient.query(wrcmQuery);
            latestWrcmRecord = res.rows[0];
        } finally {
            wrcmClient.release();
        }

        expect(latestWrcmRecord, 'No approved institutional IP priorauth claim request found in WRCM database.').toBeDefined();
        console.log(`Latest WRCM validated claim found:`);
        console.log(`  - Request ID: ${latestWrcmRecord.request_id}`);
        console.log(`  - ProvClaimNo: ${latestWrcmRecord.provclaimno}`);
        console.log(`  - Last Updated Date: ${latestWrcmRecord.last_updated_date}`);

        const lastUpdatedDate = latestWrcmRecord.last_updated_date ? new Date(latestWrcmRecord.last_updated_date) : new Date(0);
        const responseDateTime = latestWrcmRecord.response_date_time ? new Date(latestWrcmRecord.response_date_time) : new Date(0);
        const recordDate = lastUpdatedDate > responseDateTime ? lastUpdatedDate : responseDateTime;
        const now = new Date();
        const ageMs = now - recordDate;
        const tenMinutesMs = 10 * 60 * 1000;
        const isOlderThan10Min = ageMs >= tenMinutesMs;

        console.log(`  - Record Date (GREATEST): ${recordDate.toString()}`);
        console.log(`  - Record Age: ${Math.round(ageMs / 1000)}s (${(ageMs / 60000).toFixed(2)} minutes)`);

        try {
            await parameter('WRCM Request ID', latestWrcmRecord.request_id);
            await parameter('ProvClaimNo', latestWrcmRecord.provclaimno);
        } catch (err) { }

        console.log('--- Step 2: Connecting to CSBRIDGE_STG database ---');
        const stgClient = await stgPool.connect();
        try {
            // 1. Check a05_wrcm_log table for our latest request ID
            console.log('Checking a05_wrcm_log table...');

            // Get column names of a05_wrcm_log table dynamically
            const logColsRes = await stgClient.query('SELECT * FROM a05_wrcm_log LIMIT 0');
            const logColNames = logColsRes.fields.map(r => r.name);
            console.log('a05_wrcm_log columns:', logColNames);

            const logRequestCol = logColNames.find(
                col => col.toLowerCase() === 'request_id' || col.toLowerCase() === 'requestid'
            );
            expect(logRequestCol, 'a05_wrcm_log should have a request ID column').toBeDefined();

            // Query for the specific request ID
            const logRes = await stgClient.query(
                `SELECT * FROM a05_wrcm_log WHERE ${logRequestCol} = $1`,
                [latestWrcmRecord.request_id]
            );
            console.log(`Found ${logRes.rows.length} log entry/entries for request ID: ${latestWrcmRecord.request_id}`);

            // If the latest WRCM record has just been generated/updated, we allow a brief retry/polling window 
            // for the CS Bridge scheduler to pull it (up to the remaining time of the 10-minute cycle + 30s buffer).
            let syncedLogRows = logRes.rows;
            if (syncedLogRows.length === 0) {
                if (isOlderThan10Min) {
                    console.log(`Latest WRCM record (ID: ${latestWrcmRecord.request_id}) is older than 10 minutes but was not found in a05_wrcm_log. Failing immediately.`);
                    expect(syncedLogRows.length, `Latest WRCM record (request_id: ${latestWrcmRecord.request_id}) is older than 10 minutes (${(ageMs / 60000).toFixed(2)} minutes) but was not found in a05_wrcm_log. This indicates a sync failure.`).toBeGreaterThan(0);
                } else {
                    const remainingTimeMs = tenMinutesMs - ageMs;
                    const maxPollTimeMs = remainingTimeMs + 30000; // remaining time + 30s buffer
                    console.log(`Record is brand new (${(ageMs / 60000).toFixed(2)} minutes old).`);
                    console.log(`Polling for sync to complete (up to ${Math.round(maxPollTimeMs / 1000)} seconds)...`);

                    // Dynamically increase Playwright test timeout to avoid premature test failure
                    test.setTimeout(maxPollTimeMs + 10000);

                    const pollStartTime = Date.now();
                    while (Date.now() - pollStartTime < maxPollTimeMs) {
                        await new Promise(resolve => setTimeout(resolve, 10000)); // check every 10 seconds
                        const pollLogRes = await stgClient.query(
                            `SELECT * FROM a05_wrcm_log WHERE ${logRequestCol} = $1`,
                            [latestWrcmRecord.request_id]
                        );
                        if (pollLogRes.rows.length > 0) {
                            syncedLogRows = pollLogRes.rows;
                            console.log(`Sync completed! Found log entry after ${Math.round((Date.now() - pollStartTime) / 1000)}s of polling`);
                            break;
                        }
                    }
                }
            }

            expect(syncedLogRows.length, `No log entry found in a05_wrcm_log for request_id: ${latestWrcmRecord.request_id}`).toBeGreaterThan(0);

            // 2. Check a05_wrcm_poll_state table (should be updated now that the record has synced)
            console.log('Checking a05_wrcm_poll_state table...');
            const pollRes = await stgClient.query('SELECT * FROM a05_wrcm_poll_state');
            expect(pollRes.rows.length, 'a05_wrcm_poll_state table should have at least one record').toBeGreaterThan(0);

            const pollState = pollRes.rows[0];
            console.log('Poll State:', pollState);

            // Look for last fetched request ID column dynamically
            const requestIdCol = Object.keys(pollState).find(
                key => key.toLowerCase().includes('request_id') || key.toLowerCase().includes('requestid')
            );
            expect(requestIdCol, 'a05_wrcm_poll_state should have a request ID column').toBeDefined();
            const lastFetchedRequestId = pollState[requestIdCol];
            console.log(`Last Fetched Request ID in poll state: ${lastFetchedRequestId}`);
            expect(lastFetchedRequestId, 'last_fetched_request_id should be populated').toBeTruthy();
            expect(Number(lastFetchedRequestId), 'last_fetched_request_id should be greater than or equal to the processed request ID').toBeGreaterThanOrEqual(Number(latestWrcmRecord.request_id));

            const syncStatusCol = logColNames.find(
                col => col.toLowerCase().includes('status') || col.toLowerCase().includes('state')
            );
            if (syncStatusCol) {
                const statusVal = syncedLogRows[0][syncStatusCol];
                console.log(`Sync log status: ${statusVal}`);
                // Expect status to be successful or processed
                expect(statusVal.toString().toUpperCase()).not.toContain('ERROR');
                expect(statusVal.toString().toUpperCase()).not.toContain('FAIL');
            }

            console.log(`ADT A05 database sync validation successful for request_id: ${latestWrcmRecord.request_id}`);
        } finally {
            stgClient.release();
        }
    });
});
