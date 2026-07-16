/**
 * subject.routes.js
 *
 * Route definitions for the subject module. Every route requires
 * authentication (`authenticate()`) followed by teacher-context
 * resolution (`resolveTeacherContext()`) before reaching validation and
 * the controller, since every operation here is tenant-scoped.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const subjectController = require('./subject.controller');
const {
  createSubjectSchema,
  listSubjectsSchema,
  subjectIdParamSchema,
  updateSubjectSchema,
} = require('./subject.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.post('/', validate(createSubjectSchema, 'body'), subjectController.createSubject);

router.get('/', validate(listSubjectsSchema, 'query'), subjectController.listSubjects);

router.get('/:id', validate(subjectIdParamSchema, 'params'), subjectController.getSubject);

router.patch(
  '/:id',
  validate(subjectIdParamSchema, 'params'),
  validate(updateSubjectSchema, 'body'),
  subjectController.updateSubject
);

router.delete('/:id', validate(subjectIdParamSchema, 'params'), subjectController.deleteSubject);

module.exports = router;
