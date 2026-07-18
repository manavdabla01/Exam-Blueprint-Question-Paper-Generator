/**
 * ai.routes.js
 *
 * Route definitions for the AI module.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const { aiLimiter } = require('../../middlewares/rateLimiter.middleware');
const aiController = require('./ai.controller');
const { transcriptionParamSchema } = require('./ai.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.get(
  '/:sourceMaterialId/transcription',
  aiLimiter(),
  validate(transcriptionParamSchema, 'params'),
  aiController.getTranscription
);

module.exports = router;
