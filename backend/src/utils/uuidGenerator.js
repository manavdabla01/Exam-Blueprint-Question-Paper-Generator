/**
 * uuidGenerator.js
 *
 * Centralized UUID generation. All public-facing entity IDs
 * (teachers.public_id, subjects.public_id, etc.) are generated here rather
 * than calling the `uuid` package directly in repositories, so the ID
 * strategy can be changed in exactly one place if needed.
 *
 * Uses UUID v7 (time-ordered) per the established database design decision:
 * public IDs are UUIDv7 while internal primary keys remain auto-increment.
 */

'use strict';

const { v7: uuidv7 } = require('uuid');

/**
 * Generates a new UUID v7 string, suitable for use as a `public_id` on any
 * tenant-owned entity.
 *
 * @returns {string} A UUID v7 string, e.g. "017f22e2-79b0-7cc3-98c4-dc0c0c07398f"
 */
function generatePublicId() {
  return uuidv7();
}

module.exports = {
  generatePublicId,
};
