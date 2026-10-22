/**
 * Adapter Registry - Central registry for database adapters
 */

const logger = require('../utils/logger');

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * Register a database adapter
   * @param {string} name - Adapter name (e.g., 'oracle', 'postgres')
   * @param {Class} AdapterClass - Adapter class
   * @throws {Error} if adapter is invalid
   */
  register(name, AdapterClass) {
    if (!name || typeof name !== 'string') {
      throw new Error('Adapter name must be a non-empty string');
    }

    if (typeof AdapterClass !== 'function') {
      throw new Error(`AdapterClass for '${name}' must be a class/function`);
    }

    this.adapters.set(name.toLowerCase(), AdapterClass);
    logger.debug(`Adapter registered: ${name}`);
  }

  /**
   * Get adapter class by name
   * @param {string} name - Adapter name
   * @returns {Class} Adapter class
   * @throws {Error} if adapter not found
   */
  get(name) {
    const normalizedName = name.toLowerCase();

    if (!this.adapters.has(normalizedName)) {
      const available = Array.from(this.adapters.keys());
      throw new Error(
        `Adapter '${name}' not found. Available adapters: ${available.join(', ')}`
      );
    }

    return this.adapters.get(normalizedName);
  }

  /**
   * Check if adapter is registered
   * @param {string} name - Adapter name
   * @returns {boolean} true if registered
   */
  isRegistered(name) {
    return this.adapters.has(name.toLowerCase());
  }

  /**
   * Get all registered adapter names
   * @returns {Array<string>} List of registered adapters
   */
  getAll() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Unregister an adapter
   * @param {string} name - Adapter name
   */
  unregister(name) {
    this.adapters.delete(name.toLowerCase());
    logger.debug(`Adapter unregistered: ${name}`);
  }

  /**
   * Clear all adapters
   */
  clear() {
    this.adapters.clear();
    logger.debug('Adapter registry cleared');
  }

  /**
   * Get adapter count
   * @returns {number} Number of registered adapters
   */
  count() {
    return this.adapters.size;
  }
}

module.exports = AdapterRegistry;
