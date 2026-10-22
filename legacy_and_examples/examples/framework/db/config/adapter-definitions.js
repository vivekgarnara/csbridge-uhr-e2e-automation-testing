/**
 * Adapter Definitions - Register available database adapters
 */

const OracleAdapter = require('../adapters/oracle-adapter');
const PostgresAdapter = require('../adapters/postgres-adapter');

/**
 * Register all available adapters with pool manager
 * @param {ConnectionPoolManager} poolManager - Pool manager instance
 */
function registerAdapters(poolManager) {
  // Register Oracle adapter
  poolManager.getRegistry().register('oracle', OracleAdapter);

  // Register PostgreSQL adapter
  poolManager.getRegistry().register('postgres', PostgresAdapter);

  // Future adapters can be registered here:
  // poolManager.getRegistry().register('mysql', MySQLAdapter);
  // poolManager.getRegistry().register('mongodb', MongoDBAdapter);
  // poolManager.getRegistry().register('redis', RedisAdapter);
}

/**
 * Get list of all registered adapter names
 * @returns {Array<string>} List of adapter names
 */
function getRegisteredAdapters() {
  return ['oracle', 'postgres'];
  // Add to list as new adapters are registered
  // return ['oracle', 'postgres', 'mysql', 'mongodb', 'redis'];
}

module.exports = {
  registerAdapters,
  getRegisteredAdapters
};
