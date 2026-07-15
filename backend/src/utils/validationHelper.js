/**
 * validationHelper.js
 *
 * Small set of framework-agnostic validation primitives used by
 * per-module `*.validation.js` files (introduced in later tasks) and
 * anywhere else basic input shape checking is needed before it reaches
 * the database layer.
 */

'use strict';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates that a string is a syntactically well-formed email address.
 *
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Validates that a value is a non-empty, trimmed string within optional
 * min/max length bounds.
 *
 * @param {any} value
 * @param {Object} [options]
 * @param {number} [options.minLength]
 * @param {number} [options.maxLength]
 * @returns {boolean}
 */
function isNonEmptyString(value, { minLength = 1, maxLength = Infinity } = {}) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length >= minLength && trimmed.length <= maxLength;
}

/**
 * Validates password strength: minimum 8 characters, at least one letter
 * and one number. Kept intentionally simple and adjustable in one place.
 *
 * @param {string} password
 * @returns {boolean}
 */
function isStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

/**
 * Validates that a value is a positive integer (used for IDs, pagination).
 *
 * @param {any} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

/**
 * Validates that a string is a syntactically well-formed UUID (v1-v7).
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidUUID(value) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof value === 'string' && UUID_REGEX.test(value);
}

module.exports = {
  isValidEmail,
  isNonEmptyString,
  isStrongPassword,
  isPositiveInteger,
  isValidUUID,
};
