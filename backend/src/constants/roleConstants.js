/**
 * roleConstants.js
 *
 * Role definitions reserved for future authorization/RBAC middleware.
 * Currently the platform has a single primary actor (teacher), but this
 * is defined up front so auth middleware built in later tasks has a
 * stable contract to depend on.
 */

'use strict';

const ROLES = Object.freeze({
  TEACHER: 'teacher',
  ADMIN: 'admin',
});

module.exports = ROLES;
