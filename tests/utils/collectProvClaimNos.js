import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Registers a test.afterAll that writes collected provClaimNos to JSON,
 * and returns a collect() function to call inside each positive test.
 *
 * @param {string} claimsJsonPath - absolute path to the aXX-post-claims.json file
 * @returns {(provClaimNo: string) => void}
 */
export function setupClaimCollection(claimsJsonPath) {
  const collected = [];

  test.beforeAll(() => {
    const dir = path.dirname(claimsJsonPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  test.afterAll(() => {
    if (collected.length === 0) return; // Do not modify or overwrite the file if this worker did not collect new claims

    let existing = [];
    try {
      if (fs.existsSync(claimsJsonPath)) {
        const fileContent = fs.readFileSync(claimsJsonPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && Array.isArray(parsed.provClaimNos)) {
          existing = parsed.provClaimNos;
        }
      }
    } catch (err) {
      // Ignore reading issues on fresh file
    }

    const merged = Array.from(new Set([...existing, ...collected]));
    fs.writeFileSync(
      claimsJsonPath,
      JSON.stringify({ provClaimNos: merged }, null, 2)
    );
    console.log(
      `Saved ${collected.length} new provClaimNo(s) (Total: ${merged.length}) to ${path.basename(claimsJsonPath)}`
    );
  });

  return (provClaimNo) => {
    collected.push(provClaimNo);
  };
}
