/**
 * ValidationError.js
 *
 * Thrown when incoming request data fails schema/business validation.
 * Maps to HTTP 422 Unprocessable Entity.
 */

'use strict';

const AppError = require('./AppError');
const HTTP_STATUS = require('../../constants/httpStatus');

class ValidationError extends AppError {
  /**
   * @param {string} message - Human-readable validation failure summary
   * @param {Object|Array|null} [details] - Field-level validation errors
   */
  constructor(message = 'Validation failed', details = null) {
    super(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', details);
  }
}

module.exports = ValidationError;
