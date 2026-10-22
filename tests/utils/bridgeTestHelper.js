import { buildFullTableName } from './eventTestHelper.js';
import { testRuntimeConfig } from '../config/test.config.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queryEvents(dbAssertions, activeSession, eventType, provClaimNo) {
  const eventsTable = buildFullTableName(
    activeSession.dbConfig,
    activeSession.providerType || 'default_auto',
    'events'
  );
  console.log(`Querying events from table ${eventsTable} for provClaimNo=${provClaimNo} and eventType=${eventType}`);
  return dbAssertions.query(
    `SELECT * FROM ${eventsTable} WHERE UPPER(eventtype) = UPPER($1) AND provclaimno = $2`,
    [eventType, provClaimNo]
  );
}

/**
 * Poll until bridge creates an event (default_auto) or timeout.
 */
export async function waitForEvent(dbAssertions, activeSession, eventType, provClaimNo, options = {}) {
  const timeout = options.timeout ?? testRuntimeConfig.bridgeSyncTimeoutMs;
  const interval = options.interval ?? testRuntimeConfig.bridgeSyncPollMs;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const rows = await queryEvents(dbAssertions, activeSession, eventType, provClaimNo);
    if (rows.length > 0) {
      return rows;
    }
    await sleep(interval);
  }
  return [];
}

/**
 * Poll until no event appears (negative scenarios) or timeout elapses with still no row.
 */
export async function waitForNoEvent(dbAssertions, activeSession, eventType, provClaimNo, options = {}) {
  const settleMs = options.settleMs ?? Math.min(15000, testRuntimeConfig.bridgeSyncPollMs * 3);
  const timeout = options.timeout ?? testRuntimeConfig.bridgeSyncTimeoutMs;
  const interval = options.interval ?? testRuntimeConfig.bridgeSyncPollMs;
  const start = Date.now();

  await sleep(settleMs);

  while (Date.now() - start < timeout) {
    const rows = await queryEvents(dbAssertions, activeSession, eventType, provClaimNo);
    if (rows.length > 0) {
      return rows;
    }
    await sleep(interval);
  }
  return [];
}
