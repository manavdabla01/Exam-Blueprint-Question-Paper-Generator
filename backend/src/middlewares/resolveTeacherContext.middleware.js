/**
 * resolveTeacherContext.middleware.js
 *
 * The JWT access token (see auth.middleware.js) only carries the
 * teacher's public UUID (`req.teacher.publicId`) — by design, internal
 * auto-increment ids are never placed in a client-visible token. However,
 * every tenant-scoped repository (subjects, source materials, etc.)
 * filters by the internal `teacher_id` foreign key for efficient indexed
 * joins/lookups.
 *
 * This middleware bridges the two: given an already-authenticated
 * request (`req.teacher.publicId` set by auth.middleware.js), it resolves
 * the corresponding internal id and attaches it as `req.teacher.id`. It
 * also re-confirms the teacher account is still active, so a token issued
 * before an account was suspended/deleted stops working immediately
 * rather than only at its natural expiry.
 *
 * Must be registered after `authenticate()` on any route that touches a
 * tenant-scoped resource.
 */

'use strict';

const teacherRepository = require('../modules/auth/teacher.repository');
const UnauthorizedError = require('../utils/errors/UnauthorizedError');
const APP_CONSTANTS = require('../constants/appConstants');

/**
 * @returns {Function} Express middleware (req, res, next)
 */
function resolveTeacherContext() {
  return async (req, res, next) => {
    try {
      if (!req.teacher || !req.teacher.publicId) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const teacherRow = await teacherRepository.findByPublicId(req.teacher.publicId);

      if (!teacherRow) {
        return next(new UnauthorizedError('Account no longer exists'));
      }

      if (teacherRow.status !== APP_CONSTANTS.TEACHER_STATUS.ACTIVE) {
        return next(new UnauthorizedError('Account is not active'));
      }

      req.teacher.id = teacherRow.id;

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = resolveTeacherContext;
