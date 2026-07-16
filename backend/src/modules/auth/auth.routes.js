/**
 * auth.routes.js
 *
 * Route definitions for the auth module. Each route composes:
 *  1. An appropriate rate limiter (strict login limiter on /login, the
 *     app-wide global limiter is already applied upstream in app.js for
 *     everything else).
 *  2. The generic Joi validation middleware bound to the endpoint's schema.
 *  3. The controller handler.
 *
 * No authentication middleware is applied here — every route in this
 * module is intentionally public (a caller cannot be authenticated before
 * they have logged in).
 */

'use strict';

const express = require('express');
const validate = require('../../middlewares/validate.middleware');
const { loginLimiter } = require('../../middlewares/rateLimiter.middleware');
const authController = require('./auth.controller');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(registerSchema, 'body'), authController.register);

router.post('/login', loginLimiter(), validate(loginSchema, 'body'), authController.login);

router.post('/refresh', validate(refreshSchema, 'body'), authController.refresh);

router.post('/logout', validate(logoutSchema, 'body'), authController.logout);

module.exports = router;
