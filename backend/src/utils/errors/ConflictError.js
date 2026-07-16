/**
 * ConflictError.js
 *
 * Thrown when a request conflicts with existing state — most commonly a
 * uniqueness violation (e.g. registering with an email that already
 * exists). Maps to HTTP 409 Conflict.
 */

'use strict';

const AppError = require('./AppError');
const HTTP_STATUS = require('../../constants/httpStatus');

class ConflictError extends AppError {
  /**
   * @param {string} [message] - Human-readable message
   */
  constructor(message = 'Resource already exists') {
    super(message, HTTP_STATUS.CONFLICT, 'CONFLICT');
  }
}

module.exports = ConflictError;
