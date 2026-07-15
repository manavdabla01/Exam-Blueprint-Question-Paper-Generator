/**
 * sanitize.util.js
 *
 * Input sanitization helpers applied to incoming request data before it
 * reaches validation/business logic. These are defense-in-depth measures
 * that complement, but do not replace, the project's core injection
 * defenses:
 *  - SQL injection is prevented structurally by always using parameterized
 *    queries (see config/database.js `query()`), never by sanitizing
 *    strings for SQL — string sanitization is NOT a substitute for
 *    parameterization and this module makes no attempt at SQL escaping.
 *  - NoSQL-style injection (e.g. an attacker passing an object where a
 *    string is expected, such as `{ "$ne": null }`) is prevented by
 *    strict type validation in the Joi schemas, but `stripNonPrimitive`
 *    below adds a belt-and-braces check for the same class of attack.
 *  - XSS is mitigated by stripping HTML/script content from free-text
 *    fields that will ever be rendered back to a browser (e.g. institute
 *    name, subject name) before persistence.
 */

'use strict';

const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_PROTOCOL_REGEX = /javascript:/gi;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;

/**
 * Strips HTML tags, `javascript:` URIs, and control characters from a
 * string, then trims surrounding whitespace. Intended for free-text
 * fields that may later be rendered in the frontend (institute name,
 * subject name, exam titles, etc.).
 *
 * @param {string} input - Raw user-supplied string
 * @returns {string} Sanitized string safe to store/render
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(HTML_TAG_REGEX, '')
    .replace(SCRIPT_PROTOCOL_REGEX, '')
    .replace(CONTROL_CHARS_REGEX, '')
    .trim();
}

/**
 * Normalizes an email address for consistent storage/lookup: trims
 * whitespace and lowercases it. Does NOT validate format — pair with
 * `validationHelper.isValidEmail` for that.
 *
 * @param {string} email - Raw user-supplied email
 * @returns {string} Normalized email string
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') return email;
  return email.trim().toLowerCase();
}

/**
 * Recursively walks a plain object/array and applies `sanitizeString` to
 * every string value found. Non-string primitives are left untouched.
 * Used as a final pass over `req.body` for free-text fields before they
 * reach the service layer.
 *
 * @param {any} value - The value (object, array, or primitive) to sanitize
 * @returns {any} A new, sanitized copy of the input (input is not mutated)
 */
function sanitizeDeep(value) {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = sanitizeDeep(value[key]);
    }
    return result;
  }
  return value;
}

/**
 * Defense-in-depth guard against NoSQL/operator-injection-style payloads:
 * rejects (returns false for) any value where a plain scalar was expected
 * but an object or array was supplied instead (e.g. `{ "$ne": null }`
 * submitted for a field validated elsewhere as "string"). This is a
 * supplementary check; the authoritative defense is Joi's strict type
 * validation in each schema.
 *
 * @param {any} value - The value to check
 * @returns {boolean} True if the value is a safe scalar (string, number, boolean, null, undefined)
 */
function isSafeScalar(value) {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean';
}

module.exports = {
  sanitizeString,
  normalizeEmail,
  sanitizeDeep,
  isSafeScalar,
};
