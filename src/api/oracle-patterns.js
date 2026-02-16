/**
 * Oracle Patterns — barrel re-export.
 * Candidates, versioning, security, voting, import/export.
 *
 * Split into focused sub-modules:
 *   oracle-patterns-candidates.js  — Tagging, cleaning, promotion
 *   oracle-patterns-versioning.js  — Rollback, healing stats
 *   oracle-patterns-security.js    — Security scanning and auditing
 *   oracle-patterns-voting.js      — Voting, reputation, GitHub identity
 *   oracle-patterns-export.js      — Diff, import, export
 */

const candidates = require('./oracle-patterns-candidates');
const versioning = require('./oracle-patterns-versioning');
const security = require('./oracle-patterns-security');
const voting = require('./oracle-patterns-voting');
const exporting = require('./oracle-patterns-export');

module.exports = {
  ...candidates,
  ...versioning,
  ...security,
  ...voting,
  ...exporting,
};
