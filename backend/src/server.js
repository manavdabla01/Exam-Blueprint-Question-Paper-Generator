/**
 * server.js
 *
 * Application entrypoint. Responsible for:
 *  - Initializing the database connection pool before accepting traffic.
 *  - Creating the Express app and starting the HTTP listener.
 *  - Registering process-level handlers for graceful shutdown
 *    (SIGTERM/SIGINT) and for uncaught exceptions / unhandled rejections.
 *
 * This file intentionally contains no business logic or route
 * definitions — those live in app.js and the module routers.
 */

'use strict';

const config = require('./config/env');
const logger = require('./utils/logger');
const { initDatabase, closePool } = require('./config/database');
const createApp = require('./app');

let httpServer = null;

/**
 * Bootstraps the entire application: connects to the database, builds the
 * Express app, and starts listening for HTTP traffic.
 *
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    await initDatabase();

    const app = createApp();

    httpServer = app.listen(config.server.port, () => {
      logger.info(`Server started successfully`, {
        port: config.server.port,
        environment: config.env,
        apiVersion: config.server.apiVersion,
      });
    });
  } catch (error) {
    logger.error(`Fatal error during server startup: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the HTTP server and database pool. Ensures
 * in-flight requests are allowed to complete before the process exits,
 * and that no new connections are accepted during shutdown.
 *
 * @param {string} signal - The OS signal that triggered shutdown
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 15000);

  try {
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) return reject(err);
          return resolve();
        });
      });
      logger.info('HTTP server closed. No longer accepting new connections.');
    }

    await closePool();

    clearTimeout(forceExitTimer);
    logger.info('Graceful shutdown complete. Exiting process.');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    logger.error(`Error during graceful shutdown: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Promise Rejection: ${reason instanceof Error ? reason.message : reason}`, {
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  // Uncaught exceptions leave the process in an undefined state.
  // Exit after logging so the process manager (PM2/Docker/systemd) restarts us cleanly.
  process.exit(1);
});

startServer();
