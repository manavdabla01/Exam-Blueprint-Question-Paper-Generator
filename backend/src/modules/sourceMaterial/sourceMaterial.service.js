/**
 * sourceMaterial.service.js
 *
 * Business logic for tenant-scoped source material metadata management.
 * This task implements metadata only — no file upload, storage, OCR, or
 * Claude integration. Only `source_type = 'text'` is accepted at creation
 * time, since 'file' and 'image' types require an actual uploaded file
 * (out of scope here); attempting to create those types is rejected by
 * validation before this layer is ever reached (see
 * sourceMaterial.validation.js).
 *
 * Every function requires the authenticated teacher's internal id and
 * delegates all persistence to sourceMaterial.repository.js. Subject
 * ownership is verified by reusing subject.repository.js directly (not
 * duplicating a query) — a source material's `subject_id` must belong to
 * the same teacher creating it, so we resolve and validate the subject
 * first for every create.
 */

'use strict';

const sourceMaterialRepository = require('./sourceMaterial.repository');
const subjectRepository = require('../subject/subject.repository');
const { toPublicSourceMaterial, toPublicSourceMaterialDetail } = require('./sourceMaterial.mapper');
const { generatePublicId } = require('../../utils/uuidGenerator');
const NotFoundError = require('../../utils/errors/NotFoundError');
const APP_CONSTANTS = require('../../constants/appConstants');

/**
 * Creates a new source material metadata record. Only text-type sources
 * are supported at this stage; the raw text content is stored directly
 * and the record is marked 'processed' immediately since no
 * transcription/OCR step is needed for already-typed text.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} input
 * @param {string} input.subjectId - Public UUID of the subject this source belongs to
 * @param {string} input.title - Human-facing title
 * @param {string|null} [input.description] - Optional longer description
 * @param {string} input.rawTextContent - The pasted text content
 * @returns {Promise<Object>} The newly created source material in its public shape
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 */
async function createSourceMaterial(teacherId, { subjectId, title, description = null, rawTextContent }) {
  const subjectRow = await subjectRepository.findByPublicId(teacherId, subjectId);
  if (!subjectRow) {
    throw new NotFoundError('Subject not found');
  }

  const publicId = generatePublicId();

  await sourceMaterialRepository.create({
    teacherId,
    subjectId: subjectRow.id,
    publicId,
    sourceType: APP_CONSTANTS.SOURCE_TYPE.TEXT,
    title,
    description,
    rawTextContent,
    status: APP_CONSTANTS.SOURCE_STATUS.PROCESSED,
  });

  const createdRow = await sourceMaterialRepository.findByPublicId(teacherId, publicId);
  return toPublicSourceMaterialDetail(createdRow);
}

/**
 * Lists a teacher's source materials with optional subject filter,
 * search, sort, and pagination applied.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} params
 * @param {string|null} [params.subjectId] - Optional subject public UUID to filter by
 * @param {string|null} [params.search] - Optional search term (matches title)
 * @param {string} [params.sortBy] - Field to sort by
 * @param {string} [params.sortOrder] - Sort direction
 * @param {number} params.page - 1-indexed page number
 * @param {number} params.pageSize - Number of items per page
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 * @throws {NotFoundError} If a subjectId filter is supplied but does not resolve to an owned subject
 */
async function listSourceMaterials(teacherId, { subjectId, search, sortBy, sortOrder, page, pageSize }) {
  let internalSubjectId = null;

  if (subjectId) {
    const subjectRow = await subjectRepository.findByPublicId(teacherId, subjectId);
    if (!subjectRow) {
      throw new NotFoundError('Subject not found');
    }
    internalSubjectId = subjectRow.id;
  }

  const offset = (page - 1) * pageSize;

  const [rows, totalItems] = await Promise.all([
    sourceMaterialRepository.listByTeacher({
      teacherId,
      subjectId: internalSubjectId,
      search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset,
    }),
    sourceMaterialRepository.countByTeacher({ teacherId, subjectId: internalSubjectId, search }),
  ]);

  return {
    items: rows.map(toPublicSourceMaterial),
    totalItems,
  };
}

/**
 * Retrieves a single source material by its public id, including its raw
 * text content.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Source material's public UUID
 * @returns {Promise<Object>} The source material in its public detail shape
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function getSourceMaterialByPublicId(teacherId, publicId) {
  const row = await sourceMaterialRepository.findByPublicId(teacherId, publicId);
  if (!row) {
    throw new NotFoundError('Source material not found');
  }
  return toPublicSourceMaterialDetail(row);
}

/**
 * Updates a source material's title and/or description.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Source material's public UUID
 * @param {Object} fields
 * @param {string} [fields.title] - New title
 * @param {string} [fields.description] - New description
 * @returns {Promise<Object>} The updated source material in its public detail shape
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function updateSourceMaterial(teacherId, publicId, fields) {
  const affectedRows = await sourceMaterialRepository.updateByPublicId(teacherId, publicId, fields);
  if (affectedRows === 0) {
    throw new NotFoundError('Source material not found');
  }
  const row = await sourceMaterialRepository.findByPublicId(teacherId, publicId);
  return toPublicSourceMaterialDetail(row);
}

/**
 * Soft-deletes a source material.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Source material's public UUID
 * @returns {Promise<void>}
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function deleteSourceMaterial(teacherId, publicId) {
  const affectedRows = await sourceMaterialRepository.softDeleteByPublicId(teacherId, publicId);
  if (affectedRows === 0) {
    throw new NotFoundError('Source material not found');
  }
}

module.exports = {
  createSourceMaterial,
  listSourceMaterials,
  getSourceMaterialByPublicId,
  updateSourceMaterial,
  deleteSourceMaterial,
};
