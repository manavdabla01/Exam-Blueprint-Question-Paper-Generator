/**
 * index.routes.js
 *
 * Aggregates all module-level routers into a single router mounted by
 * app.js. As new modules (auth, subjects, source-materials, etc.) are
 * implemented in later tasks, their routers are registered here.
 */

'use strict';

const express = require('express');

const router = express.Router();

// Module routers (auth, subjects, source-materials, exams, etc.) will be
// registered here in subsequent tasks, e.g.:
//   router.use('/auth', authRoutes);
//   router.use('/subjects', subjectRoutes);

module.exports = router;
