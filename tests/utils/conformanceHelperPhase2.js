import { buildFullTableName, normalizeRow } from './eventTestHelper.js';

// Re-export shared base functions from Phase 1
export {
  createEvent,
  triggerSync,
  updateEncounterClass,
  updateEncounterStatus,
  dischargeEncounter,
  cancelDischarge
} from './conformanceHelperPhase1.js';

export async function addCareTeamMember(dbAssertions, activeSession, provClaimNo, sequenceNo, physicianId, physicianName, practitionerRole, careTeamRole, careTeamQualification) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimcareteam');

  const idCol = providerType.toLowerCase().includes('abha') ? 'visitID' : 'provclaimno';
  const checkSql = `SELECT * FROM ${tableName} WHERE ${idCol} = $1 AND sequenceno = $2`;
  const existing = await dbAssertions.query(checkSql, [provClaimNo, sequenceNo]);

  if (existing.length > 0) {
    const sql = `UPDATE ${tableName} SET physicianid = $1, physicianname = $2, practitionerrole = $3, careteamrole = $4, careteamqualification = $5 WHERE ${idCol} = $6 AND sequenceno = $7`;
    await dbAssertions.query(sql, [physicianId, physicianName, practitionerRole, careTeamRole, careTeamQualification, provClaimNo, sequenceNo]);
  } else {
    const sql = `
      INSERT INTO ${tableName} (${idCol}, sequenceno, physicianid, physicianname, practitionerrole, careteamrole, careteamqualification)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await dbAssertions.query(sql, [provClaimNo, sequenceNo, physicianId, physicianName, practitionerRole, careTeamRole, careTeamQualification]);
  }
}

export async function addDiagnosis(dbAssertions, activeSession, provClaimNo, sequenceNo, diagnosisCode, diagnosisDesc, diagnosisType, onAdmission = 'y') {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimdiagnosis');

  const idCol = providerType.toLowerCase().includes('abha') ? 'visitID' : 'provclaimno';
  const checkSql = `SELECT * FROM ${tableName} WHERE ${idCol} = $1 AND sequenceno = $2`;
  const existing = await dbAssertions.query(checkSql, [provClaimNo, sequenceNo]);

  if (existing.length > 0) {
    const sql = `UPDATE ${tableName} SET diagnosiscode = $1, diagnosisdesc = $2, diagnosistype = $3, onadmission = $4 WHERE ${idCol} = $5 AND sequenceno = $6`;
    await dbAssertions.query(sql, [diagnosisCode, diagnosisDesc, diagnosisType, onAdmission, provClaimNo, sequenceNo]);
  } else {
    const sql = `
      INSERT INTO ${tableName} (${idCol}, sequenceno, diagnosiscode, diagnosisdesc, diagnosistype, onadmission)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await dbAssertions.query(sql, [provClaimNo, sequenceNo, diagnosisCode, diagnosisDesc, diagnosisType, onAdmission]);
  }
}

export async function deleteDiagnosis(dbAssertions, activeSession, provClaimNo, sequenceNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimdiagnosis');

  const idCol = providerType.toLowerCase().includes('abha') ? 'visitID' : 'provclaimno';
  const sql = `DELETE FROM ${tableName} WHERE ${idCol} = $1 AND sequenceno = $2`;
  await dbAssertions.query(sql, [provClaimNo, sequenceNo]);
}

export async function addSupportingInfoAllergy(dbAssertions, activeSession, provClaimNo, sequenceNo, code, severity, type, note) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');

  const allowedSeverities = ['SEVERE', 'MODERATE', 'MILD', 'UNKNOWN'];
  const allowedTypes = ['DRUG_ALLERGY', 'FOOD_ALLERGY', 'OTHER_ALLERGY'];
  if (severity && !allowedSeverities.includes(severity.toUpperCase())) {
    throw new Error(`Invalid AllergySeverity: ${severity}. Must be one of ${allowedSeverities.join(', ')}`);
  }
  if (type && !allowedTypes.includes(type.toUpperCase())) {
    throw new Error(`Invalid AllergyType: ${type}. Must be one of ${allowedTypes.join(', ')}`);
  }

  const supportingValue = `${code || ''};;${type || ''};;${severity || ''};;${note || ''}`;

  let targetCode = code;
  let targetNote = note;
  if (!targetCode && sequenceNo === 1) targetCode = '102263004';
  if (!targetCode && sequenceNo === 2) targetCode = '387016008';
  if (!targetCode && sequenceNo === 3) targetNote = 'allergy to unknown antibiotic';

  // Search existing allergy rows for this claim
  const rows = await dbAssertions.query(
    `SELECT sequenceno, supportingvalue FROM ${tableName} WHERE provclaimno = $1 AND category = $2`,
    [provClaimNo, 'Allergy']
  );

  let existingSeq = null;
  for (const r of rows) {
    const row = normalizeRow(r);
    const parts = (row.supportingvalue || '').split(';;');
    const rowCode = parts[0] ? parts[0].trim() : '';
    const rowNote = parts[3] ? parts[3].trim() : '';

    if (targetCode) {
      if (rowCode === targetCode.trim()) {
        existingSeq = row.sequenceno;
        break;
      }
    } else if (targetNote) {
      if (rowNote === targetNote.trim()) {
        existingSeq = row.sequenceno;
        break;
      }
    }
  }

  if (existingSeq !== null) {
    const sql = `UPDATE ${tableName} SET supportingvalue = $1 WHERE provclaimno = $2 AND category = $3 AND sequenceno = $4`;
    await dbAssertions.query(sql, [supportingValue, provClaimNo, 'Allergy', existingSeq]);
  } else {
    // Get max sequenceno to avoid ORA-00001
    const maxRows = await dbAssertions.query(
      `SELECT MAX(sequenceno) as max_seq FROM ${tableName} WHERE provclaimno = $1`,
      [provClaimNo]
    );
    const maxSeq = maxRows.length > 0 && normalizeRow(maxRows[0]).max_seq ? parseInt(normalizeRow(maxRows[0]).max_seq, 10) : 0;
    const newSeq = maxSeq + 1;

    const sql = `
      INSERT INTO ${tableName} (provclaimno, sequenceno, category, supportingvalue)
      VALUES ($1, $2, 'Allergy', $3)
    `;
    await dbAssertions.query(sql, [provClaimNo, newSeq, supportingValue]);
  }
}

export async function deleteSupportingInfoAllergy(dbAssertions, activeSession, provClaimNo, sequenceNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');

  let targetCode = '';
  let targetNote = '';
  if (sequenceNo === 1) targetCode = '102263004';
  if (sequenceNo === 2) targetCode = '387016008';
  if (sequenceNo === 3) targetNote = 'allergy to unknown antibiotic';

  const rows = await dbAssertions.query(
    `SELECT sequenceno, supportingvalue FROM ${tableName} WHERE provclaimno = $1 AND category = $2`,
    [provClaimNo, 'Allergy']
  );

  let targetSeq = null;
  for (const r of rows) {
    const row = normalizeRow(r);
    const parts = (row.supportingvalue || '').split(';;');
    const rowCode = parts[0] ? parts[0].trim() : '';
    const rowNote = parts[3] ? parts[3].trim() : '';

    if (targetCode) {
      if (rowCode === targetCode.trim()) {
        targetSeq = row.sequenceno;
        break;
      }
    } else if (targetNote) {
      if (rowNote === targetNote.trim()) {
        targetSeq = row.sequenceno;
        break;
      }
    }
  }

  if (targetSeq !== null) {
    const sql = `DELETE FROM ${tableName} WHERE provclaimno = $1 AND category = $2 AND sequenceno = $3`;
    await dbAssertions.query(sql, [provClaimNo, 'Allergy', targetSeq]);
  }
}

export async function updateHospitalSpecialty(dbAssertions, activeSession, provClaimNo, specialty) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const isUhr = providerType.toLowerCase().includes('enhanced');

  const encountersTable = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const hospTable = isUhr
    ? buildFullTableName(dbConfig, providerType, 'ENCOUNTERHOSPITALIZATION')
    : dbConfig.type === 'oracle'
      ? 'nphiesencounterhospitalization'
      : buildFullTableName(dbConfig, providerType, 'encounterhospitalization');

  const encRows = await dbAssertions.query(
    `SELECT encounterid FROM ${encountersTable} WHERE provclaimno = $1`,
    [provClaimNo]
  );
  if (encRows.length === 0) return;
  const encounterId = normalizeRow(encRows[0]).encounterid;

  const hospRows = await dbAssertions.query(
    `SELECT * FROM ${hospTable} WHERE encounterid = $1`,
    [encounterId]
  );

  if (hospRows.length > 0) {
    const colSpec = dbConfig.type === 'oracle' ? 'HOSPITALADMISSIONSPECIALITY' : 'hospitaladmissionspeciality';
    const sql = `UPDATE ${hospTable} SET ${colSpec} = $1 WHERE encounterid = $2`;
    await dbAssertions.query(sql, [specialty, encounterId]);
  } else {
    const hospId = `HOS${Date.now()}`.substring(0, 17);
    const colId = dbConfig.type === 'oracle' ? 'ENCOUNTERHOSPITALIZATIONID' : 'encounterhospitalizationid';
    const colSpec = dbConfig.type === 'oracle' ? 'HOSPITALADMISSIONSPECIALITY' : 'hospitaladmissionspeciality';
    const colSource = dbConfig.type === 'oracle' ? 'HOSPITALADMISSIONSOURCE' : 'hospitaladmissionsource';
    const colStay = dbConfig.type === 'oracle' ? 'HOSPITALINTENDEDLENGTHOFSTAY' : 'hospitalintendedlengthofstay';
    const colEncId = dbConfig.type === 'oracle' ? 'ENCOUNTERID' : 'encounterid';
    const sql = `
      INSERT INTO ${hospTable} (${colId}, ${colSpec}, ${colSource}, ${colStay}, ${colEncId})
      VALUES ($1, $2, $3, $4, $5)
    `;
    await dbAssertions.query(sql, [hospId, specialty, 'emergency', '1-3', encounterId]);
  }
}

export async function addPatientLocation(dbAssertions, activeSession, provClaimNo, locationText, sequenceNo = 1) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');

  const checkSql = `SELECT * FROM ${tableName} WHERE provclaimno = $1 AND category = $2 AND sequenceno = $3`;
  const existing = await dbAssertions.query(checkSql, [provClaimNo, 'patient-location', sequenceNo]);

  if (existing.length > 0) {
    const sql = `UPDATE ${tableName} SET supportingvalue = $1 WHERE provclaimno = $2 AND category = $3 AND sequenceno = $4`;
    await dbAssertions.query(sql, [locationText, provClaimNo, 'patient-location', sequenceNo]);
  } else {
    const sql = `
      INSERT INTO ${tableName} (provclaimno, sequenceno, category, supportingvalue)
      VALUES ($1, $2, $3, $4)
    `;
    await dbAssertions.query(sql, [provClaimNo, sequenceNo, 'patient-location', locationText]);
  }
}

export async function removePatientLocation(dbAssertions, activeSession, provClaimNo, sequenceNo = 1) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');

  const sql = `DELETE FROM ${tableName} WHERE provclaimno = $1 AND category = $2 AND sequenceno = $3`;
  await dbAssertions.query(sql, [provClaimNo, 'patient-location', sequenceNo]);
}

export async function clearSupportingInfo(dbAssertions, activeSession, provClaimNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const claimSupTable = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');
  const itemSupTable = buildFullTableName(dbConfig, providerType, 'itemsupportinginfo');

  const idCol = providerType.toLowerCase().includes('abha') ? 'visitID' : 'provclaimno';

  try {
    await dbAssertions.query(`DELETE FROM ${itemSupTable} WHERE ${idCol} = $1`, [provClaimNo]);
  } catch (err) {
    console.warn(`[Helper] Failed to delete from ${itemSupTable}:`, err.message);
  }

  try {
    await dbAssertions.query(`DELETE FROM ${claimSupTable} WHERE ${idCol} = $1`, [provClaimNo]);
  } catch (err) {
    console.warn(`[Helper] Failed to delete from ${claimSupTable}:`, err.message);
  }
}
