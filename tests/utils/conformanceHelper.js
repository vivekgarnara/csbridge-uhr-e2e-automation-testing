import { buildFullTableName, normalizeRow } from './eventTestHelper.js';

function isAutoProvider(providerType) {
  return (providerType || '').toLowerCase().endsWith('_auto');
}

export async function createEvent(dbAssertions, activeSession, provClaimNo, eventType, isSubmitted = 0) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const isUhr = providerType.toLowerCase().includes('enhanced');
  const tableName = 'events';
  const fullTable = buildFullTableName(dbConfig, providerType, tableName);
  const eventId = `EVT${Date.now()}${Math.random().toString(36).substr(2, 9)}`.substring(0, 47);
  
  const colCreatedDate = isUhr
      ? 'CREATED_DATE'
      : dbConfig.type === 'oracle'
          ? 'CREATED_DATE'
          : dbConfig.type === 'mssql'
              ? 'CREATEDDATE'
              : 'createddate';
  const colEventType = isUhr ? 'EVENTTYPE' : 'eventtype';

  const isSubmittedVal = dbConfig.type === 'postgres'
    ? (isSubmitted === 0 || isSubmitted === false)
    : (isSubmitted === true ? 0 : isSubmitted === false ? 0 : isSubmitted);

  const sql = `
    INSERT INTO ${fullTable} (eventid, provclaimno, ${colEventType}, ${colCreatedDate}, issubmitted)
    VALUES ($1, $2, $3, $4, $5)
  `;
  await dbAssertions.query(sql, [eventId, provClaimNo, eventType, new Date(), isSubmittedVal]);
  return eventId;
}

export async function triggerSync(dbAssertions, activeSession, provClaimNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tables = ['claimencounters', 'claiminfo', 'claimsupportinginfo'];
  
  for (const tableSuffix of tables) {
    const fullTable = buildFullTableName(dbConfig, providerType, tableSuffix);
    try {
      if (dbConfig.type === 'oracle') {
        await dbAssertions.query(
          `UPDATE ${fullTable} SET updated_date = SYSTIMESTAMP WHERE provclaimno = $1`,
          [provClaimNo]
        );
      } else if (dbConfig.type === 'postgres') {
        await dbAssertions.query(
          `UPDATE ${fullTable} SET updated_date = NOW() WHERE provclaimno = $1`,
          [provClaimNo]
        );
      } else {
        await dbAssertions.query(
          `UPDATE ${fullTable} SET updated_date = GETDATE() WHERE provclaimno = $1`,
          [provClaimNo]
        );
      }
    } catch (err) {
      // Table may lack updated_date in some environments
    }
  }
}

export async function triggerSyncOrEvent(dbAssertions, activeSession, provClaimNo, eventType) {
  const providerType = activeSession.providerType || 'default_auto';
  if (isAutoProvider(providerType)) {
    await triggerSync(dbAssertions, activeSession, provClaimNo);
  } else {
    await createEvent(dbAssertions, activeSession, provClaimNo, eventType, 0);
  }
}

export async function resetEventToUnsubmitted(dbAssertions, activeSession, provClaimNo, eventType) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = 'events';
  const fullTable = buildFullTableName(dbConfig, providerType, tableName);
  const isUhr = providerType.toLowerCase().includes('enhanced');
  const colEventType = isUhr ? 'EVENTTYPE' : 'eventtype';

  const sql = dbConfig.type === 'postgres'
    ? `UPDATE ${fullTable} SET issubmitted = false WHERE provclaimno = $1 AND UPPER(${colEventType}) = UPPER($2)`
    : `UPDATE ${fullTable} SET issubmitted = 0 WHERE provclaimno = $1 AND UPPER(${colEventType}) = UPPER($2)`;

  return dbAssertions.query(sql, [provClaimNo, eventType]);
}

export async function updatePatientDemographics(dbAssertions, activeSession, beneficiaryId, fields) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'beneficiary');
  
  const setClauses = [];
  const params = [];
  let index = 1;
  for (const [key, value] of Object.entries(fields)) {
    const colName = dbConfig.type === 'oracle' ? key.toUpperCase() : key.toLowerCase();
    setClauses.push(`${colName} = $${index}`);
    params.push(value);
    index++;
  }
  params.push(beneficiaryId);
  
  const sql = `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE beneficiaryid = $${index}`;
  return dbAssertions.query(sql, params);
}

export async function updateEncounterClass(dbAssertions, activeSession, provClaimNo, newClass) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const classCol = dbConfig.type === 'oracle' ? 'ENCOUNTERCLASS' : 'encounterclass';
  
  const sql = `UPDATE ${tableName} SET ${classCol} = $1 WHERE provclaimno = $2`;
  return dbAssertions.query(sql, [newClass, provClaimNo]);
}

export async function updateEncounterStatus(dbAssertions, activeSession, provClaimNo, newStatus) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const statusCol = dbConfig.type === 'oracle' ? 'ENCOUNTERSTATUS' : 'encounterstatus';
  
  const sql = `UPDATE ${tableName} SET ${statusCol} = $1 WHERE provclaimno = $2`;
  return dbAssertions.query(sql, [newStatus, provClaimNo]);
}

export async function addTransferLocation(dbAssertions, activeSession, provClaimNo, locationText) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');
  
  // First check if a room transfer supporting info already exists
  const checkSql = `SELECT * FROM ${tableName} WHERE provclaimno = $1 AND category = $2`;
  const existing = await dbAssertions.query(checkSql, [provClaimNo, 'info']);
  
  if (existing.length > 0) {
    const sql = `UPDATE ${tableName} SET supportingvalue = $1 WHERE provclaimno = $2 AND category = $3`;
    return dbAssertions.query(sql, [locationText, provClaimNo, 'info']);
  } else {
    const sql = `
      INSERT INTO ${tableName} (provclaimno, sequenceno, category, supportingvalue)
      VALUES ($1, 1, 'info', $2)
    `;
    return dbAssertions.query(sql, [provClaimNo, locationText]);
  }
}

export async function removeTransferLocation(dbAssertions, activeSession, provClaimNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimsupportinginfo');
  
  const sql = `DELETE FROM ${tableName} WHERE provclaimno = $1 AND category = $2`;
  return dbAssertions.query(sql, [provClaimNo, 'info']);
}

export async function updateEncounterServiceType(dbAssertions, activeSession, provClaimNo, serviceType) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const tableName = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const colName = dbConfig.type === 'oracle' ? 'ENCOUNTERSERVICETYPE' : 'encounterservicetype';
  
  const sql = `UPDATE ${tableName} SET ${colName} = $1 WHERE provclaimno = $2`;
  return dbAssertions.query(sql, [serviceType, provClaimNo]);
}

export async function dischargeEncounter(dbAssertions, activeSession, provClaimNo, dischargeDate, disposition) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const encountersTable = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const hospTable = providerType.toLowerCase().includes('enhanced')
    ? buildFullTableName(dbConfig, providerType, 'ENCOUNTERHOSPITALIZATION')
    : dbConfig.type === 'oracle'
      ? 'nphiesencounterhospitalization'
      : buildFullTableName(dbConfig, providerType, 'encounterhospitalization');
      
  const endCol = dbConfig.type === 'oracle' ? 'ENCOUNTERENDDATE' : 'encounterenddate';
  
  // Set discharge date
  await dbAssertions.query(
    `UPDATE ${encountersTable} SET ${endCol} = $1 WHERE provclaimno = $2`,
    [dischargeDate, provClaimNo]
  );
  
  // Get encounterid
  const encRows = await dbAssertions.query(
    `SELECT encounterid FROM ${encountersTable} WHERE provclaimno = $1`,
    [provClaimNo]
  );
  if (encRows.length > 0) {
    const enc = normalizeRow(encRows[0]);
    const encounterId = enc.encounterid;
    
    // Check if hospitalization entry exists
    const hospRows = await dbAssertions.query(
      `SELECT * FROM ${hospTable} WHERE encounterid = $1`,
      [encounterId]
    );
    
    if (hospRows.length > 0) {
      const colDisp = dbConfig.type === 'oracle' ? 'HOSPITALDISCHARGEDISPOSITION' : 'hospitaldischargedisposition';
      await dbAssertions.query(
        `UPDATE ${hospTable} SET ${colDisp} = $1 WHERE encounterid = $2`,
        [disposition, encounterId]
      );
    } else {
      const hospId = `HOS${Date.now()}`.substring(0, 17);
      await dbAssertions.query(
        `INSERT INTO ${hospTable} (encounterhospitalizationid, hospitaladmissionspeciality, hospitalintendedlengthofstay, hospitaladmissionsource, hospitaldischargedisposition, encounterid)
         VALUES ($1, 'internal', '1-3', 'emergency', $2, $3)`,
        [hospId, disposition, encounterId]
      );
    }
  }
}

export async function cancelDischarge(dbAssertions, activeSession, provClaimNo) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const encountersTable = buildFullTableName(dbConfig, providerType, 'claimencounters');
  const endCol = dbConfig.type === 'oracle' ? 'ENCOUNTERENDDATE' : 'encounterenddate';
  
  await dbAssertions.query(
    `UPDATE ${encountersTable} SET ${endCol} = NULL WHERE provclaimno = $2`,
    [provClaimNo]
  );
}

export async function insertNewEncounterForBeneficiary(dbAssertions, activeSession, options) {
  const dbConfig = activeSession.dbConfig;
  const providerType = activeSession.providerType || 'default_auto';
  const isUhr = providerType.toLowerCase().includes('enhanced');
  
  const tables = {
    claiminfo: buildFullTableName(dbConfig, providerType, 'claiminfo'),
    claimencounters: buildFullTableName(dbConfig, providerType, 'claimencounters'),
    claimitem: buildFullTableName(dbConfig, providerType, 'claimitem'),
    claimdiagnosis: buildFullTableName(dbConfig, providerType, 'claimdiagnosis'),
    claimcareteam: buildFullTableName(dbConfig, providerType, 'claimcareteam')
  };

  const provClaimNo = options.provClaimNo || `CLM${Date.now()}`.substring(0, 40);
  const encounterId = options.encounterId || `ENC${Date.now()}`.substring(0, 17);
  const episodeId = `EP${Date.now()}`.substring(0, 17);
  const claimType = options.claimType || '01.08';
  const claimSubType = options.claimSubType || 'ip';
  
  // Insert claiminfo
  await dbAssertions.query(`
    INSERT INTO ${tables.claiminfo} 
    (provclaimno, episodeid, isnewborn, isreferral, claimtype, claimsubtype, providernphiesid, claimcreateddate, accountingperiod, total, coverageid, beneficiaryid)
    VALUES ($1, $2, $3, 'false', $4, $5, '15000000112233', $6, $6, 100.00, $7, $8)
  `, [
    provClaimNo,
    episodeId,
    options.isNewborn || 'false',
    claimType,
    claimSubType,
    new Date(),
    options.coverageId,
    options.beneficiaryId
  ]);

  // Insert encounter
  const endCol = dbConfig.type === 'oracle' ? 'ENCOUNTERENDDATE' : 'encounterenddate';
  const sqlEnc = `
    INSERT INTO ${tables.claimencounters} 
    (provclaimno, encounterid, encounterstartdate, ${endCol}, encounterclass, encounterservicetype, priority, serviceprovider, encounterstatus)
    VALUES ($1, $2, $3, $4, $5, 'consultation', 'routine', '15000000112233', $6)
  `;
  await dbAssertions.query(sqlEnc, [
    provClaimNo,
    encounterId,
    options.encounterStartDate || new Date(),
    options.encounterEndDate || null,
    options.encounterClass || 'IMP',
    options.encounterStatus || 'planned'
  ]);

  // Insert item
  const itemEndDateCol = dbConfig.type === 'oracle' ? 'ENDDATE' : 'enddate';
  if (providerType === 'abha') {
    await dbAssertions.query(`
      INSERT INTO ${tables.claimitem}
      (visitid, sequenceno, servicetype, servicecode, servicedesc, ispackage, quantity, quantitycode, startdate, ${itemEndDateCol})
      VALUES ($1, 1, 'service', '99213', 'Consultation', 'false', 1.0, 'unit', $2, $2)
    `, [provClaimNo, new Date()]);
  } else {
    await dbAssertions.query(`
      INSERT INTO ${tables.claimitem}
      (provclaimno, invoiceno, sequenceno, servicetype, servicecode, servicedesc, ispackage, quantity, unitprice, factor, patientshare, payershare, tax, net, ${itemEndDateCol})
      VALUES ($1, 'INV123', 1, 'service', '99213', 'Consultation', 'false', 1.0, 100.0, 1.0, 20.0, 80.0, 15.0, 115.0, $2)
    `, [provClaimNo, new Date()]);
  }

  // Insert diagnosis
  const idCol = providerType === 'abha' ? 'visitid' : 'provclaimno';
  await dbAssertions.query(`
    INSERT INTO ${tables.claimdiagnosis}
    (${idCol}, sequenceno, diagnosiscode, diagnosisdesc, diagnosistype)
    VALUES ($1, 1, 'M25.46', 'Consultation Diagnosis', 'PRINCIPAL')
  `, [provClaimNo]);

  // Insert careteam
  await dbAssertions.query(`
    INSERT INTO ${tables.claimcareteam}
    (${idCol}, sequenceno, physicianid, physicianname, careteamrole, careteamqualification)
    VALUES ($1, 1, '00TEST1980', 'Attending Physician, MD', 'primary', 'MD')
  `, [provClaimNo]);

  return { provClaimNo, encounterId };
}
