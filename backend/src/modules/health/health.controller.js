/**
 * health.controller.js
 *
 * Exposes GET /health for uptime monitoring, load balancer health checks,
 * and deployment verification. Reports application uptime, environment,
 * version, and live database connectivity status.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const { checkHealth } = require('../../config/database');
const config = require('../../config/env');
const HTTP_STATUS = require('../../constants/httpStatus');

// eslint-disable-next-line global-require, import/no-unresolved
const packageJson = require('../../../package.json');

/**
 * GET /health
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getHealth = asyncHandler(async (req, res) => {
  const dbHealth = await checkHealth();

  const healthPayload = {
    status: dbHealth.healthy ? 'healthy' : 'degraded',
    database: {
      status: dbHealth.healthy ? 'connected' : 'disconnected',
      message: dbHealth.message,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.env,
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  };

  const statusCode = dbHealth.healthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;

  return successResponse(res, { statusCode, data: healthPayload });
});

module.exports = {
  getHealth,
};
