'use strict';

/**
 * src/audit/pattern-detectors.js — the bridge that finally WIRES the ten
 * standalone audit-pattern detectors into the audit engine.
 *
 * Each detector under src/patterns/audit-patterns/ was implemented,
 * documented with vulnerable/safe examples, and unit-tested — and had
 * zero callers on any consumer path (trap #24's species, found in the
 * 2026-08-07 sweep). This module runs them as one file-level pass inside
 * auditCode and normalizes their {line, pattern|expression,
 * warning|suggestion} results into engine findings.
 *
 * Findings carry ruleId `pattern/<detector>` so they are traceable to
 * this bridge, and each detector maps to an existing bug class so
 * `options.bugClasses` filtering keeps working unchanged. A detector
 * that throws is skipped — one broken lens must not blind the audit.
 */

const DETECTORS = [
  {
    ruleId: 'pattern/shell-injection-detection', bugClass: 'security', severity: 'high',
    assumption: 'interpolating a variable into a shell command string is safe',
    fn: require('../patterns/audit-patterns/shell-injection-detection').detectShellInjection,
  },
  {
    ruleId: 'pattern/security-scan-bypass', advisory: true, bugClass: 'security', severity: 'medium',
    assumption: 'matching security patterns against raw source cannot be fooled',
    fn: require('../patterns/audit-patterns/security-scan-bypass').detectSecurityScanBypass,
  },
  {
    ruleId: 'pattern/null-property-access-guard', advisory: true, bugClass: 'integration', severity: 'medium',
    assumption: 'the object is always present when its property is read',
    fn: require('../patterns/audit-patterns/null-property-access-guard').detectNullPropertyAccess,
  },
  {
    ruleId: 'pattern/wrong-property-access', advisory: true, bugClass: 'integration', severity: 'medium',
    assumption: 'the property name spelled here is the one the object carries',
    fn: require('../patterns/audit-patterns/wrong-property-access').detectWrongPropertyAccess,
  },
  {
    ruleId: 'pattern/loop-query-detection', advisory: true, bugClass: 'integration', severity: 'medium',
    assumption: 'a query per loop iteration is as cheap as one batched query',
    fn: require('../patterns/audit-patterns/loop-query-detection').detectLoopQuery,
  },
  {
    ruleId: 'pattern/off-by-one-detection', advisory: true, bugClass: 'edge-case', severity: 'medium',
    assumption: 'the loop bound / index arithmetic is exact',
    fn: require('../patterns/audit-patterns/off-by-one-detection').detectOffByOne,
  },
  {
    ruleId: 'pattern/operator-precedence-check', advisory: true, bugClass: 'edge-case', severity: 'medium',
    assumption: 'the expression groups the way it reads',
    fn: require('../patterns/audit-patterns/operator-precedence-check').detectPrecedenceIssues,
  },
  {
    ruleId: 'pattern/falsy-zero-coercion', advisory: true, bugClass: 'type', severity: 'medium',
    assumption: 'a falsy check treats 0 and empty string as absent on purpose',
    fn: require('../patterns/audit-patterns/falsy-zero-coercion').detectFalsyZeroCoercion,
  },
  {
    ruleId: 'pattern/cache-mutation-detection', advisory: true, bugClass: 'state-mutation', severity: 'medium',
    assumption: 'the value read from the cache is a private copy',
    fn: require('../patterns/audit-patterns/cache-mutation-detection').detectCacheMutation,
  },
  {
    ruleId: 'pattern/logic-inconsistency-check', advisory: true, bugClass: 'state-mutation', severity: 'medium',
    assumption: 'a dry-run/preview path leaves state untouched',
    fn: require('../patterns/audit-patterns/logic-inconsistency-check').detectLogicInconsistency,
  },
];

/**
 * Run every pattern detector against the raw source and emit normalized
 * findings. `isEnabled(bugClass)` is the same filter auditCode applies
 * to its native checkers, so bugClasses options govern this pass too.
 */
function runPatternDetectors(source, emit, isEnabled, opts) {
  for (const d of DETECTORS) {
    // Advisory tier — every detector except shell-injection. Tiering is
    // MEASURED, not guessed: run at full volume across all of src, the
    // others' hits were uniformly false positives here (correct
    // least-squares/rotation math flagged as precedence bugs, Levenshtein
    // DP tables as off-by-one, owned-object timestamp updates as cache
    // mutation, the substrate's own regex analyzers as scan bypass,
    // in-memory getAll as N+1). shell-injection stays default-on: its one
    // full-volume run caught six real interpolated-shell sites, all fixed
    // the same day. Opt the rest in via options.advisoryPatterns.
    if (d.advisory && !(opts && opts.advisoryPatterns)) continue;
    if (isEnabled && !isEnabled(d.bugClass)) continue;
    let results;
    try { results = d.fn(source); }
    catch (_) { continue; }
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      emit({
        line: r.line || 0,
        bugClass: d.bugClass,
        ruleId: d.ruleId,
        severity: r.severity || d.severity,
        assumption: d.assumption,
        reality: r.warning || r.suggestion || 'pattern matched',
        suggestion: r.suggestion || r.warning || null,
        code: r.pattern || r.expression || null,
      });
    }
  }
}
runPatternDetectors.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 9, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

module.exports = { runPatternDetectors, DETECTORS };
