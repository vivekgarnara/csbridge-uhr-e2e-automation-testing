import { test as baseTest, expect } from '../../../utils/test-fixtures.js';
import { DbAssertions } from '../../../utils/dbAssertions.js';
import { buildFullTableName, normalizeRow } from '../../../utils/eventTestHelper.js';
import { testRuntimeConfig } from '../../../config/test.config.js';
import * as conformanceHelper from '../../../utils/conformanceHelperPhase2.js';
import fs from 'fs';
import path from 'path';

// Load targetDb.json configuration for the QA environment
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
  throw new Error('targetDb.json configuration not found for QA database connection!');
}

// Extend base test to include QA/Target DB assertions
export const test = baseTest.extend({
  qaDbAssertions: async ({}, use) => {
    const config = getTargetDbConfig();
    const db = new DbAssertions(config, 'default');
    await db.connect();
    await use(db);
    await db.close();
  }
});

// Helper: Parse HL7 ACK response body locally ( ER7 format )
export function parseHl7Ack(rawMessage) {
  if (!rawMessage) {
    throw new Error('Empty response body received from transaction log');
  }

  let text = rawMessage.trim();

  // 1. Handle JSON wrapper if present
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      text = parsed.response || parsed.payload || parsed.message || parsed.data || parsed.hl7 || text;
      if (typeof text === 'string') {
        text = text.trim();
      }
    } catch (e) {
      // ignore JSON parse failure and proceed
    }
  }

  // 2. Decode Base64 if not already plain text MSH segment
  if (!text.startsWith('MSH|')) {
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
      if (decoded.startsWith('MSH|')) {
        text = decoded;
        console.log('Successfully decoded Base64 HL7 payload');
      }
    } catch (e) {
      // not base64, proceed
    }
  }

  if (!text.startsWith('MSH|')) {
    throw new Error(`Invalid HL7 payload (must start with MSH|): ${text.substring(0, 100)}`);
  }

  // 3. Find MSA segment
  const lines = text.split(/[\r\n]+/);
  let msaSegment = null;
  for (const line of lines) {
    if (line.startsWith('MSA|')) {
      msaSegment = line;
      break;
    }
  }

  if (!msaSegment) {
    throw new Error('MSA segment not found in HL7 response body');
  }

  // 4. Split MSA segment fields
  const fields = msaSegment.split('|');
  const msa1 = fields[1] ? fields[1].trim() : null; // Acknowledgement Code (AA, AE, AR)
  const msa2 = fields[2] ? fields[2].trim() : null; // Message Control ID

  return { msa1, msa2, decodedText: text };
}

// Helper: Poll local events / UHR_EVENTS table for submission status
async function pollLocalEvent(dbAssertions, activeSession, provClaimNo, eventType, eventId) {
  const maxRetries = 6; // 6 retries * 10 seconds = 60 seconds (1 minute)
  const interval = 10000; // 10 seconds
  const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
  const isPostgres = activeSession.dbConfig?.type === 'postgres';
  const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Attempt ${attempt}/${maxRetries}] Querying local database for ${eventType} status...`);
    let sql, params;
    
    sql = isPostgres
      ? `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = UPPER($2) AND issubmitted = true`
      : `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = UPPER($2) AND issubmitted = 1`;
    params = [provClaimNo, eventType];

    try {
      const rows = await dbAssertions.query(sql, params);
      if (rows.length > 0) {
        return normalizeRow(rows[0]);
      }
    } catch (err) {
      console.warn(`Query failed on attempt ${attempt}:`, err.message);
    } finally {
      try {
        await dbAssertions.close();
      } catch (e) {}
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  throw new Error(`Timeout waiting for local event ${eventType} on claim ${provClaimNo} to be processed to ISSUBMITTED = 1 after ${maxRetries} attempts.`);
}

// Helper: Poll QA event_transaction_log for response payload
async function pollQaTransactionLog(qaDbAssertions, provClaimNo, eventType) {
  const maxRetries = 6; // 6 retries * 10 seconds = 60 seconds (1 minute)
  const interval = 10000; // 10 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Attempt ${attempt}/${maxRetries}] Querying QA transaction log for Claim ${provClaimNo}, Event: ${eventType}...`);
    const sql = `
      SELECT etl.response_body
      FROM "sent_event" se
      JOIN event_transaction_log etl
        ON etl.event_id = se.id::text
       AND etl.status = 'SUBMITTED'
      WHERE se.provclaimid = $1
        AND UPPER(se.event_type::text) LIKE '%' || UPPER($2) || '%'
      ORDER BY etl.created_at DESC
    `;
    try {
      const rows = await qaDbAssertions.query(sql, [provClaimNo, eventType]);
      if (rows.length > 0 && rows[0].response_body) {
        return rows[0].response_body;
      }
    } catch (err) {
      console.warn(`QA Query failed on attempt ${attempt}:`, err.message);
    } finally {
      try {
        await qaDbAssertions.close();
      } catch (e) {}
    }

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  throw new Error(`Timeout waiting for QA event_transaction_log response body for Claim: ${provClaimNo}, Event: ${eventType} after ${maxRetries} attempts.`);
}

test.describe('NPHIES ADT Conformance - Patient B: Inpatient Admission, Updates, Transfer, Discharge @conformance', () => {
  // Shared patient context across steps
  const patientB = {
    beneficiaryId: null,
    coverageId: null,
    provClaimNo: null
  };

  let step1Passed = false;
  let step2Passed = false;
  let step3Passed = false;
  let step4Passed = false;
  let step5Passed = false;
  let step6Passed = false;

  // Shared implementation of Event Submission and QA verification
  async function submitEventAndVerifyAck(dbAssertions, qaDbAssertions, activeSession, eventType, provClaimNo) {
    const isAuto = activeSession.providerType?.toLowerCase().endsWith('_auto');

    let targetEventId;

    // 1. Reset/Trigger submission
    if (!isAuto) {
      // Create event row directly (non-auto)
      targetEventId = await conformanceHelper.createEvent(dbAssertions, activeSession, provClaimNo, eventType, 0);
    } else {
      // Auto: trigger sync via database update
      await conformanceHelper.triggerSync(dbAssertions, activeSession, provClaimNo);
    }

    // 2. Poll local events until processed
    console.log(`Polling local events table for ${eventType} submission...`);
    const localEvent = await pollLocalEvent(dbAssertions, activeSession, provClaimNo, eventType, targetEventId);
    const resolvedEventId = localEvent.eventid;
    console.log(`Local event verified as submitted. Event ID: ${resolvedEventId}`);

    // 3. Poll QA database transaction log
    console.log(`Polling QA event_transaction_log for Claim ${provClaimNo} and Event ${eventType}...`);
    const responseBody = await pollQaTransactionLog(qaDbAssertions, provClaimNo, eventType);

    // 4. Parse HL7 response payload
    const ack = parseHl7Ack(responseBody);
    console.log(`Parsed HL7 ACK for ${eventType}: MSA.1 = '${ack.msa1}', MSA.2 (Message Control ID) = '${ack.msa2}'`);

    // 5. Assert MSA.1 is 'AA' (Accept)
    expect(ack.msa1, `Expected HL7 ACK acknowledgement code MSA.1 to be 'AA' but received '${ack.msa1}'`).toBe('AA');
    return ack;
  }

  // --- STEP 1: Admit Patient (A01) ---
  test('Step 1: Admit Patient (A01) [ADT^A01]', async ({ dbAssertions, qaDbAssertions, generator, activeSession }) => {
    console.log('\n--- Step 1: ADT A01 Admit Patient ---');

    // 1. Generate Patient B base data
    const result = await generator.generateData({
      numberOfEvents: 1,
      eventTypes: ['A01'],
      providerType: activeSession.providerType,
      dbConfig: activeSession.dbConfig,
      scenarioId: 'conformance-a01',
      scenarioDescription: "Admit Patient B (Inpatient ENCOUNTERCLASS='IMP')"
    });

    expect(result.success, `Patient B admission data generation failed: ${result.message}`).toBe(true);
    
    patientB.provClaimNo = result.generatedProvClaimNos[0];
    
    // Fetch generated beneficiary and coverage info
    const claimsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'claiminfo');
    const claimRows = await dbAssertions.query(
      `SELECT beneficiaryid, coverageid FROM ${claimsTable} WHERE provclaimno = $1`,
      [patientB.provClaimNo]
    );
    expect(claimRows.length, 'Generated claim info row not found in local database').toBeGreaterThan(0);
    const claim = normalizeRow(claimRows[0]);
    patientB.beneficiaryId = claim.beneficiaryid;
    patientB.coverageId = claim.coverageid;

    console.log(`Patient B details: ProvClaimNo = ${patientB.provClaimNo}, BeneficiaryId = ${patientB.beneficiaryId}`);

    // Clear any default supporting info generated randomly, so we only have allergy entries
    console.log('Clearing default supporting info generated by generator...');
    await conformanceHelper.clearSupportingInfo(dbAssertions, activeSession, patientB.provClaimNo);

    // 2. Add admission care team, diagnosis, allergies, and hospital service
    console.log('Adding Care Team roles (Attending & Consulting)...');
    await conformanceHelper.addCareTeamMember(
      dbAssertions, activeSession, patientB.provClaimNo, 1,
      '00TEST1980', 'Attending Physician, MD', 'doctor', 'primary', 'MD'
    );
    // await conformanceHelper.addCareTeamMember(
    //   dbAssertions, activeSession, patientB.provClaimNo, 2,
    //   '00TEST1981', 'Consulting Specialist, MD', 'specialist', 'assist', 'MD'
    // );

    console.log('Adding admission diagnosis (M25.46)...');
    await conformanceHelper.addDiagnosis(
      dbAssertions, activeSession, patientB.provClaimNo, 1,
      'M25.46', 'Joint effusion, lower leg', 'PRINCIPAL', 'y'
    );

    console.log('Adding patient allergies...');
    await conformanceHelper.addSupportingInfoAllergy(
      dbAssertions, activeSession, patientB.provClaimNo, 1,
      '102263004', 'SEVERE', 'FOOD_ALLERGY', 'allergy to eggs'
    );
    await conformanceHelper.addSupportingInfoAllergy(
      dbAssertions, activeSession, patientB.provClaimNo, 2,
      '387016008', 'SEVERE', 'DRUG_ALLERGY', 'allergy to ibuprofen'
    );

    console.log('Adding hospitalization specialty internal medicine...');
    await conformanceHelper.updateHospitalSpecialty(dbAssertions, activeSession, patientB.provClaimNo, 'internal');

    // Verify encounter fields in local database
    const encTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'claimencounters');
    const encRows = await dbAssertions.query(
      `SELECT encounterclass, encounterstatus FROM ${encTable} WHERE provclaimno = $1`,
      [patientB.provClaimNo]
    );
    expect(encRows.length).toBeGreaterThan(0);
    const enc = normalizeRow(encRows[0]);
    console.log(`Step 1 Encounter Verification: Class = ${enc.encounterclass}, Status = ${enc.encounterstatus}`);
    expect(enc.encounterclass).toBe('IMP');
    expect(enc.encounterstatus).toBe('planned');

    // 3. Submit and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A01',
      patientB.provClaimNo
    );

    step1Passed = true;
  });

  // --- STEP 2: Update Patient Info (A08) ---
  test('Step 2: Update Patient Info (A08) [ADT^A08]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step1Passed, 'Skipped: Step 1 (A01 Admit) did not pass successfully');
    console.log('\n--- Step 2: ADT A08 Update Patient Info ---');

    console.log('Updating Allergy 1 severity to SEVERE...');
    await conformanceHelper.addSupportingInfoAllergy(
      dbAssertions, activeSession, patientB.provClaimNo, 1,
      '102263004', 'SEVERE', 'FOOD_ALLERGY', 'allergy to eggs'
    );

    console.log('Deleting Allergy 2...');
    await conformanceHelper.deleteSupportingInfoAllergy(dbAssertions, activeSession, patientB.provClaimNo, 2);

    console.log('Adding new free-text allergy...');
    await conformanceHelper.addSupportingInfoAllergy(
      dbAssertions, activeSession, patientB.provClaimNo, 3,
      '', 'UNKNOWN', 'OTHER_ALLERGY', 'allergy to unknown antibiotic'
    );

    console.log('Deleting admission diagnosis...');
    await conformanceHelper.deleteDiagnosis(dbAssertions, activeSession, patientB.provClaimNo, 1);

    // Submit update and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A08',
      patientB.provClaimNo
    );

    step2Passed = true;
  });

  // --- STEP 3: Transfer Patient (A02) ---
  test('Step 3: Transfer Patient (A02) [ADT^A02]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step2Passed, 'Skipped: Step 2 (A08 Update) did not pass successfully');
    console.log('\n--- Step 3: ADT A02 Transfer Patient ---');

    // Prerequisite check
    const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
    const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';
    const a01Check = await dbAssertions.query(
      `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = 'A01'`,
      [patientB.provClaimNo]
    );
    expect(a01Check.length, `Prerequisite failure: No A01 event row exists for claim ${patientB.provClaimNo}`).toBeGreaterThan(0);

    console.log('Updating hospital specialty to orthopedics...');
    await conformanceHelper.updateHospitalSpecialty(dbAssertions, activeSession, patientB.provClaimNo, 'orthopedics');

    console.log('Adding patient transfer location...');
    await conformanceHelper.addPatientLocation(
      dbAssertions, activeSession, patientB.provClaimNo,
      'ROOM02;;BED02;;ORTHO;;FAC01', 1
    );

    // Submit transfer and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A02',
      patientB.provClaimNo
    );

    step3Passed = true;
  });

  // --- STEP 4: Cancel Transfer (A12) ---
  test('Step 4: Cancel Transfer (A12) [ADT^A12]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step3Passed, 'Skipped: Step 3 (A02 Transfer) did not pass successfully');
    console.log('\n--- Step 4: ADT A12 Cancel Transfer ---');

    // Prerequisite check
    const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
    const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';
    const a02Check = await dbAssertions.query(
      `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = 'A02'`,
      [patientB.provClaimNo]
    );
    expect(a02Check.length, `Prerequisite failure: No A02 event row exists for claim ${patientB.provClaimNo}`).toBeGreaterThan(0);

    console.log('Resetting hospital specialty back to internal...');
    await conformanceHelper.updateHospitalSpecialty(dbAssertions, activeSession, patientB.provClaimNo, 'internal');

    console.log('Removing transfer location...');
    await conformanceHelper.removePatientLocation(dbAssertions, activeSession, patientB.provClaimNo, 1);

    // Submit cancellation and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A12',
      patientB.provClaimNo
    );

    step4Passed = true;
  });

  // --- STEP 5: Change Inpatient to Outpatient (A07) ---
  test('Step 5: Change Inpatient to Outpatient (A07) [ADT^A07]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step4Passed, 'Skipped: Step 4 (A12 Cancel Transfer) did not pass successfully');
    console.log('\n--- Step 5: ADT A07 Change Inpatient to Outpatient ---');

    // Prerequisite check
    const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
    const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';
    const a01Check = await dbAssertions.query(
      `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = 'A01'`,
      [patientB.provClaimNo]
    );
    expect(a01Check.length, `Prerequisite failure: No A01 event row exists for claim ${patientB.provClaimNo}`).toBeGreaterThan(0);

    console.log('Changing encounter class to AMB (outpatient)...');
    await conformanceHelper.updateEncounterClass(dbAssertions, activeSession, patientB.provClaimNo, 'AMB');

    // Submit class change and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A07',
      patientB.provClaimNo
    );

    step5Passed = true;
  });

  // --- STEP 6: Discharge / End Visit (A03) ---
  test('Step 6: Discharge / End Visit (A03) [ADT^A03]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step5Passed, 'Skipped: Step 5 (A07 Class Change) did not pass successfully');
    console.log('\n--- Step 6: ADT A03 Discharge / End Visit ---');

    // Prerequisite check (A01 exists)
    const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
    const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';
    const a01Check = await dbAssertions.query(
      `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = 'A01'`,
      [patientB.provClaimNo]
    );
    expect(a01Check.length, `Prerequisite failure: No A01 event row exists for claim ${patientB.provClaimNo}`).toBeGreaterThan(0);

    console.log('Discharging encounter (setting status finished and end date)...');
    await conformanceHelper.dischargeEncounter(
      dbAssertions, activeSession, patientB.provClaimNo,
      new Date(), 'home'
    );

    console.log('Adding discharge diagnosis (S52.501A)...');
    await conformanceHelper.addDiagnosis(
      dbAssertions, activeSession, patientB.provClaimNo, 2,
      'S52.501A', 'Forearm fracture', 'SECONDARY', 'n'
    );

    // Submit discharge and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A03',
      patientB.provClaimNo
    );

    step6Passed = true;
  });

  // --- STEP 7: Cancel Discharge (A13) ---
  test('Step 7: Cancel Discharge (A13) [ADT^A13]', async ({ dbAssertions, qaDbAssertions, activeSession }) => {
    test.skip(!step6Passed, 'Skipped: Step 6 (A03 Discharge) did not pass successfully');
    console.log('\n--- Step 7: ADT A13 Cancel Discharge ---');

    // Prerequisite check
    const eventsTable = buildFullTableName(activeSession.dbConfig, activeSession.providerType, 'events');
    const colEventType = activeSession.providerType?.toLowerCase().includes('enhanced') ? 'EVENTTYPE' : 'eventtype';
    const a03Check = await dbAssertions.query(
      `SELECT * FROM ${eventsTable} WHERE provclaimno = $1 AND UPPER(${colEventType}) = 'A03'`,
      [patientB.provClaimNo]
    );
    expect(a03Check.length, `Prerequisite failure: No A03 event row exists for claim ${patientB.provClaimNo}`).toBeGreaterThan(0);

    console.log('Cancelling discharge (nullifying end date and resetting status to arrived)...');
    await conformanceHelper.cancelDischarge(dbAssertions, activeSession, patientB.provClaimNo);
    await conformanceHelper.updateEncounterStatus(dbAssertions, activeSession, patientB.provClaimNo, 'arrived');

    // Submit cancel discharge and verify
    await submitEventAndVerifyAck(
      dbAssertions,
      qaDbAssertions,
      activeSession,
      'A13',
      patientB.provClaimNo
    );
  });
});
