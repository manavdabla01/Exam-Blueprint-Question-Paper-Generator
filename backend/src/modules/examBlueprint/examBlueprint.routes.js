/**
 * examBlueprint.routes.js
 *
 * Route definitions for the exam blueprint module. Every route requires
 * authentication followed by teacher-context resolution, since every
 * operation here is tenant-scoped.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const examBlueprintController = require('./examBlueprint.controller');
const {
  createBlueprintSchema,
  listBlueprintsSchema,
  blueprintIdParamSchema,
  updateBlueprintSchema,
} = require('./examBlueprint.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.post('/', validate(createBlueprintSchema, 'body'), examBlueprintController.createBlueprint);

router.get('/', validate(listBlueprintsSchema, 'query'), examBlueprintController.listBlueprints);

router.get('/:id', validate(blueprintIdParamSchema, 'params'), examBlueprintController.getBlueprint);

router.patch(
  '/:id',
  validate(blueprintIdParamSchema, 'params'),
  validate(updateBlueprintSchema, 'body'),
  examBlueprintController.updateBlueprint
);

router.delete('/:id', validate(blueprintIdParamSchema, 'params'), examBlueprintController.deleteBlueprint);

module.exports = router;
