/**
 * generatedExam.validation.js
 *
 * Joi schemas for the generated-exam module's endpoints.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

const SORTABLE_FIELDS = ['title', 'status', 'createdAt', 'updatedAt'];

/**
 * POST /api/v1/generated-exams
 * Body: { blueprintId, title?, sourceMaterialIds? }
 */
const createGeneratedExamSchema = Joi.object({
  blueprintId: commonSchemas.publicId,
  title: Joi.string().trim().min(1).max(200).optional(),
  sourceMaterialIds: Joi.array()
    .items(
      Joi.string().guid({ version: ['uuidv4', 'uuidv7'] })
    )
    .min(1)
    .optional(),
});

/**
 * GET /api/v1/generated-exams
 * Query: { subjectId?, page?, pageSize?, search?, sortBy?, sortOrder? }
 */
const listGeneratedExamsSchema = commonSchemas.listQuerySchema(SORTABLE_FIELDS, 'createdAt').keys({
  subjectId: Joi.string()
    .guid({ version: ['uuidv4', 'uuidv7'] })
    .optional(),
});

/**
 * GET /api/v1/generated-exams/:id
 * DELETE /api/v1/generated-exams/:id
 * Params: { id }
 */
const generatedExamIdParamSchema = Joi.object({
  id: commonSchemas.publicId,
});

module.exports = {
  createGeneratedExamSchema,
  listGeneratedExamsSchema,
  generatedExamIdParamSchema,
};
