/**
 * pdf.controller.js
 *
 * HTTP layer for the PDF export module. Unlike every other controller in
 * this codebase, this endpoint does NOT use the standard JSON response
 * envelope (utils/apiResponse.js) — it returns raw `application/pdf`
 * binary content, since the client is expected to download or render the
 * file directly rather than parse a JSON body. This is a deliberate,
 * documented deviation from the standard response helper, justified by
 * the fundamentally different content type of this single endpoint.
 */

'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const HTTP_STATUS = require('../../constants/httpStatus');
const pdfService = require('./pdf.service');

/**
 * GET /api/v1/generated-exams/:id/pdf
 * Generates and streams a print-ready PDF of a completed generated exam.
 * Never exposes internal database ids or raw JSON content — the client
 * receives only the rendered binary PDF.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getExamPdf = asyncHandler(async (req, res) => {
  const { buffer, filename } = await pdfService.generateExamPdf(req.teacher.id, req.params.id);

  res.status(HTTP_STATUS.OK);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

module.exports = {
  getExamPdf,
};
