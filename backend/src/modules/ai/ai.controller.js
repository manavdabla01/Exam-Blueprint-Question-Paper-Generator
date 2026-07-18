/**
 * ai.controller.js
 *
 * HTTP layer for the AI module. The actual OCR pipeline orchestration
 * (ai.service.js `runOcrPipeline`) is invoked from
 * processing.controller.js immediately after a source material is
 * claimed for processing — it is not exposed as its own endpoint here,
 * since triggering it standalone would bypass the processing module's
 * claim/lock step (see processing.service.js). This controller instead
 * exposes read access to the resulting transcription.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const aiRepository = require('./ai.repository');
const { toPublicTranscription } = require('./transcription.mapper');
const NotFoundError = require('../../utils/errors/NotFoundError');

/**
 * GET /api/v1/ai/:sourceMaterialId/transcription
 * Retrieves the transcription result for a source material, if one
 * exists yet.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getTranscription = asyncHandler(async (req, res) => {
  const row = await aiRepository.findBySourceMaterialPublicId(req.teacher.id, req.params.sourceMaterialId);

  if (!row) {
    throw new NotFoundError('Transcription not found');
  }

  return successResponse(res, { data: toPublicTranscription(row) });
});

module.exports = {
  getTranscription,
};
