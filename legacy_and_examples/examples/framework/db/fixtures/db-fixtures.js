/**
 * Database Fixtures - Worker-scoped Playwright fixtures for lazy database initialization
 */

const { test: baseTest } = require('@playwright/test');
const { getConnectionPoolManager } = require('../pool/connection-pool-manager');
const { registerAdapters } = require('../config/adapter-definitions');
const databaseConfig = require('../config/databases.config');
const logger = require('../utils/logger');

/**
 * Initialize database pool manager (run once per worker)
 * This is called automatically by Playwright before any tests run in a worker
 */
function initializeDatabaseManager() {
  const poolManager = getConnectionPoolManager();

  if (!poolManager.isInitialized) {
    // Register all available adapters
    registerAdapters(poolManager);

    // Initialize pool manager
    const adapters = [
      { name: 'oracle', AdapterClass: require('../adapters/oracle-adapter') },
      { name: 'postgres', AdapterClass: require('../adapters/postgres-adapter') }
    ];

    poolManager.initialize(adapters);
    logger.info('Database manager initialized for worker', {
      adapters: poolManager.getRegistry().getAll()
    });
  }

  return poolManager;
}

/**
 * Extend Playwright test with database fixtures
 */
const test = baseTest.extend({
  /**
   * Oracle Database Fixture
   * Lazy initialization - only creates pool when test uses it
   */
  oracleDB: async ({ }, use) => {
    const poolManager = initializeDatabaseManager();
    const config = databaseConfig.getConfig('oracle');

    let db = null;
    try {
      db = await poolManager.getConnection('oracle', config);
      await use(db);
    } finally {
      // Do NOT close pool here - it stays alive for other tests in same worker
      // Pool only closes when worker shuts down (see workerEnd fixture below)
    }
  },

  /**
   * PostgreSQL Database Fixture
   * Lazy initialization - only creates pool when test uses it
   */
  postgresDB: async ({ }, use) => {
    const poolManager = initializeDatabaseManager();
    const config = databaseConfig.getConfig('postgres');

    let db = null;
    try {
      db = await poolManager.getConnection('postgres', config);
      await use(db);
    } finally {
      // Do NOT close pool here - it stays alive for other tests in same worker
      // Pool only closes when worker shuts down (see workerEnd fixture below)
    }
  },

  /**
   * Database Factory Fixture
   * Provides on-demand access to any database
   */
  dbFactory: async ({ }, use) => {
    const poolManager = initializeDatabaseManager();

    const factory = {
      /**
       * Get database connection by name
       * @param {string} dbName - Database name (e.g., 'oracle', 'postgres')
       * @returns {Promise<Object>} Database adapter
       */
      async getConnection(dbName) {
        const config = databaseConfig.getConfig(dbName);
        return await poolManager.getConnection(dbName, config);
      },

      /**
       * Get pool statistics
       * @param {string} dbName - Database name
       * @returns {Object} Pool statistics
       */
      getPoolStats(dbName) {
        return poolManager.getPoolStats(dbName);
      },

      /**
       * Get all pool statistics
       * @returns {Object} Statistics for all databases
       */
      getAllPoolStats() {
        return poolManager.getAllPoolStats();
      },

      /**
       * Check if database is connected
       * @param {string} dbName - Database name
       * @returns {boolean} true if connected
       */
      isConnected(dbName) {
        return poolManager.isConnected(dbName);
      },

      /**
       * Get list of active connections
       * @returns {Array<string>} Names of initialized databases
       */
      getActiveConnections() {
        return poolManager.getActiveConnections();
      }
    };

    await use(factory);
  }
});

/**
 * Worker end hook - cleanup all database pools
 * This runs once when Playwright worker shuts down
 */
const workerEnd = baseTest.afterAll(async ({ }, testInfo) => {
  if (testInfo.config.workers > 0) {
    const poolManager = getConnectionPoolManager();
    await poolManager.disconnectAll();
    logger.info('All database pools cleaned up on worker shutdown');
  }
});

module.exports = {
  test,
  workerEnd,
  initializeDatabaseManager
};
