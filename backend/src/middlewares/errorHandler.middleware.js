/**
 * errorHandler.middleware.js
 *
 * Global Express error-handling middleware. Must be registered LAST, after
 * all routes and the notFound middleware. Every error thrown anywhere in
 * the request lifecycle (via `throw` in an asyncHandler-wrapped route, or
 * via `next(err)`) ends up here.
 *
 * Behavior:
 *  - AppError (and subclasses) are trusted, operational errors: their
 *    statusCode/errorCode/message/details are sent to the client as-is.
 *  - Any other error (a genuine bug, an unexpected exception from a
 *    library, etc.) is treated as non-operational: the client receives a
 *    generic 500 message (no internals/stack leaked), while the full
 *    error is logged server-side for investigation.
 */

'use strict';

const AppError = require('../utils/errors/AppError');
const HTTP_STATUS = require('../constants/httpStatus');
const logger = require('../utils/logger');
const config = require('../config/env');

/**
 * @returns {Function} Express error-handling middleware (4-arg signature required by Express)
 */
function errorHandlerMiddleware() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const isTrustedError = err instanceof AppError;

    const statusCode = isTrustedError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const errorCode = isTrustedError ? err.errorCode : 'INTERNAL_ERROR';
    const clientMessage = isTrustedError ? err.message : 'An unexpected error occurred. Please try again later.';
    const details = isTrustedError ? err.details : null;

    const logPayload = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      errorCode,
      message: err.message,
      stack: err.stack,
    };

    if (isTrustedError) {
      logger.warn(`Operational error: ${err.message}`, logPayload);
    } else {
      logger.error(`Unhandled error: ${err.message}`, logPayload);
    }

    const responseBody = {
      success: false,
      error: {
        code: errorCode,
        message: clientMessage,
      },
    };

    if (details) {
      responseBody.error.details = details;
    }

    // In development, surface the stack trace to speed up debugging.
    if (config.isDevelopment && !isTrustedError) {
      responseBody.error.stack = err.stack;
    }

    res.status(statusCode).json(responseBody);
  };
}

module.exports = errorHandlerMiddleware;
