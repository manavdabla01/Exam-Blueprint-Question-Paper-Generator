/**
 * paginationHelper.js
 *
 * Normalizes and validates pagination query parameters (page, pageSize)
 * from incoming requests, and computes the SQL OFFSET/LIMIT values.
 * Used by any future list-endpoint controller/service.
 */

'use strict';

const APP_CONSTANTS = require('../constants/appConstants');

/**
 * Parses raw query parameters into safe, bounded pagination values.
 *
 * @param {Object} query - Express req.query object
 * @param {string|number} [query.page] - Requested page number (1-indexed)
 * @param {string|number} [query.pageSize] - Requested page size
 * @returns {{ page: number, pageSize: number, offset: number, limit: number }}
 */
function parsePagination(query = {}) {
  let page = parseInt(query.page, 10);
  let pageSize = parseInt(query.pageSize, 10);

  if (!Number.isInteger(page) || page < 1) {
    page = APP_CONSTANTS.DEFAULT_PAGE;
  }

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    pageSize = APP_CONSTANTS.DEFAULT_PAGE_SIZE;
  }

  if (pageSize > APP_CONSTANTS.MAX_PAGE_SIZE) {
    pageSize = APP_CONSTANTS.MAX_PAGE_SIZE;
  }

  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset, limit: pageSize };
}

module.exports = {
  parsePagination,
};
