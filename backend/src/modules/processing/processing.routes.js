/**
 * processing.routes.js
 *
 * Route definitions for the processing module.
 *
 * NOTE: `POST /:sourceMaterialId/start` is an explicitly temporary
 * development endpoint for manually driving the pending->processing
 * transition ahead of the real Claude Vision / OCR pipeline (a future
 * task). It should be reconsidered (likely removed or admin-gated) once
 * automatic processing is triggered by upload completion instead.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const processingController = require('./processing.controller');
const { startProcessingParamSchema } = require('./processing.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.post(
  '/:sourceMaterialId/start',
  validate(startProcessingParamSchema, 'params'),
  processingController.startProcessing
);

module.exports = router;
