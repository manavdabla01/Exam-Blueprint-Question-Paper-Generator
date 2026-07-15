/**
 * logger.js
 *
 * Centralized Winston logger.
 *
 * - INFO / WARN / ERROR / DEBUG levels supported.
 * - Daily rotating file transports for persistent logs (error.log, combined.log).
 * - Console transport enabled only in non-production environments for readability.
 * - JSON structured format on disk (machine-parseable), colorized human-readable
 *   format on console.
 */

'use strict';

const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('../config/env');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/**
 * Console-friendly format used only in development.
 */
const consoleFormat = printf(({ level, message, timestamp: ts, stack, requestId }) => {
  const reqPart = requestId ? ` [reqId:${requestId}]` : '';
  return `${ts} ${level}${reqPart}: ${stack || message}`;
});

/**
 * File transport for all logs (info level and above).
 */
const combinedFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(config.logging.dir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info',
});

/**
 * File transport dedicated to errors only.
 */
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(config.logging.dir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
});

const transports = [combinedFileTransport, errorFileTransport];

if (!config.isProduction) {
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
    })
  );
}

/**
 * The shared logger instance used across the entire application.
 * Import via: const logger = require('./utils/logger');
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), json()),
  transports,
  exitOnError: false,
});

/**
 * Express middleware that logs every incoming request and its response time.
 * Attaches the request's unique requestId (set by requestId middleware) to
 * every log line for traceability.
 *
 * @returns {Function} Express middleware
 */
function requestLoggerMiddleware() {
  return (req, res, next) => {
    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;

      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(2)}ms`, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        ip: req.ip,
      });
    });

    next();
  };
}

module.exports = logger;
module.exports.requestLoggerMiddleware = requestLoggerMiddleware;
