/**
 * generatedExam.controller.js
 *
 * HTTP layer for the generated-exam module. Contains no SQL and no
 * business logic.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, paginationResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const generatedExamService = require('./generatedExam.service');
const generationService = require('./generation.service');
const { sanitizeString } = require('../../utils/sanitize.util');

/**
 * POST /api/v1/generated-exams
 * Creates a new exam generation request. Returns immediately with
 * status 'queued' — no AI generation happens synchronously.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createGeneratedExam = asyncHandler(async (req, res) => {
  const title = req.body.title ? sanitizeString(req.body.title) : null;

  const generatedExam = await generatedExamService.createGenerationRequest(req.teacher.id, {
    blueprintId: req.body.blueprintId,
    title,
    sourceMaterialIds: req.body.sourceMaterialIds,
  });

  return successResponse(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Exam generation request queued successfully',
    data: generatedExam,
  });
});

/**
 * GET /api/v1/generated-exams
 * Lists the authenticated teacher's generated exams.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listGeneratedExams = asyncHandler(async (req, res) => {
  const { subjectId, page, pageSize, search, sortBy, sortOrder } = req.query;

  const { items, totalItems } = await generatedExamService.listGeneratedExams(req.teacher.id, {
    subjectId: subjectId || null,
    search: search || null,
    sortBy,
    sortOrder,
    page,
    pageSize,
  });

  return paginationResponse(res, { items, page, pageSize, totalItems });
});

/**
 * GET /api/v1/generated-exams/:id
 * Retrieves a single generated exam, including its content_json.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getGeneratedExam = asyncHandler(async (req, res) => {
  const generatedExam = await generatedExamService.getGeneratedExamByPublicId(req.teacher.id, req.params.id);
  return successResponse(res, { data: generatedExam });
});

/**
 * DELETE /api/v1/generated-exams/:id
 * Soft-deletes a generated exam.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const deleteGeneratedExam = asyncHandler(async (req, res) => {
  await generatedExamService.deleteGeneratedExam(req.teacher.id, req.params.id);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Generated exam deleted successfully',
    data: null,
  });
});

/**
 * POST /api/v1/generated-exams/:id/generate
 * Runs the AI generation pipeline for a queued generated exam: loads the
 * blueprint and processed source content, calls Claude, validates the
 * result against the blueprint, and persists it. Returns the finalized
 * exam (status 'completed' with content, or throws a 422/502/503/504
 * error if generation failed — the record itself is updated to 'failed'
 * with a stored reason regardless of how the controller responds).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const generateExam = asyncHandler(async (req, res) => {
  const finalState = await generationService.runGenerationPipeline(req.teacher.id, req.params.id);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Exam generation completed',
    data: finalState,
  });
});

module.exports = {
  createGeneratedExam,
  listGeneratedExams,
  getGeneratedExam,
  deleteGeneratedExam,
  generateExam,
};
