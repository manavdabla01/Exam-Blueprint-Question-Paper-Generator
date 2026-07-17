/**
 * upload.service.js
 *
 * Responsible for persisting an already-validated, in-memory file buffer
 * (see upload.middleware.js) to disk under a tenant-scoped directory
 * structure:
 *
 *   uploads/
 *     └── {teacher_public_id}/
 *         └── {subject_public_id}/
 *             └── {uuid}-{sanitized-original-filename}
 *
 * Security posture:
 *  - The client-supplied original filename is NEVER used to build a
 *    filesystem path directly; only the already-sanitized filename
 *    (produced by fileSecurity.util.sanitizeFilename in the upload
 *    middleware) is used, and even then only as a suffix appended to a
 *    generated UUID.
 *  - `teacherPublicId` and `subjectPublicId` are validated as
 *    well-formed UUIDs before being used as directory segments — this
 *    repository never places raw, arbitrary strings into a filesystem
 *    path.
 *  - After constructing the final absolute path, we resolve it and
 *    confirm it still lives under the configured upload root. This is a
 *    belt-and-braces check: even if every upstream validation somehow
 *    passed a malicious value, a `..`-based escape attempt is caught
 *    here and rejected before any disk write occurs.
 *  - Directories are created with `{ recursive: true }` so first uploads
 *    for a new teacher/subject pair succeed without a separate
 *    provisioning step.
 */

'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');
const { generatePublicId } = require('../utils/uuidGenerator');
const { isValidUUID } = require('../utils/validationHelper');

const UPLOAD_ROOT = path.resolve(process.cwd(), config.upload.uploadDir);

/**
 * Builds and validates the absolute destination path for a file, ensuring
 * it cannot escape the configured upload root regardless of input.
 *
 * @param {string} teacherPublicId - Owning teacher's public UUID
 * @param {string} subjectPublicId - Owning subject's public UUID
 * @param {string} storedFilename - The generated (UUID-prefixed, sanitized) filename
 * @returns {string} The validated absolute filesystem path
 * @throws {Error} If teacherPublicId/subjectPublicId are not valid UUIDs, or
 *   if the resolved path would escape the upload root
 */
function resolveSafeDestination(teacherPublicId, subjectPublicId, storedFilename) {
  if (!isValidUUID(teacherPublicId) || !isValidUUID(subjectPublicId)) {
    throw new Error('Invalid teacher or subject identifier for file storage');
  }

  const candidatePath = path.resolve(UPLOAD_ROOT, teacherPublicId, subjectPublicId, storedFilename);

  if (!candidatePath.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error('Resolved file path escapes the permitted upload directory');
  }

  return candidatePath;
}

/**
 * Persists an uploaded file buffer to its tenant-scoped destination on
 * disk and returns metadata describing where and how it was stored.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - The file's raw byte content (from Multer memory storage)
 * @param {string} params.teacherPublicId - Owning teacher's public UUID
 * @param {string} params.subjectPublicId - Owning subject's public UUID
 * @param {string} params.sanitizedFilename - Already-sanitized original filename (see fileSecurity.util)
 * @returns {Promise<{ storedFilename: string, relativePath: string, absolutePath: string }>}
 * @throws {Error} If the destination path is invalid or the write fails
 */
async function saveFile({ buffer, teacherPublicId, subjectPublicId, sanitizedFilename }) {
  const storedFilename = `${generatePublicId()}-${sanitizedFilename}`;
  const absolutePath = resolveSafeDestination(teacherPublicId, subjectPublicId, storedFilename);
  const destinationDir = path.dirname(absolutePath);

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' });

  const relativePath = path.relative(UPLOAD_ROOT, absolutePath);

  return {
    storedFilename,
    relativePath,
    absolutePath,
  };
}

/**
 * Deletes a previously stored file, given its path relative to the
 * upload root (as returned by `saveFile`). Used for cleanup when a
 * subsequent step in a create flow fails after the file was already
 * written to disk. Errors are intentionally swallowed here (logged by
 * the caller if needed) since a failed cleanup of an orphaned file is a
 * lower-severity concern than surfacing the original failure that
 * triggered the cleanup.
 *
 * @param {string} relativePath - Path relative to the upload root
 * @returns {Promise<void>}
 */
async function deleteFile(relativePath) {
  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  if (!absolutePath.startsWith(UPLOAD_ROOT + path.sep)) {
    return;
  }
  await fs.unlink(absolutePath).catch(() => {});
}

/**
 * Resolves a path relative to the upload root (as stored in
 * `source_materials.file_path`) back to a validated absolute filesystem
 * path, for reading a previously stored file. Applies the same
 * containment check as `resolveSafeDestination` so a corrupted or
 * tampered `file_path` value can never cause a read outside the upload
 * root.
 *
 * @param {string} relativePath - Path relative to the upload root
 * @returns {string} The validated absolute filesystem path
 * @throws {Error} If the resolved path would escape the upload root
 */
function resolveAbsolutePath(relativePath) {
  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  if (!absolutePath.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error('Resolved file path escapes the permitted upload directory');
  }
  return absolutePath;
}

module.exports = {
  saveFile,
  deleteFile,
  resolveAbsolutePath,
};
