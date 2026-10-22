export const provClaimPrefix = 'CLM';

export function buildFullTableName(dbConfig, providerType = 'default', tableSuffix) {
  const isUhr = providerType.toLowerCase().includes('enhanced');
  let schemaPrefix;
  let tablePrefix;

  if (dbConfig.type === 'oracle' || dbConfig.type === 'mssql' || dbConfig.type === 'mysql') {
    schemaPrefix = '';
    tablePrefix = isUhr ? 'UHR_' : 'nphies_';
  } else {
    schemaPrefix = 'midtable_nphies.';
    tablePrefix = isUhr ? 'uhr_' : 'nphies_';
  }

  if (tableSuffix === 'events' && isUhr) {
    return `${schemaPrefix}UHR_EVENTS`;
  }

  if (tableSuffix.toLowerCase() === 'encounterhospitalization') {
    return `${schemaPrefix}${isUhr ? 'uhr_encounterhospitalization' : 'nphiesencounterhospitalization'}`;
  }

  return `${schemaPrefix}${tablePrefix}${tableSuffix}`;
}

/** Lowercase keys so Oracle/MSSQL column casing does not break assertions. */
export function normalizeRow(row) {
  if (!row || typeof row !== 'object') {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}
