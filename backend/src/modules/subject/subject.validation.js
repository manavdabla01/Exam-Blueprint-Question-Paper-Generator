/**
 * subject.validation.js
 *
 * Joi schemas for the subject module's endpoints.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

const SORTABLE_FIELDS = ['name', 'grade', 'createdAt', 'updatedAt'];

/**
 * POST /api/v1/subjects
 * Body: { name, grade }
 */
const createSubjectSchema = Joi.object({
  name: commonSchemas.shortText(100),
  grade: commonSchemas.shortText(30),
});

/**
 * GET /api/v1/subjects
 * Query: { page?, pageSize?, search?, sortBy?, sortOrder? }
 */
const listSubjectsSchema = commonSchemas.listQuerySchema(SORTABLE_FIELDS, 'createdAt');

/**
 * GET /api/v1/subjects/:id
 * PATCH /api/v1/subjects/:id
 * DELETE /api/v1/subjects/:id
 * Params: { id }
 */
const subjectIdParamSchema = Joi.object({
  id: commonSchemas.publicId,
});

/**
 * PATCH /api/v1/subjects/:id
 * Body: { name?, grade? } — at least one field required
 */
const updateSubjectSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  grade: Joi.string().trim().min(1).max(30).optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one of "name" or "grade" must be provided',
  });

module.exports = {
  createSubjectSchema,
  listSubjectsSchema,
  subjectIdParamSchema,
  updateSubjectSchema,
};
