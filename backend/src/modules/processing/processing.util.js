/**
 * processing.util.js
 *
 * Reusable helpers for the AI processing pipeline. Pure functions only —
 * no SQL, no `req`/`res`, no logging side effects — so they can be used
 * identically by processing.service.js today and by a future background
 * worker / OCR step without modification.
 *
 * Status mapping note: the `source_materials.status` ENUM (fixed by the
 * Task 2 schema) is ('pending', 'processing', 'processed',
 * 'failed_legibility', 'error'). This task's spec describes the pipeline
 * in terms of ('pending', 'processing', 'processed', 'failed'). We map
 * the spec's generic 'failed' onto the schema's 'error' value — 'error'
 * is used for pipeline/processing-level failures (e.g. an exception
 * while processing), while 'failed_legibility' remains reserved for the
 * more specific Claude Vision gatekeeper rejection described in the
 * original product spec (Task 1), implemented in a future task. No new
 * ENUM value is introduced.
 */

'use strict';

const APP_CONSTANTS = require('../../constants/appConstants');

/** Maximum processing attempts before a source material is considered permanently failed. */
const MAX_PROCESSING_ATTEMPTS = 3;

/** Maximum length stored for a failure_reason value (matches the column's VARCHAR(500) limit). */
const MAX_FAILURE_REASON_LENGTH = 500;

/**
 * Whitelist of allowed status transitions. Any transition not listed
 * here is rejected by `isValidTransition`. Kept as an explicit map
 * (rather than inferred logic) so the full state machine is visible at a
 * glance and can't silently grow an unintended edge.
 */
const STATUS_TRANSITIONS = Object.freeze({
  [APP_CONSTANTS.SOURCE_STATUS.PENDING]: [APP_CONSTANTS.SOURCE_STATUS.PROCESSING],
  [APP_CONSTANTS.SOURCE_STATUS.PROCESSING]: [
    APP_CONSTANTS.SOURCE_STATUS.PROCESSED,
    APP_CONSTANTS.SOURCE_STATUS.ERROR,
    APP_CONSTANTS.SOURCE_STATUS.FAILED_LEGIBILITY,
  ],
  // 'processed', 'error', and 'failed_legibility' are terminal states in
  // this pipeline foundation — no further automatic transition is
  // defined out of them. A future retry feature would need to explicitly
  // add e.g. error -> pending here.
});

/**
 * Checks whether transitioning a source material from one status to
 * another is permitted by the pipeline's state machine.
 *
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Desired next status
 * @returns {boolean} True if the transition is allowed
 */
function isValidTransition(fromStatus, toStatus) {
  const allowedNextStates = STATUS_TRANSITIONS[fromStatus];
  return Array.isArray(allowedNextStates) && allowedNextStates.includes(toStatus);
}

/**
 * Determines whether a source material has exhausted its processing
 * attempt budget and should not be retried further.
 *
 * @param {number} attemptsSoFar - Number of processing attempts already recorded
 * @returns {boolean} True if no further attempts should be made
 */
function hasExceededMaxAttempts(attemptsSoFar) {
  return attemptsSoFar >= MAX_PROCESSING_ATTEMPTS;
}

/**
 * Formats an arbitrary error/exception into a safe, bounded string
 * suitable for storage in `source_materials.failure_reason`. Strips
 * newlines (so the reason renders as a single log/DB line) and truncates
 * to the column's maximum length rather than letting a long stack trace
 * or verbose upstream error message overflow storage.
 *
 * @param {Error|string} error - The error or message to format
 * @returns {string} A single-line, length-bounded failure reason
 */
function formatFailureReason(error) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const singleLine = rawMessage.replace(/\s+/g, ' ').trim();
  return singleLine.slice(0, MAX_FAILURE_REASON_LENGTH);
}

/**
 * Builds a plain processing-context object describing everything a
 * (future) processing step needs to know about a source material, in one
 * consistent shape. Centralizing this avoids each caller re-deriving the
 * same fields from a raw repository row in a slightly different way.
 *
 * @param {Object} sourceMaterialRow - Raw row as returned by processing.repository.js
 * @returns {Object} Processing context
 */
function buildProcessingContext(sourceMaterialRow) {
  return {
    sourceMaterialId: sourceMaterialRow.id,
    teacherId: sourceMaterialRow.teacher_id,
    subjectId: sourceMaterialRow.subject_id,
    sourceType: sourceMaterialRow.source_type,
    currentStatus: sourceMaterialRow.status,
    attemptsSoFar: sourceMaterialRow.processing_attempts,
  };
}

module.exports = {
  MAX_PROCESSING_ATTEMPTS,
  MAX_FAILURE_REASON_LENGTH,
  STATUS_TRANSITIONS,
  isValidTransition,
  hasExceededMaxAttempts,
  formatFailureReason,
  buildProcessingContext,
};
