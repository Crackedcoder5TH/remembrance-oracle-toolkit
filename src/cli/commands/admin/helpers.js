'use strict';

const fs = require('fs');
const path = require('path');
const { _quiet } = require('./out');

// Shared helpers lifted out of the admin monolith's closure
// (decomposition #5, 2026-08-09). Bodies verbatim; the parameterless
// catch now names its failure through the out seam.

function loadAuditBackend() {
  const backend = (process.env.ORACLE_AUDIT_BACKEND || 'ast').toLowerCase();
  if (backend === 'regex' || backend === 'legacy') {
    return require('../../../audit/static-checkers');
  }
  return require('../../../audit/ast-checkers');
}
loadAuditBackend.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * Compute the mean Phase 2 risk score across the repo's src/
 * directory. Returns null on any error so callers can degrade
 * gracefully. Used by `session start` / `session end` to track
 * risk deltas across a work session.
 */
function computeSessionMeanRisk(repoRoot) {
  try {
    const { scanDirectory } = require('../../../quality/risk-scanner');
    const srcDir = path.join(repoRoot, 'src');
    if (!fs.existsSync(srcDir)) return null;
    const report = scanDirectory(srcDir, { topN: 1 });
    return report.stats.meanProbability;
  } catch (e) {
    _quiet('admin:helpers:computeSessionMeanRisk', e);
    return null;
  }
}
computeSessionMeanRisk.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 11, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};

module.exports = { loadAuditBackend, computeSessionMeanRisk };
