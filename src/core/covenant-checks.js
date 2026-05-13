'use strict';

/**
 * Covenant Checks — active registry.
 *
 * Every function exported here is a covenant check that fires during
 * covenantValidate(code, filePath). Each returns:
 *   { passed: bool, severity: 'low'|'medium'|'high', finding?: string, remedy?: string }
 *
 * Checks approved by self-improve (2026-04-19):
 *   - harm-patterns   (15 canonical seals)
 *   - framing-check   (16th seal: "No False Framing")
 *
 * Add new checks here. The validator composes them with short-circuit
 * semantics: any high-severity failure seals covenant_breach.
 */

const { checkFraming, PROPOSED_SEAL } = require('./framing-patterns');

function framingCheck(code, filePath) {
  const result = checkFraming(code, filePath);
  if (!result.flagged) return { passed: true, severity: 'low', check: 'framing' };
  const __retVal = {
    passed: false,
    severity: result.findings.some(f => !f.disclaimerPresent && f.severity === 'medium') ? 'medium' : 'low',
    check: 'framing',
    finding: `Domain-authority language (${result.domain}) without disclaimer`,
    remedy: result.remedy,
    details: result.findings,
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, 1 - (__retVal.severity || 0))), source: 'oracle:covenant-checks:framingCheck' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

framingCheck.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

// Approved seals — promoted from proposed to active by self-improve
const ACTIVE_SEALS = [
  { id: 16, ...PROPOSED_SEAL, status: 'active', approvedAt: '2026-04-19T15:00:00Z', approvedBy: 'self-improve' },
];

function runAllChecks(code, filePath = '') {
  const results = [];
  for (const check of CHECKS) {
    try {
      results.push(check(code, filePath));
    } catch (e) {
      results.push({ passed: false, severity: 'high', check: check.name, error: String(e) });
    }
  }
  const failed = results.filter(r => !r.passed);
  const highestSeverity = failed.length === 0 ? null
    : failed.some(r => r.severity === 'high') ? 'high'
    : failed.some(r => r.severity === 'medium') ? 'medium'
    : 'low';
  return {
    sealed: failed.length === 0,
    severity: highestSeverity,
    failed,
    passed: results.filter(r => r.passed),
    totalChecks: results.length,
  };
}

const CHECKS = [framingCheck];

module.exports = {
  CHECKS,
  ACTIVE_SEALS,
  framingCheck,
  runAllChecks,
};
