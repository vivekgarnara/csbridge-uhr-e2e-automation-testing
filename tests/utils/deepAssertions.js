import { buildFullTableName, normalizeRow } from './eventTestHelper.js';
import { waitForEvent, waitForNoEvent, queryEvents } from './bridgeTestHelper.js';
import { testRuntimeConfig } from '../config/test.config.js';

const ROOM_PATTERN = /room|ward|bed|floor|unit/i;

export async function queryByProvClaim(dbAssertions, tableName, provClaimNo, extraWhere = '') {
  const sql = `SELECT * FROM ${tableName} WHERE provclaimno = $1${extraWhere}`;
  return dbAssertions.query(sql, [provClaimNo]);
}

export async function countByProvClaim(dbAssertions, tableName, provClaimNo) {
  const sql = `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE provclaimno = $1`;
  const rows = await dbAssertions.query(sql, [provClaimNo]);
  const row = normalizeRow(rows[0] || {});
  return Number(row.cnt ?? 0);
}

function isAutoProvider(providerType) {
  return (providerType || '').toLowerCase().endsWith('_auto');
}

function compareDocumentId(actual, expected, dbType) {
  if (expected === null) return actual === null || actual === undefined;
  if (expected === '') {
    // Oracle stores ' ' (space) via oracleNotNull() for NOT NULL columns, or NULL for nullable columns
    if (dbType === 'oracle') return actual === '' || actual === ' ' || actual === null || actual === undefined;
    return actual === '' || actual === null || actual === undefined;
  }
  // DataGenerator truncates documentId to 50 chars — accept truncated value as valid
  if (typeof expected === 'string' && expected.length > 50) {
    return actual === expected.substring(0, 50);
  }
  return actual === expected;
}

function compareSupportingValue(actual, expected, dbType) {
  if (expected === null) return actual === null || actual === undefined;
  if (expected === '') {
    // Oracle stores '' as NULL for nullable columns
    if (dbType === 'oracle') return actual === '' || actual === null || actual === undefined;
    return actual === '' || actual === null || actual === undefined;
  }
  return actual === expected;
}

function normalizeEncounterClass(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim().toUpperCase();
  if (s === 'AMB' || s === 'OUTPATIENT' || s === 'OUT PATIENT' || s === 'OP') return 'AMB';
  if (s === 'IMP' || s === 'INPATIENT' || s === 'IN PATIENT' || s === 'IP') return 'IMP';
  if (s === 'EMER' || s === 'EMERGENCY' || s === 'ER') return 'EMER';
  if (s === 'SS' || s === 'SAME DAY SURGERY') return 'SS';
  if (s === 'HH' || s === 'HOME HEALTH') return 'HH';
  if (s === 'VR' || s === 'VIRTUAL') return 'VR';
  return s;
}

function compareEncounterClass(actual, expected, dbType) {
  if (expected === '') {
    // Oracle stores ' ' (space) as stand-in for '' due to NOT NULL constraint
    if (dbType === 'oracle') return actual === '' || actual === ' ' || actual === null || actual === undefined;
    return actual === '' || actual === null || actual === undefined;
  }
  return normalizeEncounterClass(actual) === normalizeEncounterClass(expected);
}

function compareEncounterEndDate(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  if (expected === 'INVALID_DATE') return actual === 'INVALID_DATE' || actual === null;
  if (expected === '' || expected === '   ') {
    return actual === '' || actual === null || actual === undefined;
  }
  if (expected instanceof Date && actual instanceof Date) {
    return Math.abs(actual.getTime() - expected.getTime()) < 120000;
  }
  if (expected instanceof Date && actual) {
    return String(actual).includes(expected.toISOString().slice(0, 10));
  }
  return actual !== null && actual !== undefined;
}

function assertSupportingValueRules(supportRows, config, expect, scenarioId, dbType) {
  for (const raw of supportRows) {
    const row = normalizeRow(raw);
    if (config.assertions?.category !== undefined) {
      expect(row.category, `[${scenarioId}] category`).toBe(config.assertions.category);
    }
    if (config.assertions?.supportingvalue !== undefined) {
      expect(
        compareSupportingValue(row.supportingvalue, config.assertions.supportingvalue, dbType),
        `[${scenarioId}] supportingvalue`
      ).toBeTruthy();
    }
    const val = String(row.supportingvalue ?? '');
    if (config.supportingValueMustContain) {
      const re = new RegExp(config.supportingValueMustContain, 'i');
      expect(re.test(val), `[${scenarioId}] supporting value must match ${config.supportingValueMustContain}`).toBeTruthy();
    }
    if (config.supportingValueMustNotContain) {
      const re = new RegExp(config.supportingValueMustNotContain, 'i');
      expect(re.test(val), `[${scenarioId}] supporting value must not match room pattern`).toBeFalsy();
    }
  }
}

/**
 * Full claim-chain + event validation for A01–A04.
 */
export async function runDeepScenarioAssertions({
  scenario,
  eventType,
  result,
  config,
  dbAssertions,
  activeSession,
  expect
}) {
  const providerType = activeSession.providerType || 'default_auto';
  const isAuto = isAutoProvider(providerType);
  const dbType = activeSession.dbConfig?.type;
  const id = scenario.id;

  if (config.expectGenerationSuccess === false) {
    expect(result.success, `[${id}] expected generation failure`).toBeFalsy();
    return { provClaimNo: null };
  }

  expect(result.success, `[${id}] ${result.message}`).toBeTruthy();
  const provClaimNo = result.generatedProvClaimNos?.[0];
  expect(provClaimNo, `[${id}] PROVCLAIMNO`).toBeTruthy();

  const tables = {
    beneficiary: buildFullTableName(activeSession.dbConfig, providerType, 'beneficiary'),
    coverage: buildFullTableName(activeSession.dbConfig, providerType, 'coverage'),
    coverageClass: buildFullTableName(activeSession.dbConfig, providerType, 'coverage_class'),
    claiminfo: buildFullTableName(activeSession.dbConfig, providerType, 'claiminfo'),
    claimitem: buildFullTableName(activeSession.dbConfig, providerType, 'claimitem'),
    claimitemdetails: buildFullTableName(activeSession.dbConfig, providerType, 'claimitemdetails'),
    claimdiagnosis: buildFullTableName(activeSession.dbConfig, providerType, 'claimdiagnosis'),
    claimcareteam: buildFullTableName(activeSession.dbConfig, providerType, 'claimcareteam'),
    claimencounters: buildFullTableName(activeSession.dbConfig, providerType, 'claimencounters'),
    claimsupportinginfo: buildFullTableName(activeSession.dbConfig, providerType, 'claimsupportinginfo')
  };

  const claimRows = await queryByProvClaim(dbAssertions, tables.claiminfo, provClaimNo);
  expect(claimRows.length, `[${id}] claiminfo`).toBeGreaterThan(0);
  const claim = normalizeRow(claimRows[0]);
  expect(claim.provclaimno ?? claim.PROVCLAIMNO, `[${id}] claiminfo.provclaimno`).toBeTruthy();
  expect(claim.beneficiaryid ?? claim.BENEFICIARYID, `[${id}] claiminfo.beneficiaryid`).toBeTruthy();
  expect(claim.claimtype ?? claim.CLAIMTYPE, `[${id}] claiminfo.claimtype`).toBeTruthy();
  expect(claim.providernphiesid ?? claim.PROVIDERNPHIESID, `[${id}] claiminfo.providernphiesid`).toBeTruthy();

  const benId = claim.beneficiaryid ?? claim.BENEFICIARYID;
  const benRows = await dbAssertions.query(
    `SELECT * FROM ${tables.beneficiary} WHERE beneficiaryid = $1`,
    [benId]
  );
  expect(benRows.length, `[${id}] beneficiary`).toBeGreaterThan(0);
  const beneficiary = normalizeRow(benRows[0]);
  expect(beneficiary.documenttype ?? beneficiary.DOCUMENTTYPE, `[${id}] documenttype`).toBeTruthy();
  expect(beneficiary.gender ?? beneficiary.GENDER, `[${id}] gender`).toBeTruthy();
  expect(beneficiary.dob ?? beneficiary.DOB, `[${id}] dob`).toBeTruthy();

  if (config.assertions?.documentid !== undefined) {
    expect(
      compareDocumentId(beneficiary.documentid ?? beneficiary.DOCUMENTID, config.assertions.documentid, dbType)
    ).toBeTruthy();
  }

  const covRows = await dbAssertions.query(
    `SELECT * FROM ${tables.coverage} WHERE beneficiaryid = $1`,
    [benId]
  );
  expect(covRows.length, `[${id}] coverage`).toBeGreaterThan(0);

  const itemCount = await countByProvClaim(dbAssertions, tables.claimitem, provClaimNo);
  expect(itemCount, `[${id}] claimitem count`).toBeGreaterThan(0);

  const diagCount = await countByProvClaim(dbAssertions, tables.claimdiagnosis, provClaimNo);
  expect(diagCount, `[${id}] claimdiagnosis count`).toBeGreaterThan(0);

  const careCount = await countByProvClaim(dbAssertions, tables.claimcareteam, provClaimNo);
  expect(careCount, `[${id}] claimcareteam count`).toBeGreaterThan(0);

  const encRows = await queryByProvClaim(dbAssertions, tables.claimencounters, provClaimNo);
  expect(encRows.length, `[${id}] claimencounters`).toBeGreaterThan(0);
  const encounter = normalizeRow(encRows[0]);
  expect(encounter.encounterid ?? encounter.ENCOUNTERID, `[${id}] encounterid`).toBeTruthy();
  expect(encounter.encounterstartdate ?? encounter.ENCOUNTERSTARTDATE, `[${id}] encounterstartdate`).toBeTruthy();

  if (config.assertions?.encounterclass !== undefined) {
    expect(
      compareEncounterClass(
        encounter.encounterclass ?? encounter.ENCOUNTERCLASS,
        config.assertions.encounterclass,
        activeSession.dbConfig?.type
      ),
      `[${id}] encounterclass`
    ).toBeTruthy();
  }

  if (config.assertions?.encounterstatus !== undefined) {
    expect(encounter.encounterstatus ?? encounter.ENCOUNTERSTATUS).toBe(config.assertions.encounterstatus);
  }

  if (config.assertions?.encounterenddate !== undefined) {
    expect(
      compareEncounterEndDate(
        encounter.encounterenddate ?? encounter.ENCOUNTERENDDATE,
        config.assertions.encounterenddate
      )
    ).toBeTruthy();
  }

  if (eventType === 'A02' || config.requireSupportingInfo !== false) {
    const supportRows = await queryByProvClaim(dbAssertions, tables.claimsupportinginfo, provClaimNo);
    if (eventType === 'A02' || config.assertions?.category !== undefined) {
      expect(supportRows.length, `[${id}] claimsupportinginfo`).toBeGreaterThan(0);
      assertSupportingValueRules(supportRows, config, expect, id, dbType);
    }
  }

  if (config.assertions?.claimsubtype !== undefined) {
    expect(claim.claimsubtype ?? claim.CLAIMSUBTYPE).toBe(config.assertions.claimsubtype);
  }

  if (config.assertions?.claimtype !== undefined) {
    expect(claim.claimtype ?? claim.CLAIMTYPE).toBe(config.assertions.claimtype);
  }

  if (config.assertions?.isnewborn !== undefined) {
    expect(String(claim.isnewborn ?? claim.ISNEWBORN)).toBe(String(config.assertions.isnewborn));
  }

  if (config.assertions?.ismaternity !== undefined) {
    const itemRows = await queryByProvClaim(dbAssertions, tables.claimitem, provClaimNo);
    expect(itemRows.length, `[${id}] claimitem`).toBeGreaterThan(0);
    const item = normalizeRow(itemRows[0]);
    expect(String(item.ismaternity ?? item.ISMATERNITY)).toBe(String(config.assertions.ismaternity));
  }

  if (config.assertions?.servicetype !== undefined || config.assertions?.servicecode !== undefined || config.assertions?.servicedesc !== undefined) {
    const detailRows = await queryByProvClaim(dbAssertions, tables.claimitemdetails, provClaimNo);
    expect(detailRows.length, `[${id}] claimitemdetails`).toBeGreaterThan(0);
    const detail = normalizeRow(detailRows[0]);
    if (config.assertions.servicetype !== undefined) {
      expect(detail.servicetype ?? detail.SERVICETYPE).toBe(config.assertions.servicetype);
    }
    if (config.assertions.servicecode !== undefined) {
      expect(detail.servicecode ?? detail.SERVICECODE).toBe(config.assertions.servicecode);
    }
    if (config.assertions.servicedesc !== undefined) {
      expect(detail.servicedesc ?? detail.SERVICEDESC).toBe(config.assertions.servicedesc);
    }
  }

  const encounterId = encounter.encounterid ?? encounter.ENCOUNTERID;

  if (config.assertions?.hospitaldischargedisposition !== undefined) {
    const isUhr = providerType.toLowerCase().includes('enhanced');
    const hospTable = isUhr
      ? buildFullTableName(activeSession.dbConfig, providerType, 'ENCOUNTERHOSPITALIZATION')
      : dbType === 'oracle'
        ? 'nphiesencounterhospitalization'
        : buildFullTableName(activeSession.dbConfig, providerType, 'encounterhospitalization');
    const hospRows = await dbAssertions.query(
      `SELECT * FROM ${hospTable} WHERE encounterid = $1`,
      [encounterId]
    );
    expect(hospRows.length, `[${id}] encounterhospitalization`).toBeGreaterThan(0);
    const hosp = normalizeRow(hospRows[0]);
    expect(hosp.hospitaldischargedisposition ?? hosp.HOSPITALDISCHARGEDISPOSITION).toBe(config.assertions.hospitaldischargedisposition);
  }

  if (config.assertions?.emergencydepartmentdisposition !== undefined) {
    const emergTable = buildFullTableName(activeSession.dbConfig, providerType, 'encounteremergency');
    const emergRows = await dbAssertions.query(
      `SELECT * FROM ${emergTable} WHERE encounterid = $1`,
      [encounterId]
    );
    expect(emergRows.length, `[${id}] encounteremergency`).toBeGreaterThan(0);
    const emerg = normalizeRow(emergRows[0]);
    expect(emerg.emergencydepartmentdisposition ?? emerg.EMERGENCYDEPARTMENTDISPOSITION).toBe(config.assertions.emergencydepartmentdisposition);
  }

  if (config.assertions?.supportingattachment !== undefined) {
    const supportRows = await queryByProvClaim(dbAssertions, tables.claimsupportinginfo, provClaimNo);
    expect(supportRows.length, `[${id}] claimsupportinginfo for attachment`).toBeGreaterThan(0);

    // Dynamically find the row where category is 'attachment'
    let support = supportRows.find(row => {
      const norm = normalizeRow(row);
      const categoryVal = norm.category ?? norm.CATEGORY;
      return categoryVal && String(categoryVal).toLowerCase() === 'attachment';
    });

    // Fallback to the first row if no explicit attachment row is found (e.g. in negative scenarios)
    if (!support) {
      support = supportRows[0];
    }

    const normalizedSupport = normalizeRow(support);
    const val = normalizedSupport.supportingattachment ?? normalizedSupport.SUPPORTINGATTACHMENT;
    if (config.assertions.supportingattachment === 'exists') {
      expect(val).toBeTruthy();
    } else {
      const expected = config.assertions.supportingattachment;
      if (expected === '') {
        expect(val === '' || val === null || val === undefined).toBeTruthy();
      } else {
        expect(val).toBe(expected);
      }
    }
  }

  if (config.expectEvent === undefined) {
    return { provClaimNo, claim, encounter, beneficiary };
  }

  let events = [];
  const verifyMode = testRuntimeConfig.eventVerifyMode || 'local';

  // Auto-mode providers rely on CS Bridge to write nphies_events rows.
  // In local verify mode no bridge is running, so the table stays empty — skip the check.
  if (isAuto && verifyMode === 'local') {
    return { provClaimNo, claim, encounter, beneficiary };
  }
  console.log(`[${id}] verifyMode=${verifyMode}, isAuto=${isAuto}`);
  console.log(`[${id}] config=${JSON.stringify(config)}`);
  if (config.expectEvent) {
    if (verifyMode === 'bridge' && isAuto) {
      events = await waitForEvent(dbAssertions, activeSession, eventType, provClaimNo);
    } else if (verifyMode === 'hybrid' && isAuto) {
      events = await waitForEvent(dbAssertions, activeSession, eventType, provClaimNo, {
        timeout: testRuntimeConfig.bridgeSyncTimeoutMs
      });
      if (events.length === 0) {
        events = await queryEvents(dbAssertions, activeSession, eventType, provClaimNo);
      }
    } else {
      events = await queryEvents(dbAssertions, activeSession, eventType, provClaimNo);
    }
    expect(
      events.length,
      `[${id}] expected ${eventType} event in nphies_events (mode=${verifyMode})`
    ).toBeGreaterThan(0);
  } else {
    if (verifyMode === 'bridge' && isAuto) {
      const unexpected = await waitForNoEvent(dbAssertions, activeSession, eventType, provClaimNo);
      expect(unexpected.length, `[${id}] no event`).toBe(0);
    } else {
      events = await queryEvents(dbAssertions, activeSession, eventType, provClaimNo);
      expect(events.length, `[${id}] expected no event row`).toBe(0);
    }
  }

  if (events.length > 0 && config.expectEvent) {
    const ev = normalizeRow(events[0]);
    const evType = (ev.eventtype ?? ev.EVENTTYPE ?? '').toUpperCase();
    expect(evType, `[${id}] eventtype`).toBe(eventType.toUpperCase());
    const evClaim = ev.provclaimno ?? ev.PROVCLAIMNO;
    expect(evClaim, `[${id}] event.provclaimno`).toBe(provClaimNo);
    if (config.expectSubmitted !== undefined) {
      const submitted = Number(ev.issubmitted ?? ev.ISSUBMITTED ?? 0);
      expect(submitted, `[${id}] issubmitted`).toBe(config.expectSubmitted ? 1 : 0);
    }
    expect(
      ev.createddate ?? ev.CREATEDDATE ?? ev.created_date ?? ev.CREATED_DATE,
      `[${id}] event timestamp`
    ).toBeTruthy();
  }

  return { provClaimNo, claim, encounter, beneficiary, events };
}
