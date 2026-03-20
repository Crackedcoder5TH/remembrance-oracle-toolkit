/**
 * Oracle Core — Similarity detection.
 *
 * NOW DELEGATES to src/unified/similarity.js — the single source of truth.
 * This file remains for backwards compatibility.
 */

const unified = require('../unified/similarity');

module.exports = {
  SIMILARITY_REJECT_THRESHOLD: unified.SIMILARITY_REJECT_THRESHOLD,
  SIMILARITY_CANDIDATE_THRESHOLD: unified.SIMILARITY_CANDIDATE_THRESHOLD,
  _codeSimilarity: unified.jaccardSimilarity,
  _structuralSimilarity: unified.structuralSimilarity,
  _checkSimilarity: unified.checkSimilarity,
};
