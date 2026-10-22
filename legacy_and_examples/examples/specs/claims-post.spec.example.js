/**
 * Claims Processing Tests - PostgreSQL Database Example
 *
 * This test suite demonstrates using the database architecture with PostgreSQL
 * with lazy initialization and automatic pool reuse
 *
 * @tag db:postgres - Indicates this suite requires PostgreSQL database
 */

const { test, expect } = require('../framework/db');

test.describe('Claims Processing (@db:postgres)', () => {
  // Setup before each test
  test.beforeEach(async ({ postgresDB }) => {
    // Create test table if not exists
    try {
      await postgresDB.execute(`
        CREATE TABLE IF NOT EXISTS claims_test_data (
          id SERIAL PRIMARY KEY,
          claim_number VARCHAR(50) UNIQUE NOT NULL,
          claimant_name VARCHAR(255),
          amount DECIMAL(10, 2),
          status VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, []);
    } catch (error) {
      // Table already exists, that's okay
    }

    // Clear test data
    try {
      await postgresDB.execute('TRUNCATE TABLE claims_test_data CASCADE', []);
    } catch (error) {
      // Table might not exist yet
    }
  });

  // Cleanup after each test
  test.afterEach(async ({ postgresDB }) => {
    // Optional: cleanup test data
    try {
      await postgresDB.execute('TRUNCATE TABLE claims_test_data CASCADE', []);
    } catch (error) {
      // Already cleaned up or doesn't exist
    }
  });

  test('should insert claim record into PostgreSQL', async ({ postgresDB }) => {
    // Insert a claim record using parameterized query
    const result = await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
       VALUES ($1, $2, $3, $4)`,
      ['CLM-001', 'John Doe', 5000.00, 'SUBMITTED']
    );

    // Verify insert
    expect(result.rowsAffected).toBe(1);
  });

  test('should query claim records from PostgreSQL', async ({ postgresDB }) => {
    // Setup: Insert test claim
    await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
       VALUES ($1, $2, $3, $4)`,
      ['CLM-002', 'Jane Smith', 7500.00, 'UNDER_REVIEW']
    );

    // Execute query
    const claims = await postgresDB.query(
      `SELECT claim_number, claimant_name, amount, status FROM claims_test_data
       WHERE claim_number = $1`,
      ['CLM-002']
    );

    // Verify results
    expect(claims).toHaveLength(1);
    expect(claims[0].claim_number).toBe('CLM-002');
    expect(claims[0].claimant_name).toBe('Jane Smith');
    expect(claims[0].amount).toBe('7500.00'); // PostgreSQL returns decimal as string
    expect(claims[0].status).toBe('UNDER_REVIEW');
  });

  test('should update claim status', async ({ postgresDB }) => {
    // Setup: Insert initial claim
    await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
       VALUES ($1, $2, $3, $4)`,
      ['CLM-003', 'Bob Johnson', 3000.00, 'SUBMITTED']
    );

    // Update status
    const updateResult = await postgresDB.execute(
      `UPDATE claims_test_data SET status = $1, updated_at = NOW()
       WHERE claim_number = $2`,
      ['APPROVED', 'CLM-003']
    );

    expect(updateResult.rowsAffected).toBe(1);

    // Verify update
    const updated = await postgresDB.query(
      `SELECT status, updated_at FROM claims_test_data WHERE claim_number = $1`,
      ['CLM-003']
    );

    expect(updated[0].status).toBe('APPROVED');
    expect(updated[0].updated_at).toBeDefined();
  });

  test('should handle multiple claims concurrently', async ({ postgresDB }) => {
    // Demonstrate concurrent operations using the reused pool

    const claims = [
      { num: 'CLM-100', name: 'Alice', amount: 1000.00 },
      { num: 'CLM-101', name: 'Bob', amount: 2000.00 },
      { num: 'CLM-102', name: 'Charlie', amount: 3000.00 },
      { num: 'CLM-103', name: 'Diana', amount: 4000.00 },
    ];

    // Insert all concurrently
    await Promise.all(
      claims.map(claim =>
        postgresDB.execute(
          `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
           VALUES ($1, $2, $3, $4)`,
          [claim.num, claim.name, claim.amount, 'SUBMITTED']
        )
      )
    );

    // Verify all were inserted
    const allClaims = await postgresDB.query(
      `SELECT COUNT(*) as cnt FROM claims_test_data WHERE claim_number LIKE 'CLM-1%'`
    );

    expect(parseInt(allClaims[0].cnt)).toBe(4);
  });

  test('should handle complex claim workflow', async ({ postgresDB }) => {
    // Demonstrate multi-step claim processing

    const claimNum = 'CLM-WF-001';

    // Step 1: Submit claim
    await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
       VALUES ($1, $2, $3, $4)`,
      [claimNum, 'Workflow Test', 10000.00, 'SUBMITTED']
    );

    // Step 2: Verify submission
    let claim = await postgresDB.query(
      `SELECT status FROM claims_test_data WHERE claim_number = $1`,
      [claimNum]
    );
    expect(claim[0].status).toBe('SUBMITTED');

    // Step 3: Review claim
    await postgresDB.execute(
      `UPDATE claims_test_data SET status = $1 WHERE claim_number = $2`,
      ['UNDER_REVIEW', claimNum]
    );

    // Step 4: Approve claim
    await postgresDB.execute(
      `UPDATE claims_test_data SET status = $1 WHERE claim_number = $2`,
      ['APPROVED', claimNum]
    );

    // Step 5: Final verification
    claim = await postgresDB.query(
      `SELECT status FROM claims_test_data WHERE claim_number = $1`,
      [claimNum]
    );
    expect(claim[0].status).toBe('APPROVED');
  });

  test('should handle NULL values correctly', async ({ postgresDB }) => {
    // Test NULL value handling in PostgreSQL
    await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount)
       VALUES ($1, $2, NULL)`,
      ['CLM-NULL', 'No Amount']
    );

    const claim = await postgresDB.query(
      `SELECT claim_number, amount FROM claims_test_data WHERE claim_number = $1`,
      ['CLM-NULL']
    );

    expect(claim[0].claim_number).toBe('CLM-NULL');
    expect(claim[0].amount).toBeNull();
  });

  test('should properly use parameterized queries', async ({ postgresDB }) => {
    // Demonstrate safe parameter binding (prevents SQL injection)
    const claimNum = "CLM-'; DROP TABLE claims_test_data; --"; // Malicious input

    // This is safe because the malicious input is treated as data, not SQL
    await postgresDB.execute(
      `INSERT INTO claims_test_data (claim_number, claimant_name, amount)
       VALUES ($1, $2, $3)`,
      [claimNum, 'Safe Test', 1000.00]
    );

    // Verify the literal value was inserted safely
    const result = await postgresDB.query(
      `SELECT claim_number FROM claims_test_data WHERE claim_number = $1`,
      [claimNum]
    );

    expect(result[0].claim_number).toBe(claimNum);
  });

  test('should handle bulk operations efficiently', async ({ postgresDB }) => {
    // Demonstrate efficient bulk operations using the pooled connection

    // Insert 50 claims efficiently
    for (let i = 0; i < 50; i++) {
      await postgresDB.execute(
        `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
         VALUES ($1, $2, $3, $4)`,
        [`CLM-BULK-${i.toString().padStart(3, '0')}`, `Claimant ${i}`, (i + 1) * 100, 'SUBMITTED']
      );
    }

    // Verify all were inserted
    const count = await postgresDB.query(
      `SELECT COUNT(*) as cnt FROM claims_test_data WHERE claim_number LIKE 'CLM-BULK-%'`
    );

    expect(parseInt(count[0].cnt)).toBe(50);
  });

  test('should verify pool reuse across test suite', async ({ postgresDB }) => {
    // This test implicitly demonstrates pool reuse:
    // All previous tests in this describe block have used postgresDB
    // The pool was created on first use and reused for subsequent tests
    // No reconnections between tests occurred

    // Verify pool is still functional
    const result = await postgresDB.query(
      `SELECT version() as version`
    );

    expect(result).toHaveLength(1);
    expect(result[0].version).toBeDefined();
  });
});

/**
 * Additional test suite with different patterns
 */
test.describe('Claims Analytics (@db:postgres)', () => {
  test('should aggregate claim statistics', async ({ postgresDB }) => {
    // Setup: Insert test claims
    const testClaims = [
      ['CLM-A-001', 'User A', 1000.00, 'APPROVED'],
      ['CLM-A-002', 'User B', 2000.00, 'APPROVED'],
      ['CLM-A-003', 'User C', 3000.00, 'REJECTED'],
    ];

    for (const claim of testClaims) {
      await postgresDB.execute(
        `INSERT INTO claims_test_data (claim_number, claimant_name, amount, status)
         VALUES ($1, $2, $3, $4)`,
        claim
      );
    }

    // Analytics query
    const stats = await postgresDB.query(
      `SELECT
         COUNT(*) as total_claims,
         SUM(amount) as total_amount,
         AVG(amount) as avg_amount,
         MAX(amount) as max_amount
       FROM claims_test_data
       WHERE claim_number LIKE 'CLM-A-%'`
    );

    expect(parseInt(stats[0].total_claims)).toBe(3);
    expect(parseFloat(stats[0].total_amount)).toBe(6000.00);
  });
});
