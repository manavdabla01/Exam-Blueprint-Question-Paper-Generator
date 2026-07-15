/**
 * database.js
 *
 * MySQL connection pool management using mysql2/promise.
 *
 * Responsibilities:
 *  - Create and expose a single shared connection pool for the entire app.
 *  - Verify connectivity at startup with a retry-with-backoff strategy so
 *    transient DB unavailability (e.g. container still starting) doesn't
 *    crash the app immediately.
 *  - Provide a `query()` helper that all repositories use instead of
 *    touching the pool directly.
 *  - Provide a `closePool()` function for graceful shutdown.
 *
 * No SQL business logic lives here — this is infrastructure only.
 */

'use strict';

const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;

const MAX_CONNECTION_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Creates the mysql2 connection pool using validated environment config.
 *
 * @returns {import('mysql2/promise').Pool}
 */
function createPool() {
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: config.db.queueLimit,
    connectTimeout: config.db.connectTimeoutMs,
    charset: 'utf8mb4_unicode_ci',
    dateStrings: false,
    namedPlaceholders: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

/**
 * Sleeps for the given number of milliseconds.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initializes the connection pool and verifies connectivity with a
 * retry-with-exponential-backoff strategy. Must be called once at
 * application startup before the server starts accepting requests.
 *
 * @returns {Promise<void>}
 * @throws {Error} If the database cannot be reached after all retries
 */
async function initDatabase() {
  pool = createPool();

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_CONNECTION_RETRIES) {
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info('MySQL connection pool established successfully', {
        host: config.db.host,
        database: config.db.database,
        connectionLimit: config.db.connectionLimit,
      });
      return;
    } catch (error) {
      lastError = error;
      attempt += 1;
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        `MySQL connection attempt ${attempt}/${MAX_CONNECTION_RETRIES} failed: ${error.message}. Retrying in ${delayMs}ms...`
      );
      if (attempt < MAX_CONNECTION_RETRIES) {
        await sleep(delayMs);
      }
    }
  }

  logger.error('MySQL connection failed after all retry attempts. Aborting startup.', {
    error: lastError ? lastError.message : 'unknown error',
  });
  throw new Error(`Unable to establish MySQL connection: ${lastError ? lastError.message : 'unknown error'}`);
}

/**
 * Executes a parameterized SQL query against the shared pool.
 * This is the ONLY function repositories should use to talk to the database.
 *
 * @param {string} sql - Parameterized SQL string using `?` placeholders
 * @param {Array<any>} [params] - Values to bind to the placeholders
 * @returns {Promise<[any, any]>} mysql2 result tuple: [rows/result, fields]
 * @throws {Error} If the pool has not been initialized, or the query fails
 */
async function query(sql, params = []) {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initDatabase() before querying.');
  }
  try {
    return await pool.query(sql, params);
  } catch (error) {
    logger.error(`Database query failed: ${error.message}`, { sql });
    throw error;
  }
}

/**
 * Retrieves a dedicated connection from the pool for manual transaction
 * control (BEGIN/COMMIT/ROLLBACK). Caller is responsible for releasing it.
 *
 * @returns {Promise<import('mysql2/promise').PoolConnection>}
 * @throws {Error} If the pool has not been initialized
 */
async function getConnection() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initDatabase() before requesting a connection.');
  }
  return pool.getConnection();
}

/**
 * Performs a lightweight health check against the database.
 * Used by the /health endpoint.
 *
 * @returns {Promise<{ healthy: boolean, message: string }>}
 */
async function checkHealth() {
  if (!pool) {
    return { healthy: false, message: 'Database pool not initialized' };
  }
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return { healthy: true, message: 'Database connection healthy' };
  } catch (error) {
    return { healthy: false, message: error.message };
  }
}

/**
 * Gracefully closes all connections in the pool.
 * Must be called during application shutdown (SIGTERM/SIGINT handlers).
 *
 * @returns {Promise<void>}
 */
async function closePool() {
  if (!pool) {
    return;
  }
  try {
    await pool.end();
    logger.info('MySQL connection pool closed gracefully');
    pool = null;
  } catch (error) {
    logger.error(`Error while closing MySQL connection pool: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initDatabase,
  query,
  getConnection,
  checkHealth,
  closePool,
};
