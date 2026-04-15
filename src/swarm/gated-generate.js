'use strict';

/**
 * Gated swarm code generation.
 *
 * Wraps swarmCode / swarmHeal with the anti-hallucination pipeline:
 *
 *   1. swarmCode(description)        → raw draft from the swarm
 *   2. extract proposed symbols      → derive the plan from the draft
 *   3. planFromIntent(symbols)       → verify each symbol against
 *                                      built-ins / session / oracle / repo
 *   4. checkAgainstPlan(plan, draft) → reject drafts that call anything
 *                                      not in the verified set
 *   5. if rejected, optionally re-prompt the swarm with the violations
 *      and iterate up to N times
 *
 * Returns a SwarmResult shape with an extra `gate` field describing
 * the final verification outcome. Callers can choose to treat
 * rejected results as errors or surface them as partial credit.
 *
 * This is intentionally a post-processing wrapper rather than a
 * swarm-internal modification — it keeps the swarm's existing
 * consensus / cross-scoring / escalation loops unchanged and adds
 * grounding as an outer verification layer. If the swarm already
 * produces verified-against-plan code, the gate is a no-op; if it
 * fabricates, the gate catches the fabrication before the output
 * is delivered.
 */

const {
  extractCalledIdentifiers,
  extractDefinedIdentifiers,
  BUILTINS,
} = require('../audit/ground');
const { tokenize } = require('../audit/parser');
const { planFromIntent } = require('../quality/planner');
const { checkAgainstPlan } = require('../quality/generate-gate');

/**
 * Run the anti-hallucination gate against a draft produced by the
 * swarm (or any code generator). Pure function over `code` — does
 * not call the swarm or the network.
 *
 * @param {object} args
 *   - code: string (the draft source)
 *   - intent: string (high-level description of what the code does)
 *   - oracle: RemembranceOracle instance (for pattern lookups)
 *   - repoRoot: filesystem root for symbol scans
 *   - knownIdentifiers: Set<string> from session ledger
 *   - extraAllowlist: additional symbols to permit
 *
 * @returns {{
 *   ok: boolean,
 *   plan: <plan result>,
 *   gate: <gate result>,
 *   fabrications: string[],   // symbols that failed both plan + gate
 *   suggestions: string[]     // per-violation guidance for re-prompting
 * }}
 */
function verifyDraft(args) {
  const code = String(args.code || '');
  if (code.length === 0) {
    return {
      ok: false,
      plan: null,
      gate: null,
      fabrications: [],
      suggestions: ['Draft is empty — cannot verify.'],
    };
  }

  // Extract the symbols the draft actually calls — these are what
  // the plan needs to verify. Skip locally-defined calls because
  // they ground against the draft itself.
  let tokens;
  try { tokens = tokenize(code); }
  catch (e) {
    return {
      ok: false,
      plan: null,
      gate: null,
      fabrications: [],
      suggestions: ['Draft failed to parse: ' + e.message],
    };
  }

  const calls = extractCalledIdentifiers(tokens);
  const defined = extractDefinedIdentifiers(tokens);

  // Only symbols that are NOT defined locally AND NOT built-in need
  // external verification — those are the calls that could be
  // hallucinations. Locally-defined helpers ground against the draft
  // itself; built-ins ground against the JS/Node allowlist; the
  // plan only verifies the remainder.
  const external = [...new Set(calls.map(c => c.name))].filter(
    name => !defined.has(name) && !BUILTINS.has(name),
  );

  const plan = planFromIntent({
    intent: args.intent || '(swarm draft)',
    symbols: external,
    oracle: args.oracle,
    repoRoot: args.repoRoot,
    knownIdentifiers: args.knownIdentifiers,
  });
  // A plan with zero external symbols is trivially ok — the draft
  // uses only locals + built-ins, which can't hallucinate. Override
  // the planner's "empty list is not ok" rule for this case.
  if (external.length === 0) plan.ok = true;

  // Run the gate against the draft using ONLY the plan's verified
  // set (not plan.symbols, which may contain unverified entries from
  // a partial plan). checkAgainstPlan's internal fallback to
  // plan.symbols would otherwise let missing symbols through as
  // "part of the plan" when the plan is actually rejecting them.
  const gatePlan = {
    intent: plan.intent,
    verified: plan.verified || [],
  };
  const gate = checkAgainstPlan({
    plan: gatePlan,
    draftCode: code,
    extraAllowlist: args.extraAllowlist || [],
  });

  const fabrications = gate.violations.map(v => v.name);

  // Build actionable suggestions for the swarm to re-prompt with.
  const suggestions = [];
  if (plan.missing.length > 0) {
    suggestions.push(
      'The following symbols do not exist in the oracle library or the repo. ' +
      'Replace them with real symbols, or search/read the file that defines them first: ' +
      plan.missing.map(m => m.symbol).join(', ')
    );
  }
  if (gate.violations.length > 0 && gate.violations.length !== plan.missing.length) {
    suggestions.push(
      'The draft uses symbols that are not in the verified plan: ' +
      gate.violations.map(v => v.name).join(', ') +
      '. Either add them to the plan (after verifying they are real) or remove the call sites.'
    );
  }

  return {
    ok: plan.ok && gate.ok,
    plan,
    gate,
    fabrications,
    suggestions,
  };
}

/**
 * Gated wrapper around a code-generating function. Runs the
 * generator, verifies the draft, and re-prompts with feedback up to
 * `maxIterations` times if the gate rejects.
 *
 * @param {Function} generatorFn - async (description, options) → { code }
 * @param {string} description - high-level intent to pass to the generator
 * @param {object} options
 *   - oracle, repoRoot, knownIdentifiers, extraAllowlist: passed to verifyDraft
 *   - maxIterations: default 3
 *   - onIteration: optional callback (iteration, result) for logging
 *
 * @returns {{
 *   ok, draft, iterations, result, fabrications, suggestions
 * }}
 */
async function generateWithGate(generatorFn, description, options = {}) {
  const maxIterations = options.maxIterations || 3;
  const history = [];
  let lastResult = null;
  let feedback = '';

  for (let i = 0; i < maxIterations; i++) {
    const prompt = feedback
      ? `${description}\n\nPrevious attempt failed verification:\n${feedback}\n\nRevise the code to only use real, verified symbols.`
      : description;

    let genResult;
    try { genResult = await generatorFn(prompt, options); }
    catch (e) {
      return {
        ok: false,
        draft: null,
        iterations: i + 1,
        result: null,
        fabrications: [],
        suggestions: ['Generator threw: ' + (e.message || String(e))],
      };
    }

    const draft = genResult?.code || genResult?.text || '';
    const verification = verifyDraft({
      code: draft,
      intent: description,
      oracle: options.oracle,
      repoRoot: options.repoRoot,
      knownIdentifiers: options.knownIdentifiers,
      extraAllowlist: options.extraAllowlist,
    });

    history.push({ iteration: i + 1, draft, verification });
    if (typeof options.onIteration === 'function') {
      try { options.onIteration(i + 1, verification); } catch { /* advisory */ }
    }

    if (verification.ok) {
      return {
        ok: true,
        draft,
        iterations: i + 1,
        result: genResult,
        fabrications: [],
        suggestions: [],
        history,
      };
    }

    lastResult = { genResult, verification };
    feedback = verification.suggestions.join('\n');
  }

  // Exhausted the iteration budget — return the last attempt with
  // its failure state so the caller can decide what to do.
  return {
    ok: false,
    draft: lastResult?.genResult?.code || null,
    iterations: maxIterations,
    result: lastResult?.genResult || null,
    fabrications: lastResult?.verification?.fabrications || [],
    suggestions: lastResult?.verification?.suggestions || [],
    history,
  };
}

module.exports = {
  verifyDraft,
  generateWithGate,
};
