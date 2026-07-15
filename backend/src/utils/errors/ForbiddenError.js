/**
 * ForbiddenError.js
 *
 * Thrown when an authenticated actor is identified correctly but is not
 * permitted to perform the requested action (wrong role, or attempting to
 * access/modify a resource they do not own). Maps to HTTP 403 Forbidden.
 *
 * Note: for tenant-owned resources (subjects, source materials, exams),
 * prefer NotFoundError over ForbiddenError when a teacher requests a
 * resource belonging to another tenant — returning 404 avoids confirming
 * to an attacker that the resource exists at all. ForbiddenError is
 * reserved for cases where existence disclosure is not a concern (e.g.
 * role-gated admin endpoints).
 */

'use strict';

const AppError = require('./AppError');
const HTTP_STATUS = require('../../constants/httpStatus');

class ForbiddenError extends AppError {
  /**
   * @param {string} [message] - Human-readable message
   */
  constructor(message = 'You do not have permission to perform this action') {
    super(message, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
  }
}

module.exports = ForbiddenError;
