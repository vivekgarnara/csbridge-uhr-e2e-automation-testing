import { test as base } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { DbAssertions } from './dbAssertions.js';
import { DataGenerator } from '../../src/core/generators/adtDataGenerator.js';
import { CdaDataGenerator } from '../../src/core/generators/cdaDataGenerator.js';
import { FhirDataGenerator } from '../../src/core/generators/fhirDataGenerator.js';
import { loadActiveSessionFromPath, validateAutoModeSession } from './specSetup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolved once at module load time.
// This file lives at tests/utils/, so ../config/activeDb.json → tests/config/activeDb.json.
const ACTIVE_DB_JSON_PATH = path.resolve(__dirname, '../config/activeDb.json');

export const test = base.extend({
  activeSession: [
    async ({}, use) => {
      const session = loadActiveSessionFromPath(ACTIVE_DB_JSON_PATH);
      validateAutoModeSession(session);
      await use(session);
      // No teardown — plain config object, nothing to close.
    },
    { scope: 'worker' },
  ],
  dbAssertions: [
    async ({ activeSession }, use) => {
      const db = new DbAssertions(
        activeSession.dbConfig,
        activeSession.providerType || 'default_auto'
      );
      await db.connect();

      await use(db);

      // Teardown: runs once after all tests in this worker complete.
      await db.close();
    },
    { scope: 'worker' },
  ],
  generator: [
    async ({ activeSession }, use) => {
      const gen = new DataGenerator(
        activeSession.dbConfig,
        activeSession.providerType || 'default_auto'
      );

      await use(gen);

      // Teardown: runs once after all tests in this worker complete.
      await gen.close();
    },
    { scope: 'worker' },
  ],
  cdaGenerator: [
    async ({ activeSession }, use) => {
      const gen = new CdaDataGenerator(
        activeSession.dbConfig
      );

      await use(gen);

      // Teardown: runs once after all tests in this worker complete.
      await gen.close();
    },
    { scope: 'worker' },
  ],
  fhirGenerator: [
    async ({ activeSession }, use) => {
      const gen = new FhirDataGenerator(
        activeSession.dbConfig
      );

      await use(gen);

      // Teardown: runs once after all tests in this worker complete.
      await gen.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
