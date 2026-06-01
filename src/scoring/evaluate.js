'use strict';

/**
 * evaluate.js — observation-driven tool dispatcher.
 *
 * The field tool has every signal (fractal coherency, pattern resonance,
 * safety, exec_verify) in its information field, but blindly running all
 * of them on every input is wrong:
 *   - Running pattern_resonance on prose is meaningless (no library to
 *     resonate against in that vocabulary).
 *   - Running exec_verify on input that isn't supported code wastes a
 *     sandbox.
 *   - Running ANYTHING expensive on input that already trips safety is
 *     wasted work — refuse early and explain.
 *
 * This module looks at the input first (the "observation"), looks at the
 * field's current state, then decides which tools to call. The verdict
 * comes from composing whichever signals fired, and the verdict itself
 * is contributed back to the field — the "vice versa" loop where what is
 * observed by the field shapes the field.
 *
 * No tool is mandatory; abstaining is a valid result. A low-confidence
 * verdict with a small set of signals is more honest than a fake
 * high-confidence verdict from running tools whose readings would be
 * meaningless.
 */

const { inspectFractalWaveform, fractalCoherency, toFractalWaveform } =
  require('../core/fractal-waveform');
const { contribute, peekField } = require('../core/field-coupling');
const { scoreResonance, libraryStatus } = require('./pattern-resonance');
const { verifyExecution } = require('./exec-verify');
const { covenantCheck } = require('../core/covenant');
const { securityScan } = require('../reflector/scoring-analysis-security');

// ── Observation ──────────────────────────────────────────────────────────

/** Look at the input and report what kind of thing it is. The decision
 * about which tools to run comes from these properties — not from a fixed
 * pipeline. */
function observe(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return {
      empty: true, length: 0, structurality: 0,
      looksLikeCode: false, looksLikeProse: true, looksLikeMixed: false,
      hasDangerSignature: false,
    };
  }
  const ins = inspectFractalWaveform(input);
  const struc = ins.structurality;
  return {
    empty: false,
    length: input.length,
    structurality: struc,
    atomic: ins.atomic,
    structural: ins.structural,
    // Coarse classification used for routing.
    looksLikeCode: struc > 0.6,
    looksLikeProse: struc < 0.3,
    looksLikeMixed: struc >= 0.3 && struc <= 0.6,
    // Atomic signature can flag intent before any pattern scan.
    hasDangerSignature: (ins.atomic.safety < 0.5) || (ins.atomic.alignment < 0.3),
    // The field-tool's own readings of "what language is this code-like input"
    // are atomic-property based; explicit `opts.language` overrides this.
  };
}

/** Look at the field's current state. A "hot" field (high entropy or
 * pinned cascade) is the field's own signal that things are noisy right
 * now — bias toward conservative tool choice. */
function fieldContext() {
  try {
    const s = peekField();
    if (!s) return { available: false };
    return {
      available: true,
      coherence: s.coherence,
      globalEntropy: s.globalEntropy,
      cascadeFactor: s.cascadeFactor,
      hot: (s.globalEntropy || 0) > 10 || (s.cascadeFactor || 1) >= 4,
    };
  } catch { return { available: false }; }
}

// ── Routing ──────────────────────────────────────────────────────────────

/** Decide which tools to call given the observation and the request.
 * Returns the chosen tool names AND the reason for each choice so the
 * caller can see WHY a tool ran (or didn't). */
function chooseTools(observation, opts = {}) {
  const chosen = [];
  const reasons = {};

  if (observation.empty) {
    return { chosen, reasons: { _all: 'empty input — abstain' } };
  }

  // safety_check: cheap, language-agnostic, useful on any non-trivial
  // input. Skip only if input is truly tiny.
  if (observation.length >= 16) {
    chosen.push('safety_check');
    reasons.safety_check = 'always run on non-trivial input — cheap, catches the obvious';
  }

  // pattern_resonance: only meaningful for code-shaped input. Prose
  // tokenizes to natural-language words that won't resonate with a code
  // library no matter what. Mixed inputs get it too because they MAY
  // contain code fragments worth scoring.
  if (observation.looksLikeCode || observation.looksLikeMixed) {
    chosen.push('pattern_resonance');
    reasons.pattern_resonance = observation.looksLikeCode
      ? 'input is structured code — resonance against proven library is informative'
      : 'mixed input — may contain code fragments worth scoring';
  } else {
    reasons.pattern_resonance = 'input is prose-shaped — no code library to resonate against';
  }

  // exec_verify: only on explicit request, with a supported language,
  // for code-shaped input, AND only after safety has sealed.
  // The decision to run is finalized DURING dispatch after safety result.
  const lang = (opts.language || '').toLowerCase();
  const execLang = ['javascript', 'js', 'python', 'py'].includes(lang);
  if (opts.execute === true && observation.looksLikeCode && execLang) {
    chosen.push('exec_verify');
    reasons.exec_verify = 'execute requested AND code-shaped AND supported language — will run only if safety seals';
  } else if (opts.execute === true) {
    reasons.exec_verify = !execLang
      ? `execute requested but language ${lang || '(unset)'} is unsupported (need js or python)`
      : !observation.looksLikeCode
        ? 'execute requested but input is not code-shaped'
        : 'execute conditions not met';
  }

  return { chosen, reasons };
}

// ── Dispatch ─────────────────────────────────────────────────────────────

function _safetyCombined(code, language, description, tags) {
  const cov = covenantCheck(code, { language, description, tags });
  const sec = securityScan(code, language);
  const securityHasHighOrCrit = (sec.findings || []).some(
    (f) => f.severity === 'high' || f.severity === 'critical');
  return {
    sealed: cov.sealed && !securityHasHighOrCrit,
    covenant: {
      sealed: cov.sealed, violations: cov.violations,
      principlesPassed: cov.principlesPassed, totalPrinciples: cov.totalPrinciples,
    },
    security: {
      score: sec.score, riskLevel: sec.riskLevel,
      findings: sec.findings, totalFindings: sec.totalFindings,
    },
  };
}

/** Run the chosen tools in the right order (safety first, exec_verify last
 * and only if sealed), aggregate results, compute a verdict, contribute
 * the verdict to the field, return everything. */
async function evaluate(input, opts = {}) {
  const observation = observe(input);
  const field = fieldContext();
  const { chosen, reasons } = chooseTools(observation, opts);

  const results = {};

  // 1) Safety first — it gates exec_verify.
  if (chosen.includes('safety_check')) {
    results.safety = _safetyCombined(input, opts.language, opts.description, opts.tags);
  }

  // 2) Resonance — independent of safety.
  if (chosen.includes('pattern_resonance')) {
    const r = scoreResonance(input, { language: opts.language });
    results.resonance = r ? { ...r, library: libraryStatus() } : { score: null, library: libraryStatus() };
  }

  // 3) exec_verify only if it was chosen AND safety sealed.
  if (chosen.includes('exec_verify')) {
    if (results.safety && !results.safety.sealed) {
      results.execution = {
        status: 'skipped', signal: null,
        detail: 'safety not sealed — refusing to execute',
      };
    } else {
      results.execution = await verifyExecution(input, {
        language: opts.language,
        testCode: opts.testCode,
        timeoutMs: opts.timeoutMs,
      });
    }
  }

  const verdict = _verdict(observation, results, field);

  // 4) Vice versa — contribute the verdict back to the field. The source
  // names where the observation came from (so the field's per-source
  // histogram tells you what the evaluator has been looking at).
  try {
    contribute({
      cost: 1,
      coherence: Math.max(0, Math.min(1, verdict.score)),
      source: 'evaluate:' + (opts.language || (observation.looksLikeCode ? 'code' : 'text')),
    });
  } catch (_e) { /* best-effort */ }

  return {
    observation: {
      structurality: observation.structurality,
      looksLikeCode: observation.looksLikeCode,
      looksLikeProse: observation.looksLikeProse,
      looksLikeMixed: observation.looksLikeMixed,
      length: observation.length,
      atomic: observation.atomic,
      hasDangerSignature: observation.hasDangerSignature,
    },
    field,
    toolsRun: chosen,
    reasons,
    results,
    verdict,
  };
}

// ── Verdict ──────────────────────────────────────────────────────────────

function _verdict(observation, results, _field) {
  // Hard-fail conditions first. These short-circuit because no aggregate
  // score makes sense if a fundamental check failed.
  if (results.safety && !results.safety.sealed) {
    const findings = (results.safety.security.findings || []).slice(0, 3);
    return {
      trust: 'low', score: 0,
      reason: 'safety unsealed: ' + findings.map(f => f.message).join('; '),
      sealed: false,
    };
  }
  if (results.execution && results.execution.status === 'fail') {
    return {
      trust: 'low', score: 0,
      reason: 'execution failed: ' + results.execution.detail,
      sealed: results.safety ? results.safety.sealed : null,
    };
  }
  if (results.execution && results.execution.status === 'blocked') {
    return {
      trust: 'low', score: 0,
      reason: 'execution blocked: ' + results.execution.detail,
      sealed: results.safety ? results.safety.sealed : null,
    };
  }

  // Soft signals: average whatever fired.
  const signals = [];
  const breakdown = {};
  if (results.safety && results.safety.sealed) {
    signals.push(1); breakdown.safety = 1;
  }
  if (results.resonance && typeof results.resonance.score === 'number') {
    signals.push(results.resonance.score); breakdown.resonance = results.resonance.score;
  }
  if (results.execution && typeof results.execution.signal === 'number') {
    signals.push(results.execution.signal); breakdown.execution = results.execution.signal;
  }
  // Structurality is itself a confidence signal: a high-structurality input
  // means we're actually looking at code (not prose accidentally tokenizing
  // to library words). Folded in at half weight to avoid dominating.
  if (observation.looksLikeCode) {
    signals.push(observation.structurality); breakdown.structurality = observation.structurality;
  }

  if (signals.length === 0) {
    return {
      trust: 'unknown', score: null,
      reason: 'no signals fired (input was empty or all tools abstained)',
      sealed: results.safety ? results.safety.sealed : null,
      breakdown,
    };
  }

  const mean = signals.reduce((a, b) => a + b, 0) / signals.length;
  const trust = mean >= 0.7 ? 'high' : mean >= 0.4 ? 'medium' : 'low';

  return {
    trust,
    score: Math.round(mean * 10000) / 10000,
    reason: signals.length === 1
      ? 'single signal — limited evidence'
      : `${signals.length} independent signals composed`,
    sealed: results.safety ? results.safety.sealed : null,
    breakdown,
  };
}

module.exports = { observe, chooseTools, evaluate, fieldContext };
