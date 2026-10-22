/**
 * Connection Pool Manager - Singleton manager for all database connection pools
 * One instance per Playwright worker
 */

const logger = require('../utils/logger');
const AdapterRegistry = require('../registry/adapter-registry');

class ConnectionPoolManager {
  constructor() {
    this.poolMap = {}; // { oracle: OracleAdapter, postgres: null, ... }
    this.adapterRegistry = new AdapterRegistry();
    this.isInitialized = false;
  }

  /**
   * Initialize pool manager with adapter registry
   * @param {Array<{name, AdapterClass}>} adapters - List of adapters to register
   */
  initialize(adapters = []) {
    for (const { name, AdapterClass } of adapters) {
      this.adapterRegistry.register(name, AdapterClass);
      this.poolMap[name] = null; // Initialize slot for each adapter
    }
    this.isInitialized = true;
    logger.info('ConnectionPoolManager initialized', {
      registeredAdapters: this.adapterRegistry.getAll()
    });
  }

  /**
   * Get or create database connection (lazy initialization)
   * @param {string} dbName - Database name (e.g., 'oracle', 'postgres')
   * @param {Object} config - Database configuration
   * @param {boolean} forceNew - Force new adapter instance (default: false)
   * @returns {Promise<Object>} Database adapter client
   * @throws {Error} if adapter not registered or connection fails
   */
  async getConnection(dbName, config, forceNew = false) {
    if (!this.isInitialized) {
      throw new Error('ConnectionPoolManager not initialized. Call initialize() first.');
    }

    const normalizedName = dbName.toLowerCase();

    // Check if adapter is registered
    if (!this.adapterRegistry.isRegistered(normalizedName)) {
      throw new Error(
        `Database adapter '${dbName}' not registered. Available: ${this.adapterRegistry.getAll().join(', ')}`
      );
    }

    // Return existing pool if available and not forcing new
    if (!forceNew && this.poolMap[normalizedName]) {
      logger.debug(`Reusing existing ${dbName} connection pool`);
      return this.poolMap[normalizedName];
    }

    // Create new adapter instance
    logger.info(`Creating new ${dbName} connection pool...`);

    const AdapterClass = this.adapterRegistry.get(normalizedName);
    const adapter = new AdapterClass(normalizedName, config);

    try {
      await adapter.initialize();
      this.poolMap[normalizedName] = adapter;
      logger.info(`${dbName} connection pool created successfully`, adapter.getPoolStats());
      return adapter;
    } catch (error) {
      logger.error(`Failed to initialize ${dbName} adapter`, error, {
        database: dbName
      });
      throw error;
    }
  }

  /**
   * Get existing connection without creating
   * @param {string} dbName - Database name
   * @returns {Object|null} Adapter if exists, null otherwise
   */
  getExistingConnection(dbName) {
    const normalizedName = dbName.toLowerCase();
    return this.poolMap[normalizedName] || null;
  }

  /**
   * Get pool statistics for a database
   * @param {string} dbName - Database name
   * @returns {Object} Pool statistics
   */
  getPoolStats(dbName) {
    const adapter = this.getExistingConnection(dbName);
    if (!adapter) {
      return { status: 'not_initialized' };
    }
    return adapter.getPoolStats();
  }

  /**
   * Get statistics for all active connections
   * @returns {Object} Statistics for all databases
   */
  getAllPoolStats() {
    const stats = {};
    for (const [dbName, adapter] of Object.entries(this.poolMap)) {
      if (adapter) {
        stats[dbName] = adapter.getPoolStats();
      } else {
        stats[dbName] = { status: 'not_initialized' };
      }
    }
    return stats;
  }

  /**
   * Disconnect specific database
   * @param {string} dbName - Database name
   * @returns {Promise<void>}
   */
  async disconnect(dbName) {
    const normalizedName = dbName.toLowerCase();
    const adapter = this.poolMap[normalizedName];

    if (!adapter) {
      logger.debug(`${dbName} not initialized, nothing to disconnect`);
      return;
    }

    try {
      logger.info(`Disconnecting ${dbName}...`);
      await adapter.disconnect();
      this.poolMap[normalizedName] = null;
      logger.info(`${dbName} disconnected successfully`);
    } catch (error) {
      logger.error(`Error disconnecting ${dbName}`, error);
      throw error;
    }
  }

  /**
   * Disconnect all databases
   * @returns {Promise<void>}
   */
  async disconnectAll() {
    logger.info('Disconnecting all database pools...');

    const promises = [];
    for (const dbName of Object.keys(this.poolMap)) {
      if (this.poolMap[dbName]) {
        promises.push(this.disconnect(dbName).catch(err => {
          logger.warn(`Error disconnecting ${dbName}`, { error: err.message });
        }));
      }
    }

    await Promise.all(promises);
    logger.info('All database pools disconnected');
  }

  /**
   * Get list of active connections
   * @returns {Array<string>} Names of initialized databases
   */
  getActiveConnections() {
    return Object.entries(this.poolMap)
      .filter(([, adapter]) => adapter !== null)
      .map(([name]) => name);
  }

  /**
   * Check if specific database is connected
   * @param {string} dbName - Database name
   * @returns {boolean} true if connected
   */
  isConnected(dbName) {
    const adapter = this.getExistingConnection(dbName);
    return adapter ? adapter.isConnected : false;
  }

  /**
   * Get adapter registry
   * @returns {AdapterRegistry} The adapter registry instance
   */
  getRegistry() {
    return this.adapterRegistry;
  }
}

// Singleton instance (one per worker)
let instance = null;

function getConnectionPoolManager() {
  if (!instance) {
    instance = new ConnectionPoolManager();
  }
  return instance;
}

function resetConnectionPoolManager() {
  instance = null;
}

module.exports = {
  ConnectionPoolManager,
  getConnectionPoolManager,
  resetConnectionPoolManager
};
