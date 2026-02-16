/**
 * Reflector — Deep Code Analysis — barrel re-export.
 *
 * Split into focused sub-modules:
 *   scoring-analysis-security.js    — Security pattern scanning (self-referential safe)
 *   scoring-analysis-complexity.js  — Complexity, comments, nesting, quality metrics
 *   scoring-analysis-aggregate.js   — deepScore, repoScore, formatDeepScore
 */

const security = require('./scoring-analysis-security');
const complexity = require('./scoring-analysis-complexity');
const aggregate = require('./scoring-analysis-aggregate');

module.exports = {
  ...security,
  ...complexity,
  ...aggregate,
};
