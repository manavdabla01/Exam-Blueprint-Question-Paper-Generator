/**
 * multer.config.js
 *
 * Multer instance configuration for source-material file uploads.
 *
 * - Memory storage (not disk storage): the file buffer is held in memory
 *   only for the duration of the request; upload.service.js is
 *   responsible for writing it to its final, tenant-scoped destination on
 *   disk. This avoids Multer ever writing to a predictable/temp location
 *   on the shared filesystem before our own validation has run.
 * - 5MB max file size, enforced here AND re-checked via
 *   fileSecurity.util.isAllowedFileSize in the upload middleware, so the
 *   limit is never dependent on a single layer.
 * - Single file per request, field name 'file'.
 * - A `fileFilter` performs an early MIME allow-list check so that
 *   disallowed files are rejected before their bytes are even fully
 *   buffered into memory; the upload middleware still re-validates MIME,
 *   extension, and size afterward as defense in depth (fileFilter alone
 *   cannot inspect the real file size).
 */

'use strict';

const multer = require('multer');
const config = require('./env');
const FILE_CONSTANTS = require('../constants/fileConstants');

const storage = multer.memoryStorage();

/**
 * Multer fileFilter callback: rejects disallowed MIME types immediately.
 * Extension and true content-sniffing checks happen later in
 * upload.middleware.js, since Multer's fileFilter only has access to the
 * client-claimed mimetype/filename, not the full buffer.
 *
 * @param {import('express').Request} req
 * @param {Express.Multer.File} file
 * @param {import('multer').FileFilterCallback} callback
 */
function fileFilter(req, file, callback) {
  if (!FILE_CONSTANTS.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    return;
  }
  callback(null, true);
}

/**
 * Configured Multer instance for single source-material file uploads.
 * Use as `uploadInstance.single('file')` in the upload middleware.
 */
const uploadInstance = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeMb * 1024 * 1024,
    files: 1,
  },
  fileFilter,
});

module.exports = uploadInstance;
