/**
 * NotFoundError.js
 *
 * Thrown when a requested resource does not exist (or, for tenant-scoped
 * resources, does not exist *for the requesting teacher* — we deliberately
 * return 404 rather than 403 in that case to avoid leaking the existence
 * of other tenants' resources).
 */

'use strict';

const AppError = require('./AppError');
const HTTP_STATUS = require('../../constants/httpStatus');

class NotFoundError extends AppError {
  /**
   * @param {string} [message] - Human-readable message
   */
  constructor(message = 'Resource not found') {
    super(message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }
}

module.exports = NotFoundError;
