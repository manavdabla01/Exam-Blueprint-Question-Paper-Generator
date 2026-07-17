/**
 * sourceMaterial.routes.js
 *
 * Route definitions for the source-material module. Every route requires
 * authentication followed by teacher-context resolution, since every
 * operation here is tenant-scoped.
 */

'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const handleSourceMaterialUpload = require('../../middlewares/upload.middleware');
const sourceMaterialController = require('./sourceMaterial.controller');
const {
  createSourceMaterialSchema,
  listSourceMaterialsSchema,
  sourceMaterialIdParamSchema,
  updateSourceMaterialSchema,
} = require('./sourceMaterial.validation');

const router = express.Router();

router.use(authenticate(), resolveTeacherContext());

router.post(
  '/',
  handleSourceMaterialUpload(),
  validate(createSourceMaterialSchema, 'body'),
  sourceMaterialController.createSourceMaterial
);

router.get('/', validate(listSourceMaterialsSchema, 'query'), sourceMaterialController.listSourceMaterials);

router.get(
  '/:id',
  validate(sourceMaterialIdParamSchema, 'params'),
  sourceMaterialController.getSourceMaterial
);

router.patch(
  '/:id',
  validate(sourceMaterialIdParamSchema, 'params'),
  validate(updateSourceMaterialSchema, 'body'),
  sourceMaterialController.updateSourceMaterial
);

router.delete(
  '/:id',
  validate(sourceMaterialIdParamSchema, 'params'),
  sourceMaterialController.deleteSourceMaterial
);

module.exports = router;
