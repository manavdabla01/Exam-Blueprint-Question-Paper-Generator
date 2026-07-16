/**
 * auth.validation.js
 *
 * Joi schemas for every auth endpoint. Composed from the shared
 * validators/commonSchemas.js fragments (email, password) so validation
 * rules stay consistent with the rest of the API, plus fields specific to
 * the auth module (instituteName, phone, refreshToken).
 */

'use strict';

const Joi = require('joi');
const commonSchemas = require('../../validators/commonSchemas');

/**
 * POST /api/v1/auth/register
 * Body: { email, password, instituteName, phone? }
 */
const registerSchema = Joi.object({
  email: commonSchemas.email,
  password: commonSchemas.password,
  instituteName: commonSchemas.shortText(150),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]{7,20}$/)
    .allow(null, '')
    .optional()
    .messages({
      'string.pattern.base': 'Phone number format is invalid',
    }),
});

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 */
const loginSchema = Joi.object({
  email: commonSchemas.email,
  password: Joi.string().min(1).required().messages({
    'string.empty': 'Password is required',
  }),
});

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 */
const refreshSchema = Joi.object({
  refreshToken: Joi.string().trim().min(1).required().messages({
    'string.empty': 'Refresh token is required',
  }),
});

/**
 * POST /api/v1/auth/logout
 * Body: { refreshToken }
 */
const logoutSchema = Joi.object({
  refreshToken: Joi.string().trim().min(1).required().messages({
    'string.empty': 'Refresh token is required',
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
};
