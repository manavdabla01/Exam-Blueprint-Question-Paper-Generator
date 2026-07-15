/**
 * rateLimitConstants.js
 *
 * Window/max-request configuration for each category of rate limiter.
 * The global limiter is driven by environment variables (RATE_LIMIT_*)
 * since its tuning is deployment-dependent; the more sensitive/expensive
 * endpoint categories (login, upload, AI) use fixed, deliberately strict
 * defaults since their thresholds are a security/cost decision rather
 * than an infra-tuning one.
 */

'use strict';

const RATE_LIMIT_CONSTANTS = Object.freeze({
  LOGIN: Object.freeze({
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5,
  }),
  UPLOAD: Object.freeze({
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 10,
  }),
  AI: Object.freeze({
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 5,
  }),
});

module.exports = RATE_LIMIT_CONSTANTS;
