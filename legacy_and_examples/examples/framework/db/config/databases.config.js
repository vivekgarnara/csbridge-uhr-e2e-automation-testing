/**
 * Database Configuration
 * Connection strings and pool settings for all databases
 * Uses environment variables for sensitive credentials
 */

/**
 * Oracle Database Configuration
 */
const oracleConfig = {
  name: 'oracle',
  type: 'oracledb',
  host: process.env.ORACLE_HOST || 'localhost',
  port: parseInt(process.env.ORACLE_PORT || '1521', 10),
  user: process.env.ORACLE_USER || 'system',
  password: process.env.ORACLE_PASSWORD || '',
  database: process.env.ORACLE_SID || 'ORCLDB',
  poolSettings: {
    max: parseInt(process.env.ORACLE_POOL_MAX || '10', 10),
    min: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.ORACLE_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.ORACLE_CONNECTION_TIMEOUT || '5000', 10),
    maxUses: parseInt(process.env.ORACLE_MAX_USES || '100', 10),
    validationQuery: 'SELECT 1 FROM dual'
  }
};

/**
 * PostgreSQL Database Configuration
 */
const postgresConfig = {
  name: 'postgres',
  type: 'pg',
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DB || 'testdb',
  poolSettings: {
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    min: parseInt(process.env.PG_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '5000', 10),
    statementTimeoutMillis: parseInt(process.env.PG_STATEMENT_TIMEOUT || '30000', 10),
    validationQuery: 'SELECT 1'
  }
};

/**
 * MySQL Database Configuration (Future)
 */
const mysqlConfig = {
  name: 'mysql',
  type: 'mysql2',
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'testdb',
  poolSettings: {
    max: parseInt(process.env.MYSQL_POOL_MAX || '10', 10),
    min: parseInt(process.env.MYSQL_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.MYSQL_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.MYSQL_CONNECTION_TIMEOUT || '5000', 10),
    validationQuery: 'SELECT 1'
  }
};

/**
 * Get database configuration by name
 * @param {string} dbName - Database name
 * @returns {Object} Database configuration
 * @throws {Error} if database not configured
 */
function getConfig(dbName) {
  const configMap = {
    oracle: oracleConfig,
    postgres: postgresConfig,
    mysql: mysqlConfig
  };

  const config = configMap[dbName.toLowerCase()];
  if (!config) {
    throw new Error(`Database '${dbName}' not configured`);
  }

  return { ...config }; // Return copy to prevent modification
}

/**
 * Get all configured databases
 * @returns {Object} Map of all database configurations
 */
function getAllConfigs() {
  return {
    oracle: oracleConfig,
    postgres: postgresConfig,
    mysql: mysqlConfig
  };
}

/**
 * Validate that required environment variables are set
 * @param {string} dbName - Database name
 * @throws {Error} if required env vars missing
 */
function validateConfig(dbName) {
  const config = getConfig(dbName);

  if (!config.host) {
    throw new Error(`${dbName.toUpperCase()}_HOST environment variable not set`);
  }

  if (!config.user) {
    throw new Error(`${dbName.toUpperCase()}_USER environment variable not set`);
  }

  if (!config.password) {
    throw new Error(`${dbName.toUpperCase()}_PASSWORD environment variable not set`);
  }

  if (!config.database) {
    throw new Error(`${dbName.toUpperCase()}_DB or ${dbName.toUpperCase()}_SID environment variable not set`);
  }
}

module.exports = {
  oracleConfig,
  postgresConfig,
  mysqlConfig,
  getConfig,
  getAllConfigs,
  validateConfig
};
