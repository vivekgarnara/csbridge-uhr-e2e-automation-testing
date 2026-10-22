// Helper to safely get environment variables in both Node.js and Vite/Client environments
const getEnv = (key, defaultVal) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] !== undefined) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key];
  }
  return defaultVal;
};

// Export different environments the user can select
export const dbEnvironments = {
  postgres: {
    type: 'postgres',
    host: getEnv('VITE_POSTGRES_HOST', 'localhost'),
    port: parseInt(getEnv('VITE_POSTGRES_PORT', '5432'), 10),
    database: getEnv('VITE_POSTGRES_DATABASE', 'postgres'),
    user: getEnv('VITE_POSTGRES_USER', 'postgres'),
    password: getEnv('VITE_POSTGRES_PASSWORD', 'admin')
  },
  oracle: {
    type: 'oracle',
    host: getEnv('VITE_ORACLE_HOST', 'localhost'),
    port: parseInt(getEnv('VITE_ORACLE_PORT', '1522'), 10),
    database: getEnv('VITE_ORACLE_DATABASE', 'XE'),
    user: getEnv('VITE_ORACLE_USER', 'system'),
    password: getEnv('VITE_ORACLE_PASSWORD', 'oracle')
  },
  mssql: {
    type: 'mssql',
    host: getEnv('VITE_SQLSERVER_HOST', '172.16.10.6\\SQL2019'),
    port: parseInt(getEnv('VITE_SQLSERVER_PORT', '1433'), 10),
    database: getEnv('VITE_SQLSERVER_DATABASE', 'uhr_waseel'),
    user: getEnv('VITE_SQLSERVER_USER', 'BADAL'),
    password: getEnv('VITE_SQLSERVER_PASSWORD', 'badal')
  },
  mysql: {
    type: 'mysql',
    host: getEnv('VITE_MYSQL_HOST', 'localhost'),
    port: parseInt(getEnv('VITE_MYSQL_PORT', '3306'), 10),
    database: getEnv('VITE_MYSQL_DATABASE', 'csbridge'),
    user: getEnv('VITE_MYSQL_USER', 'csbridge'),
    password: getEnv('VITE_MYSQL_PASSWORD', 'Csbridge@0000')
  },
  stagingPostgres: {
    type: 'postgres',
    host: '10.104.5.234',
    port: 7000,
    database: 'CSBRIDGE_STG',
    user: 'csbridge',
    password: 'Lkid0kR#sKldiX%',
    connectionTimeoutMillis: 10000,
    ssl: false
  },
  stagingWrcm: {
    type: 'postgres',
    host: '10.104.5.234',
    port: 7000,
    database: 'WRCM_STG',
    user: 'uhr_ro_user',
    password: 'Uhdg6354hsg726',
    connectionTimeoutMillis: 10000,
    ssl: false
  },
  qaPostgres: {
    type: 'postgres',
    host: '10.104.5.234',
    port: 6000,
    database: 'CSBRIDGE_QA',
    user: 'csbridge',
    password: 'Mdhcui#skof%cs3R',
    connectionTimeoutMillis: 10000,
    ssl: false
  }
};

export const providerTypes = [
  'default',
  'default_auto',
  'default_plus',
  'enhanced',
  'enhanced_auto',
  'uhr'
];
