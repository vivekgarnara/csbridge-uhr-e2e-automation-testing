import fs from 'fs';
import path from 'path';
import { buildFullTableName, normalizeRow } from './eventTestHelper.js';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'test_data/events');

function getEventGroup(eventType) {
  const cdaEvents = [
    'DISCHARGE_SUMMARY', 'OUTPATIENT_ENCOUNTER_SUMMARY', 
    'OPERATIVE_NOTE', 'NEWBORN_DISCHARGE', 'MATERNAL_DISCHARGE'
  ];
  const fhirEvents = [
    'LAB_ORDER', 'LAB_RESULT', 'MEDICATION_REQUEST', 
    'MEDICATION_DISPENSE', 'RADIOLOGY_ORDER', 'RADIOLOGY_RESULT'
  ];
  const upperEvent = eventType.toUpperCase();
  if (cdaEvents.includes(upperEvent)) return 'CDA';
  if (fhirEvents.includes(upperEvent)) return 'FHIR';
  return 'ADT';
}

function safeName(value) {
  return String(value || 'unknown')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}

async function queryByProvClaim(dbAssertions, tableName, provClaimNo) {
  try {
    return await dbAssertions.query(
      `SELECT * FROM ${tableName} WHERE provclaimno = $1`,
      [provClaimNo]
    );
  } catch (error) {
    return { error: error.message };
  }
}

async function queryEvents(dbAssertions, tableName, eventType, provClaimNo) {
  try {
    return await dbAssertions.query(
      `SELECT * FROM ${tableName} WHERE UPPER(eventtype) = UPPER($1) AND provclaimno = $2`,
      [eventType, provClaimNo]
    );
  } catch (error) {
    return { error: error.message };
  }
}

async function queryBeneficiary(dbAssertions, tableName, beneficiaryId) {
  if (!beneficiaryId) {
    return [];
  }
  try {
    return await dbAssertions.query(
      `SELECT * FROM ${tableName} WHERE beneficiaryid = $1`,
      [beneficiaryId]
    );
  } catch (error) {
    return { error: error.message };
  }
}

function extractBeneficiaryId(claimRows) {
  if (!Array.isArray(claimRows) || claimRows.length === 0) {
    return null;
  }
  const claim = normalizeRow(claimRows[0]);
  return claim.beneficiaryid || null;
}

export async function writeTestEventJson({
  eventType,
  scenario,
  scenarioConfig,
  generationResult,
  dbAssertions,
  activeSession
}) {
  const event = eventType.toUpperCase();
  const scenarioId = scenario.id;
  const provClaimNo = generationResult.generatedProvClaimNos?.[0] || null;
  const providerType = activeSession.providerType || 'default_auto';
  const dbConfig = activeSession.dbConfig;

  const tables = {
    beneficiary: buildFullTableName(dbConfig, providerType, 'beneficiary'),
    coverage: buildFullTableName(dbConfig, providerType, 'coverage'),
    coverageClass: buildFullTableName(dbConfig, providerType, 'coverage_class'),
    claiminfo: buildFullTableName(dbConfig, providerType, 'claiminfo'),
    claimitem: buildFullTableName(dbConfig, providerType, 'claimitem'),
    claimdiagnosis: buildFullTableName(dbConfig, providerType, 'claimdiagnosis'),
    claimcareteam: buildFullTableName(dbConfig, providerType, 'claimcareteam'),
    claimencounters: buildFullTableName(dbConfig, providerType, 'claimencounters'),
    claimsupportinginfo: buildFullTableName(dbConfig, providerType, 'claimsupportinginfo'),
    events: buildFullTableName(dbConfig, providerType, 'events')
  };

  const generatedData = {};
  if (provClaimNo) {
    generatedData.claiminfo = await queryByProvClaim(dbAssertions, tables.claiminfo, provClaimNo);
    generatedData.claimitems = await queryByProvClaim(dbAssertions, tables.claimitem, provClaimNo);
    generatedData.claimdiagnosis = await queryByProvClaim(dbAssertions, tables.claimdiagnosis, provClaimNo);
    generatedData.claimcareteam = await queryByProvClaim(dbAssertions, tables.claimcareteam, provClaimNo);
    generatedData.claimencounters = await queryByProvClaim(dbAssertions, tables.claimencounters, provClaimNo);
    generatedData.claimsupportinginfo = await queryByProvClaim(dbAssertions, tables.claimsupportinginfo, provClaimNo);
    generatedData.events = await queryEvents(dbAssertions, tables.events, event, provClaimNo);
    generatedData.beneficiary = await queryBeneficiary(
      dbAssertions,
      tables.beneficiary,
      extractBeneficiaryId(generatedData.claiminfo)
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    eventType: event,
    scenario: {
      id: scenarioId,
      title: scenario.title,
      category: scenario.category,
      generationDescription: scenario.generationDescription
    },
    expectedRules: scenarioConfig,
    generationResult,
    activeSession: {
      providerType,
      dbType: dbConfig?.type,
      database: dbConfig?.database,
      host: dbConfig?.host,
      port: dbConfig?.port
    },
    generatedKeys: {
      provClaimNo
    },
    generatedData
  };

  const group = getEventGroup(event);
  const prefix = group.toLowerCase();
  const outputDir = path.join(OUTPUT_ROOT, group, event);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${prefix}-${safeName(scenarioId).toLowerCase()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}
