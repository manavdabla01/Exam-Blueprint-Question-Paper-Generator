/**
 * pdf.routes.js
 *
 * Route definitions for the PDF export module. Mounted at the same
 * `/generated-exams` prefix as generatedExam.routes.js (see
 * routes/index.routes.js) so the final path is
 * `GET /api/v1/generated-exams/:id/pdf`, without needing to modify the
 * existing generated-exam route file — Express allows multiple routers
 * to share a mount prefix, and this router's `/:id/pdf` path never
 * collides with generatedExam.routes.js's `/:id` or `/:id/generate`
 * patterns.
 */

'use strict';

const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../../middlewares/auth.middleware');
const resolveTeacherContext = require('../../middlewares/resolveTeacherContext.middleware');
const validate = require('../../middlewares/validate.middleware');
const commonSchemas = require('../../validators/commonSchemas');
const pdfController = require('./pdf.controller');

const router = express.Router();

const pdfParamSchema = Joi.object({
  id: commonSchemas.publicId,
});

router.use(authenticate(), resolveTeacherContext());

router.get('/:id/pdf', validate(pdfParamSchema, 'params'), pdfController.getExamPdf);

module.exports = router;
