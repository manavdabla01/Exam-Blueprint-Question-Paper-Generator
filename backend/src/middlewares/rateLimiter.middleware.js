/**
 * rateLimiter.middleware.js
 *
 * Defines the rate limiters used across the application, each scoped to
 * a specific risk/cost profile:
 *
 *  - globalLimiter: applied to all traffic as a baseline DoS/brute-force
 *    mitigation. Tuned via RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX_REQUESTS.
 *  - loginLimiter: strict per-IP limiter on the login endpoint to slow
 *    down credential-stuffing/brute-force attempts.
 *  - uploadLimiter: limits file-upload frequency to protect disk/bandwidth.
 *  - aiLimiter: limits calls to Claude-backed endpoints, since each
 *    request has real monetary cost and latency impact.
 *
 * All limiters respond through the standardized error envelope (via
 * AppError -> global error handler) rather than express-rate-limit's
 * default plain-text response, so API consumers always get a consistent
 * JSON shape.
 */

'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const HTTP_STATUS = require('../constants/httpStatus');
const RATE_LIMIT_CONSTANTS = require('../constants/rateLimitConstants');
const AppError = require('../utils/errors/AppError');

/**
 * Builds a standardized `handler` callback for express-rate-limit that
 * forwards a consistent AppError to the global error handler instead of
 * letting express-rate-limit write its own response body.
 *
 * @param {string} message - Human-readable message returned to the client
 * @returns {Function} express-rate-limit `handler` option
 */
function buildLimitHandler(message) {
  return (req, res, next) => {
    next(new AppError(message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED'));
  };
}

/**
 * Global baseline rate limiter applied to all API traffic.
 * Window/max are environment-configurable (see config/env.js).
 *
 * @returns {Function} Express middleware
 */
function globalLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: buildLimitHandler('Too many requests. Please try again later.'),
  });
}

/**
 * Strict limiter applied specifically to the login endpoint to mitigate
 * brute-force and credential-stuffing attacks.
 *
 * @returns {Function} Express middleware
 */
function loginLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONSTANTS.LOGIN.WINDOW_MS,
    max: RATE_LIMIT_CONSTANTS.LOGIN.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: buildLimitHandler('Too many login attempts. Please try again in a few minutes.'),
  });
}

/**
 * Limiter applied to file upload endpoints to protect disk and bandwidth
 * resources from abuse.
 *
 * @returns {Function} Express middleware
 */
function uploadLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONSTANTS.UPLOAD.WINDOW_MS,
    max: RATE_LIMIT_CONSTANTS.UPLOAD.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: buildLimitHandler('Too many uploads. Please slow down and try again shortly.'),
  });
}

/**
 * Limiter applied to Claude-backed AI endpoints (transcription, exam
 * generation), since each request carries real API cost and latency.
 *
 * @returns {Function} Express middleware
 */
function aiLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_CONSTANTS.AI.WINDOW_MS,
    max: RATE_LIMIT_CONSTANTS.AI.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: buildLimitHandler('Too many AI requests. Please wait a moment before trying again.'),
  });
}

module.exports = {
  globalLimiter,
  loginLimiter,
  uploadLimiter,
  aiLimiter,
};
