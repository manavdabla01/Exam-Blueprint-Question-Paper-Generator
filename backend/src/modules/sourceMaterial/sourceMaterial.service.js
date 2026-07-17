/**
 * sourceMaterial.service.js
 *
 * Business logic for tenant-scoped source material management, covering
 * both text-content sources (pasted text, stored directly in the
 * database) and file-based sources (pdf/docx/image, uploaded via
 * multipart/form-data and persisted to disk by upload.service.js).
 *
 * This module does NOT perform OCR or call the Claude API — file-based
 * sources are created with `status: 'pending'`, awaiting a future
 * processing step. Text sources are marked `status: 'processed'`
 * immediately since no extraction step is needed for already-typed text.
 *
 * API-level `sourceType` values ('text' | 'pdf' | 'docx' | 'image') are
 * intentionally more granular than the database's `source_type` ENUM
 * ('text' | 'file' | 'image', fixed by the Task 2 schema): 'pdf' and
 * 'docx' both map to the database's 'file' type, while the specific kind
 * of file is still recoverable from the stored `mime_type`/
 * `original_filename`. This avoids an ENUM migration while still letting
 * the API distinguish document types at the validation layer.
 *
 * Every function requires the authenticated teacher's internal id and
 * delegates persistence to sourceMaterial.repository.js. Subject
 * ownership is verified by reusing subject.repository.js directly.
 */

'use strict';

const sourceMaterialRepository = require('./sourceMaterial.repository');
const subjectRepository = require('../subject/subject.repository');
const uploadService = require('../../services/upload.service');
const { toPublicSourceMaterial, toPublicSourceMaterialDetail } = require('./sourceMaterial.mapper');
const { generatePublicId } = require('../../utils/uuidGenerator');
const NotFoundError = require('../../utils/errors/NotFoundError');
const AppError = require('../../utils/errors/AppError');
const ValidationError = require('../../utils/errors/ValidationError');
const HTTP_STATUS = require('../../constants/httpStatus');
const APP_CONSTANTS = require('../../constants/appConstants');
const logger = require('../../utils/logger');

/**
 * Maps an API-level sourceType ('pdf' | 'docx' | 'image') to the
 * database's source_type ENUM value.
 *
 * @param {string} apiSourceType - 'pdf' | 'docx' | 'image'
 * @returns {string} 'file' | 'image'
 */
function toDbSourceType(apiSourceType) {
  return apiSourceType === 'image' ? APP_CONSTANTS.SOURCE_TYPE.IMAGE : APP_CONSTANTS.SOURCE_TYPE.FILE;
}

const EXPECTED_MIME_TYPES_BY_SOURCE_TYPE = Object.freeze({
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  image: ['image/jpeg', 'image/png'],
});

/**
 * Verifies that an uploaded file's actual MIME type is consistent with
 * the `sourceType` the client declared, so a record is never persisted
 * as (for example) "image" while actually containing a PDF.
 *
 * @param {string} sourceType - 'pdf' | 'docx' | 'image'
 * @param {string} mimetype - The uploaded file's claimed MIME type
 * @throws {ValidationError} If the MIME type does not match the declared sourceType
 */
function assertMimeMatchesSourceType(sourceType, mimetype) {
  const expected = EXPECTED_MIME_TYPES_BY_SOURCE_TYPE[sourceType];
  if (expected && !expected.includes(mimetype)) {
    throw new ValidationError('Uploaded file type does not match the declared sourceType', [
      { field: 'sourceType', message: `Expected a file of type ${expected.join(' or ')} for sourceType "${sourceType}"` },
    ]);
  }
}

/**
 * Creates a new source material record — either text-content or
 * file-based, depending on `sourceType`.
 *
 * Flow for file-based sources: validate subject ownership → save the
 * file to disk (upload.service.js) → create the database record → return
 * public metadata. If the database write fails after the file was
 * already written, the orphaned file is cleaned up on a best-effort
 * basis before the error propagates.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} input
 * @param {string} input.teacherPublicId - Authenticated teacher's public UUID (used for storage path)
 * @param {string} input.subjectId - Public UUID of the subject this source belongs to
 * @param {string} input.title - Human-facing title
 * @param {string|null} [input.description] - Optional longer description
 * @param {string} input.sourceType - 'text' | 'pdf' | 'docx' | 'image'
 * @param {string} [input.rawTextContent] - Required when sourceType='text'
 * @param {Object} [input.uploadedFile] - Required when sourceType is 'pdf'|'docx'|'image'
 * @param {Buffer} [input.uploadedFile.buffer] - Raw file bytes (from Multer memory storage)
 * @param {string} [input.uploadedFile.originalname] - Client-supplied original filename
 * @param {string} [input.uploadedFile.sanitizedFilename] - Sanitized filename (see upload.middleware.js)
 * @param {string} [input.uploadedFile.mimetype] - Claimed MIME type
 * @param {number} [input.uploadedFile.size] - File size in bytes
 * @returns {Promise<Object>} The newly created source material in its public shape
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 * @throws {AppError} 422 if a file-based sourceType is missing its uploaded file
 */
async function createSourceMaterial(
  teacherId,
  { teacherPublicId, subjectId, title, description = null, sourceType, rawTextContent, uploadedFile }
) {
  const subjectRow = await subjectRepository.findByPublicId(teacherId, subjectId);
  if (!subjectRow) {
    throw new NotFoundError('Subject not found');
  }

  const publicId = generatePublicId();

  if (sourceType === APP_CONSTANTS.SOURCE_TYPE.TEXT) {
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

  if (!uploadedFile) {
    throw new AppError(
      'A file upload is required for this source type',
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      'FILE_REQUIRED'
    );
  }

  assertMimeMatchesSourceType(sourceType, uploadedFile.mimetype);

  const { relativePath } = await uploadService.saveFile({
    buffer: uploadedFile.buffer,
    teacherPublicId,
    subjectPublicId: subjectRow.public_id,
    sanitizedFilename: uploadedFile.sanitizedFilename,
  });

  try {
    await sourceMaterialRepository.create({
      teacherId,
      subjectId: subjectRow.id,
      publicId,
      sourceType: toDbSourceType(sourceType),
      title,
      description,
      originalFilename: uploadedFile.originalname,
      filePath: relativePath,
      fileSizeBytes: uploadedFile.size,
      mimeType: uploadedFile.mimetype,
      status: APP_CONSTANTS.SOURCE_STATUS.PENDING,
    });
  } catch (error) {
    await uploadService.deleteFile(relativePath).catch((cleanupError) => {
      logger.error(`Failed to clean up orphaned upload after DB error: ${cleanupError.message}`);
    });
    throw error;
  }

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
