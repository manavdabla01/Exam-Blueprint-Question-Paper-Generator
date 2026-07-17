/**
 * upload.middleware.js
 *
 * Wraps the configured Multer instance (config/multer.config.js) with:
 *  - Consistent error translation: any MulterError (file too large, wrong
 *    field name, disallowed MIME type from fileFilter) is converted into
 *    the application's standard ValidationError so it flows through the
 *    same error envelope as every other validation failure, instead of
 *    Multer's own error shape.
 *  - A second, independent validation pass via fileSecurity.util after
 *    Multer has buffered the file — re-checking MIME, extension, and
 *    size — since fileFilter alone cannot see the final buffered size and
 *    defense in depth means never trusting a single check.
 *  - Filename sanitization: the client-supplied original filename is
 *    never trusted or used as-is; it is sanitized immediately and the
 *    sanitized version is attached to `req.file.sanitizedFilename` for
 *    every downstream consumer (upload.service.js) to use instead of the
 *    raw `req.file.originalname`.
 *
 * This middleware is a no-op for requests that are not
 * `multipart/form-data` (e.g. a plain JSON body creating a text source
 * material) — Multer only intercepts multipart requests, so `req.file`
 * simply remains undefined and `req.body` is left as parsed by
 * express.json() upstream.
 */

'use strict';

const uploadInstance = require('../config/multer.config');
const fileSecurity = require('../utils/fileSecurity.util');
const ValidationError = require('../utils/errors/ValidationError');

/**
 * Translates a Multer error into a human-readable message.
 *
 * @param {import('multer').MulterError} error
 * @returns {string}
 */
function describeMulterError(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File exceeds the maximum allowed size of 5MB';
    case 'LIMIT_FILE_COUNT':
      return 'Only one file may be uploaded per request';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'File type is not allowed for upload';
    default:
      return 'File upload failed';
  }
}

/**
 * Express middleware factory that handles a single file upload under the
 * `file` field, validates it thoroughly, and sanitizes its filename.
 *
 * @returns {Function} Express middleware (req, res, next)
 */
function handleSourceMaterialUpload() {
  const multerSingle = uploadInstance.single('file');

  return (req, res, next) => {
    multerSingle(req, res, (multerError) => {
      if (multerError) {
        return next(new ValidationError(describeMulterError(multerError), [
          { field: 'file', message: describeMulterError(multerError) },
        ]));
      }

      // No file on this request (e.g. a JSON 'text' source material) -
      // nothing further to validate here.
      if (!req.file) {
        return next();
      }

      const validation = fileSecurity.validateFileMetadata({
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        sizeBytes: req.file.size,
      });

      if (!validation.valid) {
        return next(
          new ValidationError(
            'Uploaded file failed validation',
            validation.errors.map((message) => ({ field: 'file', message }))
          )
        );
      }

      try {
        req.file.sanitizedFilename = fileSecurity.sanitizeFilename(req.file.originalname);
      } catch (sanitizeError) {
        return next(new ValidationError('Uploaded file has an invalid filename', [
          { field: 'file', message: sanitizeError.message },
        ]));
      }

      return next();
    });
  };
}

module.exports = handleSourceMaterialUpload;
