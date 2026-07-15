/**
 * app.js
 *
 * Express application factory. Configures all global middleware (security
 * headers, CORS, compression, body parsing, request tracing, logging),
 * mounts the aggregated route tree, and registers the 404 + global error
 * handlers last. Does NOT start listening on a port — that responsibility
 * belongs to server.js so the app instance itself remains testable in
 * isolation (e.g. with supertest) without binding a real socket.
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const config = require('./config/env');
const logger = require('./utils/logger');
const requestIdMiddleware = require('./middlewares/requestId.middleware');
const notFoundMiddleware = require('./middlewares/notFound.middleware');
const errorHandlerMiddleware = require('./middlewares/errorHandler.middleware');
const { globalLimiter } = require('./middlewares/rateLimiter.middleware');
const routes = require('./routes/index.routes');
const healthRoutes = require('./modules/health/health.routes');

/**
 * Builds and returns a fully configured Express application instance.
 *
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  // Trust the first proxy hop (load balancer/reverse proxy) so that
  // req.ip and req.secure reflect the real client rather than the proxy.
  app.set('trust proxy', 1);

  // ----------------------------------------------------------------
  // Security & core middleware
  // ----------------------------------------------------------------
  app.use(helmet());

  app.use(
    cors({
      origin: config.server.clientOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );

  app.use(compression());

  // ----------------------------------------------------------------
  // Body parsing
  // ----------------------------------------------------------------
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ----------------------------------------------------------------
  // Request tracing & logging
  // ----------------------------------------------------------------
  app.use(requestIdMiddleware());
  app.use(logger.requestLoggerMiddleware());

  // ----------------------------------------------------------------
  // Routes
  // ----------------------------------------------------------------
  // Health check is exposed at root level (no version prefix) so
  // infrastructure tooling (load balancers, uptime monitors) can hit it
  // without needing to know the current API version.
  app.use('/', healthRoutes);

  // All versioned application/business routes. Global rate limiting is
  // applied here (not to /health) so uptime monitors are never throttled.
  app.use(`/api/${config.server.apiVersion}`, globalLimiter(), routes);

  // ----------------------------------------------------------------
  // 404 + Global error handling (must be registered last, in order)
  // ----------------------------------------------------------------
  app.use(notFoundMiddleware());
  app.use(errorHandlerMiddleware());

  return app;
}

module.exports = createApp;
