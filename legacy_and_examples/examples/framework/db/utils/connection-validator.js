/**
 * Connection Validator - Validate database connections and pool health
 */

/**
 * Validate connection by executing test query
 * @param {Object} connection - Database connection
 * @param {string} validationQuery - Query to validate (e.g., 'SELECT 1')
 * @returns {Promise<boolean>} true if connection is valid
 */
async function validateConnection(connection, validationQuery) {
  try {
    if (!connection) return false;

    // Different databases may have different validation query approaches
    if (connection.execute) {
      await connection.execute(validationQuery);
      return true;
    } else if (connection.query) {
      await connection.query(validationQuery);
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if pool is healthy
 * @param {Object} pool - Connection pool
 * @returns {boolean} true if pool exists and is accessible
 */
function isPoolHealthy(pool) {
  return pool !== null && pool !== undefined;
}

/**
 * Validate pool configuration
 * @param {Object} config - Pool configuration
 * @throws {Error} if configuration is invalid
 */
function validatePoolConfig(config) {
  if (!config) {
    throw new Error('Pool configuration is required');
  }

  const { poolSettings } = config;

  if (!poolSettings) {
    throw new Error('poolSettings is required in configuration');
  }

  const { max, min } = poolSettings;

  if (typeof max !== 'number' || max < 1) {
    throw new Error('poolSettings.max must be a positive number');
  }

  if (typeof min !== 'number' || min < 0) {
    throw new Error('poolSettings.min must be a non-negative number');
  }

  if (min > max) {
    throw new Error('poolSettings.min cannot be greater than max');
  }
}

/**
 * Validate connection configuration
 * @param {Object} config - Connection configuration
 * @throws {Error} if configuration is invalid
 */
function validateConnectionConfig(config) {
  if (!config) {
    throw new Error('Connection configuration is required');
  }

  if (!config.host || !config.user || !config.password) {
    throw new Error('host, user, and password are required in configuration');
  }

  validatePoolConfig(config);
}

/**
 * Monitor pool for exhaustion
 * @param {Object} adapter - Database adapter with pool stats
 * @param {number} warningThreshold - Warning threshold (default 80%)
 * @returns {Object} Monitor result
 */
function monitorPoolHealth(adapter, warningThreshold = 0.8) {
  const stats = adapter.getPoolStats();
  const utilization = stats.activeConnections / stats.maxPoolSize;

  return {
    isHealthy: utilization < 1,
    utilization: Math.round(utilization * 100),
    warned: utilization >= warningThreshold,
    stats: stats
  };
}

/**
 * Get human-readable connection error
 * @param {Error} error - Connection error
 * @returns {string} User-friendly error message
 */
function getConnectionErrorMessage(error) {
  const message = (error.message || '').toLowerCase();

  const errorMap = {
    'connection refused': 'Database server refused connection. Check host and port.',
    'connection timeout': 'Connection to database timed out. Check network.',
    'no pg_hba.conf': 'PostgreSQL authentication failed. Check credentials.',
    'ora-12514': 'Oracle listener not available. Check connection string.',
    'ora-12541': 'Oracle connection refused. Check database availability.',
    'enotfound': 'Database host not found. Check hostname.',
    'eacces': 'Permission denied. Check credentials.',
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (message.includes(key)) {
      return value;
    }
  }

  return error.message || 'Unknown connection error';
}

module.exports = {
  validateConnection,
  isPoolHealthy,
  validatePoolConfig,
  validateConnectionConfig,
  monitorPoolHealth,
  getConnectionErrorMessage
};
