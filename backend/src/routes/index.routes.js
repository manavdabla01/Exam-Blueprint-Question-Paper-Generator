/**
 * index.routes.js
 *
 * Aggregates all module-level routers into a single router mounted by
 * app.js. As new modules (auth, subjects, source-materials, etc.) are
 * implemented in later tasks, their routers are registered here.
 */

'use strict';

const express = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const subjectRoutes = require('../modules/subject/subject.routes');
const sourceMaterialRoutes = require('../modules/sourceMaterial/sourceMaterial.routes');
const processingRoutes = require('../modules/processing/processing.routes');
const aiRoutes = require('../modules/ai/ai.routes');
const examBlueprintRoutes = require('../modules/examBlueprint/examBlueprint.routes');
const generatedExamRoutes = require('../modules/examGenerator/generatedExam.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/subjects', subjectRoutes);
router.use('/source-materials', sourceMaterialRoutes);
router.use('/processing', processingRoutes);
router.use('/ai', aiRoutes);
router.use('/exam-blueprints', examBlueprintRoutes);
router.use('/generated-exams', generatedExamRoutes);

module.exports = router;
