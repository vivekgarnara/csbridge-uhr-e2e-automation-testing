/**
 * Database Framework - Public API
 * Main entry point for database functionality
 */

// Connection Management
const { getConnectionPoolManager, resetConnectionPoolManager } = require('./pool/connection-pool-manager');

// Adapters
const BaseAdapter = require('./adapters/base-adapter');
const OracleAdapter = require('./adapters/oracle-adapter');
const PostgresAdapter = require('./adapters/postgres-adapter');

// Configuration
const databaseConfig = require('./config/databases.config');
const { registerAdapters, getRegisteredAdapters } = require('./config/adapter-definitions');

// Fixtures
const { test, workerEnd, initializeDatabaseManager } = require('./fixtures/db-fixtures');

// Utilities
const logger = require('./utils/logger');
const { retryWithBackoff, isConnectionError, isStaleConnectionError } = require('./utils/retry-logic');
const { validateConnection, validateConnectionConfig, monitorPoolHealth } = require('./utils/connection-validator');

/**
 * Initialize database framework
 * Should be called from playwright.config.js
 */
async function initializeDatabase() {
  try {
    const poolManager = getConnectionPoolManager();
    registerAdapters(poolManager);

    const adapters = [
      { name: 'oracle', AdapterClass: OracleAdapter },
      { name: 'postgres', AdapterClass: PostgresAdapter }
    ];

    poolManager.initialize(adapters);
    logger.info('Database framework initialized');

    return poolManager;
  } catch (error) {
    logger.error('Failed to initialize database framework', error);
    throw error;
  }
}

/**
 * Cleanup database framework
 * Should be called on test suite shutdown
 */
async function cleanupDatabase() {
  try {
    const poolManager = getConnectionPoolManager();
    await poolManager.disconnectAll();
    resetConnectionPoolManager();
    logger.info('Database framework cleaned up');
  } catch (error) {
    logger.error('Error during database cleanup', error);
    throw error;
  }
}

/**
 * Get current connection pool manager
 * @returns {ConnectionPoolManager} Pool manager singleton
 */
function getPoolManager() {
  return getConnectionPoolManager();
}

module.exports = {
  // Main functions
  initializeDatabase,
  cleanupDatabase,
  getPoolManager,

  // Fixtures
  test,
  workerEnd,
  initializeDatabaseManager,

  // Adapters
  BaseAdapter,
  OracleAdapter,
  PostgresAdapter,

  // Configuration
  databaseConfig,
  registerAdapters,
  getRegisteredAdapters,

  // Utilities
  logger,
  retryWithBackoff,
  isConnectionError,
  isStaleConnectionError,
  validateConnection,
  validateConnectionConfig,
  monitorPoolHealth
};
