/**
 * pdf.template.js
 *
 * Builds the print-ready exam paper layout onto a PDFKit document
 * instance. Contains only layout/formatting logic — no database access,
 * no HTTP concerns. `pdf.service.js` is responsible for gathering the
 * data this module renders.
 *
 * Fonts: DejaVu Sans (bundled in ./fonts) is registered and used for all
 * text instead of PDFKit's built-in Helvetica, so the paper can render
 * Latin Extended, Greek, Cyrillic, and a wide range of symbols correctly
 * as embedded glyphs regardless of what fonts are installed on the
 * deployment host. DejaVu Sans does not cover Devanagari/CJK; a
 * language-specific script would need an additional bundled font
 * registered the same way.
 */

'use strict';

const path = require('path');

const PAGE_MARGIN = 50;
const FONT_REGULAR = 'Body';
const FONT_BOLD = 'Body-Bold';
const FONT_REGULAR_PATH = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

const MARKS_COLUMN_WIDTH = 60;
const QUESTION_SPACING = 10;
const SECTION_SPACING = 16;
const MIN_SPACE_BEFORE_NEW_SECTION = 100;

/**
 * Registers the bundled Unicode fonts on a PDFKit document. Must be
 * called once per document before any text is drawn.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @returns {void}
 */
function registerFonts(doc) {
  doc.registerFont(FONT_REGULAR, FONT_REGULAR_PATH);
  doc.registerFont(FONT_BOLD, FONT_BOLD_PATH);
}

/**
 * Draws the header block: institute name, subject/class/marks/time
 * metadata row, and the exam title.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @param {Object} data - See buildExamPdf for the full data shape
 * @returns {void}
 */
function drawHeader(doc, data) {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;

  doc
    .font(FONT_BOLD)
    .fontSize(16)
    .text(data.instituteName, PAGE_MARGIN, PAGE_MARGIN, { width: contentWidth, align: 'center' });

  doc.moveDown(0.3);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  const metaColumnWidth = contentWidth / 2;
  const metaStartY = doc.y;

  doc
    .font(FONT_REGULAR)
    .fontSize(10)
    .text(`Subject: ${data.subjectName}`, PAGE_MARGIN, metaStartY, { width: metaColumnWidth })
    .text(`Class: ${data.className}`, PAGE_MARGIN, doc.y);

  doc
    .font(FONT_REGULAR)
    .fontSize(10)
    .text(`Total Marks: ${data.totalMarks}`, PAGE_MARGIN + metaColumnWidth, metaStartY, {
      width: metaColumnWidth,
      align: 'right',
    })
    .text(`Time Allowed: ${data.timeAllowed}`, PAGE_MARGIN + metaColumnWidth, metaStartY + doc.currentLineHeight(), {
      width: metaColumnWidth,
      align: 'right',
    });

  doc.moveDown(1);
  doc
    .font(FONT_BOLD)
    .fontSize(14)
    .text(data.examTitle, PAGE_MARGIN, doc.y, { width: contentWidth, align: 'center', underline: true });

  doc.moveDown(1);
}

/**
 * Draws the instructions box, if instructions were provided.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @param {string|null} instructions - Free-text instructions from the blueprint
 * @returns {void}
 */
function drawInstructions(doc, instructions) {
  if (!instructions || instructions.trim().length === 0) {
    return;
  }

  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const boxPadding = 8;
  const boxStartY = doc.y;

  doc.font(FONT_BOLD).fontSize(10).text('Instructions:', PAGE_MARGIN + boxPadding, boxStartY + boxPadding, {
    width: contentWidth - boxPadding * 2,
  });
  doc.font(FONT_REGULAR).fontSize(10).text(instructions, PAGE_MARGIN + boxPadding, doc.y, {
    width: contentWidth - boxPadding * 2,
  });

  const boxEndY = doc.y + boxPadding;
  doc
    .rect(PAGE_MARGIN, boxStartY, contentWidth, boxEndY - boxStartY)
    .lineWidth(0.75)
    .stroke();

  doc.y = boxEndY;
  doc.moveDown(1);
}

/**
 * Ensures there is enough vertical space remaining on the current page
 * before starting a new section; if not, forces a page break so a
 * section heading is never orphaned alone at the bottom of a page.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @returns {void}
 */
function ensureSpaceForNewSection(doc) {
  const remainingSpace = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remainingSpace < MIN_SPACE_BEFORE_NEW_SECTION) {
    doc.addPage();
  }
}

/**
 * Draws a single question: question number + text on the left, marks in
 * a fixed-width right-aligned column, correctly handling multi-line
 * question text (PDFKit automatically paginates if the text overflows
 * the current page).
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @param {Object} question - { questionNumber, questionText, marks }
 * @returns {void}
 */
function drawQuestion(doc, question) {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const questionColumnWidth = contentWidth - MARKS_COLUMN_WIDTH - 10;

  const startY = doc.y;
  const startPageIndex = doc.bufferedPageRange().count - 1;

  doc
    .font(FONT_REGULAR)
    .fontSize(11)
    .text(`${question.questionNumber}. ${question.questionText}`, PAGE_MARGIN, startY, {
      width: questionColumnWidth,
      align: 'left',
    });

  const endY = doc.y;
  const endPageIndex = doc.bufferedPageRange().count - 1;

  // If the question text itself triggered a page break mid-draw, the
  // marks label must be placed on the page where the question STARTED;
  // for the common case (a question fitting on one page) we draw the
  // marks aligned to the same starting line as the question text.
  if (startPageIndex === endPageIndex) {
    doc
      .font(FONT_BOLD)
      .fontSize(11)
      .text(`[${question.marks}]`, PAGE_MARGIN + questionColumnWidth + 10, startY, {
        width: MARKS_COLUMN_WIDTH,
        align: 'right',
      });
  }

  doc.y = Math.max(doc.y, endY);
  doc.moveDown(QUESTION_SPACING / doc.currentLineHeight());
}

/**
 * Draws a single section: its name as a heading, then every question in
 * order.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @param {Object} section - { sectionName, questions: Array<Object> }
 * @returns {void}
 */
function drawSection(doc, section) {
  ensureSpaceForNewSection(doc);

  doc.font(FONT_BOLD).fontSize(12).text(section.sectionName, PAGE_MARGIN, doc.y);
  doc.moveDown(0.5);

  section.questions.forEach((question) => drawQuestion(doc, question));

  doc.moveDown(SECTION_SPACING / doc.currentLineHeight());
}

/**
 * Adds a "Page X of Y" footer to every buffered page. Must be called
 * AFTER all content has been drawn (requires the document to have been
 * created with `bufferPages: true`), since the total page count is only
 * known once. Temporarily zeroes the bottom margin while drawing each
 * footer to prevent PDFKit's own overflow detection from inserting an
 * unwanted extra blank page — a well-known PDFKit footer/pagination
 * interaction that must be worked around explicitly.
 *
 * @param {import('pdfkit')} doc - The PDFKit document instance
 * @returns {void}
 */
function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const footerY = doc.page.height - PAGE_MARGIN + 10;

    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .text(`Page ${i + 1} of ${range.count}`, PAGE_MARGIN, footerY, {
        width: contentWidth,
        align: 'center',
      });

    doc.page.margins.bottom = originalBottomMargin;
  }
}

/**
 * Builds the complete exam paper onto the given PDFKit document. The
 * caller is responsible for creating the PDFDocument (with
 * `bufferPages: true`) and for piping/collecting its output.
 *
 * @param {import('pdfkit')} doc - A freshly created PDFDocument instance
 * @param {Object} data
 * @param {string} data.instituteName - Teacher's institute/coaching center name
 * @param {string} data.subjectName - Subject name
 * @param {string} data.className - Class/grade label
 * @param {string} data.examTitle - Generated exam's title
 * @param {number} data.totalMarks - Total marks for the exam
 * @param {string} data.timeAllowed - Time allowed label (may be a fill-in-the-blank placeholder)
 * @param {string|null} data.instructions - Free-text instructions from the blueprint
 * @param {Array<{ sectionName: string, questions: Array<Object> }>} data.sections - Exam sections and questions
 * @returns {void}
 */
function buildExamPdf(doc, data) {
  registerFonts(doc);

  drawHeader(doc, data);
  drawInstructions(doc, data.instructions);

  data.sections.forEach((section) => drawSection(doc, section));

  drawFooters(doc);
}

module.exports = {
  buildExamPdf,
};
