/**
 * generatedExam.service.js
 *
 * Business logic for tenant-scoped generated-exam management, including
 * the generation *request* orchestration flow:
 *
 *   validate request -> load blueprint -> load processed source
 *   materials -> build AI context -> create generation job -> persist
 *   generated exam metadata (status: 'queued')
 *
 * This module deliberately does NOT call the Claude API — that is a
 * future task. `createGenerationRequest` only assembles everything the
 * eventual generation step will need (the "AI context") and persists a
 * queued placeholder record; a future task will pick up 'queued' rows
 * and perform the actual generation, transitioning status to
 * 'generating' -> 'completed'/'failed'.
 */

'use strict';

const generatedExamRepository = require('./generatedExam.repository');
const examBlueprintRepository = require('../examBlueprint/examBlueprint.repository');
const sourceMaterialRepository = require('../sourceMaterial/sourceMaterial.repository');
const subjectRepository = require('../subject/subject.repository');
const { toPublicGeneratedExam } = require('./generatedExam.mapper');
const { generatePublicId } = require('../../utils/uuidGenerator');
const logger = require('../../utils/logger');
const NotFoundError = require('../../utils/errors/NotFoundError');
const ValidationError = require('../../utils/errors/ValidationError');

/**
 * Resolves the set of processed source materials to include in an exam
 * generation run: either the caller's explicit selection (validated for
 * ownership, subject match, and 'processed' status) or, if none was
 * specified, every processed source material under the blueprint's
 * subject.
 *
 * @param {number} teacherId - Internal auto-increment teacher id
 * @param {Object} blueprintRow - The loaded blueprint row (needs .subject_id)
 * @param {Array<string>|undefined} sourceMaterialPublicIds - Optional explicit selection of source material public UUIDs
 * @returns {Promise<Array<Object>>} The resolved, validated source material rows
 * @throws {ValidationError} If an explicitly requested source material is invalid, wrong subject, or not yet processed
 * @throws {ValidationError} If no processed source materials are available at all
 */
async function resolveSourceMaterials(teacherId, blueprintRow, sourceMaterialPublicIds) {
  let sourceMaterials;

  if (Array.isArray(sourceMaterialPublicIds) && sourceMaterialPublicIds.length > 0) {
    sourceMaterials = [];
    const invalidSelections = [];

    for (const publicId of sourceMaterialPublicIds) {
      const row = await sourceMaterialRepository.findByPublicId(teacherId, publicId);
      if (!row) {
        invalidSelections.push({ field: 'sourceMaterialIds', message: `Source material not found: ${publicId}` });
        continue;
      }
      if (row.subject_id !== blueprintRow.subject_id) {
        invalidSelections.push({
          field: 'sourceMaterialIds',
          message: `Source material does not belong to this blueprint's subject: ${publicId}`,
        });
        continue;
      }
      if (row.status !== 'processed') {
        invalidSelections.push({
          field: 'sourceMaterialIds',
          message: `Source material has not finished processing (status: ${row.status}): ${publicId}`,
        });
        continue;
      }
      sourceMaterials.push(row);
    }

    if (invalidSelections.length > 0) {
      throw new ValidationError('One or more selected source materials are invalid', invalidSelections);
    }
  } else {
    sourceMaterials = await sourceMaterialRepository.findProcessedBySubject(teacherId, blueprintRow.subject_id);
  }

  if (sourceMaterials.length === 0) {
    throw new ValidationError(
      'No processed source materials are available for this subject. Upload and process source materials before generating an exam.'
    );
  }

  return sourceMaterials;
}

/**
 * Builds the AI context object that a future generation step will send
 * to Claude: the blueprint's structure/constraints plus the actual
 * content of every processed source material to draw questions from.
 * Not persisted verbatim — this is constructed fresh whenever generation
 * actually runs, so it always reflects the latest blueprint/source
 * content rather than a stale snapshot from request time.
 *
 * @param {Object} blueprintRow - The loaded blueprint row
 * @param {Array<Object>} sourceMaterials - The resolved source material rows
 * @returns {Object} The AI context object
 */
function buildAiContext(blueprintRow, sourceMaterials) {
  return {
    blueprint: {
      name: blueprintRow.name,
      boardReference: blueprintRow.board_reference,
      totalMarks: blueprintRow.total_marks,
      structure: blueprintRow.structure_json,
    },
    sourceMaterials: sourceMaterials.map((row) => ({
      id: row.public_id,
      title: row.title,
      content: row.raw_text_content,
    })),
  };
}

/**
 * Creates a new exam generation request: validates the blueprint exists
 * and is owned by the teacher, resolves the source materials to use,
 * builds the AI context (logged for traceability, not persisted), and
 * persists a 'queued' generated_exams row. Does NOT call Claude — actual
 * question generation is implemented in a future task.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {Object} input
 * @param {string} input.blueprintId - Public UUID of the exam blueprint to generate from
 * @param {string|null} [input.title] - Optional title override (defaults to a name derived from the blueprint)
 * @param {Array<string>} [input.sourceMaterialIds] - Optional explicit selection of source materials to include
 * @returns {Promise<Object>} The newly created generated exam in its public shape (status: 'queued')
 * @throws {NotFoundError} If the blueprint does not exist or is not owned by this teacher
 * @throws {ValidationError} If source material selection/resolution fails
 */
async function createGenerationRequest(teacherId, { blueprintId, title, sourceMaterialIds }) {
  const blueprintRow = await examBlueprintRepository.findByPublicId(teacherId, blueprintId);
  if (!blueprintRow) {
    throw new NotFoundError('Exam blueprint not found');
  }

  const sourceMaterials = await resolveSourceMaterials(teacherId, blueprintRow, sourceMaterialIds);

  const aiContext = buildAiContext(blueprintRow, sourceMaterials);
  logger.info('Exam generation request queued', {
    teacherId,
    blueprintId: blueprintRow.id,
    sourceMaterialCount: sourceMaterials.length,
    totalMarks: aiContext.blueprint.totalMarks,
  });

  const publicId = generatePublicId();
  const resolvedTitle = title || `${blueprintRow.name} - Generated Exam`;

  const contentPlaceholder = {
    message: 'This exam has been queued for generation and has not been produced yet.',
    queuedAt: new Date().toISOString(),
    sourceMaterialIds: sourceMaterials.map((row) => row.public_id),
  };

  await generatedExamRepository.create({
    teacherId,
    subjectId: blueprintRow.subject_id,
    blueprintId: blueprintRow.id,
    publicId,
    title: resolvedTitle,
    content: contentPlaceholder,
    status: 'queued',
  });

  const createdRow = await generatedExamRepository.findByPublicId(teacherId, publicId);
  return toPublicGeneratedExam(createdRow, true);
}

/**
 * Lists a teacher's generated exams with optional subject filter, search,
 * sort, and pagination. Content is omitted from list results to keep
 * payload size reasonable.
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
async function listGeneratedExams(teacherId, { subjectId, search, sortBy, sortOrder, page, pageSize }) {
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
    generatedExamRepository.listByTeacher({
      teacherId,
      subjectId: internalSubjectId,
      search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset,
    }),
    generatedExamRepository.countByTeacher({ teacherId, subjectId: internalSubjectId, search }),
  ]);

  return {
    items: rows.map((row) => toPublicGeneratedExam(row, false)),
    totalItems,
  };
}

/**
 * Retrieves a single generated exam by its public id, including its
 * content_json.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Generated exam's public UUID
 * @returns {Promise<Object>} The generated exam in its public detail shape
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function getGeneratedExamByPublicId(teacherId, publicId) {
  const row = await generatedExamRepository.findByPublicId(teacherId, publicId);
  if (!row) {
    throw new NotFoundError('Generated exam not found');
  }
  return toPublicGeneratedExam(row, true);
}

/**
 * Soft-deletes a generated exam.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} publicId - Generated exam's public UUID
 * @returns {Promise<void>}
 * @throws {NotFoundError} If it does not exist or is not owned by this teacher
 */
async function deleteGeneratedExam(teacherId, publicId) {
  const affectedRows = await generatedExamRepository.softDeleteByPublicId(teacherId, publicId);
  if (affectedRows === 0) {
    throw new NotFoundError('Generated exam not found');
  }
}

module.exports = {
  createGenerationRequest,
  listGeneratedExams,
  getGeneratedExamByPublicId,
  deleteGeneratedExam,
};
