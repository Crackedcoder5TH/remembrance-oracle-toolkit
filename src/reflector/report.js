/**
 * Remembrance Self-Reflector — Report Module (barrel re-export)
 *
 * Split into focused sub-modules for maintainability:
 *   1. report-history.js        — run history and logging
 *   2. report-pattern-hook.js   — pattern-guided healing
 *   3. report-pr.js             — PR formatting
 *   4. report-github.js         — GitHub/git operations
 *   5. report-autocommit.js     — auto-commit safety
 *   6. report-notifications.js  — notification system
 *   7. report-dashboard.js      — reflector dashboard
 *   8. report-safety.js         — safety checks
 *
 * All exports are re-exported here for backwards compatibility.
 */

const history = require('./report-history');
const patternHook = require('./report-pattern-hook');
const pr = require('./report-pr');
const github = require('./report-github');
const autocommit = require('./report-autocommit');
const notifications = require('./report-notifications');
const dashboard = require('./report-dashboard');
const safety = require('./report-safety');

module.exports = {
  // Section 1: History
  ...history,

  // Section 2: Pattern Hook
  ...patternHook,

  // Section 3: PR Formatter
  ...pr,

  // Section 4: GitHub
  ...github,

  // Section 5: Auto-Commit
  ...autocommit,

  // Section 6: Notifications
  ...notifications,

  // Section 7: Dashboard
  ...dashboard,

  // Section 8: Safety
  ...safety,
};
