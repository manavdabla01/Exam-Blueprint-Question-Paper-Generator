/**
 * ai.repository.js
 *
 * Data-access layer for the `transcriptions` table. Every read that
 * needs to enforce tenant ownership joins through `source_materials` to
 * check `teacher_id`, since `transcriptions` itself has no teacher_id
 * column (it is owned indirectly via `source_material_id`). All queries
 * are parameterized.
 */

'use strict';

const db = require('../../config/database');

/**
 * Inserts a new transcription record for a source material. A source
 * material may be re-processed (e.g. after a future manual retry
 * feature), in which case this simply inserts another row — the
 * `transcriptions.source_material_id` UNIQUE constraint from the Task 2
 * schema means a second insert for the same source material will fail
 * with a duplicate-key error; callers processing a genuine retry should
 * use `upsertForSourceMaterial` instead (see below) rather than calling
 * `insert` a second time for the same source material.
 *
 * @param {Object} data
 * @param {number} data.sourceMaterialId - Internal auto-increment source_materials id
 * @param {string|null} data.transcribedText - The transcription result, or null if never legibly produced
 * @param {number|null} data.legibilityScore - Confidence score (0.0-1.0) as self-reported by Claude
 * @param {string} data.gatekeeperStatus - One of 'passed' | 'failed' | 'pending_review'
 * @param {boolean} data.selfCorrectionAttempted - Whether the one-shot self-correction pass was run
 * @param {string} data.claudeModelUsed - The Claude model identifier used for this transcription
 * @param {string|null} [data.language] - ISO 639-1 language code, if determined
 * @param {number|null} [data.processingDurationMs] - Total processing duration in milliseconds
 * @returns {Promise<number>} The internal auto-increment id of the newly created row
 */
async function insert({
  sourceMaterialId,
  transcribedText,
  legibilityScore,
  gatekeeperStatus,
  selfCorrectionAttempted,
  claudeModelUsed,
  language = null,
  processingDurationMs = null,
}) {
  const sql = `
    INSERT INTO transcriptions
      (source_material_id, transcribed_text, language, processing_duration_ms,
       legibility_score, gatekeeper_status, self_correction_attempted, claude_model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [
    sourceMaterialId,
    transcribedText,
    language,
    processingDurationMs,
    legibilityScore,
    gatekeeperStatus,
    selfCorrectionAttempted ? 1 : 0,
    claudeModelUsed,
  ]);
  return result.insertId;
}

/**
 * Inserts a transcription row for a source material, or updates the
 * existing one if a transcription already exists for it (honoring the
 * `transcriptions.source_material_id` UNIQUE constraint). Used so a
 * source material can be reprocessed without accumulating duplicate
 * transcription history rows.
 *
 * @param {Object} data - Same shape as `insert`
 * @returns {Promise<void>}
 */
async function upsertForSourceMaterial(data) {
  const sql = `
    INSERT INTO transcriptions
      (source_material_id, transcribed_text, language, processing_duration_ms,
       legibility_score, gatekeeper_status, self_correction_attempted, claude_model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      transcribed_text = VALUES(transcribed_text),
      language = VALUES(language),
      processing_duration_ms = VALUES(processing_duration_ms),
      legibility_score = VALUES(legibility_score),
      gatekeeper_status = VALUES(gatekeeper_status),
      self_correction_attempted = VALUES(self_correction_attempted),
      claude_model_used = VALUES(claude_model_used)
  `;
  await db.query(sql, [
    data.sourceMaterialId,
    data.transcribedText,
    data.language || null,
    data.processingDurationMs || null,
    data.legibilityScore,
    data.gatekeeperStatus,
    data.selfCorrectionAttempted ? 1 : 0,
    data.claudeModelUsed,
  ]);
}

/**
 * Finds the transcription for a source material, scoped to the owning
 * teacher via a join through `source_materials`. Returns null both when
 * no transcription exists yet and when the source material is not owned
 * by this teacher (or does not exist).
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} sourceMaterialPublicId - Source material's public UUID
 * @returns {Promise<Object|null>} Transcription row, or null if not found/not owned
 */
async function findBySourceMaterialPublicId(teacherId, sourceMaterialPublicId) {
  const sql = `
    SELECT t.id, t.source_material_id, t.transcribed_text, t.language, t.processing_duration_ms,
           t.legibility_score, t.gatekeeper_status, t.self_correction_attempted, t.claude_model_used,
           t.created_at, t.updated_at
    FROM transcriptions t
    INNER JOIN source_materials sm ON sm.id = t.source_material_id
    WHERE sm.public_id = ? AND sm.teacher_id = ? AND sm.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [sourceMaterialPublicId, teacherId]);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  insert,
  upsertForSourceMaterial,
  findBySourceMaterialPublicId,
};
