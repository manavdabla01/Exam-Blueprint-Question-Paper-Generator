/**
 * AppError.js
 *
 * Base class for all predictable, operational errors thrown intentionally
 * by the application (as opposed to programmer errors/bugs). Every
 * deliberate error thrown in controllers/services should be an instance
 * of this class (or a subclass of it) so the global error handler can
 * respond with the correct semantic HTTP status code.
 */

'use strict';

const HTTP_STATUS = require('../../constants/httpStatus');

class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode] - HTTP status code to return (default 500)
   * @param {string} [errorCode] - Machine-readable error code for clients
   * @param {Object|null} [details] - Optional additional error context
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
