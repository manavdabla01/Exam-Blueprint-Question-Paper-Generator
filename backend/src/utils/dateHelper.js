/**
 * dateHelper.js
 *
 * Small set of date/time utilities used across services and repositories.
 * Centralized here to guarantee consistent formatting when writing
 * DATETIME values to MySQL and when computing expiry timestamps.
 */

'use strict';

/**
 * Formats a JS Date into a MySQL-compatible DATETIME string
 * ("YYYY-MM-DD HH:MM:SS") in UTC.
 *
 * @param {Date} [date] - Date to format (defaults to now)
 * @returns {string} MySQL DATETIME formatted string
 */
function toMySQLDateTime(date = new Date()) {
  const pad = (num) => String(num).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

/**
 * Returns a future Date object offset from now by the given duration string.
 * Supports simple duration formats: "15m", "7d", "1h".
 *
 * @param {string} duration - Duration string, e.g. "15m", "7d", "1h"
 * @returns {Date} The resulting future date
 * @throws {Error} If the duration string format is invalid
 */
function addDuration(duration) {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected formats like "15m", "7d", "1h".`);
  }
  const value = Number(match[1]);
  const unit = match[2];

  const unitToMs = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + value * unitToMs[unit]);
}

/**
 * Checks whether a given date has already passed relative to now.
 *
 * @param {Date|string} date - Date object or DATETIME string to check
 * @returns {boolean} True if the date is in the past
 */
function isExpired(date) {
  const target = date instanceof Date ? date : new Date(date);
  return target.getTime() < Date.now();
}

module.exports = {
  toMySQLDateTime,
  addDuration,
  isExpired,
};
