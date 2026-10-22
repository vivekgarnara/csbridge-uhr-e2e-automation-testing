/**
 * Base Adapter - Abstract Interface for Database Adapters
 * All database adapters must extend this class and implement required methods
 */

class BaseAdapter {
  constructor(name, config) {
    this.name = name; // 'oracle', 'postgres', 'mysql', etc.
    this.config = config;
    this.pool = null;
    this.isConnected = false;
    this.poolStats = {
      activeConnections: 0,
      idleConnections: 0,
      maxPoolSize: config.poolSettings?.max || 10,
      totalRequests: 0,
      failedRequests: 0
    };
  }

  /**
   * Initialize connection pool
   * Must be implemented by subclasses
   * @throws {Error} if pool creation fails
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Execute SELECT query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Execute INSERT/UPDATE/DELETE
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   * @returns {Promise<Object>} Result object with rowsAffected
   */
  async execute(sql, params = []) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Get single connection from pool
   * @returns {Promise<Object>} Database connection
   */
  async getConnection() {
    throw new Error('getConnection() must be implemented by subclass');
  }

  /**
   * Release connection back to pool
   * @param {Object} connection - Connection to release
   * @returns {Promise<void>}
   */
  async releaseConnection(connection) {
    throw new Error('releaseConnection() must be implemented by subclass');
  }

  /**
   * Close pool and cleanup all connections
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Health check - validate database connectivity
   * @returns {Promise<boolean>} true if healthy
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }

  /**
   * Get current pool statistics
   * @returns {Object} Pool stats
   */
  getPoolStats() {
    return { ...this.poolStats };
  }

  /**
   * Increment connection request counter
   * @internal
   */
  _recordRequest() {
    this.poolStats.totalRequests++;
  }

  /**
   * Increment failed request counter
   * @internal
   */
  _recordFailure() {
    this.poolStats.failedRequests++;
  }
}

module.exports = BaseAdapter;
