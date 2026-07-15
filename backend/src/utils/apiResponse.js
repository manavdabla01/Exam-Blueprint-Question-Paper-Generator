/**
 * apiResponse.js
 *
 * Standardized response shape helpers used by every controller so that
 * API consumers (the React frontend) always receive a predictable,
 * consistent envelope:
 *
 *   Success: { success: true, data, meta? }
 *   Error:   { success: false, error: { code, message, details? } }
 */

'use strict';

const HTTP_STATUS = require('../constants/httpStatus');

/**
 * Sends a standardized success response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {Object} [options]
 * @param {number} [options.statusCode] - HTTP status code (default 200)
 * @param {any} [options.data] - Payload to return to the client
 * @param {string} [options.message] - Optional human-readable message
 * @returns {import('express').Response}
 */
function successResponse(res, { statusCode = HTTP_STATUS.OK, data = null, message = null } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  return res.status(statusCode).json(body);
}

/**
 * Sends a standardized error response.
 * Note: in most cases controllers should simply `throw` an AppError and
 * let the global error handler call this internally — this export exists
 * for the rare case a controller needs to respond without throwing.
 *
 * @param {import('express').Response} res - Express response object
 * @param {Object} [options]
 * @param {number} [options.statusCode] - HTTP status code (default 500)
 * @param {string} [options.code] - Machine-readable error code
 * @param {string} [options.message] - Human-readable error message
 * @param {Object|Array|null} [options.details] - Additional error context
 * @returns {import('express').Response}
 */
function errorResponse(
  res,
  { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred', details = null } = {}
) {
  const body = {
    success: false,
    error: { code, message },
  };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}

/**
 * Sends a standardized paginated success response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {Object} options
 * @param {Array<any>} options.items - The page of records being returned
 * @param {number} options.page - Current page number (1-indexed)
 * @param {number} options.pageSize - Number of items per page
 * @param {number} options.totalItems - Total number of records available
 * @param {number} [options.statusCode] - HTTP status code (default 200)
 * @returns {import('express').Response}
 */
function paginationResponse(res, { items, page, pageSize, totalItems, statusCode = HTTP_STATUS.OK }) {
  const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0;
  return res.status(statusCode).json({
    success: true,
    data: items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
}

module.exports = {
  successResponse,
  errorResponse,
  paginationResponse,
};
