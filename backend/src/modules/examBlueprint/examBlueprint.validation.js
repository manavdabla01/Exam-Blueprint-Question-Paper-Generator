/**
 * examBlueprint.validation.js
 *
 * Joi schemas for the exam blueprint module's endpoints. The `structure`
 * object encodes the actual exam plan (difficulty distribution, question
 * type distribution, chapter/topic weightage, instructions) and is
 * stored verbatim in `exam_blueprints.structure_json`. Percentage-based
 * distributions are validated to sum to 100 using custom Joi validators
 * built on examBlueprint.util.js, so an internally inconsistent blueprint
 * (e.g. difficulty percentages summing to 90%) is rejected before it
 * ever reaches the database.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');
const { sumsToOneHundred, chapterWeightageSumsToOneHundred } = require('./examBlueprint.util');

const SORTABLE_FIELDS = ['name', 'totalMarks', 'createdAt', 'updatedAt'];

/**
 * Percentage distribution object (e.g. difficulty or question type),
 * validated as a map of string keys to 0-100 numeric percentages that
 * must sum to 100.
 */
const percentageDistributionSchema = Joi.object()
  .pattern(Joi.string().min(1).max(50), Joi.number().min(0).max(100))
  .min(1)
  .custom((value, helpers) => {
    if (!sumsToOneHundred(value)) {
      return helpers.error('distribution.sum');
    }
    return value;
  })
  .messages({
    'distribution.sum': 'Distribution percentages must sum to 100',
  });

/**
 * Chapter/topic weightage array: each entry names a topic and its
 * percentage weight, and the weights across all entries must sum to 100.
 */
const chapterWeightageSchema = Joi.array()
  .items(
    Joi.object({
      topic: Joi.string().trim().min(1).max(150).required(),
      weightagePercent: Joi.number().min(0).max(100).required(),
    })
  )
  .min(1)
  .custom((value, helpers) => {
    if (!chapterWeightageSumsToOneHundred(value)) {
      return helpers.error('weightage.sum');
    }
    return value;
  })
  .messages({
    'weightage.sum': 'Chapter/topic weightage percentages must sum to 100',
  });

/**
 * The full blueprint structure object.
 */
const structureSchema = Joi.object({
  numberOfQuestions: Joi.number().integer().min(1).max(200).required(),
  difficultyDistribution: percentageDistributionSchema.required(),
  questionTypeDistribution: percentageDistributionSchema.required(),
  chapterWeightage: chapterWeightageSchema.required(),
  instructions: Joi.string().trim().max(2000).allow('', null).optional(),
});

/**
 * POST /api/v1/exam-blueprints
 * Body: { subjectId, name, boardReference?, totalMarks, structure }
 */
const createBlueprintSchema = Joi.object({
  subjectId: commonSchemas.publicId,
  name: commonSchemas.shortText(150),
  boardReference: Joi.string().trim().max(100).allow('', null).optional(),
  totalMarks: Joi.number().integer().min(1).max(500).required(),
  structure: structureSchema.required(),
});

/**
 * GET /api/v1/exam-blueprints
 * Query: { subjectId?, page?, pageSize?, search?, sortBy?, sortOrder? }
 */
const listBlueprintsSchema = commonSchemas.listQuerySchema(SORTABLE_FIELDS, 'createdAt').keys({
  subjectId: Joi.string()
    .guid({ version: ['uuidv4', 'uuidv7'] })
    .optional(),
});

/**
 * GET /api/v1/exam-blueprints/:id
 * PATCH /api/v1/exam-blueprints/:id
 * DELETE /api/v1/exam-blueprints/:id
 * Params: { id }
 */
const blueprintIdParamSchema = Joi.object({
  id: commonSchemas.publicId,
});

/**
 * PATCH /api/v1/exam-blueprints/:id
 * Body: { name?, boardReference?, totalMarks?, structure? } — at least one field required
 */
const updateBlueprintSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).optional(),
  boardReference: Joi.string().trim().max(100).allow('', null).optional(),
  totalMarks: Joi.number().integer().min(1).max(500).optional(),
  structure: structureSchema.optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided to update',
  });

module.exports = {
  createBlueprintSchema,
  listBlueprintsSchema,
  blueprintIdParamSchema,
  updateBlueprintSchema,
};
