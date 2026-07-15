/**
 * validate.middleware.js
 *
 * Generic, reusable Express validation middleware built on top of Joi.
 * Module-specific route files pass a Joi schema and the request part to
 * validate ('body' | 'params' | 'query'); this middleware runs the
 * schema, and on failure throws a ValidationError populated with a clean
 * field-level error list (via validationErrorFormatter).
 *
 * On success, the request part is REPLACED with Joi's validated/coerced
 * value (e.g. pagination strings converted to numbers, defaults applied),
 * so downstream code can trust the shape without re-parsing.
 *
 * Usage:
 *   router.post('/subjects', validate(createSubjectSchema, 'body'), controller.create);
 */

'use strict';

const ValidationError = require('../utils/errors/ValidationError');
const { formatJoiError } = require('../validators/validationErrorFormatter');

const VALID_SOURCES = Object.freeze(['body', 'params', 'query']);

/**
 * Express middleware factory that validates a given request part against
 * a Joi schema.
 *
 * @param {import('joi').Schema} schema - The Joi schema to validate against
 * @param {'body'|'params'|'query'} [source] - Which part of the request to validate (default 'body')
 * @returns {Function} Express middleware (req, res, next)
 * @throws {Error} If an invalid `source` value is supplied (programmer error, fails at setup time)
 */
function validate(schema, source = 'body') {
  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`Invalid validation source "${source}". Must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = formatJoiError(error);
      return next(new ValidationError('Request validation failed', details));
    }

    req[source] = value;
    return next();
  };
}

module.exports = validate;
