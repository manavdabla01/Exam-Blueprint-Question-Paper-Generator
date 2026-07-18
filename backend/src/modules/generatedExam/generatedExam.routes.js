/**
 * generatedExam.routes.js
 *
 * Route definitions for the generated-exam module. Every route requires
 * authentication followed by teacher-context resolution.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const generatedExamController = require('./generatedExam.controller');
const {
  createGeneratedExamSchema,
  listGeneratedExamsSchema,
  generatedExamIdParamSchema,
} = require('./generatedExam.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.post('/', validate(createGeneratedExamSchema, 'body'), generatedExamController.createGeneratedExam);

router.get('/', validate(listGeneratedExamsSchema, 'query'), generatedExamController.listGeneratedExams);

router.get(
  '/:id',
  validate(generatedExamIdParamSchema, 'params'),
  generatedExamController.getGeneratedExam
);

router.delete(
  '/:id',
  validate(generatedExamIdParamSchema, 'params'),
  generatedExamController.deleteGeneratedExam
);

module.exports = router;
