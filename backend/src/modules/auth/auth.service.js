/**
 * auth.service.js
 *
 * Business logic for teacher registration, login, token refresh, and
 * logout. Orchestrates the repository layer (teacher, refresh_tokens,
 * login_audit_logs) and the shared security utilities (bcrypt, JWT,
 * token hashing). Contains no Express-specific code (req/res) — the
 * controller layer adapts HTTP concerns to/from these functions.
 *
 * Security posture:
 *  - Login never reveals whether a given email exists: "account not
 *    found", "wrong password", and "account suspended" all produce the
 *    same generic client-facing message and the same 401 status code.
 *    The specific reason is recorded internally in login_audit_logs and
 *    the application logger only.
 *  - Every login attempt (success or failure) writes a login_audit_logs
 *    record. Audit-log write failures are caught and logged but never
 *    allowed to fail the surrounding auth operation.
 *  - Refresh tokens are rotated on every refresh: the presented token is
 *    revoked and a brand new one is issued and persisted, limiting the
 *    usable lifetime of any single refresh token value.
 */

'use strict';

const jwt = require('jsonwebtoken');

const teacherRepository = require('./teacher.repository');
const refreshTokenRepository = require('./refreshToken.repository');
const loginAuditLogRepository = require('./loginAudit.repository');
const { toPublicTeacher } = require('./teacher.mapper');

const db = require('../../config/database');
const logger = require('../../utils/logger');
const { generatePublicId } = require('../../utils/uuidGenerator');
const { hashPassword, verifyPassword } = require('../../utils/password.util');
const jwtUtil = require('../../utils/jwt.util');
const { hashToken } = require('../../utils/tokenHash.util');
const { toMySQLDateTime } = require('../../utils/dateHelper');

const UnauthorizedError = require('../../utils/errors/UnauthorizedError');
const ConflictError = require('../../utils/errors/ConflictError');
const APP_CONSTANTS = require('../../constants/appConstants');

const GENERIC_LOGIN_FAILURE_MESSAGE = 'Invalid email or password';

/**
 * Safely writes a login audit log entry. Never throws — any failure is
 * caught and logged internally so that audit logging can never abort or
 * mask the result of the primary auth operation.
 *
 * @param {Object} entry - See loginAuditLog.repository.js `create()` for shape
 * @returns {Promise<void>}
 */
async function safeWriteAuditLog(entry) {
  try {
    await loginAuditLogRepository.create(entry);
  } catch (error) {
    logger.error(`Failed to write login audit log: ${error.message}`, { stack: error.stack });
  }
}

/**
 * Issues a fresh access + refresh token pair for a teacher and persists
 * the refresh token's hash. Used by both registration and login.
 *
 * @param {Object} teacherRow - Full teacher row from the repository
 * @param {Object} requestMeta
 * @param {string} requestMeta.ipAddress
 * @param {string|null} requestMeta.userAgent
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function issueTokenPair(teacherRow, { ipAddress, userAgent }, connection = null) {
  const accessToken = jwtUtil.generateAccessToken({
    publicId: teacherRow.public_id,
    email: teacherRow.email,
    role: 'teacher',
  });

  const { token: refreshToken } = jwtUtil.generateRefreshToken({ publicId: teacherRow.public_id });
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = toMySQLDateTime(jwtUtil.getTokenExpiryDate(refreshToken));

  await refreshTokenRepository.create(
    {
      teacherId: teacherRow.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    },
    connection
  );

  return { accessToken, refreshToken };
}

/**
 * Registers a new teacher account.
 *
 * @param {Object} input
 * @param {string} input.email - Normalized, validated email address
 * @param {string} input.password - Plaintext password (validated for strength upstream)
 * @param {string} input.instituteName - Institute/coaching center name
 * @param {Object} requestMeta
 * @param {string} requestMeta.ipAddress
 * @param {string|null} requestMeta.userAgent
 * @returns {Promise<{ teacher: Object, accessToken: string, refreshToken: string }>}
 * @throws {ConflictError} If a teacher with this email already exists
 */
async function registerTeacher({ email, password, instituteName }, { ipAddress, userAgent }) {
  const alreadyExists = await teacherRepository.existsByEmail(email);
  if (alreadyExists) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const publicId = generatePublicId();

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const teacherId = await teacherRepository.createTeacher(
      {
        publicId,
        email,
        passwordHash,
        instituteName,
        status: APP_CONSTANTS.TEACHER_STATUS.ACTIVE,
      },
      connection
    );

    const teacherRow = {
      id: teacherId,
      public_id: publicId,
      email,
      institute_name: instituteName,
      status: APP_CONSTANTS.TEACHER_STATUS.ACTIVE,
    };

    const { accessToken, refreshToken } = await issueTokenPair(teacherRow, { ipAddress, userAgent }, connection);

    await connection.commit();

    await safeWriteAuditLog({
      teacherId,
      emailAttempted: email,
      status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.SUCCESS,
      ipAddress,
      userAgent,
      failureReason: null,
    });

    return {
      teacher: toPublicTeacher(teacherRow),
      accessToken,
      refreshToken,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Authenticates a teacher with email + password and issues a new token
 * pair on success. Every attempt (success or failure) is recorded in
 * login_audit_logs. Failure responses are intentionally generic to avoid
 * revealing whether the email is registered.
 *
 * @param {Object} input
 * @param {string} input.email - Normalized email address
 * @param {string} input.password - Plaintext password
 * @param {Object} requestMeta
 * @param {string} requestMeta.ipAddress
 * @param {string|null} requestMeta.userAgent
 * @returns {Promise<{ teacher: Object, accessToken: string, refreshToken: string }>}
 * @throws {UnauthorizedError} If credentials are invalid or the account is not active
 */
async function loginTeacher({ email, password }, { ipAddress, userAgent }) {
  const teacherRow = await teacherRepository.findByEmail(email);

  if (!teacherRow) {
    await safeWriteAuditLog({
      teacherId: null,
      emailAttempted: email,
      status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.FAILED_NOT_FOUND,
      ipAddress,
      userAgent,
      failureReason: 'No account found for this email',
    });
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE_MESSAGE);
  }

  const passwordMatches = await verifyPassword(password, teacherRow.password_hash);
  if (!passwordMatches) {
    await safeWriteAuditLog({
      teacherId: teacherRow.id,
      emailAttempted: email,
      status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.FAILED_PASSWORD,
      ipAddress,
      userAgent,
      failureReason: 'Password mismatch',
    });
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE_MESSAGE);
  }

  if (teacherRow.status === APP_CONSTANTS.TEACHER_STATUS.SUSPENDED) {
    await safeWriteAuditLog({
      teacherId: teacherRow.id,
      emailAttempted: email,
      status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.FAILED_SUSPENDED,
      ipAddress,
      userAgent,
      failureReason: 'Account is suspended',
    });
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE_MESSAGE);
  }

  if (teacherRow.status === APP_CONSTANTS.TEACHER_STATUS.PENDING_VERIFICATION) {
    await safeWriteAuditLog({
      teacherId: teacherRow.id,
      emailAttempted: email,
      status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.FAILED_UNVERIFIED,
      ipAddress,
      userAgent,
      failureReason: 'Account pending email verification',
    });
    throw new UnauthorizedError(GENERIC_LOGIN_FAILURE_MESSAGE);
  }

  const { accessToken, refreshToken } = await issueTokenPair(teacherRow, { ipAddress, userAgent });

  await safeWriteAuditLog({
    teacherId: teacherRow.id,
    emailAttempted: email,
    status: APP_CONSTANTS.LOGIN_AUDIT_STATUS.SUCCESS,
    ipAddress,
    userAgent,
    failureReason: null,
  });

  return {
    teacher: toPublicTeacher(teacherRow),
    accessToken,
    refreshToken,
  };
}

/**
 * Rotates a refresh token: verifies the presented JWT and its database
 * record, revokes it, and issues a brand new access + refresh token pair.
 *
 * @param {string} rawRefreshToken - The raw refresh token JWT presented by the client
 * @param {Object} requestMeta
 * @param {string} requestMeta.ipAddress
 * @param {string|null} requestMeta.userAgent
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 * @throws {UnauthorizedError} If the token is invalid, expired, revoked, or its owner is not active
 */
async function refreshAccessToken(rawRefreshToken, { ipAddress, userAgent }) {
  let decoded;
  try {
    decoded = jwtUtil.verifyRefreshToken(rawRefreshToken);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired');
    }
    throw new UnauthorizedError('Refresh token is invalid');
  }

  const tokenHash = hashToken(rawRefreshToken);
  const tokenRecord = await refreshTokenRepository.findByTokenHash(tokenHash);

  if (!tokenRecord) {
    throw new UnauthorizedError('Refresh token is invalid');
  }

  if (tokenRecord.revoked_at) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    throw new UnauthorizedError('Refresh token has expired');
  }

  const teacherRow = await teacherRepository.findByPublicId(decoded.sub);
  if (!teacherRow) {
    throw new UnauthorizedError('Refresh token is invalid');
  }

  if (teacherRow.status !== APP_CONSTANTS.TEACHER_STATUS.ACTIVE) {
    throw new UnauthorizedError('Account is not active');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await refreshTokenRepository.revokeById(tokenRecord.id, connection);
    const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(
      teacherRow,
      { ipAddress, userAgent },
      connection
    );

    await connection.commit();

    return { accessToken, refreshToken: newRefreshToken };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Logs out a teacher by revoking the presented refresh token. Idempotent
 * and intentionally forgiving: an already-invalid, already-revoked, or
 * unrecognized token still results in a successful logout response,
 * since the end state the client cares about (this token no longer
 * grants access) already holds true in all of those cases.
 *
 * @param {string} rawRefreshToken - The raw refresh token JWT to revoke
 * @returns {Promise<void>}
 */
async function logoutTeacher(rawRefreshToken) {
  let tokenHash;
  try {
    tokenHash = hashToken(rawRefreshToken);
  } catch (error) {
    // Malformed input - nothing to revoke, treat as already logged out.
    return;
  }

  const tokenRecord = await refreshTokenRepository.findByTokenHash(tokenHash);
  if (!tokenRecord) {
    return;
  }

  await refreshTokenRepository.revokeById(tokenRecord.id);
}

module.exports = {
  registerTeacher,
  loginTeacher,
  refreshAccessToken,
  logoutTeacher,
};
