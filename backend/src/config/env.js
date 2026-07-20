/**
 * env.js
 *
 * Centralized environment configuration loader.
 *
 * Responsibilities:
 *  - Load variables from .env (via dotenv) in non-production environments.
 *  - Validate that every REQUIRED environment variable is present and
 *    correctly typed before the application is allowed to boot.
 *  - Export a single frozen, typed configuration object used throughout
 *    the entire codebase instead of raw `process.env` access.
 *
 * Fail-fast policy:
 *  - If any required variable is missing or malformed, the process exits
 *    immediately with a descriptive error. We never allow the server to
 *    start in a half-configured state.
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env file only if present (in production, real env vars are injected
// by the hosting platform and a .env file may not exist at all).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Definition of every environment variable this application depends on.
 * `required: true` means the process will fail fast if the variable is
 * missing or empty. `type` is used for basic coercion/validation.
 */
const ENV_SCHEMA = [
  { key: 'NODE_ENV', required: true, type: 'string', allowed: ['development', 'production', 'test'] },
  { key: 'PORT', required: true, type: 'number' },
  { key: 'CLIENT_ORIGIN', required: true, type: 'string' },
  { key: 'API_VERSION', required: false, type: 'string', default: 'v1' },

  { key: 'DB_HOST', required: true, type: 'string' },
  { key: 'DB_PORT', required: true, type: 'number' },
  { key: 'DB_USER', required: true, type: 'string' },
  { key: 'DB_PASSWORD', required: true, type: 'string', allowEmpty: true },
  { key: 'DB_NAME', required: true, type: 'string' },
  { key: 'DB_CONNECTION_LIMIT', required: false, type: 'number', default: 10 },
  { key: 'DB_QUEUE_LIMIT', required: false, type: 'number', default: 0 },
  { key: 'DB_CONNECT_TIMEOUT_MS', required: false, type: 'number', default: 10000 },

  { key: 'JWT_ACCESS_SECRET', required: false, type: 'string' },
  { key: 'JWT_ACCESS_EXPIRY', required: false, type: 'string', default: '15m' },
  { key: 'JWT_REFRESH_SECRET', required: false, type: 'string' },
  { key: 'JWT_REFRESH_EXPIRY', required: false, type: 'string', default: '7d' },
  { key: 'BCRYPT_SALT_ROUNDS', required: false, type: 'number', default: 12 },

  { key: 'ANTHROPIC_API_KEY', required: false, type: 'string' },
  { key: 'CLAUDE_MODEL', required: false, type: 'string', default: 'claude-3-5-sonnet-20241022' },
  { key: 'CLAUDE_MAX_TOKENS', required: false, type: 'number', default: 4096 },
  { key: 'CLAUDE_LEGIBILITY_THRESHOLD', required: false, type: 'number', default: 0.75 },

  { key: 'UPLOAD_DIR', required: false, type: 'string', default: './uploads' },
  { key: 'MAX_FILE_SIZE_MB', required: false, type: 'number', default: 5 },

  { key: 'RATE_LIMIT_WINDOW_MS', required: false, type: 'number', default: 900000 },
  { key: 'RATE_LIMIT_MAX_REQUESTS', required: false, type: 'number', default: 100 },

  { key: 'LOG_LEVEL', required: false, type: 'string', default: 'info' },
  { key: 'LOG_DIR', required: false, type: 'string', default: './logs' },

  { key: 'WORKER_ENABLED', required: false, type: 'string', default: 'true' },
  { key: 'WORKER_POLL_INTERVAL_MS', required: false, type: 'number', default: 5000 },
  { key: 'WORKER_BATCH_SIZE', required: false, type: 'number', default: 5 },
];

/**
 * Coerces a raw string environment variable into the declared type.
 *
 * @param {string} rawValue - The raw value from process.env
 * @param {'string'|'number'} type - Target type
 * @returns {string|number}
 */
function coerceValue(rawValue, type) {
  if (type === 'number') {
    const numericValue = Number(rawValue);
    return numericValue;
  }
  return rawValue;
}

/**
 * Validates and builds the final configuration object.
 * Exits the process with code 1 if validation fails.
 *
 * @returns {Object} Fully validated, typed configuration object
 */
function buildConfig() {
  const errors = [];
  const config = {};

  for (const field of ENV_SCHEMA) {
    const rawValue = process.env[field.key];
    const isEmpty = rawValue === undefined || rawValue === null || rawValue === '';

    if (isEmpty) {
      if (field.required && !field.allowEmpty) {
        errors.push(`Missing required environment variable: ${field.key}`);
        continue;
      }
      config[field.key] = field.default !== undefined ? field.default : rawValue;
      continue;
    }

    const coerced = coerceValue(rawValue, field.type);

    if (field.type === 'number' && Number.isNaN(coerced)) {
      errors.push(`Environment variable ${field.key} must be a valid number, received: "${rawValue}"`);
      continue;
    }

    if (field.allowed && !field.allowed.includes(coerced)) {
      errors.push(`Environment variable ${field.key} must be one of [${field.allowed.join(', ')}], received: "${coerced}"`);
      continue;
    }

    config[field.key] = coerced;
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('\n[FATAL] Environment configuration validation failed:\n');
    errors.forEach((err) => console.error(`  - ${err}`));
    console.error('\nServer startup aborted. Fix the above issues in your .env file.\n');
    process.exit(1);
  }

  return config;
}

const rawConfig = buildConfig();

/**
 * Final exported configuration object.
 * Frozen to prevent accidental mutation anywhere in the codebase.
 */
const config = Object.freeze({
  env: rawConfig.NODE_ENV,
  isProduction: rawConfig.NODE_ENV === 'production',
  isDevelopment: rawConfig.NODE_ENV === 'development',
  isTest: rawConfig.NODE_ENV === 'test',

  server: Object.freeze({
    port: rawConfig.PORT,
    clientOrigin: rawConfig.CLIENT_ORIGIN,
    apiVersion: rawConfig.API_VERSION,
  }),

  db: Object.freeze({
    host: rawConfig.DB_HOST,
    port: rawConfig.DB_PORT,
    user: rawConfig.DB_USER,
    password: rawConfig.DB_PASSWORD,
    database: rawConfig.DB_NAME,
    connectionLimit: rawConfig.DB_CONNECTION_LIMIT,
    queueLimit: rawConfig.DB_QUEUE_LIMIT,
    connectTimeoutMs: rawConfig.DB_CONNECT_TIMEOUT_MS,
  }),

  auth: Object.freeze({
    jwtAccessSecret: rawConfig.JWT_ACCESS_SECRET,
    jwtAccessExpiry: rawConfig.JWT_ACCESS_EXPIRY,
    jwtRefreshSecret: rawConfig.JWT_REFRESH_SECRET,
    jwtRefreshExpiry: rawConfig.JWT_REFRESH_EXPIRY,
    bcryptSaltRounds: rawConfig.BCRYPT_SALT_ROUNDS,
  }),

  claude: Object.freeze({
    apiKey: rawConfig.ANTHROPIC_API_KEY,
    model: rawConfig.CLAUDE_MODEL,
    maxTokens: rawConfig.CLAUDE_MAX_TOKENS,
    legibilityThreshold: rawConfig.CLAUDE_LEGIBILITY_THRESHOLD,
  }),

  upload: Object.freeze({
    uploadDir: rawConfig.UPLOAD_DIR,
    maxFileSizeMb: rawConfig.MAX_FILE_SIZE_MB,
  }),

  rateLimit: Object.freeze({
    windowMs: rawConfig.RATE_LIMIT_WINDOW_MS,
    maxRequests: rawConfig.RATE_LIMIT_MAX_REQUESTS,
  }),

  logging: Object.freeze({
    level: rawConfig.LOG_LEVEL,
    dir: rawConfig.LOG_DIR,
  }),

  worker: Object.freeze({
    enabled: String(rawConfig.WORKER_ENABLED).toLowerCase() !== 'false',
    pollIntervalMs: rawConfig.WORKER_POLL_INTERVAL_MS,
    batchSize: rawConfig.WORKER_BATCH_SIZE,
  }),
});

module.exports = config;
