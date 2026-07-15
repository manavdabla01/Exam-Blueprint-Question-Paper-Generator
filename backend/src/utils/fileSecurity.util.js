/**
 * fileSecurity.util.js
 *
 * File-upload security helpers used by the future upload middleware and
 * source-material validation layer. These functions validate untrusted
 * file metadata (claimed MIME type, filename, size) BEFORE the file is
 * persisted or processed. They do not perform the upload itself.
 *
 * Security note: the claimed `mimetype` on a multipart upload is supplied
 * by the client and cannot be fully trusted on its own; true content
 * sniffing (e.g. via the `file-type` package reading magic bytes) should
 * be layered on top of this validation in the upload middleware when it
 * is implemented, to catch a malicious file disguised with a fake
 * extension/MIME type.
 */

'use strict';

const path = require('path');
const FILE_CONSTANTS = require('../constants/fileConstants');

const SAFE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;
const PATH_TRAVERSAL_REGEX = /\.\.[/\\]/g;

/**
 * Validates that a claimed MIME type is in the application's allow-list.
 *
 * @param {string} mimeType - The claimed MIME type of the uploaded file
 * @returns {boolean} True if the MIME type is permitted
 */
function isAllowedMimeType(mimeType) {
  if (typeof mimeType !== 'string') return false;
  return FILE_CONSTANTS.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validates that a filename's extension is in the application's allow-list.
 * Case-insensitive.
 *
 * @param {string} filename - The original filename supplied by the client
 * @returns {boolean} True if the file extension is permitted
 */
function isAllowedExtension(filename) {
  if (typeof filename !== 'string' || filename.trim().length === 0) return false;
  const extension = path.extname(filename).toLowerCase();
  return FILE_CONSTANTS.ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Validates that a file's size in bytes does not exceed the configured
 * maximum (5MB per the architecture constraints).
 *
 * @param {number} sizeBytes - The file size in bytes
 * @returns {boolean} True if the file size is within the allowed limit
 */
function isAllowedFileSize(sizeBytes) {
  if (typeof sizeBytes !== 'number' || Number.isNaN(sizeBytes) || sizeBytes <= 0) return false;
  return sizeBytes <= FILE_CONSTANTS.MAX_FILE_SIZE_BYTES;
}

/**
 * Produces a filesystem-safe filename by stripping path-traversal
 * sequences and any character outside a strict alphanumeric/dot/dash/
 * underscore allow-list. The original extension is preserved (lowercased)
 * so downstream MIME-by-extension logic keeps working.
 *
 * This does NOT guarantee uniqueness — callers should combine the result
 * with a generated UUID (see utils/uuidGenerator.js) when constructing
 * the final storage path, e.g. `${uuid}-${sanitizeFilename(original)}`.
 *
 * @param {string} filename - The original, untrusted filename
 * @returns {string} A sanitized filename safe to use in a filesystem path
 * @throws {Error} If the filename is empty after sanitization
 */
function sanitizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new Error('Filename must be a string');
  }

  const withoutTraversal = filename.replace(PATH_TRAVERSAL_REGEX, '');
  const baseName = path.basename(withoutTraversal);
  const extension = path.extname(baseName).toLowerCase();
  const nameOnly = path.basename(baseName, path.extname(baseName));

  const sanitizedNameOnly = nameOnly.replace(SAFE_FILENAME_REGEX, '_').slice(0, 100);
  const sanitizedExtension = extension.replace(SAFE_FILENAME_REGEX, '');

  const result = `${sanitizedNameOnly}${sanitizedExtension}`;

  if (sanitizedNameOnly.length === 0) {
    throw new Error('Filename is empty or invalid after sanitization');
  }

  return result;
}

/**
 * Performs the full set of file-metadata validations at once, returning a
 * structured result instead of throwing, so calling code (e.g. a future
 * upload middleware) can decide how to respond (typically 422 with the
 * list of failed checks).
 *
 * @param {Object} fileMeta
 * @param {string} fileMeta.filename - Original filename
 * @param {string} fileMeta.mimetype - Claimed MIME type
 * @param {number} fileMeta.sizeBytes - File size in bytes
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFileMetadata({ filename, mimetype, sizeBytes }) {
  const errors = [];

  if (!isAllowedExtension(filename)) {
    errors.push(`File extension not allowed. Permitted: ${FILE_CONSTANTS.ALLOWED_EXTENSIONS.join(', ')}`);
  }
  if (!isAllowedMimeType(mimetype)) {
    errors.push(`File type not allowed. Permitted: ${FILE_CONSTANTS.ALLOWED_MIME_TYPES.join(', ')}`);
  }
  if (!isAllowedFileSize(sizeBytes)) {
    errors.push(`File exceeds maximum allowed size of ${FILE_CONSTANTS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  isAllowedMimeType,
  isAllowedExtension,
  isAllowedFileSize,
  sanitizeFilename,
  validateFileMetadata,
};
