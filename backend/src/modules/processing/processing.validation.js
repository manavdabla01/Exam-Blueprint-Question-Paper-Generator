/**
 * processing.validation.js
 *
 * Joi schemas for the processing module's endpoints.
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

/**
 * POST /api/v1/processing/:sourceMaterialId/start
 * Params: { sourceMaterialId }
 */
const startProcessingParamSchema = Joi.object({
  sourceMaterialId: commonSchemas.publicId,
});

module.exports = {
  startProcessingParamSchema,
};
