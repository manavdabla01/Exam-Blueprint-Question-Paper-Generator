/**
 * worker.scheduler.js
 *
 * A small, generic polling scheduler used by every background worker
 * (processing.worker.js, generation.worker.js). Given a `pollOnce`
 * function that attempts to claim and process a single unit of work
 * (returning `true` if it did work, `false` if there was nothing to do),
 * this module repeatedly drains up to `batchSize` units of work per
 * tick, then sleeps for `pollIntervalMs` before ticking again.
 *
 * Contains no business logic of its own — it only knows how to call
 * `pollOnce` repeatedly and handle timing/errors/shutdown generically,
 * so processing.worker.js and generation.worker.js each supply their own
 * `pollOnce` built entirely from existing services.
 *
 * Reliability: any error thrown by `pollOnce` itself (as opposed to an
 * error in the job it started, which each worker's own `pollOnce` is
 * responsible for catching internally) is caught here and logged —
 * it never stops the scheduler's polling loop.
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Creates a scheduler instance for a single named worker.
 *
 * @param {Object} options
 * @param {string} options.name - Human-readable worker name, used in log lines (e.g. "processing-worker")
 * @param {() => Promise<boolean>} options.pollOnce - Attempts to claim and process one unit of work;
 *   resolves `true` if work was done, `false` if there was nothing to claim
 * @param {number} options.pollIntervalMs - Milliseconds to wait between ticks when idle
 * @param {number} options.batchSize - Maximum units of work to drain in a single tick before sleeping
 * @returns {{ start: () => void, stop: () => Promise<void>, isRunning: () => boolean }}
 */
function createScheduler({ name, pollOnce, pollIntervalMs, batchSize }) {
  let isRunning = false;
  let stopRequested = false;
  let timeoutHandle = null;
  let tickInFlight = null;

  /**
   * Runs a single scheduling tick: attempts up to `batchSize` units of
   * work, logs whether the tick was idle, then schedules the next tick
   * (unless shutdown has been requested).
   *
   * @returns {Promise<void>}
   */
  async function runTick() {
    let processedCount = 0;

    try {
      while (processedCount < batchSize) {
        if (stopRequested) break;

        // eslint-disable-next-line no-await-in-loop
        const didWork = await pollOnce();
        if (!didWork) break;
        processedCount += 1;
      }
    } catch (error) {
      logger.error(`[${name}] Unexpected error during poll tick: ${error.message}`, { stack: error.stack });
    }

    if (processedCount === 0) {
      logger.debug(`[${name}] Idle - no work found this tick`);
    } else {
      logger.info(`[${name}] Tick complete`, { processedCount });
    }

    if (!stopRequested) {
      timeoutHandle = setTimeout(() => {
        tickInFlight = runTick();
      }, pollIntervalMs);
    }
  }

  /**
   * Starts the scheduler: runs an immediate first tick, then continues
   * ticking every `pollIntervalMs` until `stop()` is called. Calling
   * `start()` while already running is a no-op.
   *
   * @returns {void}
   */
  function start() {
    if (isRunning) {
      return;
    }
    isRunning = true;
    stopRequested = false;
    logger.info(`[${name}] Worker started`, { pollIntervalMs, batchSize });
    tickInFlight = runTick();
  }

  /**
   * Stops the scheduler gracefully: prevents any further ticks from
   * being scheduled and waits for the currently in-flight tick (if any)
   * to finish before resolving, so a job is never abandoned mid-write.
   *
   * @returns {Promise<void>}
   */
  async function stop() {
    if (!isRunning) {
      return;
    }
    stopRequested = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (tickInFlight) {
      await tickInFlight;
    }
    isRunning = false;
    logger.info(`[${name}] Worker stopped`);
  }

  return {
    start,
    stop,
    isRunning: () => isRunning,
  };
}

module.exports = {
  createScheduler,
};
