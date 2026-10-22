# Database Framework Setup Guide

## Overview

This guide explains how to set up and use the Playwright multi-database architecture for lazy initialization, singleton pooling, and extensible database support.

---

## Step 1: Install Required Dependencies

### Oracle Database Support
```bash
npm install oracledb
```

### PostgreSQL Support
```bash
npm install pg
```

---

## Step 2: Environment Variables

Create a `.env` file in your project root with database credentials:

```bash
# Oracle Configuration
ORACLE_HOST=localhost
ORACLE_PORT=1521
ORACLE_USER=system
ORACLE_PASSWORD=oracle123
ORACLE_SID=ORCLDB

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=postgres123
PG_DB=testdb

# Optional: Pool Configuration
ORACLE_POOL_MAX=10
ORACLE_POOL_MIN=2
PG_POOL_MAX=10
PG_POOL_MIN=2

# Enable verbose logging (optional)
DB_LOG_VERBOSE=true
```

Load environment variables in `playwright.config.js`:
```javascript
require('dotenv').config();
```

---

## Step 3: Update playwright.config.js

Update your Playwright configuration to initialize the database framework:

```javascript
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config();

const dbFramework = require('./framework/db');

module.exports = defineConfig({
  testDir: './specs',
  workers: 4, // Parallel workers

  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global setup - initialize database framework
  globalSetup: async (config) => {
    await dbFramework.initializeDatabase();
    return async () => {
      await dbFramework.cleanupDatabase();
    };
  },

  // Global teardown - cleanup on test suite end
  globalTeardown: async (config) => {
    await dbFramework.cleanupDatabase();
  },
});
```

---

## Step 4: Update Test Files

### Option A: Using Specific Database Fixtures (Recommended)

**payment.spec.js** - Oracle only:
```javascript
const { test, expect } = require('./framework/db');

test.describe('Payment Processing', () => {
  test('should process payment in Oracle', async ({ oracleDB }) => {
    // oracleDB is automatically initialized (lazy)
    const payments = await oracleDB.query('SELECT * FROM payments WHERE id = :id', [123]);
    expect(payments).toHaveLength(1);
  });

  test('should insert payment record', async ({ oracleDB }) => {
    const result = await oracleDB.execute(
      'INSERT INTO payments (amount, status) VALUES (:amount, :status)',
      [100.00, 'PENDING']
    );
    expect(result.rowsAffected).toBe(1);
  });
});
```

**claims-post.spec.js** - PostgreSQL only:
```javascript
const { test, expect } = require('./framework/db');

test.describe('Claims Processing', () => {
  test('should create claim in PostgreSQL', async ({ postgresDB }) => {
    // postgresDB is automatically initialized (lazy)
    const result = await postgresDB.execute(
      'INSERT INTO claims (claim_number, amount) VALUES ($1, $2)',
      ['CLM-001', 5000.00]
    );
    expect(result.rowsAffected).toBe(1);
  });

  test('should retrieve claim details', async ({ postgresDB }) => {
    const claims = await postgresDB.query(
      'SELECT * FROM claims WHERE claim_number = $1',
      ['CLM-001']
    );
    expect(claims).toHaveLength(1);
  });
});
```

### Option B: Using Database Factory (Multi-DB Access)

**reconciliation.spec.js** - Cross-database validation:
```javascript
const { test, expect } = require('./framework/db');

test.describe('Database Reconciliation', () => {
  test('should reconcile Oracle and PostgreSQL records', async ({ dbFactory }) => {
    // Get both databases on demand
    const oracleDB = await dbFactory.getConnection('oracle');
    const postgresDB = await dbFactory.getConnection('postgres');

    // Fetch from both databases
    const oraclePayments = await oracleDB.query(
      'SELECT id, amount FROM payments WHERE status = :status',
      ['COMPLETED']
    );

    const pgPayments = await postgresDB.query(
      'SELECT id, amount FROM payments WHERE status = $1',
      ['COMPLETED']
    );

    // Validate records match
    expect(oraclePayments.length).toBe(pgPayments.length);

    // Check pool statistics
    const stats = dbFactory.getAllPoolStats();
    console.log('Pool Stats:', stats);
  });
});
```

### Option C: Dynamic Database Selection

```javascript
const { test, expect } = require('./framework/db');

// Use tags to indicate which database(s) are needed
test('@db:oracle @critical', 'should validate Oracle data', async ({ oracleDB }) => {
  const records = await oracleDB.query('SELECT COUNT(*) as cnt FROM payments');
  expect(records[0].cnt).toBeGreaterThan(0);
});

test('@db:postgres', 'should validate PostgreSQL data', async ({ postgresDB }) => {
  const records = await postgresDB.query('SELECT COUNT(*) as cnt FROM claims');
  expect(records[0].cnt).toBeGreaterThan(0);
});
```

---

## Step 5: How It Works

### Worker Startup
```
1. Playwright worker process starts
2. Database framework initialized (once per worker)
3. Adapter registry populated (adapters registered but not connected)
4. Fixtures available (lazy - not yet connected to databases)
```

### First Test Using Oracle
```
1. Test declares: async ({ oracleDB })
2. oracleDB fixture triggers
3. Pool Manager checks: Is Oracle pool already created?
4. NO → Create pool, initialize, cache
5. Return client to test
6. Test uses client: await oracleDB.query(...)
```

### Second Test Using Oracle (Same Worker)
```
1. Test declares: async ({ oracleDB })
2. oracleDB fixture triggers
3. Pool Manager checks: Is Oracle pool already created?
4. YES → Return existing pool (reuse!)
5. No reconnection, no overhead
```

### Worker Shutdown
```
1. All tests in worker complete
2. Playwright triggers worker cleanup
3. Pool Manager closes all pools
4. Connections released, resources cleaned up
5. Worker exits
```

---

## Step 6: API Reference

### Database Client Methods

```javascript
// Query (SELECT)
const results = await oracleDB.query(sql, params);
// Returns: Array<Object>

// Execute (INSERT/UPDATE/DELETE)
const result = await oracleDB.execute(sql, params);
// Returns: { rowsAffected: number, lastInsertId: any }

// Get pool statistics
const stats = oracleDB.getPoolStats();
// Returns: { activeConnections, idleConnections, maxPoolSize, totalRequests, failedRequests }
```

### Database Factory Methods

```javascript
// Get connection to specific database
const db = await dbFactory.getConnection('postgres');

// Get statistics for specific database
const stats = dbFactory.getPoolStats('oracle');

// Get all statistics
const allStats = dbFactory.getAllPoolStats();

// Check if database is connected
const isConnected = dbFactory.isConnected('postgres');

// Get list of active connections
const active = dbFactory.getActiveConnections(); // ['oracle', 'postgres']
```

---

## Step 7: Error Handling & Retries

Database operations automatically include:
- **Stale connection detection** — Automatically retries with fresh connection
- **Health checks** — Validates pool on initialization
- **Retry logic** — Exponential backoff for transient failures
- **Logging** — Detailed debug logs for troubleshooting

Example with error handling:
```javascript
test('should handle database errors gracefully', async ({ postgresDB }) => {
  try {
    const results = await postgresDB.query('SELECT * FROM invalid_table');
  } catch (error) {
    // Error is caught and logged
    expect(error.message).toContain('does not exist');
  }
});
```

---

## Step 8: Monitoring Pool Health

Monitor pool statistics to detect issues:

```javascript
test('should monitor pool health', async ({ dbFactory }) => {
  const stats = dbFactory.getAllPoolStats();

  console.log('Oracle:', stats.oracle);
  // Output: {
  //   activeConnections: 3,
  //   idleConnections: 7,
  //   maxPoolSize: 10,
  //   totalRequests: 1250,
  //   failedRequests: 2
  // }

  // Alert if utilization is high
  const utilization = stats.oracle.activeConnections / stats.oracle.maxPoolSize;
  if (utilization > 0.8) {
    console.warn('Oracle pool utilization high:', Math.round(utilization * 100) + '%');
  }
});
```

---

## Step 9: Adding a New Database Type

To add a new database (e.g., MySQL), follow these steps:

### 1. Create Adapter
```javascript
// framework/db/adapters/mysql-adapter.js
const BaseAdapter = require('./base-adapter');

class MySQLAdapter extends BaseAdapter {
  // Implement required methods
  async initialize() { ... }
  async query(sql, params) { ... }
  async execute(sql, params) { ... }
  // ... etc
}

module.exports = MySQLAdapter;
```

### 2. Add Configuration
```javascript
// databases.config.js
const mysqlConfig = {
  name: 'mysql',
  host: process.env.MYSQL_HOST,
  // ... rest of config
};
```

### 3. Register Adapter
```javascript
// adapter-definitions.js
function registerAdapters(poolManager) {
  // ... existing registrations
  poolManager.getRegistry().register('mysql', MySQLAdapter);
}
```

### 4. Use in Tests
```javascript
test('should work with MySQL', async ({ dbFactory }) => {
  const mysql = await dbFactory.getConnection('mysql');
  const results = await mysql.query('SELECT * FROM users');
});
```

**That's it!** No framework changes needed.

---

## Troubleshooting

### Connection Refused
```
Error: Cannot get Oracle connection: Database server refused connection
```
**Solution:** Check ORACLE_HOST, ORACLE_PORT, and database availability

### Pool Exhaustion
```
Warning: Oracle pool utilization high: 95%
```
**Solution:** Increase ORACLE_POOL_MAX in .env or investigate slow queries

### Stale Connection
```
[DB-WARN] Stale connection detected and replaced
```
**Solution:** This is normal and handled automatically. Connection is replaced.

### Module Not Found
```
Error: oracledb package is not installed
```
**Solution:** Run `npm install oracledb` for Oracle support

---

## Best Practices

1. **Always use fixture declaration** — `async ({ oracleDB })` makes dependencies explicit
2. **Use environment variables** — Never hardcode credentials
3. **Monitor pool stats** — Regular health checks prevent exhaustion
4. **Tag tests** — Use `@db:oracle` tags for easy test selection
5. **Commit migration** — Once working, commit changes to version control

---

## Performance Tips

- Lazy initialization reduces startup time by ~80% for database-specific tests
- Singleton pooling reuses connections across all tests in a worker
- No pool recreation between tests (significant performance boost)
- Parallel workers each get isolated pools (safe concurrent access)

---

For more details, see the Architecture Plan document.
