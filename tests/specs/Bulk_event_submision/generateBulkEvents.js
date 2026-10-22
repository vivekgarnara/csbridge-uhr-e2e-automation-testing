import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { DbAssertions } from '../../utils/dbAssertions.js';
import { dbEnvironments, providerTypes } from '../../config/db.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = {};
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count' || argv[i] === '-c') args.count = parseInt(argv[i + 1], 10);
    if (argv[i] === '--event' || argv[i] === '-e') args.event = argv[i + 1];
    if (argv[i] === '--env' || argv[i] === '-d') args.env = argv[i + 1];
    if (argv[i] === '--provider' || argv[i] === '-p') args.provider = argv[i + 1];
  }
  return args;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const askQuestion = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  console.log('--- Bulk Event Generator (ADT, FHIR, CDA) ---');

  const args = parseArgs();
  const dbKeys = Object.keys(dbEnvironments);
  if (dbKeys.length === 0) {
    console.error('[ERROR] No database environments configured.');
    rl.close();
    process.exit(1);
  }

  let envChoice = args.env;
  if (envChoice && !dbKeys.includes(envChoice)) {
    envChoice = dbKeys.find(k => k.toLowerCase() === envChoice.toLowerCase());
  }

  if (!envChoice) {
    if (args.env) {
      console.warn(`[WARNING] Database environment '${args.env}' not found, falling back to interactive selection.`);
    }
    console.log('\nSelect database to connect:');
    dbKeys.forEach((k, i) => console.log(`${i + 1}. ${k}`));
    let dbInput = await askQuestion('\nEnter number (default: 1): ');
    let dbIndex = parseInt(dbInput.trim(), 10) || 1;
    if (dbIndex < 1 || dbIndex > dbKeys.length) dbIndex = 1;
    envChoice = dbKeys[dbIndex - 1];
  }
  const activeConfig = dbEnvironments[envChoice];

  let providerChoice = args.provider;
  if (providerChoice && !providerTypes.includes(providerChoice)) {
    providerChoice = providerTypes.find(pt => pt.toLowerCase() === providerChoice.toLowerCase());
  }
  if (!providerChoice) {
    if (args.provider) {
      console.warn(`[WARNING] Provider Type '${args.provider}' not found, falling back to interactive selection.`);
    }
    console.log('\nSelect Provider Type:');
    providerTypes.forEach((pt, i) => console.log(`${i + 1}. ${pt}`));
    let ptInput = await askQuestion('\nEnter number (default: 1): ');
    let ptIndex = parseInt(ptInput.trim(), 10) || 1;
    if (ptIndex < 1 || ptIndex > providerTypes.length) ptIndex = 1;
    providerChoice = providerTypes[ptIndex - 1];
  }

  let eventType = args.event ? args.event.trim().toUpperCase() : '';
  if (!eventType) {
    console.log('\nSupported Event Types:');
    console.log(' - ADT: A01, A02, A03, A04, A05, A06, A07, A08, A11, A12, A13, A31, A38, A45, A50');
    console.log(' - FHIR: LAB_ORDER, LAB_RESULT, MEDICATION_REQUEST, MEDICATION_DISPENSE, RADIOLOGY_ORDER, RADIOLOGY_RESULT');
    console.log(' - CDA: DISCHARGE_SUMMARY, MATERNAL_DISCHARGE, NEWBORN_DISCHARGE, OPERATIVE_NOTE, OUTPATIENT_ENCOUNTER_SUMMARY');
    
    let evInput = await askQuestion('\nEvent type to generate (default: A01): ');
    eventType = (evInput || 'A01').trim().toUpperCase();
  }

  let count = args.count;
  if (count === undefined || isNaN(count) || count <= 0) {
    if (args.count !== undefined) {
      console.warn(`[WARNING] Invalid count '${args.count}', falling back to interactive prompt.`);
    }
    let countInput = await askQuestion('\nHow many events do you want to generate (e.g. 50000)? ');
    count = parseInt(countInput.trim(), 10) || 0;
    if (count <= 0) {
      console.error('[ERROR] Invalid number of events. Exiting.');
      rl.close();
      process.exit(1);
    }
  }

  rl.close();

  console.log(`\nConnecting to ${envChoice} database at ${activeConfig.host} with provider ${providerChoice}...`);

  // Dynamically import the correct generator based on event type
  let generator;
  const fhirEvents = ['LAB_ORDER', 'LAB_RESULT', 'MEDICATION_REQUEST', 'MEDICATION_DISPENSE', 'RADIOLOGY_ORDER', 'RADIOLOGY_RESULT'];
  const cdaEvents = ['DISCHARGE_SUMMARY', 'MATERNAL_DISCHARGE', 'NEWBORN_DISCHARGE', 'OPERATIVE_NOTE', 'OUTPATIENT_ENCOUNTER_SUMMARY'];

  if (fhirEvents.includes(eventType)) {
    console.log('[INFO] Using FHIR Data Generator.');
    const { FhirDataGenerator } = await import('../../../src/core/generators/fhirDataGenerator.js');
    generator = new FhirDataGenerator(activeConfig, providerChoice);
  } else if (cdaEvents.includes(eventType)) {
    console.log('[INFO] Using CDA Data Generator.');
    const { CdaDataGenerator } = await import('../../../src/core/generators/cdaDataGenerator.js');
    generator = new CdaDataGenerator(activeConfig);
    generator.providerType = providerChoice;
  } else {
    console.log('[INFO] Using ADT Data Generator.');
    const { DataGenerator } = await import('../../../src/core/generators/adtDataGenerator.js');
    generator = new DataGenerator(activeConfig, providerChoice);
  }

  const dbAssertions = new DbAssertions(activeConfig, providerChoice);

  const isConnected = await generator.testConnection();
  if (!isConnected) {
    console.error(`[ERROR] Failed to connect to ${envChoice}.`);
    process.exit(1);
  }

  await dbAssertions.connect();
  console.log(`[SUCCESS] Connected to ${envChoice} database.`);

  const activeDbPath = path.resolve(__dirname, '../../config/activeDb.json');
  const activeSessionData = { dbConfig: activeConfig, providerType: providerChoice };
  fs.writeFileSync(activeDbPath, JSON.stringify(activeSessionData, null, 2));
  console.log(`Saved active DB config and Provider Type to ${activeDbPath}`);

  console.log(`\nStarting generation of ${count} ${eventType} events...`);

  try {
    const config = {
      numberOfEvents: count,
      eventTypes: [eventType],
      providerType: providerChoice,
      dbConfig: activeConfig,
      scenarioDescription: `Bulk insert ${count} ${eventType}`
    };

    const result = await generator.generateData(config);

    console.log('\n--- Bulk Generation Result ---');
    console.log(`Success: ${result.success}`);
    console.log(result.message || 'No message');
    console.log(`Events created: ${result.eventsCreated ?? 'unknown'}`);

    if (result.success && result.generatedProvClaimNos && result.generatedProvClaimNos.length > 0) {
      const bulkDir = path.resolve(process.cwd(), 'test_data/claims/Bulk');
      if (!fs.existsSync(bulkDir)) {
        fs.mkdirSync(bulkDir, { recursive: true });
      }
      const bulkFile = path.join(bulkDir, `bulk-${eventType.toLowerCase()}-claims.json`);
      if (fs.existsSync(bulkFile)) {
        fs.unlinkSync(bulkFile);
      }
      fs.writeFileSync(
        bulkFile,
        JSON.stringify({ provClaimNos: result.generatedProvClaimNos }, null, 2)
      );
      console.log(`[SUCCESS] Saved ${result.generatedProvClaimNos.length} provClaimNo(s) to ${bulkFile}`);
    }

  } catch (err) {
    console.error('Fatal error during bulk generation:', err);
  } finally {
    await dbAssertions.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
