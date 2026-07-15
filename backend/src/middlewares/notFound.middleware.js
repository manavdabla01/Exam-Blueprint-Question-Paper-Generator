/**
 * notFound.middleware.js
 *
 * Catches any request that did not match a defined route and forwards a
 * NotFoundError to the global error handler, ensuring unmatched routes
 * still return the standardized error envelope instead of Express's
 * default HTML 404 page.
 */

'use strict';

const NotFoundError = require('../utils/errors/NotFoundError');

/**
 * @returns {Function} Express middleware (must be registered after all routes)
 */
function notFoundMiddleware() {
  return (req, res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
  };
}

module.exports = notFoundMiddleware;
