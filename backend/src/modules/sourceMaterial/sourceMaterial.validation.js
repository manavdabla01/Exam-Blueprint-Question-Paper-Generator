/**
 * sourceMaterial.validation.js
 *
 * Joi schemas for the source-material module's endpoints. Supports both
 * text-content creation (JSON body, sourceType='text', rawTextContent
 * required) and file-based creation (multipart/form-data,
 * sourceType='pdf'|'docx'|'image', file carried in the `file` field and
 * validated by upload.middleware.js rather than Joi, since Joi only
 * inspects `req.body`/`req.params`/`req.query`, never `req.file`).
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

const SORTABLE_FIELDS = ['title', 'createdAt', 'updatedAt'];

/**
 * POST /api/v1/source-materials
 * Body (JSON, sourceType='text'): { subjectId, title, description?, sourceType: 'text', rawTextContent }
 * Body (multipart/form-data, sourceType='pdf'|'docx'|'image'): { subjectId, title, description?, sourceType } + file field
 *
 * `rawTextContent` is required only for sourceType='text' and forbidden
 * otherwise (file-based sources carry their content in the uploaded file,
 * validated separately by upload.middleware.js — Joi cannot inspect
 * `req.file`, so the file's presence is checked in the controller).
 */
const createSourceMaterialSchema = Joi.object({
  subjectId: commonSchemas.publicId,
  title: commonSchemas.shortText(200),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  sourceType: Joi.string().valid('text', 'pdf', 'docx', 'image').required().messages({
    'any.only': 'sourceType must be one of: text, pdf, docx, image',
  }),
  rawTextContent: Joi.string()
    .trim()
    .min(1)
    .max(100000)
    .when('sourceType', {
      is: 'text',
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    })
    .messages({
      'string.empty': 'rawTextContent is required for text source materials',
      'any.unknown': 'rawTextContent must not be provided for file-based source materials',
    }),
});

/**
 * GET /api/v1/source-materials
 * Query: { subjectId?, page?, pageSize?, search?, sortBy?, sortOrder? }
 */
const listSourceMaterialsSchema = commonSchemas
  .listQuerySchema(SORTABLE_FIELDS, 'createdAt')
  .keys({
    subjectId: Joi.string()
      .guid({ version: ['uuidv4', 'uuidv7'] })
      .optional(),
  });

/**
 * GET /api/v1/source-materials/:id
 * PATCH /api/v1/source-materials/:id
 * DELETE /api/v1/source-materials/:id
 * Params: { id }
 */
const sourceMaterialIdParamSchema = Joi.object({
  id: commonSchemas.publicId,
});

/**
 * PATCH /api/v1/source-materials/:id
 * Body: { title?, description? } — at least one field required
 */
const updateSourceMaterialSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one of "title" or "description" must be provided',
  });

module.exports = {
  createSourceMaterialSchema,
  listSourceMaterialsSchema,
  sourceMaterialIdParamSchema,
  updateSourceMaterialSchema,
};
