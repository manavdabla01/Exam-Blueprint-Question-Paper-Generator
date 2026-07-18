/**
 * ai.validation.js
 *
 * Joi schemas for the AI module's endpoints.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

/**
 * GET /api/v1/ai/:sourceMaterialId/transcription
 * Params: { sourceMaterialId }
 */
const transcriptionParamSchema = Joi.object({
  sourceMaterialId: commonSchemas.publicId,
});

module.exports = {
  transcriptionParamSchema,
};
