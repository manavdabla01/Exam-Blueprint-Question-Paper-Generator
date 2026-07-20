/**
 * generation.worker.js
 *
 * Background worker that continuously polls for queued generated exams
 * and runs them through the existing AI generation pipeline. Contains NO
 * business logic of its own — every step (claiming, loading the
 * blueprint/source content, calling Claude, validating, persisting) is
 * delegated entirely to generation.service.js, the same service the HTTP
 * layer uses via `POST /generated-exams/:id/generate`.
 *
 * Claiming strategy mirrors processing.worker.js exactly:
 * `generatedExam.repository.js`'s `findNextQueuedForUpdate` is used only
 * to identify the next candidate row via a short-lived read-only
 * transaction; the actual claim (queued -> generating, under its own row
 * lock) is performed by `generationService.runGenerationPipeline`. Safe
 * under the single-worker-instance guarantee enforced by worker.js.
 */

'use strict';

const db = require('../config/database');
const logger = require('../utils/logger');
const generatedExamRepository = require('../modules/examGenerator/generatedExam.repository');
const generationService = require('../modules/examGenerator/generation.service');

/**
 * Identifies the next globally queued generated exam, if any, via a
 * short-lived transaction that only reads and immediately commits.
 *
 * @returns {Promise<Object|null>} A minimal candidate row ({ id, public_id, teacher_id }), or null if none queued
 */
async function findNextCandidate() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const candidate = await generatedExamRepository.findNextQueuedForUpdate(connection);
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
 * Attempts to claim and fully generate exactly one queued exam. Resolves
 * `true` if a candidate was found and attempted (whether generation
 * ultimately succeeded or failed), or `false` if there was no queued
 * work at all.
 *
 * A failure while generating the claimed job is caught and logged here
 * so it never propagates up and stops the scheduler.
 *
 * @returns {Promise<boolean>} True if a job was found and attempted, false if idle
 */
async function pollAndGenerateOnce() {
  const candidate = await findNextCandidate();

  if (!candidate) {
    return false;
  }

  logger.info('[generation-worker] Job started', {
    generatedExamId: candidate.id,
    teacherId: candidate.teacher_id,
  });

  try {
    const finalState = await generationService.runGenerationPipeline(candidate.teacher_id, candidate.public_id);

    logger.info('[generation-worker] Job completed', {
      generatedExamId: candidate.id,
      status: finalState.status,
    });
  } catch (error) {
    logger.warn(`[generation-worker] Job failed: ${error.message}`, {
      generatedExamId: candidate.id,
      teacherId: candidate.teacher_id,
    });
  }

  return true;
}

module.exports = {
  pollAndGenerateOnce,
};
