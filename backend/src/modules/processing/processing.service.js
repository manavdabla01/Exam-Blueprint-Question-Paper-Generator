/**
 * processing.service.js
 *
 * Business logic for the AI processing pipeline foundation. This module
 * claims a source material for processing and enforces the pipeline's
 * state machine (see processing.util.js STATUS_TRANSITIONS). It does NOT
 * perform any actual OCR/transcription/Claude call — that is explicitly
 * out of scope for this task. `startProcessing` currently claims the
 * item (pending -> processing) and returns; a future task will call
 * `completeProcessing`/`failProcessing` once real extraction logic
 * exists to drive the terminal transition.
 *
 * Concurrency: claiming is done inside a single transaction using a row
 * lock (`SELECT ... FOR UPDATE`), so two simultaneous requests to start
 * processing the same source material cannot both succeed — the second
 * one's status check will see 'processing' (not 'pending') once the
 * first transaction commits, and will be rejected with a ConflictError.
 */

'use strict';

const processingRepository = require('./processing.repository');
const { toPublicProcessingState } = require('./processing.mapper');
const {
  isValidTransition,
  hasExceededMaxAttempts,
  formatFailureReason,
  buildProcessingContext,
} = require('./processing.util');

const db = require('../../config/database');
const logger = require('../../utils/logger');
const NotFoundError = require('../../utils/errors/NotFoundError');
const ConflictError = require('../../utils/errors/ConflictError');
const APP_CONSTANTS = require('../../constants/appConstants');

/**
 * Starts processing for a single source material: validates ownership
 * and current status, then atomically transitions it from 'pending' to
 * 'processing' under a row lock so duplicate concurrent starts are
 * impossible.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} sourceMaterialPublicId - Source material's public UUID
 * @returns {Promise<Object>} The updated processing state in its public shape
 * @throws {NotFoundError} If the source material does not exist or is not owned by this teacher
 * @throws {ConflictError} If the source material is not currently 'pending'
 *   (already processing, already processed, or in a failure state)
 */
async function startProcessing(teacherId, sourceMaterialPublicId) {
  logger.info('Source material queued for processing', {
    teacherId,
    sourceMaterialPublicId,
  });

  const connection = await db.getConnection();
  let lockedRow;

  try {
    await connection.beginTransaction();

    lockedRow = await processingRepository.findByPublicIdForUpdate(connection, teacherId, sourceMaterialPublicId);

    if (!lockedRow) {
      await connection.rollback();
      throw new NotFoundError('Source material not found');
    }

    if (!isValidTransition(lockedRow.status, APP_CONSTANTS.SOURCE_STATUS.PROCESSING)) {
      await connection.rollback();

      if (lockedRow.status === APP_CONSTANTS.SOURCE_STATUS.PROCESSING) {
        throw new ConflictError('This source material is already being processed');
      }
      if (lockedRow.status === APP_CONSTANTS.SOURCE_STATUS.PROCESSED) {
        throw new ConflictError('This source material has already been processed');
      }
      throw new ConflictError(`This source material cannot be processed from its current status (${lockedRow.status})`);
    }

    if (hasExceededMaxAttempts(lockedRow.processing_attempts)) {
      await connection.rollback();
      throw new ConflictError('This source material has exceeded the maximum number of processing attempts');
    }

    await processingRepository.markProcessing(connection, lockedRow.id);

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error(`Rollback failed during processing claim: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    connection.release();
  }

  logger.info('Source material processing started', buildProcessingContext(lockedRow));

  const updatedRow = await processingRepository.findByIdForOwner(teacherId, lockedRow.id);
  return toPublicProcessingState(updatedRow);
}

/**
 * Marks a source material as successfully processed. Not yet wired to
 * any route in this task (no OCR step exists to call it) — provided as
 * the completion half of the state machine for a future processing task
 * to invoke once real extraction succeeds.
 *
 * @param {number} teacherId - Internal auto-increment id of the owning teacher
 * @param {number} sourceMaterialId - Internal auto-increment source material id
 * @returns {Promise<Object>} The updated processing state in its public shape
 * @throws {NotFoundError} If the source material does not exist or is not owned by this teacher
 * @throws {ConflictError} If the source material is not currently 'processing'
 */
async function completeProcessing(teacherId, sourceMaterialId) {
  const row = await processingRepository.findByIdForOwner(teacherId, sourceMaterialId);
  if (!row) {
    throw new NotFoundError('Source material not found');
  }
  if (!isValidTransition(row.status, APP_CONSTANTS.SOURCE_STATUS.PROCESSED)) {
    throw new ConflictError(`Cannot mark as processed from status (${row.status})`);
  }

  await processingRepository.markProcessed(sourceMaterialId);

  logger.info('Source material processing completed', buildProcessingContext(row));

  const updatedRow = await processingRepository.findByIdForOwner(teacherId, sourceMaterialId);
  return toPublicProcessingState(updatedRow);
}

/**
 * Marks a source material as failed, recording a formatted failure
 * reason. Not yet wired to any route in this task — provided as the
 * failure half of the state machine for a future processing task.
 *
 * @param {number} teacherId - Internal auto-increment id of the owning teacher
 * @param {number} sourceMaterialId - Internal auto-increment source material id
 * @param {Error|string} error - The error that caused processing to fail
 * @param {string} [failureStatus] - Which failure status to record ('error' | 'failed_legibility')
 * @returns {Promise<Object>} The updated processing state in its public shape
 * @throws {NotFoundError} If the source material does not exist or is not owned by this teacher
 * @throws {ConflictError} If the source material is not currently 'processing'
 */
async function failProcessing(teacherId, sourceMaterialId, error, failureStatus = APP_CONSTANTS.SOURCE_STATUS.ERROR) {
  const row = await processingRepository.findByIdForOwner(teacherId, sourceMaterialId);
  if (!row) {
    throw new NotFoundError('Source material not found');
  }
  if (!isValidTransition(row.status, failureStatus)) {
    throw new ConflictError(`Cannot mark as failed from status (${row.status})`);
  }

  const reason = formatFailureReason(error);
  await processingRepository.markFailed(sourceMaterialId, failureStatus, reason);

  logger.warn('Source material processing failed', {
    ...buildProcessingContext(row),
    failureReason: reason,
  });

  const updatedRow = await processingRepository.findByIdForOwner(teacherId, sourceMaterialId);
  return toPublicProcessingState(updatedRow);
}

module.exports = {
  startProcessing,
  completeProcessing,
  failProcessing,
};
