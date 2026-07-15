/**
 * requestId.middleware.js
 *
 * Attaches a unique identifier to every incoming request (`req.requestId`)
 * and echoes it back via the `X-Request-Id` response header. This id is
 * threaded through logs so a single request can be traced end-to-end.
 * If the client already supplied an X-Request-Id header (e.g. from an
 * upstream gateway), it is reused instead of generating a new one.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * @returns {Function} Express middleware
 */
function requestIdMiddleware() {
  return (req, res, next) => {
    const incomingId = req.headers['x-request-id'];
    req.requestId = typeof incomingId === 'string' && incomingId.trim() !== '' ? incomingId : uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  };
}

module.exports = requestIdMiddleware;
