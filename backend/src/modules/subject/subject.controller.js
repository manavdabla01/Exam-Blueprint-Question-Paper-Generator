/**
 * subject.controller.js
 *
 * HTTP layer for the subject module. Translates Express req/res into
 * plain arguments for subject.service.js and shapes results into the
 * standardized response envelope. Contains no SQL and no business logic.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, paginationResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const subjectService = require('./subject.service');
const { sanitizeString } = require('../../utils/sanitize.util');

/**
 * POST /api/v1/subjects
 * Creates a new subject for the authenticated teacher.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createSubject = asyncHandler(async (req, res) => {
  const name = sanitizeString(req.body.name);
  const grade = sanitizeString(req.body.grade);

  const subject = await subjectService.createSubject(req.teacher.id, { name, grade });

  return successResponse(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Subject created successfully',
    data: subject,
  });
});

/**
 * GET /api/v1/subjects
 * Lists the authenticated teacher's subjects with search/sort/pagination.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listSubjects = asyncHandler(async (req, res) => {
  const { page, pageSize, search, sortBy, sortOrder } = req.query;

  const { items, totalItems } = await subjectService.listSubjects(req.teacher.id, {
    search: search || null,
    sortBy,
    sortOrder,
    page,
    pageSize,
  });

  return paginationResponse(res, { items, page, pageSize, totalItems });
});

/**
 * GET /api/v1/subjects/:id
 * Retrieves a single subject by its public id.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSubject = asyncHandler(async (req, res) => {
  const subject = await subjectService.getSubjectByPublicId(req.teacher.id, req.params.id);
  return successResponse(res, { data: subject });
});

/**
 * PATCH /api/v1/subjects/:id
 * Updates a subject's name and/or grade.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateSubject = asyncHandler(async (req, res) => {
  const fields = {};
  if (req.body.name !== undefined) fields.name = sanitizeString(req.body.name);
  if (req.body.grade !== undefined) fields.grade = sanitizeString(req.body.grade);

  const subject = await subjectService.updateSubject(req.teacher.id, req.params.id, fields);

  return successResponse(res, {
    message: 'Subject updated successfully',
    data: subject,
  });
});

/**
 * DELETE /api/v1/subjects/:id
 * Soft-deletes a subject.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const deleteSubject = asyncHandler(async (req, res) => {
  await subjectService.deleteSubject(req.teacher.id, req.params.id);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Subject deleted successfully',
    data: null,
  });
});

module.exports = {
  createSubject,
  listSubjects,
  getSubject,
  updateSubject,
  deleteSubject,
};
