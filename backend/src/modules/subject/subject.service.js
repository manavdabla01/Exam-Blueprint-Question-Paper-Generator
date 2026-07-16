/**
 * subject.service.js
 *
 * Business logic for tenant-scoped subject management. Every function
 * requires the authenticated teacher's internal id as its first argument
 * and delegates all persistence to subject.repository.js — no SQL lives
 * here. Ownership enforcement happens structurally: the repository layer
 * only ever reads/writes rows matching the given teacher_id, so there is
 * no separate "check ownership then act" step that could be forgotten.
 */

'use strict';

const subjectRepository = require('./subject.repository');
const { toPublicSubject } = require('./subject.mapper');
const { generatePublicId } = require('../../utils/uuidGenerator');
const NotFoundError = require('../../utils/errors/NotFoundError');

/**
 * Creates a new subject for the given teacher.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} input
 * @param {string} input.name - Subject name
 * @param {string} input.grade - Grade/class label
 * @returns {Promise<Object>} The newly created subject in its public shape
 */
async function createSubject(teacherId, { name, grade }) {
  const publicId = generatePublicId();
  await subjectRepository.create({ teacherId, publicId, name, grade });

  const subjectRow = await subjectRepository.findByPublicId(teacherId, publicId);
  return toPublicSubject(subjectRow);
}

/**
 * Lists a teacher's subjects with search, sort, and pagination applied.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} params
 * @param {string|null} [params.search] - Optional search term (matches name or grade)
 * @param {string} [params.sortBy] - Field to sort by
 * @param {string} [params.sortOrder] - Sort direction
 * @param {number} params.page - 1-indexed page number
 * @param {number} params.pageSize - Number of items per page
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 */
async function listSubjects(teacherId, { search, sortBy, sortOrder, page, pageSize }) {
  const offset = (page - 1) * pageSize;

  const [rows, totalItems] = await Promise.all([
    subjectRepository.listByTeacher({
      teacherId,
      search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset,
    }),
    subjectRepository.countByTeacher({ teacherId, search }),
  ]);

  return {
    items: rows.map(toPublicSubject),
    totalItems,
  };
}

/**
 * Retrieves a single subject by its public id, scoped to the requesting
 * teacher.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Subject's public UUID
 * @returns {Promise<Object>} The subject in its public shape
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 */
async function getSubjectByPublicId(teacherId, publicId) {
  const subjectRow = await subjectRepository.findByPublicId(teacherId, publicId);
  if (!subjectRow) {
    throw new NotFoundError('Subject not found');
  }
  return toPublicSubject(subjectRow);
}

/**
 * Updates a subject's name and/or grade.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Subject's public UUID
 * @param {Object} fields
 * @param {string} [fields.name] - New subject name
 * @param {string} [fields.grade] - New grade/class label
 * @returns {Promise<Object>} The updated subject in its public shape
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 */
async function updateSubject(teacherId, publicId, fields) {
  const affectedRows = await subjectRepository.updateByPublicId(teacherId, publicId, fields);
  if (affectedRows === 0) {
    throw new NotFoundError('Subject not found');
  }
  const subjectRow = await subjectRepository.findByPublicId(teacherId, publicId);
  return toPublicSubject(subjectRow);
}

/**
 * Soft-deletes a subject.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Subject's public UUID
 * @returns {Promise<void>}
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 */
async function deleteSubject(teacherId, publicId) {
  const affectedRows = await subjectRepository.softDeleteByPublicId(teacherId, publicId);
  if (affectedRows === 0) {
    throw new NotFoundError('Subject not found');
  }
}

module.exports = {
  createSubject,
  listSubjects,
  getSubjectByPublicId,
  updateSubject,
  deleteSubject,
};
