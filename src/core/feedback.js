/**
 * Actionable Rejection Feedback — barrel re-export.
 *
 * Split into focused sub-modules:
 *   feedback-covenant.js  — Covenant fix suggestions (dynamic keyword construction)
 *   feedback-coherency.js — Dimension-specific coherency advice
 */

const { findPatternLocation, FIX_SUGGESTIONS, covenantFeedback } = require('./feedback-covenant');
const { COHERENCY_ADVICE, coherencyFeedback } = require('./feedback-coherency');

// FIELD: every validation is a reading. A pass contributes 1.0; a rejection
// contributes the FRACTION of gates that still held, so the field records
// how close the code came rather than a flat failure. Best-effort.
function _contributeValidation(validationResult, passed) {
  try {
    let coherence = 1.0;
    if (!passed) {
      const gates = [
        !(validationResult.covenantResult && !validationResult.covenantResult.sealed),
        !(validationResult.coherencyScore && validationResult.coherencyScore.total < 0.6),
        validationResult.testPassed !== false,
      ];
      coherence = gates.filter(Boolean).length / gates.length;
    }
    require('./field-coupling').contribute({
      cost: 1.0, coherence, source: 'core:feedback:validation-gates',
    });
  } catch (_) { /* field optional */ }
}

function actionableFeedback(code, validationResult) {
  const result = { summary: '', covenantFeedback: [], coherencyFeedback: [], suggestions: [] };

  if (validationResult.valid) {
    _contributeValidation(validationResult, true);
    result.summary = 'Code passed all checks.';
    return result;
  }
  _contributeValidation(validationResult, false);

  const issues = [];

  if (validationResult.covenantResult && !validationResult.covenantResult.sealed) {
    result.covenantFeedback = covenantFeedback(code, validationResult.covenantResult);
    issues.push('covenant violation');
  }

  if (validationResult.coherencyScore && validationResult.coherencyScore.total < 0.6) {
    result.coherencyFeedback = coherencyFeedback(code, validationResult.coherencyScore);
    issues.push('low coherency');
  }

  if (validationResult.testPassed === false) {
    issues.push('test failure');
    result.suggestions.push(`Test failed: ${validationResult.testOutput || 'unknown error'}`);
    result.suggestions.push('Fix the failing assertions or update the test to match current behavior.');
  }

  result.summary = `Rejected: ${issues.join(', ')}. ${result.covenantFeedback.length + result.coherencyFeedback.length + result.suggestions.length} actionable item(s).`;
  return result;
}

function formatFeedback(feedbackResult) {
  const lines = [feedbackResult.summary];

  if (feedbackResult.covenantFeedback.length > 0) {
    lines.push('', 'Covenant Issues:');
    for (const fb of feedbackResult.covenantFeedback) lines.push(fb);
  }

  if (feedbackResult.coherencyFeedback.length > 0) {
    lines.push('', 'Coherency Issues:');
    for (const fb of feedbackResult.coherencyFeedback) lines.push(fb);
  }

  if (feedbackResult.suggestions.length > 0) {
    lines.push('', 'Suggestions:');
    for (const s of feedbackResult.suggestions) lines.push(`  - ${s}`);
  }

  return lines.join('\n');
}

module.exports = {
  covenantFeedback,
  coherencyFeedback,
  actionableFeedback,
  formatFeedback,
  findPatternLocation,
  FIX_SUGGESTIONS,
  COHERENCY_ADVICE,
};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
actionableFeedback.atomicProperties = { charge: 1, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 3, harmPotential: "minimal", alignment: "healing", intention: "neutral", domain: "utility" };
formatFeedback.atomicProperties = { charge: 1, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 3, harmPotential: "minimal", alignment: "healing", intention: "neutral", domain: "utility" };
