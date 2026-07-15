/**
 * auth.middleware.js
 *
 * Express middleware that authenticates incoming requests using a JWT
 * access token supplied via the `Authorization: Bearer <token>` header.
 *
 * On success, attaches a minimal authenticated-identity object to
 * `req.teacher` ({ publicId, email, role }) for downstream
 * controllers/services/authorization middleware to use.
 *
 * On failure, forwards a semantically correct UnauthorizedError to the
 * global error handler — it never leaks whether the failure was due to a
 * malformed token, an invalid signature, or expiry beyond what's safe to
 * disclose to the client.
 *
 * Does NOT query the database. Verifying that the teacher still exists /
 * is not suspended is left to the auth module's service layer where
 * needed, since imposing a DB read on every single authenticated request
 * is a deliberate scalability trade-off — the JWT itself is the source of
 * truth for identity within its validity window.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { verifyAccessToken } = require('../utils/jwt.util');
const UnauthorizedError = require('../utils/errors/UnauthorizedError');

const BEARER_PREFIX = 'Bearer ';

/**
 * Extracts the raw bearer token from the Authorization header.
 *
 * @param {import('express').Request} req
 * @returns {string|null} The raw token string, or null if not present/malformed
 */
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Express middleware factory that enforces JWT authentication.
 * Attaches `req.teacher = { publicId, email, role }` on success.
 *
 * @returns {Function} Express middleware (req, res, next)
 */
function authenticate() {
  return (req, res, next) => {
    const token = extractBearerToken(req);

    if (!token) {
      return next(new UnauthorizedError('Authentication token is missing'));
    }

    try {
      const decoded = verifyAccessToken(token);

      req.teacher = {
        publicId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };

      return next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new UnauthorizedError('Authentication token has expired'));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new UnauthorizedError('Authentication token is invalid'));
      }
      return next(new UnauthorizedError('Authentication failed'));
    }
  };
}

/**
 * Express middleware factory that authenticates the request if a bearer
 * token is present, but does NOT reject the request when no token is
 * supplied (`req.teacher` simply remains undefined). Useful for endpoints
 * that behave differently for authenticated vs anonymous callers without
 * requiring authentication outright.
 *
 * Invalid/expired tokens, if present, still result in a rejected request —
 * "optional" only applies to the *absence* of a token, not to a bad one.
 *
 * @returns {Function} Express middleware (req, res, next)
 */
function authenticateOptional() {
  return (req, res, next) => {
    const token = extractBearerToken(req);

    if (!token) {
      return next();
    }

    try {
      const decoded = verifyAccessToken(token);
      req.teacher = {
        publicId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
      return next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new UnauthorizedError('Authentication token has expired'));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new UnauthorizedError('Authentication token is invalid'));
      }
      return next(new UnauthorizedError('Authentication failed'));
    }
  };
}

module.exports = {
  authenticate,
  authenticateOptional,
};
