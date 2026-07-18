/**
 * claude.config.js
 *
 * Centralized Anthropic client instantiation. Every module that needs to
 * call Claude imports the client from here rather than constructing its
 * own `Anthropic` instance, so the API key/model/timeout configuration
 * lives in exactly one place.
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./env');

/**
 * Shared Anthropic SDK client instance, configured from environment
 * variables validated at startup (see config/env.js). A relatively
 * conservative request timeout is set explicitly so a hung Claude
 * request cannot indefinitely block a processing pipeline run — Node's
 * caller (ai.service.js) still wraps every call in its own try/catch to
 * translate SDK-level errors into the application's error types.
 */
const anthropicClient = new Anthropic({
  apiKey: config.claude.apiKey,
  timeout: 60 * 1000,
  maxRetries: 0, // ai.service.js controls its own single self-correction retry explicitly; the SDK should not silently retry on our behalf
});

module.exports = anthropicClient;
