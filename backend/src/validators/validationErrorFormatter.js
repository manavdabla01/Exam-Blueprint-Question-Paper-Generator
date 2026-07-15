/**
 * validationErrorFormatter.js
 *
 * Converts a raw Joi ValidationError into a clean, client-friendly array
 * of field-level errors: [{ field, message }]. Kept as a standalone
 * module (rather than inlined in the validate middleware) so the exact
 * same formatting logic can be reused anywhere else a Joi result needs
 * to be surfaced (e.g. manual validation inside a service).
 */

'use strict';

/**
 * Formats a Joi ValidationError's `details` array into a simplified,
 * stable shape for API responses.
 *
 * @param {import('joi').ValidationError} joiError - The error thrown/returned by Joi
 * @returns {Array<{ field: string, message: string }>} Field-level validation errors
 */
function formatJoiError(joiError) {
  if (!joiError || !Array.isArray(joiError.details)) {
    return [];
  }

  return joiError.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message.replace(/"/g, ''),
  }));
}

module.exports = {
  formatJoiError,
};
