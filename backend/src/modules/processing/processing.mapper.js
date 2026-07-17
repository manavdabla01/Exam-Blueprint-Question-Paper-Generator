/**
 * processing.mapper.js
 *
 * Converts a raw source_materials row (as returned by
 * processing.repository.js) into the processing-state shape safe to
 * return over the API. Excludes internal auto-increment ids and any
 * field not relevant to processing status.
 */

'use strict';

/**
 * @param {Object} row - Raw row as returned by processing.repository.js
 * @returns {{ id: string, status: string, processingStartedAt: Date|null,
 *   processingCompletedAt: Date|null, processingAttempts: number, failureReason: string|null }}
 */
function toPublicProcessingState(row) {
  return {
    id: row.public_id,
    status: row.status,
    processingStartedAt: row.processing_started_at,
    processingCompletedAt: row.processing_completed_at,
    processingAttempts: row.processing_attempts,
    failureReason: row.failure_reason,
  };
}

module.exports = {
  toPublicProcessingState,
};
