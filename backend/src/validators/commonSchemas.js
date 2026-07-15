/**
 * commonSchemas.js
 *
 * Reusable Joi schema fragments for field types that recur across many
 * modules (email, password, UUID public IDs, pagination). Module-specific
 * schemas (auth.validation.js, subject.validation.js, etc., introduced in
 * later tasks) should compose these fragments rather than redefining
 * their own email/password/UUID rules, so validation behavior stays
 * consistent across the whole API surface.
 */

'use strict';

const Joi = require('joi');
const APP_CONSTANTS = require('../constants/appConstants');

/**
 * Standard email field: required, valid email format, trimmed, lowercased.
 */
const email = Joi.string().trim().lowercase().email({ tlds: false }).max(255).required().messages({
  'string.email': 'Must be a valid email address',
  'string.empty': 'Email is required',
});

/**
 * Standard password field for registration/reset flows: minimum 8
 * characters, must contain at least one letter and one number.
 */
const password = Joi.string()
  .min(8)
  .max(72) // bcrypt silently truncates beyond 72 bytes; enforce at the boundary
  .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 72 characters',
    'string.pattern.base': 'Password must contain at least one letter and one number',
    'string.empty': 'Password is required',
  });

/**
 * A UUID (v1-v7) formatted public identifier, used for all path params
 * referencing a tenant-owned resource by its public_id.
 */
const publicId = Joi.string().guid({ version: ['uuidv4', 'uuidv7'] }).required().messages({
  'string.guid': 'Must be a valid identifier',
});

/**
 * Standard pagination query fragment: page and pageSize, both optional
 * with sane bounds (mirrors utils/paginationHelper.js defaults).
 */
const pagination = {
  page: Joi.number().integer().min(1).default(APP_CONSTANTS.DEFAULT_PAGE),
  pageSize: Joi.number().integer().min(1).max(APP_CONSTANTS.MAX_PAGE_SIZE).default(APP_CONSTANTS.DEFAULT_PAGE_SIZE),
};

/**
 * Generic non-empty, trimmed short text field (names, titles), with a
 * configurable max length.
 *
 * @param {number} [maxLength] - Maximum allowed length (default 150)
 * @returns {import('joi').StringSchema}
 */
function shortText(maxLength = 150) {
  return Joi.string().trim().min(1).max(maxLength).required();
}

module.exports = {
  email,
  password,
  publicId,
  pagination,
  shortText,
};
