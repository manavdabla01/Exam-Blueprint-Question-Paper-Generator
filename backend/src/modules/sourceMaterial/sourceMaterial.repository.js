/**
 * sourceMaterial.repository.js
 *
 * Data-access layer for the `source_materials` table (metadata only —
 * this task does not implement file upload/storage). Every query is
 * scoped by `teacher_id`; the `teacher_id` column is denormalized onto
 * this table (per the Task 2 schema decision) specifically so this
 * repository never needs to join through `subjects` to enforce tenant
 * isolation. All queries are parameterized.
 */

'use strict';

const db = require('../../config/database');

const SORTABLE_COLUMNS = Object.freeze({
  title: 'title',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/**
 * Inserts a new source material metadata row. Supports both text-content
 * sources (raw_text_content populated, file fields null) and file-based
 * sources (original_filename/file_path/file_size_bytes/mime_type
 * populated, raw_text_content null).
 *
 * @param {Object} data
 * @param {number} data.teacherId - Internal auto-increment teacher id (denormalized owner)
 * @param {number} data.subjectId - Internal auto-increment subject id this source belongs to
 * @param {string} data.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} data.sourceType - One of the source_type ENUM values: 'text' | 'file' | 'image'
 * @param {string|null} data.title - Human-facing title for the source material
 * @param {string|null} data.description - Optional longer description
 * @param {string|null} [data.rawTextContent] - Raw pasted text content (only for source_type = 'text')
 * @param {string|null} [data.originalFilename] - Client-supplied original filename (file/image only)
 * @param {string|null} [data.filePath] - Path relative to the upload root where the file is stored (file/image only)
 * @param {number|null} [data.fileSizeBytes] - File size in bytes (file/image only)
 * @param {string|null} [data.mimeType] - Claimed MIME type of the uploaded file (file/image only)
 * @param {string} data.status - One of the source_status ENUM values (see appConstants.SOURCE_STATUS)
 * @returns {Promise<number>} The internal auto-increment id of the newly created row
 */
async function create({
  teacherId,
  subjectId,
  publicId,
  sourceType,
  title,
  description,
  rawTextContent = null,
  originalFilename = null,
  filePath = null,
  fileSizeBytes = null,
  mimeType = null,
  status,
}) {
  const sql = `
    INSERT INTO source_materials
      (public_id, teacher_id, subject_id, source_type, title, description, raw_text_content,
       original_filename, file_path, file_size_bytes, mime_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [
    publicId,
    teacherId,
    subjectId,
    sourceType,
    title,
    description,
    rawTextContent,
    originalFilename,
    filePath,
    fileSizeBytes,
    mimeType,
    status,
  ]);
  return result.insertId;
}

/**
 * Finds a single source material by its public_id, scoped to the owning
 * teacher. Returns null both when it does not exist and when it belongs
 * to a different teacher.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Source material's public UUID
 * @returns {Promise<Object|null>} Source material row, or null if not found/not owned/deleted
 */
async function findByPublicId(teacherId, publicId) {
  const sql = `
    SELECT sm.id, sm.public_id, sm.teacher_id, sm.subject_id, sub.public_id AS subject_public_id,
           sm.source_type, sm.title, sm.description, sm.original_filename, sm.file_path,
           sm.file_size_bytes, sm.mime_type, sm.raw_text_content, sm.status, sm.created_at, sm.updated_at
    FROM source_materials sm
    INNER JOIN subjects sub ON sub.id = sm.subject_id
    WHERE sm.public_id = ? AND sm.teacher_id = ? AND sm.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [publicId, teacherId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Counts a teacher's non-deleted source materials matching optional
 * subject and search filters, for pagination metadata.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {number|null} [params.subjectId] - Optional internal subject id to filter by
 * @param {string|null} [params.search] - Optional case-insensitive search term (matches title)
 * @returns {Promise<number>} Total matching row count
 */
async function countByTeacher({ teacherId, subjectId = null, search = null }) {
  const conditions = ['teacher_id = ?', 'deleted_at IS NULL'];
  const params = [teacherId];

  if (subjectId) {
    conditions.push('subject_id = ?');
    params.push(subjectId);
  }

  if (search) {
    conditions.push('title LIKE ?');
    params.push(`%${search}%`);
  }

  const sql = `SELECT COUNT(*) AS total FROM source_materials WHERE ${conditions.join(' AND ')}`;
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

/**
 * Lists a teacher's non-deleted source materials with optional subject
 * filter, search, sorting, and pagination. `sortBy` is validated against
 * a fixed whitelist of real column names before being placed into the SQL
 * string (MySQL does not support parameter binding for identifiers); it
 * is never derived from raw, unchecked user input.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {number|null} [params.subjectId] - Optional internal subject id to filter by
 * @param {string|null} [params.search] - Optional case-insensitive search term
 * @param {'title'|'createdAt'|'updatedAt'} [params.sortBy] - Field to sort by (default 'createdAt')
 * @param {'asc'|'desc'} [params.sortOrder] - Sort direction (default 'desc')
 * @param {number} params.limit - Max rows to return
 * @param {number} params.offset - Rows to skip
 * @returns {Promise<Array<Object>>} Matching source material rows
 */
async function listByTeacher({
  teacherId,
  subjectId = null,
  search = null,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  limit,
  offset,
}) {
  const conditions = ['sm.teacher_id = ?', 'sm.deleted_at IS NULL'];
  const params = [teacherId];

  if (subjectId) {
    conditions.push('sm.subject_id = ?');
    params.push(subjectId);
  }

  if (search) {
    conditions.push('sm.title LIKE ?');
    params.push(`%${search}%`);
  }

  const sortColumn = `sm.${SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.createdAt}`;
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT sm.id, sm.public_id, sm.teacher_id, sm.subject_id, sub.public_id AS subject_public_id,
           sm.source_type, sm.title, sm.description, sm.original_filename, sm.file_size_bytes,
           sm.mime_type, sm.status, sm.created_at, sm.updated_at
    FROM source_materials sm
    INNER JOIN subjects sub ON sub.id = sm.subject_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Updates a source material's title and/or description. Only columns
 * present in `fields` are included in the SET clause. Scoped by
 * teacher_id so a teacher cannot update another tenant's source material.
 * Content fields (raw_text_content, file_path, source_type) are
 * intentionally not editable here — a source's underlying content is
 * immutable once created; only its descriptive metadata can change.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Source material's public UUID
 * @param {Object} fields
 * @param {string} [fields.title] - New title
 * @param {string} [fields.description] - New description
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function updateByPublicId(teacherId, publicId, fields) {
  const setClauses = [];
  const params = [];

  if (fields.title !== undefined) {
    setClauses.push('title = ?');
    params.push(fields.title);
  }
  if (fields.description !== undefined) {
    setClauses.push('description = ?');
    params.push(fields.description);
  }

  if (setClauses.length === 0) {
    return 0;
  }

  params.push(publicId, teacherId);

  const sql = `
    UPDATE source_materials
    SET ${setClauses.join(', ')}
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, params);
  return result.affectedRows;
}

/**
 * Soft-deletes a source material by setting `deleted_at = NOW()`. Scoped
 * by teacher_id so a teacher cannot delete another tenant's source
 * material. Idempotent.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Source material's public UUID
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function softDeleteByPublicId(teacherId, publicId) {
  const sql = `
    UPDATE source_materials
    SET deleted_at = NOW()
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, [publicId, teacherId]);
  return result.affectedRows;
}

/**
 * Finds all non-deleted, successfully processed ('processed' status)
 * source materials for a given subject, scoped to the owning teacher.
 * Used by the exam generation flow to assemble the AI context from only
 * the content that has actually completed the processing pipeline
 * (text sources, which are processed immediately at creation, or
 * image sources that have passed the OCR/legibility gatekeeper) — never
 * from sources still pending, mid-processing, or failed.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {number} subjectId - Internal auto-increment subject id to filter by
 * @returns {Promise<Array<Object>>} Processed source material rows, including raw_text_content
 */
async function findProcessedBySubject(teacherId, subjectId) {
  const sql = `
    SELECT id, public_id, teacher_id, subject_id, source_type, title, description,
           raw_text_content, status
    FROM source_materials
    WHERE teacher_id = ? AND subject_id = ? AND status = 'processed' AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;
  const [rows] = await db.query(sql, [teacherId, subjectId]);
  return rows;
}

module.exports = {
  create,
  findByPublicId,
  countByTeacher,
  listByTeacher,
  updateByPublicId,
  softDeleteByPublicId,
  findProcessedBySubject,
};
