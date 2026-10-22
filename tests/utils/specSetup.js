import fs from 'fs';
import path from 'path';
import { testRuntimeConfig } from '../config/test.config.js';

/**
 * Load active session by resolving activeDb.json relative to a spec file's directory.
 * Spec files live at tests/specs/<AXX>/, so two levels up reaches tests/config/.
 *
 * @param {string} specDir - __dirname of the calling spec file
 */
export function loadActiveSession(specDir) {
  const activeDbPath = path.resolve(specDir, '../../config/activeDb.json');
  return loadActiveSessionFromPath(activeDbPath);
}

/**
 * Load active session from an explicit absolute path to activeDb.json.
 * Use this from fixture files or any location where specDir is not meaningful.
 *
 * @param {string} absoluteDbJsonPath - Absolute path to activeDb.json
 */
export function loadActiveSessionFromPath(absoluteDbJsonPath) {
  if (!fs.existsSync(absoluteDbJsonPath)) {
    throw new Error(
      `activeDb.json not found at: ${absoluteDbJsonPath}. Run: npm run seed`
    );
  }
  return JSON.parse(fs.readFileSync(absoluteDbJsonPath, 'utf8'));
}

export function validateAutoModeSession(activeSession) {
  const provider = (activeSession.providerType || '').toLowerCase();
  if (!provider.endsWith('_auto')) {
    console.warn(
      `Warning: providerType is "${activeSession.providerType}". ` +
        `Full pipeline tests expect "default_auto" with CS Bridge running.`
    );
  }
  if (testRuntimeConfig.skipBridgePoll) {
    console.warn('SKIP_BRIDGE_POLL=1 — event table polling is disabled.');
  }
}
