/**
 * appConstants.js
 *
 * General application-level constants not tied to HTTP status or roles.
 */

'use strict';

const APP_CONSTANTS = Object.freeze({
  APP_NAME: 'Exam Blueprint & Question Paper Generator',
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  TEACHER_STATUS: Object.freeze({
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    PENDING_VERIFICATION: 'pending_verification',
  }),

  LOGIN_AUDIT_STATUS: Object.freeze({
    SUCCESS: 'success',
    FAILED_PASSWORD: 'failed_password',
    FAILED_NOT_FOUND: 'failed_not_found',
    FAILED_SUSPENDED: 'failed_suspended',
    FAILED_UNVERIFIED: 'failed_unverified',
  }),

  SOURCE_TYPE: Object.freeze({
    TEXT: 'text',
    FILE: 'file',
    IMAGE: 'image',
  }),

  SOURCE_STATUS: Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    PROCESSED: 'processed',
    FAILED_LEGIBILITY: 'failed_legibility',
    ERROR: 'error',
  }),

  GATEKEEPER_STATUS: Object.freeze({
    PASSED: 'passed',
    FAILED: 'failed',
    PENDING_REVIEW: 'pending_review',
  }),

  GENERATED_EXAM_STATUS: Object.freeze({
    GENERATING: 'generating',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REGENERATING: 'regenerating',
  }),
});

module.exports = APP_CONSTANTS;
