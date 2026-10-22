import fs from 'fs';
import path from 'path';
import { DbAssertions } from '../utils/dbAssertions.js';
import { dbEnvironments } from './db.config.js';

/**
 * Probe a single DB connection and return its status.
 * Never throws — failures are captured as { ok: false, error }.
 *
 * @param {string} label      - Human-readable name shown in the log
 * @param {object} dbConfig   - Connection config (type, host, port, …)
 * @param {string} providerType
 * @returns {Promise<{ ok: boolean, label: string, error?: Error }>}
 */
async function probeConnection(label, dbConfig, providerType = 'default') {
  const db = new DbAssertions(dbConfig, providerType);
  try {
    await db.connect();
    const probe = dbConfig.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1';
    await db.query(probe);
    console.log(`${label} — ${dbConfig.type} @ ${dbConfig.host}:${dbConfig.port} — Connected`);
    return { ok: true, label };
  } catch (err) {
    console.error(`${label} — ${dbConfig.type} @ ${dbConfig.host}:${dbConfig.port} — FAILED: ${err.message}`);
    return { ok: false, label, error: err };
  } finally {
    await db.close();
  }
}

function detectSpecType() {
  const args = process.argv.join(' ');
  if (/conformance/i.test(args)) return 'conformance';
  if (/(-post|-validation)\.spec\.(js|ts)/i.test(args)) return 'post';
  return 'oracle';
}

async function globalSetup(config) {
  const specType = detectSpecType();
  console.log(`Global Setup: Verifying Database Connections [mode: ${specType}]`);

  // Clear any existing claims JSON files under test_data/claims/ to start fresh for this test run
  const claimsDir = path.resolve(process.cwd(), 'test_data/claims');
  if (fs.existsSync(claimsDir)) {
    const clearClaimsJsonFiles = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          clearClaimsJsonFiles(fullPath);
        } else if (file.endsWith('.json')) {
          try {
            fs.writeFileSync(fullPath, JSON.stringify({ provClaimNos: [] }, null, 2));
            console.log(`Global Setup: Cleared claims file ${path.relative(process.cwd(), fullPath)}`);
          } catch (err) {
            console.error(`Global Setup: Failed to clear ${fullPath}:`, err.message);
          }
        }
      }
    };
    clearClaimsJsonFiles(claimsDir);
  }

  const checks = [];

  if (specType === 'oracle') {
    // ── Oracle only — used by A01.spec.js, A02.spec.js, … ──
    const activeDbPath = path.resolve(process.cwd(), 'tests/config/activeDb.json');
    if (fs.existsSync(activeDbPath)) {
      const activeSession = JSON.parse(fs.readFileSync(activeDbPath, 'utf8'));
      checks.push(
        probeConnection(
          'Oracle Local (framework specs)',
          activeSession.dbConfig,
          activeSession.providerType || 'default'
        )
      );
    } else {
      console.warn('activeDb.json not found — Oracle check skipped. Run: npm run seed');
    }
  } else if (specType === 'conformance') {
    // ── Conformance mode — check BOTH local active DB and QA DB ──
    const activeDbPath = path.resolve(process.cwd(), 'tests/config/activeDb.json');
    if (fs.existsSync(activeDbPath)) {
      const activeSession = JSON.parse(fs.readFileSync(activeDbPath, 'utf8'));
      checks.push(
        probeConnection(
          'Local Active DB (activeDb.json)',
          activeSession.dbConfig,
          activeSession.providerType || 'default'
        )
      );
    } else {
      console.warn('activeDb.json not found — Local Active DB check skipped.');
    }

    const targetDbPath = path.resolve(process.cwd(), 'tests/config/targetDb.json');
    if (fs.existsSync(targetDbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(targetDbPath, 'utf8'));
        if (data && data.dbConfig) {
          checks.push(
            probeConnection(
              'QA/Target DB (targetDb.json)',
              data.dbConfig
            )
          );
        }
      } catch (err) {
        console.warn('Error reading targetDb.json:', err.message);
      }
    } else {
      console.warn('targetDb.json not found — QA/Target DB check skipped.');
    }
  } else {
    // ── PostgreSQL only — used by A01-post.spec.js, A02-post.spec.js, … ──
    const targetDbPath = path.resolve(process.cwd(), 'tests/config/targetDb.json');
    let targetConfig = dbEnvironments.qaPostgres;
    let label = 'PostgreSQL QA CSBRIDGE_QA (post specs)';

    if (fs.existsSync(targetDbPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(targetDbPath, 'utf8'));
        if (data && data.dbConfig) {
          targetConfig = data.dbConfig;
          label = `PostgreSQL Target DB [${targetConfig.database}] (post specs)`;
        }
      } catch (err) {
        console.warn('Error reading targetDb.json:', err.message);
      }
    }

    checks.push(
      probeConnection(
        label,
        targetConfig
      )
    );
  }

  // Run probes — one per spec type
  const results = await Promise.all(checks);
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  if (passed.length === 0) {
    console.error('All database connections failed. Halting test suite.');
    throw new Error(
      `All database connections failed: ${failed.map(f => f.label).join(', ')}`
    );
  }

  if (failed.length > 0) {
    console.warn(
      `${failed.length} connection(s) unavailable: ${failed.map(f => f.label).join(', ')}`
    );
    console.warn('Tests that depend on the unavailable DB(s) will fail at runtime.');
  }

  console.log(`Global Setup complete — ${passed.length}/${results.length} DB(s) ready.`);
}

export default globalSetup;

