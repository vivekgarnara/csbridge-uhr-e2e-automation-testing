import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { DataGenerator } from '../src/core/generators/adtDataGenerator.js';
import { DbAssertions } from '../tests/utils/dbAssertions.js';
import { dbEnvironments, providerTypes } from '../tests/config/db.config.js';
import { EVENT_GROUPS } from '../tests/utils/testScenarios.js';
import { getScenarioConfig } from '../src/core/eventRules.js';
import { waitForEvent, waitForNoEvent } from '../tests/utils/bridgeTestHelper.js';
import { testRuntimeConfig } from '../tests/config/test.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Event groups that have Playwright specs (skip A05–A08 for faster seeding). */
const SEED_EVENT_GROUPS = ['A01', 'A02', 'A03', 'A04'];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('--- NPHIES Event Generation Script ---');
  console.log('Seeding event groups:', SEED_EVENT_GROUPS.join(', '));
  console.log('Available Environments:', Object.keys(dbEnvironments).join(', '));

  const dbKeys = Object.keys(dbEnvironments);
  console.log('\nSelect database to connect:');
  dbKeys.forEach((key, index) => console.log(`${index + 1}. ${key}`));

  let dbInput = await askQuestion('\nEnter number (default: 1): ');
  let dbIndex = parseInt(dbInput.trim(), 10) || 1;
  if (dbIndex < 1 || dbIndex > dbKeys.length) {
    console.error('Invalid selection. Defaulting to 1.');
    dbIndex = 1;
  }
  const envChoice = dbKeys[dbIndex - 1];
  const activeConfig = dbEnvironments[envChoice];

  console.log('\nSelect Provider Type:');
  providerTypes.forEach((pt, index) => console.log(`${index + 1}. ${pt}`));

  let ptInput = await askQuestion('\nEnter number (default: 1): ');
  let ptIndex = parseInt(ptInput.trim(), 10) || 1;
  if (ptIndex < 1 || ptIndex > providerTypes.length) {
    console.error('Invalid selection. Defaulting to 1.');
    ptIndex = 1;
  }
  const providerChoice = providerTypes[ptIndex - 1];

  console.log(`\nConnecting to ${envChoice} database at ${activeConfig.host} with provider ${providerChoice}...`);

  const generator = new DataGenerator(activeConfig, providerChoice);
  const dbAssertions = new DbAssertions(activeConfig, providerChoice);
  const isConnected = await generator.testConnection();

  if (!isConnected) {
    console.error(`\n[ERROR] Failed to connect to ${envChoice}.`);
    rl.close();
    process.exit(1);
  }

  await dbAssertions.connect();

  console.log(`[SUCCESS] Connected to ${envChoice} database.\n`);

  const activeDbPath = path.resolve(__dirname, '../tests/config/activeDb.json');
  const activeSessionData = {
    dbConfig: activeConfig,
    providerType: providerChoice
  };
  fs.writeFileSync(activeDbPath, JSON.stringify(activeSessionData, null, 2));
  console.log(`Saved active DB config and Provider Type to ${activeDbPath}`);

  const isAuto = providerChoice.toLowerCase().endsWith('_auto');
  if (isAuto) {
    console.log(
      `default_auto: event verify mode="${testRuntimeConfig.eventVerifyMode}" (local=generator inserts events, bridge=wait for CS Bridge)`
    );
  }
  let passed = 0;
  let failed = 0;

  console.log('\n--- Starting Event Generation ---');
  for (const groupName of SEED_EVENT_GROUPS) {
    const scenarios = EVENT_GROUPS[groupName];
    if (!scenarios) continue;

    console.log(`\nGenerating data for ${groupName} (${scenarios.length} scenarios)...`);

    for (const scenario of scenarios) {
      const scenarioConfig = getScenarioConfig(groupName, scenario.id, scenario.description);
      const config = {
        numberOfEvents: 1,
        eventTypes: [groupName],
        providerType: providerChoice,
        dbConfig: activeConfig,
        scenarioId: scenario.id,
        scenarioDescription: scenario.description
      };

      const result = await generator.generateData(config);
      const provClaimNo = result.generatedProvClaimNos?.[0] ?? null;

      if (scenarioConfig.expectGenerationSuccess === false) {
        if (!result.success) {
          console.log(`PASS: ${scenario.id} - generation failed as expected`);
          passed++;
        } else {
          console.error(`FAIL: ${scenario.id} - expected generation to fail`);
          failed++;
        }
        continue;
      }

      if (!result.success) {
        console.error(`FAIL: ${scenario.id} - ${result.message}`);
        failed++;
        continue;
      }

      if (!provClaimNo) {
        console.error(`FAIL: ${scenario.id} - no PROVCLAIMNO returned`);
        failed++;
        continue;
      }

      const activeSession = { dbConfig: activeConfig, providerType: providerChoice };

      const verifyMode = testRuntimeConfig.eventVerifyMode || 'local';
      let verificationRows = [];

      if (verifyMode === 'bridge' && isAuto && scenarioConfig.expectEvent !== false) {
        verificationRows = await waitForEvent(dbAssertions, activeSession, groupName, provClaimNo);
      } else if (verifyMode === 'hybrid' && isAuto && scenarioConfig.expectEvent !== false) {
        verificationRows = await waitForEvent(dbAssertions, activeSession, groupName, provClaimNo);
        if (verificationRows.length === 0) {
          verificationRows = await dbAssertions.verifyEventByProvClaimNo(provClaimNo, groupName, 1);
        }
      } else {
        verificationRows = await dbAssertions.verifyEventByProvClaimNo(provClaimNo, groupName, 1);
      }

      if (scenarioConfig.expectEvent === false) {
        if (verificationRows.length === 0) {
          console.log(`PASS: ${scenario.id} - no event row (expected) PROVCLAIMNO ${provClaimNo}`);
          passed++;
        } else {
          console.error(`FAIL: ${scenario.id} - unexpected event for PROVCLAIMNO ${provClaimNo}`);
          failed++;
        }
      } else if (verificationRows.length > 0) {
        console.log(`PASS: ${scenario.id} - event verified PROVCLAIMNO ${provClaimNo}`);
        passed++;
      } else {
        console.error(`FAIL: ${scenario.id} - event not found for PROVCLAIMNO ${provClaimNo}`);
        failed++;
      }
    }
  }

  console.log('\n--- Generation Complete! ---');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('Run Playwright tests: npm run test');
  await dbAssertions.close();
  rl.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
