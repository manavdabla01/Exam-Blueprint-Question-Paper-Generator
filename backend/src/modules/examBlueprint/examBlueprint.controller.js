/**
 * examBlueprint.controller.js
 *
 * HTTP layer for the exam blueprint module. Contains no SQL and no
 * business logic.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, paginationResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const examBlueprintService = require('./examBlueprint.service');
const { sanitizeString } = require('../../utils/sanitize.util');

/**
 * POST /api/v1/exam-blueprints
 * Creates a new exam blueprint.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createBlueprint = asyncHandler(async (req, res) => {
  const name = sanitizeString(req.body.name);
  const boardReference = req.body.boardReference ? sanitizeString(req.body.boardReference) : null;
  const instructions = req.body.structure.instructions ? sanitizeString(req.body.structure.instructions) : null;

  const blueprint = await examBlueprintService.createBlueprint(req.teacher.id, {
    subjectId: req.body.subjectId,
    name,
    boardReference,
    totalMarks: req.body.totalMarks,
    structure: { ...req.body.structure, instructions },
  });

  return successResponse(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Exam blueprint created successfully',
    data: blueprint,
  });
});

/**
 * GET /api/v1/exam-blueprints
 * Lists the authenticated teacher's exam blueprints.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listBlueprints = asyncHandler(async (req, res) => {
  const { subjectId, page, pageSize, search, sortBy, sortOrder } = req.query;

  const { items, totalItems } = await examBlueprintService.listBlueprints(req.teacher.id, {
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
 * GET /api/v1/exam-blueprints/:id
 * Retrieves a single exam blueprint.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getBlueprint = asyncHandler(async (req, res) => {
  const blueprint = await examBlueprintService.getBlueprintByPublicId(req.teacher.id, req.params.id);
  return successResponse(res, { data: blueprint });
});

/**
 * PATCH /api/v1/exam-blueprints/:id
 * Updates an exam blueprint's mutable fields.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateBlueprint = asyncHandler(async (req, res) => {
  const fields = {};
  if (req.body.name !== undefined) fields.name = sanitizeString(req.body.name);
  if (req.body.boardReference !== undefined) {
    fields.boardReference = req.body.boardReference ? sanitizeString(req.body.boardReference) : null;
  }
  if (req.body.totalMarks !== undefined) fields.totalMarks = req.body.totalMarks;
  if (req.body.structure !== undefined) {
    const instructions = req.body.structure.instructions ? sanitizeString(req.body.structure.instructions) : null;
    fields.structure = { ...req.body.structure, instructions };
  }

  const blueprint = await examBlueprintService.updateBlueprint(req.teacher.id, req.params.id, fields);

  return successResponse(res, {
    message: 'Exam blueprint updated successfully',
    data: blueprint,
  });
});

/**
 * DELETE /api/v1/exam-blueprints/:id
 * Soft-deletes an exam blueprint.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const deleteBlueprint = asyncHandler(async (req, res) => {
  await examBlueprintService.deleteBlueprint(req.teacher.id, req.params.id);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Exam blueprint deleted successfully',
    data: null,
  });
});

module.exports = {
  createBlueprint,
  listBlueprints,
  getBlueprint,
  updateBlueprint,
  deleteBlueprint,
};
