/**
 * loginAudit.repository.js
 *
 * Data-access layer for the `login_audit_logs` table. Every login
 * attempt — success or failure — is written here for security
 * investigation and future admin analytics. Writes to this table are
 * intentionally treated as best-effort by the calling service (see
 * auth.service.js): a failure to write an audit row must never block or
 * roll back the actual authentication outcome.
 */

'use strict';

const db = require('../../config/database');

/**
 * Inserts a login audit log record.
 *
 * @param {Object} auditData
 * @param {number|null} auditData.teacherId - Internal teacher id if resolved, else null
 * @param {string} auditData.emailAttempted - The raw email address submitted in the attempt
 * @param {string} auditData.status - One of the login_audit_logs.status ENUM values
 * @param {string} auditData.ipAddress - IP address of the request
 * @param {string|null} [auditData.userAgent] - User-Agent header of the request
 * @param {string|null} [auditData.failureReason] - Human-readable failure detail (internal only, never sent to client)
 * @returns {Promise<number>} The internal auto-increment id of the newly created audit row
 */
async function create({ teacherId, emailAttempted, status, ipAddress, userAgent = null, failureReason = null }) {
  const sql = `
    INSERT INTO login_audit_logs (teacher_id, email_attempted, status, ip_address, user_agent, failure_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [teacherId, emailAttempted, status, ipAddress, userAgent, failureReason]);
  return result.insertId;
}

module.exports = {
  create,
};
