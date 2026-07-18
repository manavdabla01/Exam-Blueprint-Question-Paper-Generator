/**
 * ai.service.js
 *
 * Orchestrates the full OCR pipeline for an image-based source material:
 *
 *   Python preprocessing -> Claude Vision transcription -> legibility
 *   gatekeeper -> (if unreadable) exactly ONE self-correction pass ->
 *   still unreadable -> processing.failed_legibility + explicit error
 *   readable -> persist transcription -> processing.completeProcessing
 *
 * This module deliberately depends on processing.service.js (to call
 * completeProcessing/failProcessing) but processing.service.js does NOT
 * depend back on this module — the orchestration call happens one level
 * up, in processing.controller.js, after processing.service.js has
 * already claimed the item. This keeps the dependency graph a one-way
 * arrow (ai -> processing) instead of a cycle.
 *
 * Never hallucinates: every Claude prompt explicitly instructs marking
 * unreadable spans as [unclear] rather than guessing, and this service
 * never fabricates or fills in a transcription — if Claude reports low
 * confidence/illegibility even after one careful re-attempt, the pipeline
 * fails closed (failed_legibility) rather than accepting a low-quality
 * guess.
 */

'use strict';

const fs = require('fs/promises');
const rawFs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const anthropicClient = require('../../config/claude.config');
const config = require('../../config/env');
const logger = require('../../utils/logger');

const sourceMaterialRepository = require('../sourceMaterial/sourceMaterial.repository');
const aiRepository = require('./ai.repository');
const processingService = require('../processing/processing.service');
const uploadService = require('../../services/upload.service');
const { generatePublicId } = require('../../utils/uuidGenerator');

const AppError = require('../../utils/errors/AppError');
const NotFoundError = require('../../utils/errors/NotFoundError');
const HTTP_STATUS = require('../../constants/httpStatus');
const APP_CONSTANTS = require('../../constants/appConstants');

const TRANSCRIPTION_PROMPT = rawFs.readFileSync(path.join(__dirname, 'prompts', 'transcription.prompt.txt'), 'utf8');
const LEGIBILITY_PROMPT = rawFs.readFileSync(path.join(__dirname, 'prompts', 'legibility.prompt.txt'), 'utf8');

const PYTHON_SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'python', 'preprocess.py');
const PYTHON_TIMEOUT_MS = 30 * 1000;

/** MIME types Claude Vision can actually process; pdf/docx are out of scope for this task. */
const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);

/**
 * Translates a raw Anthropic SDK error into the application's AppError
 * type with a semantically correct HTTP status, distinguishing rate
 * limiting, timeouts, and other API errors so the caller (and the
 * processing status this triggers) reflects an infrastructure failure —
 * never a legibility judgment, since Claude was never actually able to
 * assess the image.
 *
 * @param {Error} error - The error thrown by the Anthropic SDK
 * @returns {AppError}
 */
function translateClaudeError(error) {
  if (error.status === 429) {
    return new AppError(
      'Claude API rate limit exceeded. Please try again shortly.',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'CLAUDE_RATE_LIMIT'
    );
  }
  if (error.name === 'APIConnectionTimeoutError' || error.status === 408) {
    return new AppError('Claude API request timed out', HTTP_STATUS.GATEWAY_TIMEOUT, 'CLAUDE_TIMEOUT');
  }
  if (typeof error.status === 'number') {
    return new AppError(`Claude API error: ${error.message}`, HTTP_STATUS.BAD_GATEWAY, 'CLAUDE_API_ERROR');
  }
  return new AppError(`Unexpected error calling Claude: ${error.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'CLAUDE_UNKNOWN_ERROR');
}

/**
 * Calls Claude Vision with a given prompt and base64-encoded image,
 * expecting and parsing a single structured JSON response. If Claude's
 * response cannot be parsed as the expected JSON shape, this is treated
 * as a failed transcription attempt (isLegible: false, confidenceScore:
 * 0) rather than thrown as an infrastructure error — a malformed
 * response is a content-quality problem the gatekeeper should handle via
 * the normal self-correction path, not a reason to abort the pipeline.
 *
 * @param {string} promptText - The full prompt to send alongside the image
 * @param {string} base64Image - Base64-encoded image bytes
 * @param {string} mimeType - The image's MIME type ('image/jpeg' | 'image/png')
 * @returns {Promise<{ transcribedText: string, confidenceScore: number, isLegible: boolean, language: string|null, notes: string }>}
 * @throws {AppError} If the Claude API call itself fails (rate limit, timeout, API error)
 */
async function callClaudeVision(promptText, base64Image, mimeType) {
  let response;
  try {
    response = await anthropicClient.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: promptText },
          ],
        },
      ],
    });
  } catch (error) {
    throw translateClaudeError(error);
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  const rawText = textBlock ? textBlock.text : '';

  try {
    const parsed = JSON.parse(rawText.trim());
    return {
      transcribedText: typeof parsed.transcribedText === 'string' ? parsed.transcribedText : '',
      confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0,
      isLegible: parsed.isLegible === true,
      language: typeof parsed.language === 'string' ? parsed.language : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch (parseError) {
    logger.warn('Claude Vision response was not valid JSON; treating as a failed transcription attempt', {
      parseError: parseError.message,
    });
    return {
      transcribedText: '',
      confidenceScore: 0,
      isLegible: false,
      language: null,
      notes: 'Claude response could not be parsed',
    };
  }
}

/**
 * Runs the Python image-preprocessing script (orientation correction,
 * RGB conversion, resize, denoise, contrast) via `execFile` — never a
 * shell — and returns the parsed JSON result.
 *
 * @param {string} inputPath - Absolute path to the original uploaded image
 * @param {string} outputPath - Absolute path where the processed image should be written
 * @returns {Promise<{ success: boolean, outputPath?: string, width?: number, height?: number, error?: string }>}
 * @throws {AppError} If the Python process fails to run or reports a processing failure
 */
async function runPythonPreprocessing(inputPath, outputPath) {
  let stdout;
  try {
    const result = await execFileAsync('python3', [PYTHON_SCRIPT_PATH, inputPath, outputPath], {
      timeout: PYTHON_TIMEOUT_MS,
    });
    stdout = result.stdout;
  } catch (execError) {
    // execFile rejects both on a non-zero exit code and on a timeout;
    // preprocess.py always writes its structured error to stdout before
    // exiting non-zero, so we still try to parse it for a clean message.
    const attemptedStdout = execError.stdout || '';
    let parsedError = null;
    try {
      parsedError = JSON.parse(attemptedStdout.trim());
    } catch (_ignored) {
      // stdout wasn't valid JSON (e.g. the interpreter itself crashed) - fall through to generic message
    }
    const message =
      parsedError && parsedError.error ? parsedError.error : `Python preprocessing failed: ${execError.message}`;
    throw new AppError(message, HTTP_STATUS.BAD_GATEWAY, 'PREPROCESSING_FAILED');
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (parseError) {
    throw new AppError('Python preprocessing returned an unexpected response', HTTP_STATUS.BAD_GATEWAY, 'PREPROCESSING_FAILED');
  }

  if (!parsed.success) {
    throw new AppError(parsed.error || 'Image preprocessing failed', HTTP_STATUS.BAD_GATEWAY, 'PREPROCESSING_FAILED');
  }

  return parsed;
}

/**
 * Runs the complete OCR pipeline for a single image-based source
 * material: preprocess -> transcribe -> gatekeeper check -> (at most one)
 * self-correction -> persist result -> finalize processing status.
 *
 * Must be called only after the source material has already been claimed
 * (transitioned to 'processing') by processing.service.js — this
 * function finalizes that in-flight processing run into either
 * 'processed' or a failure status; it does not itself perform the
 * pending->processing claim/lock.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} sourceMaterialPublicId - Source material's public UUID
 * @returns {Promise<Object>} The finalized processing state (public shape, see processing.mapper.js)
 * @throws {NotFoundError} If the source material does not exist or is not owned by this teacher
 * @throws {AppError} 422 FAILED_LEGIBILITY if the image remains unreadable after self-correction;
 *   502/503/504 for Python/Claude infrastructure failures
 */
async function runOcrPipeline(teacherId, sourceMaterialPublicId) {
  const sourceMaterialRow = await sourceMaterialRepository.findByPublicId(teacherId, sourceMaterialPublicId);
  if (!sourceMaterialRow) {
    throw new NotFoundError('Source material not found');
  }

  const pipelineStartedAt = Date.now();
  let tempOutputPath = null;

  try {
    if (sourceMaterialRow.source_type !== APP_CONSTANTS.SOURCE_TYPE.IMAGE) {
      throw new AppError(
        'Automated OCR processing is currently only supported for image source materials',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'UNSUPPORTED_SOURCE_TYPE'
      );
    }

    if (!SUPPORTED_IMAGE_MIME_TYPES.includes(sourceMaterialRow.mime_type)) {
      throw new AppError(
        `Unsupported image MIME type for OCR: ${sourceMaterialRow.mime_type}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'UNSUPPORTED_MIME_TYPE'
      );
    }

    const inputPath = uploadService.resolveAbsolutePath(sourceMaterialRow.file_path);
    tempOutputPath = path.join(os.tmpdir(), `${generatePublicId()}.jpg`);

    logger.info('Starting image preprocessing', { sourceMaterialId: sourceMaterialRow.id });
    const preprocessStartedAt = Date.now();
    await runPythonPreprocessing(inputPath, tempOutputPath);
    logger.info('Image preprocessing completed', {
      sourceMaterialId: sourceMaterialRow.id,
      durationMs: Date.now() - preprocessStartedAt,
    });

    const imageBuffer = await fs.readFile(tempOutputPath);
    const base64Image = imageBuffer.toString('base64');

    logger.info('Sending Claude Vision transcription request', { sourceMaterialId: sourceMaterialRow.id, attempt: 1 });
    const claudeStartedAt = Date.now();
    let result = await callClaudeVision(TRANSCRIPTION_PROMPT, base64Image, sourceMaterialRow.mime_type);
    logger.info('Claude Vision transcription response received', {
      sourceMaterialId: sourceMaterialRow.id,
      attempt: 1,
      responseTimeMs: Date.now() - claudeStartedAt,
      confidenceScore: result.confidenceScore,
      isLegible: result.isLegible,
    });

    let selfCorrectionAttempted = false;

    if (!result.isLegible || result.confidenceScore < config.claude.legibilityThreshold) {
      selfCorrectionAttempted = true;

      logger.info('Legibility below threshold; running one self-correction pass', {
        sourceMaterialId: sourceMaterialRow.id,
        firstAttemptConfidence: result.confidenceScore,
      });

      const correctionStartedAt = Date.now();
      result = await callClaudeVision(LEGIBILITY_PROMPT, base64Image, sourceMaterialRow.mime_type);
      logger.info('Claude Vision self-correction response received', {
        sourceMaterialId: sourceMaterialRow.id,
        attempt: 2,
        responseTimeMs: Date.now() - correctionStartedAt,
        confidenceScore: result.confidenceScore,
        isLegible: result.isLegible,
      });
    }

    const totalDurationMs = Date.now() - pipelineStartedAt;

    if (!result.isLegible || result.confidenceScore < config.claude.legibilityThreshold) {
      // Still stores Claude's actual (honest, [unclear]-annotated) attempt
      // rather than discarding it — this is not a hallucination risk since
      // the prompts require marking uncertain spans rather than guessing;
      // preserving it gives the teacher partial value even on failure.
      await aiRepository.upsertForSourceMaterial({
        sourceMaterialId: sourceMaterialRow.id,
        transcribedText: result.transcribedText || null,
        legibilityScore: result.confidenceScore,
        gatekeeperStatus: APP_CONSTANTS.GATEKEEPER_STATUS.FAILED,
        selfCorrectionAttempted,
        claudeModelUsed: config.claude.model,
        language: result.language,
        processingDurationMs: totalDurationMs,
      });

      const error = new AppError(
        'This image could not be transcribed reliably even after a careful re-check. Please upload a clearer photo.',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'FAILED_LEGIBILITY'
      );
      await processingService.failProcessing(
        teacherId,
        sourceMaterialRow.id,
        error,
        APP_CONSTANTS.SOURCE_STATUS.FAILED_LEGIBILITY
      );
      error.__alreadyFinalized = true;
      throw error;
    }

    await aiRepository.upsertForSourceMaterial({
      sourceMaterialId: sourceMaterialRow.id,
      transcribedText: result.transcribedText,
      legibilityScore: result.confidenceScore,
      gatekeeperStatus: APP_CONSTANTS.GATEKEEPER_STATUS.PASSED,
      selfCorrectionAttempted,
      claudeModelUsed: config.claude.model,
      language: result.language,
      processingDurationMs: totalDurationMs,
    });

    const finalState = await processingService.completeProcessing(teacherId, sourceMaterialRow.id);

    logger.info('Source material OCR pipeline completed successfully', {
      sourceMaterialId: sourceMaterialRow.id,
      totalDurationMs,
      selfCorrectionAttempted,
    });

    return finalState;
  } catch (error) {
    // Any error reaching here that was NOT already finalized above (i.e.
    // every infrastructure failure: unsupported type/mime, Python
    // preprocessing failure, Claude rate limit/timeout/API error, or any
    // unexpected exception) must still terminate the processing run —
    // otherwise the source material is left stuck in 'processing'
    // forever, permanently blocked from ever being retried (the
    // pending->processing transition is the only entry point, and
    // 'processing' has no further valid transition except through this
    // same finalization step).
    if (!error.__alreadyFinalized) {
      try {
        await processingService.failProcessing(teacherId, sourceMaterialRow.id, error, APP_CONSTANTS.SOURCE_STATUS.ERROR);
      } catch (finalizeError) {
        logger.error(`Failed to finalize source material after pipeline error: ${finalizeError.message}`, {
          sourceMaterialId: sourceMaterialRow.id,
        });
      }
    }
    throw error;
  } finally {
    if (tempOutputPath) {
      await fs.unlink(tempOutputPath).catch(() => {});
    }
  }
}

module.exports = {
  runOcrPipeline,
};
