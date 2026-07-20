/**
 * pdf.service.js
 *
 * Gathers everything needed to render a completed generated exam as a
 * PDF (teacher/institute, subject, blueprint instructions, and the
 * validated exam content) and produces the PDF entirely in memory —
 * no temporary files are ever written to disk. The actual layout is
 * delegated to pdf.template.js.
 */

'use strict';

const PDFDocument = require('pdfkit');

const generatedExamRepository = require('../examGenerator/generatedExam.repository');
const examBlueprintRepository = require('../examBlueprint/examBlueprint.repository');
const subjectRepository = require('../subject/subject.repository');
const teacherRepository = require('../auth/teacher.repository');
const { buildExamPdf } = require('./pdf.template');
const { sanitizeFilename } = require('../../utils/fileSecurity.util');
const logger = require('../../utils/logger');

const NotFoundError = require('../../utils/errors/NotFoundError');
const ConflictError = require('../../utils/errors/ConflictError');

const COMPLETED_STATUS = 'completed';

/**
 * Derives a "Time Allowed" label for the paper. The blueprint schema has
 * no dedicated field for exam duration (only marks, question counts, and
 * distributions), so rather than fabricate a number the platform was
 * never told, this is rendered as an explicit fill-in-the-blank line for
 * the teacher to complete by hand — the same placeholder approach
 * mandated for the "Class" field when a dedicated class module isn't
 * available.
 *
 * @returns {string} The time-allowed placeholder label
 */
function deriveTimeAllowedLabel() {
  return '______________';
}

/**
 * Builds the filename for the exported PDF, derived from the exam title
 * and its public id (never an internal database id).
 *
 * @param {string} examTitle - The generated exam's title
 * @param {string} publicId - The generated exam's public UUID
 * @returns {string} A filesystem-safe filename ending in .pdf
 */
function buildPdfFilename(examTitle, publicId) {
  const shortId = publicId.split('-')[0];
  const safeTitle = sanitizeFilename(`${examTitle}.pdf`).replace(/\.pdf$/i, '');
  return `${safeTitle}-${shortId}.pdf`;
}

/**
 * Renders a PDFKit document into an in-memory Buffer. No file is ever
 * written to disk — the document's output stream is captured directly
 * into memory via its 'data'/'end' events.
 *
 * @param {Object} examData - The data shape expected by pdf.template.js's buildExamPdf
 * @returns {Promise<Buffer>} The complete PDF file content
 */
function renderPdfToBuffer(examData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    try {
      buildExamPdf(doc, examData);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a print-ready PDF for a completed generated exam.
 *
 * @param {number} teacherId - Internal auto-increment id of the authenticated teacher
 * @param {string} generatedExamPublicId - Generated exam's public UUID
 * @returns {Promise<{ buffer: Buffer, filename: string }>} The PDF content and a suggested download filename
 * @throws {NotFoundError} If the generated exam does not exist or is not owned by this teacher
 * @throws {ConflictError} If the generated exam is not currently 'completed' (queued/generating/failed are all rejected)
 */
async function generateExamPdf(teacherId, generatedExamPublicId) {
  const startedAt = Date.now();

  const generatedExamRow = await generatedExamRepository.findByPublicId(teacherId, generatedExamPublicId);
  if (!generatedExamRow) {
    throw new NotFoundError('Generated exam not found');
  }

  if (generatedExamRow.status !== COMPLETED_STATUS) {
    throw new ConflictError(
      `Cannot export PDF: this exam's status is "${generatedExamRow.status}", but only "completed" exams can be exported`
    );
  }

  const [blueprintRow, subjectRow, teacherRow] = await Promise.all([
    examBlueprintRepository.findByIdForOwner(teacherId, generatedExamRow.blueprint_id),
    subjectRepository.findByPublicId(teacherId, generatedExamRow.subject_public_id),
    teacherRepository.findByIdInternal(teacherId),
  ]);

  if (!blueprintRow || !subjectRow || !teacherRow) {
    throw new ConflictError('Required exam data (blueprint, subject, or teacher profile) is no longer available');
  }

  const content = generatedExamRow.content_json;

  const examData = {
    instituteName: teacherRow.institute_name,
    subjectName: subjectRow.name,
    className: subjectRow.grade,
    examTitle: content.examTitle || generatedExamRow.title,
    totalMarks: content.totalMarks,
    timeAllowed: deriveTimeAllowedLabel(),
    instructions: blueprintRow.structure_json.instructions || null,
    sections: content.sections,
  };

  const buffer = await renderPdfToBuffer(examData);

  const durationMs = Date.now() - startedAt;
  logger.info('Generated exam PDF exported', {
    generatedExamId: generatedExamRow.id,
    durationMs,
  });

  return {
    buffer,
    filename: buildPdfFilename(examData.examTitle, generatedExamRow.public_id),
  };
}

module.exports = {
  generateExamPdf,
};
