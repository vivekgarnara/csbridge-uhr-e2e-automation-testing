/**
 * Database Logger - Structured logging for database operations
 */

class DatabaseLogger {
  constructor(enableVerbose = false) {
    this.enableVerbose = enableVerbose || process.env.DB_LOG_VERBOSE === 'true';
  }

  /**
   * Log info message
   */
  info(message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[DB-INFO ${timestamp}] ${message}`, Object.keys(data).length > 0 ? data : '');
  }

  /**
   * Log debug message (only if verbose enabled)
   */
  debug(message, data = {}) {
    if (!this.enableVerbose) return;
    const timestamp = new Date().toISOString();
    console.debug(`[DB-DEBUG ${timestamp}] ${message}`, Object.keys(data).length > 0 ? data : '');
  }

  /**
   * Log warning
   */
  warn(message, data = {}) {
    const timestamp = new Date().toISOString();
    console.warn(`[DB-WARN ${timestamp}] ${message}`, Object.keys(data).length > 0 ? data : '');
  }

  /**
   * Log error
   */
  error(message, error, data = {}) {
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : error;
    console.error(`[DB-ERROR ${timestamp}] ${message}: ${errorMsg}`, Object.keys(data).length > 0 ? data : '');
    if (error instanceof Error && error.stack && this.enableVerbose) {
      console.error(error.stack);
    }
  }

  /**
   * Log pool initialization
   */
  logPoolInit(dbName, poolSize, host) {
    this.info('Pool initialized', {
      database: dbName,
      maxPoolSize: poolSize,
      host: host
    });
  }

  /**
   * Log pool stats
   */
  logPoolStats(dbName, stats) {
    this.debug('Pool statistics', {
      database: dbName,
      ...stats
    });
  }

  /**
   * Log query execution
   */
  logQuery(dbName, sql, durationMs) {
    if (durationMs > 5000) {
      this.warn('Slow query detected', {
        database: dbName,
        durationMs: durationMs,
        query: sql.substring(0, 100) + (sql.length > 100 ? '...' : '')
      });
    } else {
      this.debug('Query executed', {
        database: dbName,
        durationMs: durationMs
      });
    }
  }

  /**
   * Log connection retry
   */
  logRetry(dbName, attempt, error) {
    this.warn('Connection retry', {
      database: dbName,
      attempt: attempt,
      error: error.message
    });
  }

  /**
   * Log stale connection detection
   */
  logStaleConnectionDetected(dbName) {
    this.warn('Stale connection detected and replaced', {
      database: dbName
    });
  }
}

const logger = new DatabaseLogger();

module.exports = logger;
