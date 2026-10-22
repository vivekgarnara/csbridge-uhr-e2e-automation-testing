/**
 * polling.service.js
 *
 * Generic async polling utility for UHR automation.
 *
 * Healthcare pipelines are asynchronous — the desktop app polls every ~30 s,
 * HL7 transformation adds latency, and NPHIES submission is not instant.
 * This service provides a reusable, configurable mechanism for waiting on
 * any async condition without using page.waitForTimeout().
 */

export class PollingService {
  /**
   * @param {object} [defaults]
   * @param {number} [defaults.timeout=120000]   max wait in ms (default 2 min)
   * @param {number} [defaults.interval=5000]    polling interval in ms (default 5 s)
   */
  constructor(defaults = {}) {
    this.defaultTimeout  = defaults.timeout  ?? Number(process.env.POLLING_TIMEOUT  ?? 120_000);
    this.defaultInterval = defaults.interval ?? Number(process.env.POLLING_INTERVAL ??   5_000);
  }

  // -------------------------------------------------------------------------
  // Core method
  // -------------------------------------------------------------------------

  /**
   * Poll until `conditionFn` returns a truthy value or `timeout` is reached.
   *
   * @template T
   * @param {() => Promise<T>}  conditionFn   - async function; truthy return = success
   * @param {object}            [options]
   * @param {number}            [options.timeout]    - override default timeout
   * @param {number}            [options.interval]   - override default interval
   * @param {string}            [options.label]      - description for log messages
   * @param {(attempt: number, elapsed: number) => void} [options.onTick]
   *   - optional callback on every poll attempt (useful for progress logging)
   * @returns {Promise<T>}  the first truthy value returned by conditionFn
   * @throws  {Error}       if timeout is reached without a truthy result
   */
  async waitForCondition(conditionFn, options = {}) {
    const timeout  = options.timeout  ?? this.defaultTimeout;
    const interval = options.interval ?? this.defaultInterval;
    const label    = options.label    ?? 'condition';
    const onTick   = options.onTick   ?? null;

    const start   = Date.now();
    let   attempt = 0;

    while (true) {
      attempt++;
      const elapsed = Date.now() - start;

      if (onTick) {
        onTick(attempt, elapsed);
      } else {
        console.log(
          `[Polling] Waiting for "${label}" — attempt ${attempt}, elapsed ${(elapsed / 1000).toFixed(1)}s`
        );
      }

      try {
        const result = await conditionFn();
        if (result) {
          console.log(
            `[Polling] "${label}" satisfied on attempt ${attempt} (${(elapsed / 1000).toFixed(1)}s)`
          );
          return result;
        }
      } catch (err) {
        // Surface the error only on the last attempt so transient errors
        // (e.g. DB not yet ready) don't abort the poll prematurely.
        const remaining = timeout - (Date.now() - start);
        if (remaining <= interval) {
          throw new Error(
            `[Polling] "${label}" threw on final attempt: ${err.message}`
          );
        }
        console.warn(`[Polling] "${label}" threw (will retry): ${err.message}`);
      }

      if (Date.now() - start + interval >= timeout) {
        throw new Error(
          `[Polling] Timed out waiting for "${label}" after ${(timeout / 1000).toFixed(0)}s`
        );
      }

      await this.#sleep(interval);
    }
  }

  // -------------------------------------------------------------------------
  // Convenience wrappers
  // -------------------------------------------------------------------------

  /**
   * Poll for a non-empty array returned by `queryFn`.
   * Sugar over `waitForCondition` for the common DB-row pattern.
   *
   * @param {() => Promise<any[]>} queryFn
   * @param {object}  [options]   - same as waitForCondition options
   * @returns {Promise<any[]>}    the first non-empty result set
   */
  async waitForRows(queryFn, options = {}) {
    return this.waitForCondition(
      async () => {
        const rows = await queryFn();
        return rows?.length > 0 ? rows : null;
      },
      { label: 'DB rows', ...options }
    );
  }

  /**
   * Retry an async action up to `maxAttempts` times with `delayMs` between
   * attempts.  Useful for one-off retries (e.g. on transient network errors)
   * rather than indefinite polling.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @param {object}  [options]
   * @param {number}  [options.maxAttempts=3]
   * @param {number}  [options.delayMs=2000]
   * @param {string}  [options.label='action']
   * @returns {Promise<T>}
   */
  async retry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;
    const delayMs     = options.delayMs     ?? 2_000;
    const label       = options.label       ?? 'action';

    let lastErr;
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        console.warn(`[Polling] "${label}" attempt ${i}/${maxAttempts} failed: ${err.message}`);
        if (i < maxAttempts) await this.#sleep(delayMs);
      }
    }

    throw new Error(
      `[Polling] "${label}" failed after ${maxAttempts} attempts. Last error: ${lastErr?.message}`
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** @param {number} ms */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
