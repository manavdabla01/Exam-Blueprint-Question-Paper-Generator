/**
 * processing.worker.js
 *
 * Background worker that continuously polls for pending source
 * materials and runs them through the existing processing/OCR pipeline.
 * Contains NO business logic of its own — every step (claiming,
 * preprocessing, Claude OCR, status transitions) is delegated entirely
 * to the same services the HTTP layer uses
 * (processing.service.js + ai.service.js), so a source material behaves
 * identically whether it was picked up by a teacher manually hitting
 * `POST /processing/:id/start` or by this worker running unattended.
 *
 * Claiming strategy: `processing.repository.js`'s
 * `findNextPendingForUpdate` (added in the Processing Module task
 * specifically for this purpose) is used only to IDENTIFY the next
 * candidate row — that lookup's own short-lived transaction commits
 * immediately after reading, without transitioning any status itself.
 * The actual claim (pending -> processing, under its own row lock) is
 * then performed by `processingService.startProcessing`, exactly as the
 * HTTP controller does. This two-step approach is safe specifically
 * because the scheduler guarantees a single worker instance (see
 * worker.js's MySQL advisory lock) — there is no second poller that
 * could race for the same row between the two steps.
 */

'use strict';

const db = require('../config/database');
const logger = require('../utils/logger');
const processingRepository = require('../modules/processing/processing.repository');
const processingService = require('../modules/processing/processing.service');
const aiService = require('../modules/ai/ai.service');

/**
 * Identifies the next globally pending source material, if any, via a
 * short-lived transaction that only reads and immediately commits (it
 * does not itself transition any status).
 *
 * @returns {Promise<Object|null>} A minimal candidate row ({ id, public_id, teacher_id }), or null if none pending
 */
async function findNextCandidate() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const candidate = await processingRepository.findNextPendingForUpdate(connection);
    await connection.commit();
    return candidate;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Attempts to claim and fully process exactly one pending source
 * material. Resolves `true` if a candidate was found and processed
 * (regardless of whether processing ultimately succeeded or failed —
 * both are legitimate terminal outcomes for that one job), or `false`
 * if there was no pending work at all.
 *
 * A failure while processing the claimed job is caught and logged here
 * so it never propagates up and stops the scheduler — per-job failure
 * is expected, routine behavior for a long-running worker.
 *
 * @returns {Promise<boolean>} True if a job was found and attempted, false if idle
 */
async function pollAndProcessOnce() {
  const candidate = await findNextCandidate();

  if (!candidate) {
    return false;
  }

  logger.info('[processing-worker] Job started', {
    sourceMaterialId: candidate.id,
    teacherId: candidate.teacher_id,
  });

  try {
    await processingService.startProcessing(candidate.teacher_id, candidate.public_id);
    const finalState = await aiService.runOcrPipeline(candidate.teacher_id, candidate.public_id);

    logger.info('[processing-worker] Job completed', {
      sourceMaterialId: candidate.id,
      status: finalState.status,
    });
  } catch (error) {
    logger.warn(`[processing-worker] Job failed: ${error.message}`, {
      sourceMaterialId: candidate.id,
      teacherId: candidate.teacher_id,
    });
  }

  return true;
}

module.exports = {
  pollAndProcessOnce,
};
