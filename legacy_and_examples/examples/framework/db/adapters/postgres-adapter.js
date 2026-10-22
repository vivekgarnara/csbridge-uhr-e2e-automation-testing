/**
 * PostgreSQL Database Adapter
 * Implements BaseAdapter for PostgreSQL connections
 * Uses pg (node-postgres) driver (npm install pg)
 */

const BaseAdapter = require('./base-adapter');
const logger = require('../utils/logger');
const { retryWithBackoff, isConnectionError, executeWithStaleConnectionRecovery } = require('../utils/retry-logic');
const { validateConnection, validateConnectionConfig, getConnectionErrorMessage } = require('../utils/connection-validator');

let Pool;

try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (error) {
  logger.warn('pg (node-postgres) not installed. Install with: npm install pg');
}

class PostgresAdapter extends BaseAdapter {
  constructor(name, config) {
    super(name, config);
    if (!Pool) {
      throw new Error('pg package is not installed. Install with: npm install pg');
    }
  }

  /**
   * Initialize connection pool
   */
  async initialize() {
    try {
      // Validate configuration
      validateConnectionConfig(this.config);

      logger.info('Initializing PostgreSQL connection pool...', { host: this.config.host });

      // Create pool with retry
      await retryWithBackoff(async () => {
        this.pool = new Pool({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: this.config.database,
          max: this.config.poolSettings.max,
          min: this.config.poolSettings.min,
          idleTimeoutMillis: this.config.poolSettings.idleTimeoutMillis,
          connectionTimeoutMillis: this.config.poolSettings.connectionTimeoutMillis,
          statement_timeout: this.config.poolSettings.statementTimeoutMillis
        });

        // Test connection
        const client = await this.pool.connect();
        await client.query('SELECT NOW()');
        client.release();
      }, {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 3000,
        dbName: 'postgres'
      });

      // Run health check
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('PostgreSQL pool created but health check failed');
      }

      this.isConnected = true;
      this.poolStats.maxPoolSize = this.config.poolSettings.max;
      logger.logPoolInit('postgres', this.config.poolSettings.max, this.config.host);

    } catch (error) {
      logger.error('Failed to initialize PostgreSQL adapter', error, {
        host: this.config.host,
        port: this.config.port
      });
      throw new Error(`PostgreSQL initialization failed: ${getConnectionErrorMessage(error)}`);
    }
  }

  /**
   * Execute SELECT query
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('PostgreSQL adapter not connected');
    }

    this._recordRequest();
    const startTime = Date.now();

    try {
      const result = await executeWithStaleConnectionRecovery(
        async () => {
          const client = await this.getConnection();
          try {
            const result = await client.query(sql, params);
            return result.rows;
          } finally {
            await this.releaseConnection(client);
          }
        },
        async () => {
          // Retry with fresh connection
          const client = await this.getConnection();
          try {
            const result = await client.query(sql, params);
            return result.rows;
          } finally {
            await this.releaseConnection(client);
          }
        },
        'postgres'
      );

      const duration = Date.now() - startTime;
      logger.logQuery('postgres', sql, duration);

      return result;
    } catch (error) {
      this._recordFailure();
      logger.error('PostgreSQL query failed', error, { sql });
      throw error;
    }
  }

  /**
   * Execute INSERT/UPDATE/DELETE
   */
  async execute(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('PostgreSQL adapter not connected');
    }

    this._recordRequest();
    const startTime = Date.now();

    try {
      const client = await this.getConnection();
      try {
        const result = await client.query(sql, params);

        const duration = Date.now() - startTime;
        logger.logQuery('postgres', sql, duration);

        return {
          rowsAffected: result.rowCount || 0,
          lastInsertId: result.rows?.[0]?.id || null
        };
      } finally {
        await this.releaseConnection(client);
      }
    } catch (error) {
      this._recordFailure();
      logger.error('PostgreSQL execute failed', error, { sql });
      throw error;
    }
  }

  /**
   * Get connection from pool
   */
  async getConnection() {
    if (!this.pool) {
      throw new Error('PostgreSQL pool not initialized');
    }

    try {
      const client = await this.pool.connect();
      this.poolStats.activeConnections++;
      return client;
    } catch (error) {
      if (isConnectionError(error)) {
        throw new Error(`Cannot get PostgreSQL connection: ${getConnectionErrorMessage(error)}`);
      }
      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  async releaseConnection(client) {
    if (!client) return;

    try {
      client.release();
      this.poolStats.activeConnections = Math.max(0, this.poolStats.activeConnections - 1);
    } catch (error) {
      logger.warn('Error releasing PostgreSQL connection', { error: error.message });
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.pool) {
        throw new Error('Pool not initialized');
      }

      const client = await this.pool.connect();
      try {
        await client.query(this.config.poolSettings.validationQuery);
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('PostgreSQL health check failed', error);
      return false;
    }
  }

  /**
   * Disconnect pool
   */
  async disconnect() {
    if (!this.pool) return;

    try {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('PostgreSQL pool disconnected');
    } catch (error) {
      logger.error('Error disconnecting PostgreSQL pool', error);
      throw error;
    }
  }
}

module.exports = PostgresAdapter;
