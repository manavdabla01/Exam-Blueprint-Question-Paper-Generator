/**
 * generation.service.js
 *
 * Orchestrates the AI question-generation pipeline for a queued
 * generated_exams row:
 *
 *   Load queued exam request -> load blueprint -> load processed
 *   transcriptions/content -> build structured AI context -> call
 *   Claude -> receive structured JSON -> validate against the blueprint
 *   -> persist (completed) or record failure (failed)
 *
 * Status flow: queued -> generating -> completed | failed. Once
 * `markGenerating` has been called, this pipeline guarantees the row
 * will end in either 'completed' or 'failed' — every error path below
 * routes through a single outer catch that calls `markFailed`, so a
 * generation request can never be left stuck in 'generating'.
 *
 * Retry policy: exactly one retry is attempted for a transient Claude
 * API failure (rate limit, timeout, transport-level API error). A
 * successful API response that then fails structural/blueprint
 * validation is NEVER retried — that is a content-quality failure, not
 * an infrastructure hiccup, and retrying it would not change the
 * outcome.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const anthropicClient = require('../../config/claude.config');
const config = require('../../config/env');
const logger = require('../../utils/logger');

const generatedExamRepository = require('./generatedExam.repository');
const examBlueprintRepository = require('../examBlueprint/examBlueprint.repository');
const sourceMaterialRepository = require('../sourceMaterial/sourceMaterial.repository');
const aiRepository = require('../ai/ai.repository');
const { toPublicGeneratedExam } = require('./generatedExam.mapper');
const { formatFailureReason } = require('../processing/processing.util');

const AppError = require('../../utils/errors/AppError');
const NotFoundError = require('../../utils/errors/NotFoundError');
const ConflictError = require('../../utils/errors/ConflictError');
const HTTP_STATUS = require('../../constants/httpStatus');

const GENERATION_PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'generation.prompt.txt'), 'utf8');

/** Generous token budget for a full exam paper response (larger than the OCR pipeline's, since a complete question paper is a much larger JSON payload). */
const GENERATION_MAX_TOKENS = 8192;

/** Total Claude call attempts for transient failures: the original attempt plus exactly one retry. */
const MAX_TRANSIENT_ATTEMPTS = 2;

/**
 * Translates a raw Anthropic SDK error into the application's AppError
 * type with a semantically correct HTTP status. Mirrors
 * ai.service.js's translateClaudeError — kept as a separate local copy
 * rather than a shared import so the two pipelines (OCR vs generation)
 * remain independently modifiable without accidentally coupling their
 * error-handling behavior.
 *
 * @param {Error} error - The error thrown by the Anthropic SDK
 * @returns {AppError}
 */
function translateClaudeError(error) {
  if (error.status === 429) {
    return new AppError(
      'Claude API rate limit exceeded while generating the exam',
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      'CLAUDE_RATE_LIMIT'
    );
  }
  if (error.name === 'APIConnectionTimeoutError' || error.status === 408) {
    return new AppError(
      'Claude API request timed out while generating the exam',
      HTTP_STATUS.GATEWAY_TIMEOUT,
      'CLAUDE_TIMEOUT'
    );
  }
  if (typeof error.status === 'number') {
    return new AppError(`Claude API error: ${error.message}`, HTTP_STATUS.BAD_GATEWAY, 'CLAUDE_API_ERROR');
  }
  return new AppError(
    `Unexpected error calling Claude: ${error.message}`,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    'CLAUDE_UNKNOWN_ERROR'
  );
}

/**
 * Loads the usable text content for each requested source material: raw
 * pasted text for 'text' sources, or the passed transcription for
 * 'image' sources. Source materials that have vanished (soft-deleted
 * after queuing) or have no usable content are skipped with a warning
 * rather than aborting the whole run — the final emptiness check happens
 * at the call site.
 *
 * @param {number} teacherId - Internal auto-increment teacher id
 * @param {Array<string>} sourceMaterialPublicIds - Public UUIDs of source materials to load
 * @returns {Promise<Array<{ title: string, content: string }>>}
 */
async function loadSourceMaterialsContent(teacherId, sourceMaterialPublicIds) {
  const results = [];

  for (const publicId of sourceMaterialPublicIds) {
    const sourceMaterialRow = await sourceMaterialRepository.findByPublicId(teacherId, publicId);
    if (!sourceMaterialRow) {
      logger.warn('Source material referenced by a generation request is no longer available; skipping', { publicId });
      continue;
    }

    let textContent = sourceMaterialRow.raw_text_content;

    if (sourceMaterialRow.source_type === 'image') {
      const transcription = await aiRepository.findBySourceMaterialPublicId(teacherId, publicId);
      textContent = transcription && transcription.gatekeeper_status === 'passed' ? transcription.transcribed_text : null;
    }

    if (!textContent) {
      logger.warn('Source material has no usable content for generation; skipping', { publicId });
      continue;
    }

    results.push({ title: sourceMaterialRow.title, content: textContent });
  }

  return results;
}

/**
 * Fills the generation prompt template with the blueprint's structure
 * and the teacher's actual source material content.
 *
 * @param {Object} blueprintRow - The loaded blueprint row (structure_json already parsed)
 * @param {Array<{ title: string, content: string }>} sourceMaterialsContext - Loaded source material content
 * @returns {string} The fully-populated prompt text
 */
function buildPrompt(blueprintRow, sourceMaterialsContext) {
  const blueprintPayload = {
    totalMarks: blueprintRow.total_marks,
    boardReference: blueprintRow.board_reference,
    ...blueprintRow.structure_json,
  };

  const materialsText = sourceMaterialsContext
    .map((material, index) => `### Source ${index + 1}: ${material.title}\n${material.content}`)
    .join('\n\n');

  return GENERATION_PROMPT_TEMPLATE.replace('{{BLUEPRINT_JSON}}', JSON.stringify(blueprintPayload, null, 2)).replace(
    '{{SOURCE_MATERIALS}}',
    materialsText
  );
}

/**
 * Calls Claude with the generation prompt, retrying exactly once if the
 * API call itself fails transiently (rate limit, timeout, other API
 * error). Does not retry on a successful-but-unparseable/invalid
 * response — that failure surfaces from the caller's own JSON
 * parsing/validation step, entirely outside this retry loop.
 *
 * @param {string} promptText - The fully-populated generation prompt
 * @returns {Promise<Object>} The raw Claude API response
 * @throws {AppError} If the API call fails on both the original attempt and the single retry
 */
async function callClaudeWithRetry(promptText) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await anthropicClient.messages.create({
        model: config.claude.model,
        max_tokens: GENERATION_MAX_TOKENS,
        messages: [{ role: 'user', content: promptText }],
      });
    } catch (error) {
      lastError = translateClaudeError(error);
      logger.warn(`Claude generation call failed (attempt ${attempt}/${MAX_TRANSIENT_ATTEMPTS}): ${lastError.message}`);
      if (attempt === MAX_TRANSIENT_ATTEMPTS) {
        throw lastError;
      }
    }
  }

  // Unreachable, but keeps the function's control flow explicit for linters.
  throw lastError;
}

/**
 * Validates a Claude-generated exam's structure against its blueprint.
 * Every rule here is checked independently so a single failure produces
 * a specific, actionable error message rather than a generic rejection.
 *
 * @param {Object} content - The parsed JSON returned by Claude
 * @param {Object} blueprintRow - The loaded blueprint row (structure_json already parsed)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGeneratedExam(content, blueprintRow) {
  const errors = [];

  if (!content || typeof content !== 'object') {
    return { valid: false, errors: ['Generated content is not a valid object'] };
  }

  if (!Array.isArray(content.sections) || content.sections.length === 0) {
    errors.push('Missing sections: the generated exam has no sections');
    return { valid: false, errors };
  }

  const allQuestions = [];
  for (const section of content.sections) {
    if (!section || !Array.isArray(section.questions) || section.questions.length === 0) {
      errors.push(`Missing sections: section "${section && section.sectionName}" has no questions`);
      continue;
    }
    allQuestions.push(...section.questions);
  }

  if (allQuestions.length === 0) {
    errors.push('Missing sections: no questions were found across any section');
    return { valid: false, errors };
  }

  const structure = blueprintRow.structure_json;
  const expectedQuestionCount = structure.numberOfQuestions;
  if (allQuestions.length !== expectedQuestionCount) {
    errors.push(`Wrong question count: expected ${expectedQuestionCount}, got ${allQuestions.length}`);
  }

  if (typeof content.totalMarks !== 'number' || content.totalMarks !== blueprintRow.total_marks) {
    errors.push(`Wrong marks: expected totalMarks ${blueprintRow.total_marks}, got ${content.totalMarks}`);
  }

  const allowedTypes = Object.keys(structure.questionTypeDistribution || {});
  const allowedDifficulties = Object.keys(structure.difficultyDistribution || {});
  let sumOfQuestionMarks = 0;

  allQuestions.forEach((question, index) => {
    if (!question || typeof question.questionText !== 'string' || question.questionText.trim().length === 0) {
      errors.push(`Question ${index + 1} is missing questionText`);
    }
    if (!question || typeof question.marks !== 'number' || question.marks <= 0) {
      errors.push(`Question ${index + 1} has an invalid marks value`);
    } else {
      sumOfQuestionMarks += question.marks;
    }
    if (!question || !allowedTypes.includes(question.type)) {
      errors.push(
        `Blueprint mismatch: question ${index + 1} has type "${question && question.type}" not present in the blueprint's questionTypeDistribution`
      );
    }
    if (!question || !allowedDifficulties.includes(question.difficulty)) {
      errors.push(
        `Blueprint mismatch: question ${index + 1} has difficulty "${question && question.difficulty}" not present in the blueprint's difficultyDistribution`
      );
    }
  });

  if (sumOfQuestionMarks !== blueprintRow.total_marks) {
    errors.push(`Wrong marks: individual question marks sum to ${sumOfQuestionMarks}, expected ${blueprintRow.total_marks}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs the complete AI generation pipeline for a single queued generated
 * exam: loads the blueprint and processed source content, calls Claude,
 * validates the structured response against the blueprint, and persists
 * the result. Guarantees the row ends in 'completed' or 'failed' — never
 * left stuck in 'generating', and never persists partial/invalid content
 * on failure (the row's content_json is left untouched from its queued
 * placeholder in that case).
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} generatedExamPublicId - Generated exam's public UUID
 * @returns {Promise<Object>} The finalized generated exam in its public detail shape
 * @throws {NotFoundError} If the generated exam does not exist or is not owned by this teacher
 * @throws {ConflictError} If the generated exam is not currently 'queued'
 * @throws {AppError} If generation fails (Claude infra failure, or validation failure against the blueprint)
 */
async function runGenerationPipeline(teacherId, generatedExamPublicId) {
  const generatedExamRow = await generatedExamRepository.findByPublicId(teacherId, generatedExamPublicId);
  if (!generatedExamRow) {
    throw new NotFoundError('Generated exam not found');
  }

  if (generatedExamRow.status !== 'queued') {
    throw new ConflictError(`Cannot start generation from status (${generatedExamRow.status})`);
  }

  const pipelineStartedAt = Date.now();
  await generatedExamRepository.markGenerating(generatedExamRow.id);
  logger.info('Exam generation started', { generatedExamId: generatedExamRow.id });

  try {
    const blueprintRow = await examBlueprintRepository.findByIdForOwner(teacherId, generatedExamRow.blueprint_id);
    if (!blueprintRow) {
      throw new AppError(
        'The exam blueprint for this request is no longer available',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'BLUEPRINT_UNAVAILABLE'
      );
    }

    const queuedSourceMaterialIds =
      (generatedExamRow.content_json && generatedExamRow.content_json.sourceMaterialIds) || [];
    const sourceMaterialsContext = await loadSourceMaterialsContent(teacherId, queuedSourceMaterialIds);

    if (sourceMaterialsContext.length === 0) {
      throw new AppError(
        'No usable source material content is available to generate this exam',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'NO_SOURCE_MATERIALS'
      );
    }

    const promptText = buildPrompt(blueprintRow, sourceMaterialsContext);

    const claudeStartedAt = Date.now();
    const response = await callClaudeWithRetry(promptText);
    const claudeLatencyMs = Date.now() - claudeStartedAt;
    logger.info('Claude generation response received', {
      generatedExamId: generatedExamRow.id,
      claudeLatencyMs,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const rawText = textBlock ? textBlock.text : '';

    let content;
    try {
      content = JSON.parse(rawText.trim());
    } catch (parseError) {
      throw new AppError(
        'Claude did not return valid JSON for the generated exam',
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'INVALID_GENERATION_JSON'
      );
    }

    const validation = validateGeneratedExam(content, blueprintRow);
    logger.info('Generated exam validation result', {
      generatedExamId: generatedExamRow.id,
      valid: validation.valid,
      errorCount: validation.errors.length,
    });

    if (!validation.valid) {
      throw new AppError(
        `Generated exam failed validation against the blueprint: ${validation.errors.join('; ')}`,
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'GENERATION_VALIDATION_FAILED'
      );
    }

    const totalDurationMs = Date.now() - pipelineStartedAt;

    await generatedExamRepository.markCompleted(generatedExamRow.id, {
      content,
      claudeModelUsed: config.claude.model,
      generationDurationMs: totalDurationMs,
    });

    logger.info('Exam generation completed', {
      generatedExamId: generatedExamRow.id,
      totalDurationMs,
    });

    const finalRow = await generatedExamRepository.findByIdForOwner(teacherId, generatedExamRow.id);
    return toPublicGeneratedExam(finalRow, true);
  } catch (error) {
    const reason = formatFailureReason(error);
    await generatedExamRepository.markFailed(generatedExamRow.id, reason);
    logger.warn('Exam generation failed', {
      generatedExamId: generatedExamRow.id,
      reason,
    });
    throw error;
  }
}

module.exports = {
  runGenerationPipeline,
  validateGeneratedExam,
};
