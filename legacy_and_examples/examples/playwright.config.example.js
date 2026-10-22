/**
 * Example Playwright Configuration with Database Framework Integration
 * Copy this as playwright.config.js and update paths as needed
 */

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');
require('dotenv').config();

// Import database framework
const dbFramework = require('./framework/db');

module.exports = defineConfig({
  testDir: './specs',

  // Number of parallel workers
  workers: process.env.CI ? 1 : 4,

  // Test timeout
  timeout: 30 * 1000,

  // Expect timeout
  expect: {
    timeout: 5 * 1000,
  },

  // Fail on console errors
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },

  // Web server (if needed)
  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list'],
  ],

  // ===== DATABASE FRAMEWORK SETUP =====
  // Global setup - runs once before all tests
  globalSetup: async (config) => {
    console.log('[DB] Initializing database framework...');
    try {
      const poolManager = await dbFramework.initializeDatabase();
      console.log('[DB] Database framework initialized');
      console.log('[DB] Available adapters:', poolManager.getRegistry().getAll());
    } catch (error) {
      console.error('[DB] Failed to initialize database framework:', error.message);
      // Continue anyway - tests that use DB will fail gracefully
    }

    // Return cleanup function
    return async () => {
      console.log('[DB] Running global teardown...');
      try {
        await dbFramework.cleanupDatabase();
        console.log('[DB] Database framework cleanup complete');
      } catch (error) {
        console.error('[DB] Error during cleanup:', error.message);
      }
    };
  },

  // Global teardown - runs once after all tests
  globalTeardown: async (config) => {
    console.log('[DB] Global teardown - cleaning up resources');
    try {
      await dbFramework.cleanupDatabase();
    } catch (error) {
      console.error('[DB] Cleanup error:', error);
    }
  },

  // Fullyparallel tests (can run in parallel within worker)
  fullyParallel: true,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,
});
