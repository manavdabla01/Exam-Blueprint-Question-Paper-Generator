/**
 * transcription.mapper.js
 *
 * Converts a raw `transcriptions` row into the shape safe to return over
 * the API. Excludes internal auto-increment ids.
 */

'use strict';

/**
 * @param {Object} row - Raw row as returned by ai.repository.js
 * @returns {Object} Public-safe transcription representation
 */
function toPublicTranscription(row) {
  return {
    transcribedText: row.transcribed_text,
    language: row.language,
    confidenceScore: row.legibility_score,
    status: row.gatekeeper_status,
    selfCorrectionAttempted: Boolean(row.self_correction_attempted),
    processingDurationMs: row.processing_duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  toPublicTranscription,
};
