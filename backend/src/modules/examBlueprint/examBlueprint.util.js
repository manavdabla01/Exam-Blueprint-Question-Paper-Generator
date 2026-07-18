/**
 * examBlueprint.util.js
 *
 * Reusable validation helpers for the blueprint `structure` object,
 * shared between the Joi schema (examBlueprint.validation.js, for
 * request-shape validation) and anywhere else the same business rule
 * needs checking (e.g. a future regeneration flow). Pure functions only.
 */

'use strict';

/** Allowed tolerance when checking that a percentage distribution sums to 100. */
const DISTRIBUTION_SUM_TOLERANCE = 0.01;

/**
 * Checks whether the values of a percentage-distribution object
 * (e.g. { easy: 40, medium: 40, hard: 20 }) sum to 100, within a small
 * floating-point tolerance.
 *
 * @param {Object<string, number>} distribution - Map of label to percentage
 * @returns {boolean} True if the percentages sum to 100 (within tolerance)
 */
function sumsToOneHundred(distribution) {
  if (!distribution || typeof distribution !== 'object') return false;
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  return Math.abs(total - 100) <= DISTRIBUTION_SUM_TOLERANCE;
}

/**
 * Checks whether a chapter/topic weightage array's `weightagePercent`
 * values sum to 100, within a small floating-point tolerance.
 *
 * @param {Array<{ topic: string, weightagePercent: number }>} chapterWeightage
 * @returns {boolean} True if the weightage percentages sum to 100 (within tolerance)
 */
function chapterWeightageSumsToOneHundred(chapterWeightage) {
  if (!Array.isArray(chapterWeightage) || chapterWeightage.length === 0) return false;
  const total = chapterWeightage.reduce((sum, entry) => sum + (entry.weightagePercent || 0), 0);
  return Math.abs(total - 100) <= DISTRIBUTION_SUM_TOLERANCE;
}

module.exports = {
  DISTRIBUTION_SUM_TOLERANCE,
  sumsToOneHundred,
  chapterWeightageSumsToOneHundred,
};
