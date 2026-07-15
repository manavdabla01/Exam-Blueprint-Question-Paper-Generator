/**
 * health.routes.js
 *
 * Route definitions for the health check module.
 */

'use strict';

const express = require('express');
const { getHealth } = require('./health.controller');

const router = express.Router();

router.get('/health', getHealth);

module.exports = router;
