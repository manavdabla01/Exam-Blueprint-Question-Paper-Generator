/**
 * sourceMaterial.validation.js
 *
 * Joi schemas for the source-material module's endpoints. Creation is
 * intentionally restricted to `sourceType: 'text'` — 'file' and 'image'
 * require an actual uploaded file, which is out of scope for this task
 * (no Multer/upload pipeline implemented yet). Submitting 'file' or
 * 'image' here is rejected at the validation layer with a clear message
 * rather than silently accepted and left in a broken half-created state.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

const SORTABLE_FIELDS = ['title', 'createdAt', 'updatedAt'];

/**
 * POST /api/v1/source-materials
 * Body: { subjectId, title, description?, sourceType, rawTextContent }
 */
const createSourceMaterialSchema = Joi.object({
  subjectId: commonSchemas.publicId,
  title: commonSchemas.shortText(200),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  sourceType: Joi.string().valid('text').required().messages({
    'any.only':
      'Only "text" source materials can be created via this endpoint. File and image uploads are not yet available.',
  }),
  rawTextContent: Joi.string().trim().min(1).max(100000).required().messages({
    'string.empty': 'rawTextContent is required for text source materials',
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
