/**
 * authorize.middleware.js
 *
 * Authorization layer that runs AFTER `authenticate()` has populated
 * `req.teacher`. Provides:
 *  - Role-based access control (authorizeRoles)
 *  - A teacher-only convenience shortcut (teacherOnly)
 *  - An ownership-validation helper for tenant-scoped resources
 *
 * This module assumes `req.teacher` is already set; if authentication
 * middleware was not run first, every function here throws
 * UnauthorizedError defensively rather than silently allowing access.
 */

'use strict';

const UnauthorizedError = require('../utils/errors/UnauthorizedError');
const ForbiddenError = require('../utils/errors/ForbiddenError');
const NotFoundError = require('../utils/errors/NotFoundError');
const ROLES = require('../constants/roleConstants');

/**
 * Express middleware factory restricting access to one or more roles.
 * Must be used after `authenticate()`.
 *
 * @param {...string} allowedRoles - Roles permitted to access the route (see ROLES)
 * @returns {Function} Express middleware (req, res, next)
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.teacher) {
      return next(new UnauthorizedError('Authentication required'));
    }
    if (!allowedRoles.includes(req.teacher.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource'));
    }
    return next();
  };
}

/**
 * Express middleware restricting access to the `teacher` role specifically.
 * Convenience wrapper around authorizeRoles(ROLES.TEACHER).
 *
 * @returns {Function} Express middleware (req, res, next)
 */
function teacherOnly() {
  return authorizeRoles(ROLES.TEACHER);
}

/**
 * Validates that the authenticated teacher owns a given resource, by
 * comparing the resource's owning teacher public_id against
 * `req.teacher.publicId`. Throws NotFoundError (not ForbiddenError) on
 * mismatch, deliberately, so that a request for another tenant's resource
 * is indistinguishable from a request for a resource that does not exist
 * — this prevents leaking the existence of other tenants' data.
 *
 * This is a plain function (not a middleware factory) intended to be
 * called from within a service/controller once the resource has been
 * fetched from the repository layer, e.g.:
 *
 *   const subject = await subjectRepository.findByPublicId(id);
 *   ensureOwnership(subject.teacherPublicId, req.teacher.publicId);
 *
 * @param {string} resourceOwnerPublicId - public_id of the teacher who owns the resource
 * @param {string} requestingTeacherPublicId - public_id of the authenticated requester
 * @throws {NotFoundError} If the resource does not belong to the requesting teacher
 */
function ensureOwnership(resourceOwnerPublicId, requestingTeacherPublicId) {
  if (
    !resourceOwnerPublicId ||
    !requestingTeacherPublicId ||
    resourceOwnerPublicId !== requestingTeacherPublicId
  ) {
    throw new NotFoundError('Resource not found');
  }
}

/**
 * Express middleware factory that performs ownership validation directly
 * from route params, given a function that resolves the resource's owning
 * teacher public_id. Useful when ownership can be checked before the
 * controller body runs (e.g. via a lightweight repository lookup).
 *
 * @param {(req: import('express').Request) => Promise<string|null>} resolveOwnerPublicId -
 *   Async function that returns the public_id of the teacher who owns the
 *   resource being requested, or null if the resource does not exist.
 * @returns {Function} Express middleware (req, res, next)
 */
function requireOwnership(resolveOwnerPublicId) {
  return async (req, res, next) => {
    try {
      if (!req.teacher) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const ownerPublicId = await resolveOwnerPublicId(req);

      if (!ownerPublicId) {
        return next(new NotFoundError('Resource not found'));
      }

      ensureOwnership(ownerPublicId, req.teacher.publicId);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  authorizeRoles,
  teacherOnly,
  ensureOwnership,
  requireOwnership,
};
