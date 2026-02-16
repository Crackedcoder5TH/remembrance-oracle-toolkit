/**
 * Oracle Core — barrel re-export.
 * Submit, query, feedback, search, resolve, register.
 *
 * Split into focused sub-modules:
 *   oracle-core-similarity.js  — Jaccard similarity detection & thresholds
 *   oracle-core-whispers.js    — Resolve whisper messages & candidate notes
 *   oracle-core-submit.js      — submit, registerPattern, evolvePattern
 *   oracle-core-resolve.js     — resolve (PULL/EVOLVE/GENERATE decision)
 *   oracle-core-search.js      — search, query, smartSearch, parseSearchIntent
 *   oracle-core-feedback.js    — feedback, patternFeedback, auto-heal
 *   oracle-core-lifecycle.js   — inspect, stats, prune, events, auto-grow
 */

const similarity = require('./oracle-core-similarity');
const lifecycle = require('./oracle-core-lifecycle');
const feedback = require('./oracle-core-feedback');
const search = require('./oracle-core-search');
const submit = require('./oracle-core-submit');
const resolve = require('./oracle-core-resolve');

module.exports = {
  ...lifecycle,
  ...feedback,
  ...search,
  ...submit,
  ...resolve,
  // Expose similarity utilities for external use (tests, etc.)
  _codeSimilarity: similarity._codeSimilarity,
  _checkSimilarity: similarity._checkSimilarity,
  SIMILARITY_REJECT_THRESHOLD: similarity.SIMILARITY_REJECT_THRESHOLD,
  SIMILARITY_CANDIDATE_THRESHOLD: similarity.SIMILARITY_CANDIDATE_THRESHOLD,
};
