/**
 * examBlueprint.service.js
 *
 * Business logic for tenant-scoped exam blueprint management. Subject
 * ownership is verified by reusing subject.repository.js directly — a
 * blueprint's `subject_id` must belong to the same teacher creating it.
 */

'use strict';

const examBlueprintRepository = require('./examBlueprint.repository');
const subjectRepository = require('../subject/subject.repository');
const { toPublicBlueprint } = require('./examBlueprint.mapper');
const { generatePublicId } = require('../../utils/uuidGenerator');
const NotFoundError = require('../../utils/errors/NotFoundError');

/**
 * Creates a new exam blueprint for the given teacher and subject.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} input
 * @param {string} input.subjectId - Public UUID of the subject this blueprint targets
 * @param {string} input.name - Blueprint name
 * @param {string|null} [input.boardReference] - Board/curriculum reference
 * @param {number} input.totalMarks - Total marks for the exam
 * @param {Object} input.structure - The validated blueprint structure object
 * @returns {Promise<Object>} The newly created blueprint in its public shape
 * @throws {NotFoundError} If the subject does not exist or is not owned by this teacher
 */
async function createBlueprint(teacherId, { subjectId, name, boardReference = null, totalMarks, structure }) {
  const subjectRow = await subjectRepository.findByPublicId(teacherId, subjectId);
  if (!subjectRow) {
    throw new NotFoundError('Subject not found');
  }

  const publicId = generatePublicId();

  await examBlueprintRepository.create({
    teacherId,
    subjectId: subjectRow.id,
    publicId,
    name,
    boardReference,
    structure,
    totalMarks,
  });

  const createdRow = await examBlueprintRepository.findByPublicId(teacherId, publicId);
  return toPublicBlueprint(createdRow);
}

/**
 * Lists a teacher's exam blueprints with optional subject filter, search,
 * sort, and pagination.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} params
 * @param {string|null} [params.subjectId] - Optional subject public UUID to filter by
 * @param {string|null} [params.search] - Optional search term (matches name)
 * @param {string} [params.sortBy] - Field to sort by
 * @param {string} [params.sortOrder] - Sort direction
 * @param {number} params.page - 1-indexed page number
 * @param {number} params.pageSize - Number of items per page
 * @returns {Promise<{ items: Array<Object>, totalItems: number }>}
 * @throws {NotFoundError} If a subjectId filter is supplied but does not resolve to an owned subject
 */
async function listBlueprints(teacherId, { subjectId, search, sortBy, sortOrder, page, pageSize }) {
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
    examBlueprintRepository.listByTeacher({
      teacherId,
      subjectId: internalSubjectId,
      search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset,
    }),
    examBlueprintRepository.countByTeacher({ teacherId, search }),
  ]);

  return {
    items: rows.map(toPublicBlueprint),
    totalItems,
  };
}

/**
 * Retrieves a single exam blueprint by its public id, scoped to the
 * requesting teacher.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Blueprint's public UUID
 * @returns {Promise<Object>} The blueprint in its public shape
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function getBlueprintByPublicId(teacherId, publicId) {
  const row = await examBlueprintRepository.findByPublicId(teacherId, publicId);
  if (!row) {
    throw new NotFoundError('Exam blueprint not found');
  }
  return toPublicBlueprint(row);
}

/**
 * Updates an exam blueprint's mutable fields. If `structure` is
 * provided, it wholesale replaces the existing structure_json rather
 * than being deep-merged — a blueprint's structure is a single cohesive
 * plan (difficulty/type/chapter distributions must stay internally
 * consistent, e.g. all summing to 100%), so a partial merge could easily
 * produce an inconsistent combination the teacher never intended. The
 * client is expected to submit the complete desired structure on update.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Blueprint's public UUID
 * @param {Object} fields
 * @param {string} [fields.name] - New blueprint name
 * @param {string|null} [fields.boardReference] - New board/curriculum reference
 * @param {number} [fields.totalMarks] - New total marks
 * @param {Object} [fields.structure] - New complete structure object
 * @returns {Promise<Object>} The updated blueprint in its public shape
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function updateBlueprint(teacherId, publicId, fields) {
  const affectedRows = await examBlueprintRepository.updateByPublicId(teacherId, publicId, fields);
  if (affectedRows === 0) {
    throw new NotFoundError('Exam blueprint not found');
  }
  const row = await examBlueprintRepository.findByPublicId(teacherId, publicId);
  return toPublicBlueprint(row);
}

/**
 * Soft-deletes an exam blueprint.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Blueprint's public UUID
 * @returns {Promise<void>}
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function deleteBlueprint(teacherId, publicId) {
  const affectedRows = await examBlueprintRepository.softDeleteByPublicId(teacherId, publicId);
  if (affectedRows === 0) {
    throw new NotFoundError('Exam blueprint not found');
  }
}

module.exports = {
  createBlueprint,
  listBlueprints,
  getBlueprintByPublicId,
  updateBlueprint,
  deleteBlueprint,
};
