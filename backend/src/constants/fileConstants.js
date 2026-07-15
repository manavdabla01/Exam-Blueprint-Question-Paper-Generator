/**
 * fileConstants.js
 *
 * Constants governing file upload constraints, referenced by the future
 * upload middleware and source-material validation layer.
 */

'use strict';

const FILE_CONSTANTS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB

  ALLOWED_MIME_TYPES: Object.freeze([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ]),

  ALLOWED_EXTENSIONS: Object.freeze(['.jpg', '.jpeg', '.png', '.pdf', '.docx']),

  UPLOAD_SUBFOLDER_PATTERN: '{teacherId}/{subjectId}',
});

module.exports = FILE_CONSTANTS;
