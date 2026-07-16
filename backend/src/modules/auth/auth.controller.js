/**
 * auth.controller.js
 *
 * HTTP layer for the auth module. Translates Express req/res into plain
 * arguments for auth.service.js, and shapes service results into the
 * standardized response envelope via utils/apiResponse.js. Contains no
 * business logic, no SQL, and no direct JWT/bcrypt calls — all of that
 * lives in the service and utility layers.
 *
 * Request context (ipAddress, userAgent) is extracted here, once, and
 * passed down to the service so the service itself stays framework
 * agnostic and unit-testable without a real Express req object.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const authService = require('./auth.service');
const { normalizeEmail, sanitizeString } = require('../../utils/sanitize.util');

/**
 * Extracts the request context (client IP and User-Agent) needed for
 * refresh-token issuance and audit logging.
 *
 * @param {import('express').Request} req
 * @returns {{ ipAddress: string, userAgent: string|null }}
 */
function getRequestContext(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] || null,
  };
}

/**
 * POST /api/v1/auth/register
 * Registers a new teacher account and returns an access + refresh token
 * pair along with the public teacher profile.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const register = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const instituteName = sanitizeString(req.body.instituteName);
  const phone = req.body.phone ? sanitizeString(req.body.phone) : null;

  const result = await authService.registerTeacher(
    {
      email,
      password: req.body.password,
      instituteName,
      phone,
    },
    getRequestContext(req)
  );

  return successResponse(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Account created successfully',
    data: result,
  });
});

/**
 * POST /api/v1/auth/login
 * Authenticates a teacher and returns an access + refresh token pair.
 * On failure, always responds with a generic "Invalid email or password"
 * message regardless of the specific reason (handled inside the service).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  const result = await authService.loginTeacher(
    {
      email,
      password: req.body.password,
    },
    getRequestContext(req)
  );

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Logged in successfully',
    data: result,
  });
});

/**
 * POST /api/v1/auth/refresh
 * Rotates a refresh token: the presented token is revoked and a new
 * access + refresh token pair is issued.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshAccessToken(req.body.refreshToken, getRequestContext(req));

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Token refreshed successfully',
    data: result,
  });
});

/**
 * POST /api/v1/auth/logout
 * Revokes the presented refresh token. Always responds with success,
 * since the end state the client cares about (token no longer usable)
 * holds true even if the token was already invalid or revoked.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const logout = asyncHandler(async (req, res) => {
  await authService.logoutTeacher(req.body.refreshToken);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Logged out successfully',
    data: null,
  });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
};
