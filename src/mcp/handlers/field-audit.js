'use strict';

/**
 * mcp/handlers/field-audit.js — the field tool's 'audit' action: the
 * coherence-gated ecosystem audit whose work-cost is balanced back into
 * the entropy field. Extracted verbatim (dedented one case level) from
 * the field handler in src/mcp/handlers.js.
 */

const path = require('path');
const { _scanJsZones } = require('./helpers');

// ── coherence-gated ecosystem audit; cost balanced into the field ──
// The field's own coherence picks the audit depth: a low-coherence
// field (< 0.65) earns a full audit, a coherent one a fast scan. The
// audit's work-cost is then contributed back, so heavy audits raise
// globalEntropy and the field's backpressure throttles repeats.
function _fieldAudit(fc, args) {
  const COHERENCE_GATE = 0.65;
  const fs = require('fs');

  let source = null;
  let filePath = null;
  if (typeof args?.file === 'string' && args.file) {
    filePath = args.file;
    try {
      source = fs.readFileSync(args.file, 'utf-8');
    } catch (e) {
      return { error: `field action "audit": cannot read file "${args.file}" — ${e.message}` };
    }
  } else if (typeof args?.code === 'string' && args.code) {
    source = args.code;
  } else {
    throw new Error('field action "audit" requires "file" or "code"');
  }

  const before = fc.peekField();
  const fieldCoherence = before ? before.coherence : null;
  const mode = (fieldCoherence !== null && fieldCoherence < COHERENCE_GATE) ? 'full' : 'fast';

  const { analyze } = require('../../core/analyze');
  const env = analyze(source, filePath, { language: args?.language });

  // Fast scan touches only the cheap envelope getters; the full
  // audit computes every signal and runs a reflection heal pass.
  const verdict = { coherency: env.coherency, meta: env.meta };
  let workUnits = 1; // coherency
  if (mode === 'full') {
    verdict.audit       = env.audit;
    verdict.lint        = env.lint;
    verdict.smell       = env.smell;
    verdict.covenant    = { sealed: env.covenant.sealed, violations: env.covenant.violations || [] };
    verdict.allFindings = env.allFindings;
    workUnits += 4; // audit + lint + smell + covenant
    try {
      const { reflectionLoop } = require('../../core/reflection');
      const refl = reflectionLoop(source, { language: env.language });
      verdict.reflect = {
        loops: refl.loops,
        fullCoherency: refl.fullCoherency,
        healingPath: refl.healingPath,
        whisper: refl.whisper,
      };
      workUnits += refl.loops; // reflection loops are the heavy cost
    } catch (_) { /* reflection is best-effort */ }
  }

  try {
    const { computeBugProbability } = require('../../quality/risk-score');
    const risk = computeBugProbability(source, { filePath });
    verdict.risk = { probability: risk.probability, riskLevel: risk.riskLevel };
    workUnits += 1;
  } catch (_) { /* risk is best-effort */ }

  // The orchestrator has the final word on what to fix next —
  // every per-file audit ends with its ruling for the directory
  // tree the audited file lives in.
  if (filePath) {
    try {
      const { CoherencyDirector } = require('../../orchestrator/coherency-director');
      const zones = _scanJsZones(path.dirname(filePath));
      if (zones && zones.length) verdict.orchestrator = new CoherencyDirector().ruling(zones);
    } catch (_) { /* orchestrator deferral is best-effort */ }
  }

  // Balance the audit's cost into the entropy field. The env coherency
  // total is a heuristic aggregate with an invented ||0 fallback — not a
  // compressor reading — so it left the coherence channel (provenance
  // purge 2026-08-09). recordCost raises entropy by the audit's work
  // without claiming a coherency, which is exactly the backpressure this
  // contribution existed to produce.
  const contributed = fc.recordCost({
    units: workUnits,
    kind: 'audit',
    source: `ecosystem-audit:${mode}`,
  });
  const pressure = fc.fieldPressure();

  return {
    mode,
    gate: {
      fieldCoherence,
      threshold: COHERENCE_GATE,
      decision: mode === 'full'
        ? `field coherence ${fieldCoherence.toFixed(3)} < ${COHERENCE_GATE} → full audit`
        : `field coherence ${fieldCoherence === null ? 'unknown' : fieldCoherence.toFixed(3)} >= ${COHERENCE_GATE} → fast scan`,
    },
    target: filePath || '(inline code)',
    verdict,
    cost: {
      workUnits,
      balancedInto: 'entropy-field',
      source: `ecosystem-audit:${mode}`,
      globalEntropy: contributed ? contributed.globalEntropy : null,
      cascadeFactor: contributed ? contributed.cascadeFactor : null,
      backpressure: pressure.hot ? `hot — ${pressure.reason}` : 'nominal',
    },
  };
}
_fieldAudit.atomicProperties = { charge: 0, valence: 5, mass: "medium", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 1, group: 3, period: 4, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility", taint: "none" };

module.exports = { _fieldAudit };
