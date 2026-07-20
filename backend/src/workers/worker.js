/**
 * worker.js
 *
 * Background worker process entrypoint. Run as a separate process from
 * the HTTP API server (`node src/workers/worker.js`, or `npm run
 * worker`) — it never listens on a port and shares nothing in-process
 * with the API server, only the same MySQL database.
 *
 * Responsibilities:
 *  - Respect `WORKER_ENABLED`: if false, log and exit cleanly without
 *    starting anything (lets an operator disable the worker via config
 *    alone, e.g. in an environment that only wants the API running).
 *  - Enforce a single running worker instance using a MySQL named
 *    advisory lock (`GET_LOCK`), so accidentally starting two worker
 *    processes against the same database never results in duplicate
 *    concurrent job processing.
 *  - Start the processing and generation schedulers (see
 *    processing.worker.js / generation.worker.js / worker.scheduler.js).
 *  - Handle SIGTERM/SIGINT for graceful shutdown: stop both schedulers
 *    (waiting for any in-flight job to finish), release the advisory
 *    lock, close the database pool, then exit.
 */

'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');
const db = require('../config/database');
const { createScheduler } = require('./worker.scheduler');
const { pollAndProcessOnce } = require('./processing.worker');
const { pollAndGenerateOnce } = require('./generation.worker');

/** Name of the MySQL advisory lock used to enforce a single worker instance. */
const WORKER_LOCK_NAME = 'exam_saas_background_worker';

/** Dedicated connection holding the advisory lock for the lifetime of this process. */
let lockConnection = null;

let processingScheduler = null;
let generationScheduler = null;

/**
 * Attempts to acquire the MySQL named advisory lock that represents
 * "the single running worker instance". The lock is scoped to the
 * MySQL connection that acquires it (not the process), so the
 * connection used here is held open for the entire lifetime of the
 * worker process and is never returned to the pool — if this process
 * crashes or is killed, MySQL automatically releases the lock when the
 * underlying connection drops, so a stale lock can never block a
 * legitimate restart (unlike a PID/file-based lock, which can go stale
 * after an unclean shutdown).
 *
 * @returns {Promise<boolean>} True if the lock was acquired (this is now the sole worker instance)
 */
async function acquireSingleInstanceLock() {
  lockConnection = await db.getConnection();
  const [rows] = await lockConnection.query('SELECT GET_LOCK(?, 0) AS acquired', [WORKER_LOCK_NAME]);
  const acquired = rows[0].acquired === 1;

  if (!acquired) {
    lockConnection.release();
    lockConnection = null;
  }

  return acquired;
}

/**
 * Releases the advisory lock (if held) and returns its connection to
 * the pool.
 *
 * @returns {Promise<void>}
 */
async function releaseSingleInstanceLock() {
  if (!lockConnection) {
    return;
  }
  try {
    await lockConnection.query('SELECT RELEASE_LOCK(?)', [WORKER_LOCK_NAME]);
  } catch (error) {
    logger.warn(`Failed to explicitly release worker lock (connection close will release it anyway): ${error.message}`);
  } finally {
    lockConnection.release();
    lockConnection = null;
  }
}

/**
 * Bootstraps and starts the background worker process.
 *
 * @returns {Promise<void>}
 */
async function startWorker() {
  if (!config.worker.enabled) {
    logger.info('Background worker is disabled via WORKER_ENABLED=false. Exiting.');
    process.exit(0);
    return;
  }

  try {
    await db.initDatabase();

    const lockAcquired = await acquireSingleInstanceLock();
    if (!lockAcquired) {
      logger.warn(
        'Another background worker instance already holds the single-instance lock. This process will exit to avoid duplicate job processing.'
      );
      await db.closePool();
      process.exit(0);
      return;
    }

    logger.info('Background worker single-instance lock acquired', { lockName: WORKER_LOCK_NAME });

    processingScheduler = createScheduler({
      name: 'processing-worker',
      pollOnce: pollAndProcessOnce,
      pollIntervalMs: config.worker.pollIntervalMs,
      batchSize: config.worker.batchSize,
    });

    generationScheduler = createScheduler({
      name: 'generation-worker',
      pollOnce: pollAndGenerateOnce,
      pollIntervalMs: config.worker.pollIntervalMs,
      batchSize: config.worker.batchSize,
    });

    processingScheduler.start();
    generationScheduler.start();

    logger.info('Background worker process fully started', {
      pollIntervalMs: config.worker.pollIntervalMs,
      batchSize: config.worker.batchSize,
    });
  } catch (error) {
    logger.error(`Fatal error during worker startup: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the worker: stops both schedulers (waiting for
 * any in-flight job to finish), releases the single-instance lock, and
 * closes the database pool.
 *
 * @param {string} signal - The OS signal that triggered shutdown
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful worker shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful worker shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 30000);

  try {
    if (processingScheduler) await processingScheduler.stop();
    if (generationScheduler) await generationScheduler.stop();

    await releaseSingleInstanceLock();
    await db.closePool();

    clearTimeout(forceExitTimer);
    logger.info('Background worker shut down gracefully. Exiting process.');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    logger.error(`Error during worker graceful shutdown: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise Rejection in worker: ${reason instanceof Error ? reason.message : reason}`, {
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception in worker: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

startWorker();
