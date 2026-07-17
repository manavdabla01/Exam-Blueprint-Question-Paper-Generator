/**
 * sourceMaterial.controller.js
 *
 * HTTP layer for the source-material module. Translates Express req/res
 * into plain arguments for sourceMaterial.service.js and shapes results
 * into the standardized response envelope. Contains no SQL and no
 * business logic.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse, paginationResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const sourceMaterialService = require('./sourceMaterial.service');
const { sanitizeString } = require('../../utils/sanitize.util');

/**
 * POST /api/v1/source-materials
 * Creates a new source material. Accepts either a JSON body
 * (sourceType='text', with rawTextContent) or a multipart/form-data
 * request (sourceType='pdf'|'docx'|'image', with the file under the
 * `file` field, already validated and sanitized by upload.middleware.js).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createSourceMaterial = asyncHandler(async (req, res) => {
  const title = sanitizeString(req.body.title);
  const description = req.body.description ? sanitizeString(req.body.description) : null;

  const uploadedFile = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        sanitizedFilename: req.file.sanitizedFilename,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : undefined;

  const sourceMaterial = await sourceMaterialService.createSourceMaterial(req.teacher.id, {
    teacherPublicId: req.teacher.publicId,
    subjectId: req.body.subjectId,
    title,
    description,
    sourceType: req.body.sourceType,
    rawTextContent: req.body.rawTextContent,
    uploadedFile,
  });

  return successResponse(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Source material created successfully',
    data: sourceMaterial,
  });
});

/**
 * GET /api/v1/source-materials
 * Lists the authenticated teacher's source materials with optional
 * subject filter, search, sort, and pagination.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const listSourceMaterials = asyncHandler(async (req, res) => {
  const { subjectId, page, pageSize, search, sortBy, sortOrder } = req.query;

  const { items, totalItems } = await sourceMaterialService.listSourceMaterials(req.teacher.id, {
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
 * GET /api/v1/source-materials/:id
 * Retrieves a single source material, including its full text content.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSourceMaterial = asyncHandler(async (req, res) => {
  const sourceMaterial = await sourceMaterialService.getSourceMaterialByPublicId(req.teacher.id, req.params.id);
  return successResponse(res, { data: sourceMaterial });
});

/**
 * PATCH /api/v1/source-materials/:id
 * Updates a source material's title and/or description.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateSourceMaterial = asyncHandler(async (req, res) => {
  const fields = {};
  if (req.body.title !== undefined) fields.title = sanitizeString(req.body.title);
  if (req.body.description !== undefined) {
    fields.description = req.body.description ? sanitizeString(req.body.description) : null;
  }

  const sourceMaterial = await sourceMaterialService.updateSourceMaterial(req.teacher.id, req.params.id, fields);

  return successResponse(res, {
    message: 'Source material updated successfully',
    data: sourceMaterial,
  });
});

/**
 * DELETE /api/v1/source-materials/:id
 * Soft-deletes a source material.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const deleteSourceMaterial = asyncHandler(async (req, res) => {
  await sourceMaterialService.deleteSourceMaterial(req.teacher.id, req.params.id);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Source material deleted successfully',
    data: null,
  });
});

module.exports = {
  createSourceMaterial,
  listSourceMaterials,
  getSourceMaterial,
  updateSourceMaterial,
  deleteSourceMaterial,
};
