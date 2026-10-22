/**
 * Oracle Database Adapter
 * Implements BaseAdapter for Oracle database connections
 * Uses oracledb driver (npm install oracledb)
 */

const BaseAdapter = require('./base-adapter');
const logger = require('../utils/logger');
const { retryWithBackoff, isConnectionError, executeWithStaleConnectionRecovery } = require('../utils/retry-logic');
const { validateConnection, validateConnectionConfig, getConnectionErrorMessage } = require('../utils/connection-validator');

let oracledb;

try {
  oracledb = require('oracledb');
} catch (error) {
  logger.warn('oracledb not installed. Install with: npm install oracledb');
}

class OracleAdapter extends BaseAdapter {
  constructor(name, config) {
    super(name, config);
    if (!oracledb) {
      throw new Error('oracledb package is not installed. Install with: npm install oracledb');
    }
  }

  /**
   * Initialize connection pool
   */
  async initialize() {
    try {
      // Validate configuration
      validateConnectionConfig(this.config);

      logger.info('Initializing Oracle connection pool...', { host: this.config.host });

      // Create pool with retry
      await retryWithBackoff(async () => {
        this.pool = await oracledb.createPool({
          user: this.config.user,
          password: this.config.password,
          connectString: `${this.config.host}:${this.config.port}/${this.config.database}`,
          max: this.config.poolSettings.max,
          min: this.config.poolSettings.min,
          increment: 1,
          timeout: this.config.poolSettings.connectionTimeoutMillis / 1000,
          stmtCacheSize: 20
        });
      }, {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 3000,
        dbName: 'oracle'
      });

      // Run health check
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Oracle pool created but health check failed');
      }

      this.isConnected = true;
      this.poolStats.maxPoolSize = this.config.poolSettings.max;
      logger.logPoolInit('oracle', this.config.poolSettings.max, this.config.host);

    } catch (error) {
      logger.error('Failed to initialize Oracle adapter', error, {
        host: this.config.host,
        port: this.config.port
      });
      throw new Error(`Oracle initialization failed: ${getConnectionErrorMessage(error)}`);
    }
  }

  /**
   * Execute SELECT query
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('Oracle adapter not connected');
    }

    this._recordRequest();
    const startTime = Date.now();

    try {
      const result = await executeWithStaleConnectionRecovery(
        async () => {
          const connection = await this.getConnection();
          try {
            const result = await connection.execute(sql, params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              fetchArraySize: 100
            });
            return result.rows;
          } finally {
            await this.releaseConnection(connection);
          }
        },
        async () => {
          // Retry with fresh connection
          const connection = await this.getConnection();
          try {
            const result = await connection.execute(sql, params, {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              fetchArraySize: 100
            });
            return result.rows;
          } finally {
            await this.releaseConnection(connection);
          }
        },
        'oracle'
      );

      const duration = Date.now() - startTime;
      logger.logQuery('oracle', sql, duration);

      return result;
    } catch (error) {
      this._recordFailure();
      logger.error('Oracle query failed', error, { sql });
      throw error;
    }
  }

  /**
   * Execute INSERT/UPDATE/DELETE
   */
  async execute(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('Oracle adapter not connected');
    }

    this._recordRequest();
    const startTime = Date.now();

    try {
      const connection = await this.getConnection();
      try {
        const result = await connection.execute(sql, params, {
          autoCommit: true
        });

        const duration = Date.now() - startTime;
        logger.logQuery('oracle', sql, duration);

        return {
          rowsAffected: result.rowsAffected || 0,
          lastInsertId: result.lastRowid || null
        };
      } finally {
        await this.releaseConnection(connection);
      }
    } catch (error) {
      this._recordFailure();
      logger.error('Oracle execute failed', error, { sql });
      throw error;
    }
  }

  /**
   * Get connection from pool
   */
  async getConnection() {
    if (!this.pool) {
      throw new Error('Oracle pool not initialized');
    }

    try {
      const connection = await this.pool.getConnection();
      this.poolStats.activeConnections++;
      return connection;
    } catch (error) {
      if (isConnectionError(error)) {
        throw new Error(`Cannot get Oracle connection: ${getConnectionErrorMessage(error)}`);
      }
      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  async releaseConnection(connection) {
    if (!connection) return;

    try {
      await connection.close();
      this.poolStats.activeConnections = Math.max(0, this.poolStats.activeConnections - 1);
    } catch (error) {
      logger.warn('Error releasing Oracle connection', { error: error.message });
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const isValid = await validateConnection(
        this.pool,
        this.config.poolSettings.validationQuery
      );

      if (!isValid) {
        throw new Error('Validation query failed');
      }

      return true;
    } catch (error) {
      logger.error('Oracle health check failed', error);
      return false;
    }
  }

  /**
   * Disconnect pool
   */
  async disconnect() {
    if (!this.pool) return;

    try {
      await this.pool.close(0); // Force close without waiting
      this.pool = null;
      this.isConnected = false;
      logger.info('Oracle pool disconnected');
    } catch (error) {
      logger.error('Error disconnecting Oracle pool', error);
      throw error;
    }
  }
}

module.exports = OracleAdapter;
