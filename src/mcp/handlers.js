'use strict';

/**
 * MCP Tool Handlers — FAÇADE.
 *
 * The dispatch map was a 1,639-line monolith; the third decomposition
 * split it into organs under src/mcp/handlers/ and this module remains
 * the stable public surface — same single export, same 30 handler keys,
 * same order:
 *
 *   handlers/helpers.js        shared module-level helpers
 *   handlers/core.js           goggles + search/resolve/submit/register/
 *                              feedback/stats/pending-feedback
 *   handlers/maintenance.js    debug/sync/harvest/maintain/healing/heal
 *   handlers/analysis.js       fractal/audit/lint/smell/analyze/risk/
 *                              audit_repo
 *   handlers/orchestration.js  swarm/forge/diagnostic/ratchet/ecosystem/
 *                              reason/meditate/ecosystem_orient
 *   handlers/field.js          the Remembrance Field tool (LRE), with its
 *                              audit action in handlers/field-audit.js
 *
 * Every handler moved verbatim; the two real mutations (audit
 * baseline-clear, heal write-back) now ride sealed covenant gates in
 * their organs instead of a file-level exemption.
 */

const { CORE } = require('./handlers/core');
const { MAINTENANCE } = require('./handlers/maintenance');
const { ANALYSIS } = require('./handlers/analysis');
const { ORCHESTRATION } = require('./handlers/orchestration');
const { FIELD } = require('./handlers/field');

const HANDLERS = {
  goggles: CORE.goggles,
  oracle_search: CORE.oracle_search,
  oracle_resolve: CORE.oracle_resolve,
  oracle_submit: CORE.oracle_submit,
  oracle_register: CORE.oracle_register,
  oracle_feedback: CORE.oracle_feedback,
  oracle_stats: CORE.oracle_stats,
  oracle_debug: MAINTENANCE.oracle_debug,
  oracle_sync: MAINTENANCE.oracle_sync,
  oracle_harvest: MAINTENANCE.oracle_harvest,
  oracle_maintain: MAINTENANCE.oracle_maintain,
  oracle_healing: MAINTENANCE.oracle_healing,
  oracle_swarm: ORCHESTRATION.oracle_swarm,
  oracle_pending_feedback: CORE.oracle_pending_feedback,
  oracle_fractal: ANALYSIS.oracle_fractal,
  oracle_audit: ANALYSIS.oracle_audit,
  oracle_lint: ANALYSIS.oracle_lint,
  oracle_smell: ANALYSIS.oracle_smell,
  oracle_analyze: ANALYSIS.oracle_analyze,
  oracle_heal: MAINTENANCE.oracle_heal,
  oracle_risk: ANALYSIS.oracle_risk,
  oracle_forge: ORCHESTRATION.oracle_forge,
  oracle_diagnostic: ORCHESTRATION.oracle_diagnostic,
  oracle_ratchet: ORCHESTRATION.oracle_ratchet,
  oracle_ecosystem: ORCHESTRATION.oracle_ecosystem,
  oracle_reason: ORCHESTRATION.oracle_reason,
  oracle_meditate: ORCHESTRATION.oracle_meditate,
  field: FIELD.field,
  ecosystem_orient: ORCHESTRATION.ecosystem_orient,
  oracle_audit_repo: ANALYSIS.oracle_audit_repo,
};

module.exports = { HANDLERS };
