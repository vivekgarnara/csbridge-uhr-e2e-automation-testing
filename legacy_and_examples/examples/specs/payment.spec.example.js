/**
 * Payment Processing Tests - Oracle Database Example
 *
 * This test suite demonstrates how to use the new database architecture
 * with lazy initialization and singleton pooling
 *
 * @tag db:oracle - Indicates this suite requires Oracle database
 */

const { test, expect } = require('../framework/db');

test.describe('Payment Processing (@db:oracle)', () => {
  // Setup data before each test
  test.beforeEach(async ({ oracleDB }) => {
    // Clear test data
    try {
      await oracleDB.execute('DELETE FROM payment_test_data', []);
    } catch (error) {
      // Table might not exist yet, that's okay
    }
  });

  // Cleanup after each test
  test.afterEach(async ({ oracleDB }) => {
    // Optional: cleanup test data after verification
    await oracleDB.execute('DELETE FROM payment_test_data', []);
  });

  test('should insert payment record into Oracle', async ({ oracleDB }) => {
    // Example: Insert a payment record
    const result = await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount, status, created_at)
       VALUES (:id, :amount, :status, SYSDATE)`,
      [123, 100.00, 'PENDING']
    );

    // Verify insert was successful
    expect(result.rowsAffected).toBe(1);
  });

  test('should query payment records from Oracle', async ({ oracleDB }) => {
    // Setup: Insert test data
    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount, status)
       VALUES (:id, :amount, :status)`,
      [456, 250.50, 'COMPLETED']
    );

    // Execute query
    const payments = await oracleDB.query(
      `SELECT payment_id, amount, status FROM payment_test_data WHERE payment_id = :id`,
      [456]
    );

    // Verify results
    expect(payments).toHaveLength(1);
    expect(payments[0].PAYMENT_ID).toBe(456);
    expect(payments[0].AMOUNT).toBe(250.50);
    expect(payments[0].STATUS).toBe('COMPLETED');
  });

  test('should update payment status', async ({ oracleDB }) => {
    // Setup: Insert initial record
    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount, status)
       VALUES (:id, :amount, :status)`,
      [789, 500.00, 'PENDING']
    );

    // Update status
    const updateResult = await oracleDB.execute(
      `UPDATE payment_test_data SET status = :status WHERE payment_id = :id`,
      ['PROCESSED', 789]
    );

    expect(updateResult.rowsAffected).toBe(1);

    // Verify update
    const updated = await oracleDB.query(
      `SELECT status FROM payment_test_data WHERE payment_id = :id`,
      [789]
    );

    expect(updated[0].STATUS).toBe('PROCESSED');
  });

  test('should handle concurrent payments (connection reuse)', async ({ oracleDB }) => {
    // This test demonstrates that the pool is reused
    // Multiple concurrent operations use the same pool

    const payments = [
      { id: 1001, amount: 100.00 },
      { id: 1002, amount: 200.00 },
      { id: 1003, amount: 300.00 },
    ];

    // Insert all concurrently using Promise.all
    await Promise.all(
      payments.map(payment =>
        oracleDB.execute(
          `INSERT INTO payment_test_data (payment_id, amount) VALUES (:id, :amount)`,
          [payment.id, payment.amount]
        )
      )
    );

    // Verify all were inserted
    const allPayments = await oracleDB.query(
      `SELECT COUNT(*) as cnt FROM payment_test_data WHERE payment_id >= :id`,
      [1001]
    );

    expect(allPayments[0].CNT).toBe(3);
  });

  test('should handle complex transaction', async ({ oracleDB }) => {
    // Demonstrate multi-step operations within test

    // Step 1: Insert payment
    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount, status)
       VALUES (:id, :amount, :status)`,
      [2000, 1000.00, 'INITIATED']
    );

    // Step 2: Query to verify
    const initial = await oracleDB.query(
      `SELECT status FROM payment_test_data WHERE payment_id = :id`,
      [2000]
    );
    expect(initial[0].STATUS).toBe('INITIATED');

    // Step 3: Update status
    await oracleDB.execute(
      `UPDATE payment_test_data SET status = :status WHERE payment_id = :id`,
      ['PROCESSING', 2000]
    );

    // Step 4: Final verification
    const final = await oracleDB.query(
      `SELECT status FROM payment_test_data WHERE payment_id = :id`,
      [2000]
    );
    expect(final[0].STATUS).toBe('PROCESSING');
  });

  test('should handle NULL values', async ({ oracleDB }) => {
    // Insert record with NULL value
    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount, reference)
       VALUES (:id, :amount, NULL)`,
      [3000, 750.00]
    );

    // Query and verify NULL handling
    const payment = await oracleDB.query(
      `SELECT payment_id, reference FROM payment_test_data WHERE payment_id = :id`,
      [3000]
    );

    expect(payment[0].PAYMENT_ID).toBe(3000);
    expect(payment[0].REFERENCE).toBeNull();
  });

  test('should properly handle binding parameters', async ({ oracleDB }) => {
    // Demonstrate proper parameter binding (prevents SQL injection)
    const testId = 4000;
    const testAmount = 555.55;

    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount) VALUES (:id, :amount)`,
      [testId, testAmount] // Properly bound - safe from SQL injection
    );

    const result = await oracleDB.query(
      `SELECT amount FROM payment_test_data WHERE payment_id = :id`,
      [testId]
    );

    expect(result[0].AMOUNT).toBe(testAmount);
  });

  test('should reuse Oracle pool across multiple operations', async ({ oracleDB }) => {
    // This test implicitly demonstrates pool reuse:
    // All previous tests in this describe block have used oracleDB
    // The pool was created on first use and reused for subsequent tests
    // No reconnections or pool recreations happened

    // Verify we can still use the pool normally
    const result = await oracleDB.query(
      `SELECT * FROM dual`
    );

    expect(result).toBeDefined();
  });
});

/**
 * Additional test suite showing multiple database access patterns
 */
test.describe('Payment Integration Tests (@db:oracle)', () => {
  test('should validate payment data consistency', async ({ oracleDB }) => {
    // Insert test payment
    await oracleDB.execute(
      `INSERT INTO payment_test_data (payment_id, amount) VALUES (:id, :amount)`,
      [5000, 999.99]
    );

    // Retrieve and validate
    const payments = await oracleDB.query(
      `SELECT * FROM payment_test_data WHERE payment_id = :id`,
      [5000]
    );

    const payment = payments[0];

    // Detailed assertions
    expect(payment.PAYMENT_ID).toBe(5000);
    expect(payment.AMOUNT).toBe(999.99);
    expect(payment.CREATED_AT).toBeDefined();
  });
});
