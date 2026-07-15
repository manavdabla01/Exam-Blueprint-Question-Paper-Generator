/**
 * asyncHandler.js
 *
 * Wraps an async Express route handler so that any rejected promise
 * (thrown error) is automatically forwarded to `next()`, where the
 * global error handler middleware picks it up. Without this, unhandled
 * promise rejections inside async route handlers would crash the process
 * or hang the request.
 *
 * Usage:
 *   router.get('/example', asyncHandler(async (req, res) => {
 *     const data = await someService.doSomething();
 *     res.json(data);
 *   }));
 */

'use strict';

/**
 * @param {Function} fn - Async Express route handler (req, res, next) => Promise
 * @returns {Function} Wrapped Express-compatible handler
 */
function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
