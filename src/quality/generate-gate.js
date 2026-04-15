'use strict';

/**
 * oracle generate <plan> — stage 2 of the anti-hallucination generation
 * pipeline. Takes a verified plan (from `oracle plan`) plus a draft
 * source file and rejects the draft if it calls any symbol that ISN'T
 * in the plan's verified-symbols list.
 *
 * This is the enforceable gate: you promised X, Y, Z in your plan;
 * you must use only X, Y, Z in your code. Anything else is a
 * fabrication or a mid-stream scope expansion that needs to go back
 * through planning first.
 *
 * Parses the draft via the existing audit tokenizer, extracts every
 * call-position identifier, subtracts the plan's verified-symbols
 * set AND the draft file's own locally-defined symbols AND the JS/Node
 * built-in allowlist. Anything remaining is a violation.
 *
 * Returns a structured result so callers (CLI, swarm orchestrator,
 * MCP tool, future generation-time wrapper) can decide what to do:
 *
 *   { ok, violations, summary, plan, draft }
 *
 * When `ok === false`, the caller should:
 *   1. Show the violations to the generator
 *   2. Ask for either (a) a revised plan that includes the new symbols,
 *      or (b) a revised draft that uses only plan symbols
 *   3. Re-run the gate
 *   4. Loop until ok OR iteration budget exhausted
 */

const fs = require('fs');
const {
  extractCalledIdentifiers,
  extractDefinedIdentifiers,
  BUILTINS,
} = require('./../audit/ground');
const { tokenize } = require('./../audit/parser');

/**
 * Check a draft source against a plan.
 *
 * @param {object} args
 *   - plan: verified plan from planFromIntent()
 *   - draftPath: optional file path (mutually exclusive with draftCode)
 *   - draftCode: optional inline source string
 *   - extraAllowlist: additional symbols to permit (e.g. locally-
 *                     declared helpers from the parent scope)
 *
 * @returns {{
 *   ok: boolean,
 *   violations: Array<{ name, line, column }>,
 *   grounded: Array<{ name, line, source }>,
 *   summary: { totalCalls, grounded, violations },
 *   plan: { intent, verifiedSymbols },
 *   draft: { path, bytes }
 * }}
 */
function checkAgainstPlan(args) {
  const plan = args.plan || {};
  const verifiedSymbols = new Set(
    Array.isArray(plan.verified)
      ? plan.verified.map(v => v.symbol)
      : (plan.verifiedSymbols || [])
  );
  if (verifiedSymbols.size === 0 && Array.isArray(plan.symbols)) {
    // Fallback: if the plan has bare symbol list but no verified
    // field, treat the bare list as the allowed set.
    for (const s of plan.symbols) verifiedSymbols.add(s);
  }

  let code;
  let draftPath = args.draftPath || null;
  if (args.draftCode != null) {
    code = String(args.draftCode);
  } else if (draftPath) {
    if (!fs.existsSync(draftPath)) {
      return emptyResult(plan, draftPath, 'draft file not found');
    }
    try { code = fs.readFileSync(draftPath, 'utf-8'); }
    catch (e) { return emptyResult(plan, draftPath, 'read failed: ' + e.message); }
  } else {
    return emptyResult(plan, null, 'no draftPath or draftCode provided');
  }

  let tokens;
  try { tokens = tokenize(code); }
  catch (e) { return emptyResult(plan, draftPath, 'parse failed: ' + e.message); }

  const locallyDefined = extractDefinedIdentifiers(tokens);
  const calls = extractCalledIdentifiers(tokens);

  const extraAllowlist = new Set(args.extraAllowlist || []);
  const grounded = [];
  const violations = [];

  for (const call of calls) {
    // Locally defined in the draft itself → always allowed
    if (locallyDefined.has(call.name)) {
      grounded.push({ ...call, source: 'local' });
      continue;
    }
    // JS/Node built-ins → always allowed
    if (BUILTINS.has(call.name)) {
      grounded.push({ ...call, source: 'builtin' });
      continue;
    }
    // Caller-provided extras (e.g. parent-scope imports the gate
    // cannot see) → allowed
    if (extraAllowlist.has(call.name)) {
      grounded.push({ ...call, source: 'allowlist' });
      continue;
    }
    // Plan's verified symbol list → allowed
    if (verifiedSymbols.has(call.name)) {
      grounded.push({ ...call, source: 'plan' });
      continue;
    }
    // Not in any allowed set → violation
    violations.push(call);
  }

  return {
    ok: violations.length === 0,
    violations,
    grounded,
    summary: {
      totalCalls: calls.length,
      grounded: grounded.length,
      violations: violations.length,
    },
    plan: {
      intent: plan.intent || null,
      verifiedSymbols: Array.from(verifiedSymbols),
    },
    draft: {
      path: draftPath,
      bytes: code.length,
    },
  };
}

function emptyResult(plan, draftPath, reason) {
  return {
    ok: false,
    violations: [],
    grounded: [],
    summary: { totalCalls: 0, grounded: 0, violations: 0 },
    plan: { intent: plan?.intent || null, verifiedSymbols: [] },
    draft: { path: draftPath, bytes: 0 },
    error: reason,
  };
}

module.exports = {
  checkAgainstPlan,
};
