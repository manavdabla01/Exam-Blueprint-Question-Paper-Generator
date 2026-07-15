/**
 * UnauthorizedError.js
 *
 * Thrown when authentication is missing, invalid, or expired.
 * Maps to HTTP 401 Unauthorized. Reserved for use by the auth middleware
 * implemented in a subsequent task.
 */

'use strict';

const AppError = require('./AppError');
const HTTP_STATUS = require('../../constants/httpStatus');

class UnauthorizedError extends AppError {
  /**
   * @param {string} [message] - Human-readable message
   */
  constructor(message = 'Authentication required') {
    super(message, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}

module.exports = UnauthorizedError;
