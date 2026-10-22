/**
 * Retry Logic - Exponential backoff and connection retry strategy
 */

const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Function result
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    dbName = 'unknown'
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
          maxDelayMs
        );

        logger.logRetry(dbName, attempt, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Check if error is a connection-related error (retryable)
 * @param {Error} error - Error to check
 * @returns {boolean} true if error is retryable
 */
function isConnectionError(error) {
  if (!error) return false;

  const message = (error.message || '').toLowerCase();
  const code = error.code || '';

  // Oracle connection errors
  const oracleConnectionErrors = [
    'ora-12514', // listener not available
    'ora-12541', // connection refused
    'ora-12170', // connect timeout
    'eneterror',  // network error
    'econnrefused' // connection refused
  ];

  // PostgreSQL connection errors
  const postgresConnectionErrors = [
    'econnrefused',
    'enotfound',
    'etimedout',
    'no pg_hba.conf',
    'server closed the connection'
  ];

  const allConnectionErrors = [...oracleConnectionErrors, ...postgresConnectionErrors];

  return allConnectionErrors.some(errorType =>
    message.includes(errorType) || code.includes(errorType)
  );
}

/**
 * Check if error indicates a stale connection
 * @param {Error} error - Error to check
 * @returns {boolean} true if connection is stale
 */
function isStaleConnectionError(error) {
  if (!error) return false;

  const message = (error.message || '').toLowerCase();

  const staleErrors = [
    'connection terminated',
    'connection closed',
    'session ended',
    'connection reset',
    'broken pipe',
    'lost connection'
  ];

  return staleErrors.some(errorType => message.includes(errorType));
}

/**
 * Execute query with stale connection recovery
 * @param {Function} queryFn - Query execution function
 * @param {Function} retryFn - Alternative function to retry (e.g., get fresh connection)
 * @param {string} dbName - Database name for logging
 * @returns {Promise} Query result
 */
async function executeWithStaleConnectionRecovery(queryFn, retryFn, dbName = 'unknown') {
  try {
    return await queryFn();
  } catch (error) {
    if (isStaleConnectionError(error)) {
      logger.logStaleConnectionDetected(dbName);
      // Retry with fresh connection
      return await retryFn();
    }
    throw error;
  }
}

module.exports = {
  retryWithBackoff,
  isConnectionError,
  isStaleConnectionError,
  executeWithStaleConnectionRecovery
};
