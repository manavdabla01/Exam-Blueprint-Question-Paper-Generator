/**
 * processing.controller.js
 *
 * HTTP layer for the processing module. Exposes a manual endpoint that
 * claims a source material for processing and then immediately runs the
 * AI OCR pipeline (ai.service.js) to completion, returning the final
 * processing state. The claim step (processing.service.js) and the OCR
 * orchestration (ai.service.js) are invoked from here, side by side,
 * rather than one module depending on the other — this keeps the
 * dependency graph a one-way arrow (ai -> processing) instead of a cycle
 * (processing.service.js has no knowledge of ai.service.js).
 *
 * NOTE: this endpoint is still the same explicitly temporary development
 * trigger introduced in the Processing Module task, now with the real
 * pipeline wired in behind it, ahead of an eventual automatic trigger on
 * upload completion.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const HTTP_STATUS = require('../../constants/httpStatus');
const processingService = require('./processing.service');
const aiService = require('../ai/ai.service');

/**
 * POST /api/v1/processing/:sourceMaterialId/start
 * Claims the source material for processing (pending -> processing,
 * guarded by a row lock to prevent duplicate concurrent claims), then
 * runs the full OCR pipeline against it and returns the resulting final
 * processing state.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const startProcessing = asyncHandler(async (req, res) => {
  await processingService.startProcessing(req.teacher.id, req.params.sourceMaterialId);

  const finalState = await aiService.runOcrPipeline(req.teacher.id, req.params.sourceMaterialId);

  return successResponse(res, {
    statusCode: HTTP_STATUS.OK,
    message: 'Processing completed',
    data: finalState,
  });
});

module.exports = {
  startProcessing,
};
