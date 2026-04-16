'use strict';

/**
 * oracle plan <intent> — verified symbol plan before code generation.
 *
 * The anti-hallucination argument: hallucination happens at the
 * generation step when a model emits a token that doesn't correspond
 * to a real symbol. The cheapest way to catch this is to FORCE the
 * model to commit to a symbol list BEFORE it writes any code, then
 * verify every symbol in the list against ground truth. Anything
 * that doesn't verify is a planning-stage hallucination. Re-prompt
 * with the verifier's feedback and try again. When the plan is
 * clean, generation is constrained to use only the verified symbols.
 *
 * This module implements the planning stage:
 *
 *   1. Caller provides an `intent` (string description) and a
 *      list of `symbols` (strings the caller thinks it will call).
 *   2. For each symbol, we check it in this order:
 *        a. JS/Node built-in allowlist (from ground.js)
 *        b. Session ledger's touchedIdentifiers set (things the
 *           agent has already read in this session)
 *        c. Oracle pattern library via `oracle.search(symbol)` with
 *           a minimum coherency threshold
 *        d. Filesystem scan: grep for `function SYMBOL` / `const
 *           SYMBOL` / `class SYMBOL` across the repo's src tree
 *   3. For each symbol, return the verification result: `{ symbol,
 *      status: 'builtin|seen|pattern|found|missing', source, evidence }`.
 *   4. The plan is "verified" only if every symbol has a non-missing
 *      status. Otherwise it's a draft plan that needs revision.
 *
 * The caller (an agent, a swarm orchestrator, or the
 * `oracle generate` gate) decides what to do with the missing
 * symbols. The options:
 *   - Ask the agent to search for the symbol and add a read event
 *   - Fall back to a different symbol that DID verify
 *   - Declare the symbol as to-be-created-in-this-file (grounded
 *     locally via definition, not externally)
 *
 * Pure function. No side effects. Safe to call from anywhere.
 */

const fs = require('fs');
const path = require('path');
const { BUILTINS } = require('./../audit/ground');

/**
 * Verify a single symbol against the four-tier ground-truth chain.
 *
 * @param {string} symbol - bare identifier to verify
 * @param {object} context - { knownIdentifiers, oracle, repoRoot, srcDirs }
 * @returns {{ symbol, status, source, evidence }}
 */
function verifySymbol(symbol, context) {
  if (!symbol || typeof symbol !== 'string') {
    return { symbol: String(symbol), status: 'missing', source: null, evidence: 'invalid input' };
  }

  // Tier 1: built-in allowlist
  if (BUILTINS.has(symbol)) {
    return { symbol, status: 'builtin', source: 'js/node allowlist', evidence: null };
  }

  // Tier 2: session-touched identifiers
  if (context.knownIdentifiers && context.knownIdentifiers.has(symbol)) {
    return { symbol, status: 'seen', source: 'session ledger', evidence: 'previously read this session' };
  }

  // Tier 3: oracle pattern library
  if (context.oracle && typeof context.oracle.search === 'function') {
    try {
      const hits = context.oracle.search(symbol, { limit: 3 });
      if (Array.isArray(hits) && hits.length > 0) {
        // Require a strong match — the top hit's name must equal the
        // symbol (case-sensitive) OR contain it as a prefix. Weaker
        // text-similarity matches would let fabrications slip through.
        const top = hits[0];
        const name = top.name || top.description || '';
        if (name === symbol || name.startsWith(symbol) || (top.tags || []).includes(symbol)) {
          return {
            symbol,
            status: 'pattern',
            source: 'oracle pattern library',
            evidence: { patternName: name, coherency: top.coherency, id: top.id },
          };
        }
      }
    } catch { /* degrade gracefully */ }
  }

  // Tier 4: filesystem scan — look for a definition in the repo's src tree
  if (context.repoRoot) {
    const dirs = context.srcDirs || ['src'];
    for (const dir of dirs) {
      const abs = path.join(context.repoRoot, dir);
      if (!fs.existsSync(abs)) continue;
      const hit = scanForDefinition(abs, symbol, 200);
      if (hit) {
        return {
          symbol,
          status: 'found',
          source: 'repo scan',
          evidence: { file: path.relative(context.repoRoot, hit.file), line: hit.line },
        };
      }
    }
  }

  return { symbol, status: 'missing', source: null, evidence: 'no ground truth found' };
}

/**
 * Recursively grep-style scan a directory for a symbol definition.
 * Matches: `function NAME(`, `const NAME =`, `let NAME =`, `var NAME =`,
 * `class NAME`, `NAME:` in an export-object position, and the
 * destructuring patterns `{ NAME }` in a module.exports position.
 *
 * Returns the first hit as { file, line } or null.
 */
function scanForDefinition(rootDir, symbol, maxFiles) {
  const stack = [rootDir];
  let filesScanned = 0;
  // Build a regex that catches common definition shapes for this symbol.
  // Escaping: the symbol is a bare identifier, so no regex metachars.
  const patterns = [
    new RegExp('\\bfunction\\s+' + symbol + '\\b'),
    new RegExp('\\bconst\\s+' + symbol + '\\b'),
    new RegExp('\\blet\\s+' + symbol + '\\b'),
    new RegExp('\\bvar\\s+' + symbol + '\\b'),
    new RegExp('\\bclass\\s+' + symbol + '\\b'),
    new RegExp('\\b' + symbol + '\\s*:\\s*function\\b'),
    new RegExp('\\b' + symbol + '\\s*=\\s*function\\b'),
    new RegExp('exports\\.' + symbol + '\\s*='),
  ];
  while (stack.length > 0 && filesScanned < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(p); continue; }
      if (!entry.isFile()) continue;
      if (!/\.(js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name)) continue;
      filesScanned++;
      let content;
      try { content = fs.readFileSync(p, 'utf-8'); }
      catch { continue; }
      for (const pat of patterns) {
        const m = content.match(pat);
        if (m) {
          const idx = content.indexOf(m[0]);
          const line = content.slice(0, idx).split('\n').length;
          return { file: p, line };
        }
      }
    }
  }
  return null;
}

/**
 * Build a verified plan for an intent + proposed symbol list.
 *
 * @param {object} args
 *   - intent: string description of what the caller wants to do
 *   - symbols: string[] — the symbols the caller plans to call
 *   - oracle: optional RemembranceOracle instance for pattern lookups
 *   - repoRoot: root dir for filesystem fallback scans
 *   - knownIdentifiers: Set<string> from the session ledger
 *   - srcDirs: string[] of src subdirectories to scan (default ['src'])
 *
 * @returns {{
 *   intent, symbols, verified, missing, summary, ok, ts
 * }}
 *
 * The caller should treat `ok === false` as "re-prompt for a better
 * plan" and use `missing` as the list of symbols that need revision.
 */
function planFromIntent(args) {
  const intent = String(args.intent || '').trim();
  const symbols = Array.isArray(args.symbols) ? args.symbols.map(String) : [];
  const context = {
    knownIdentifiers: args.knownIdentifiers instanceof Set ? args.knownIdentifiers : new Set(args.knownIdentifiers || []),
    oracle: args.oracle || null,
    repoRoot: args.repoRoot || process.cwd(),
    srcDirs: args.srcDirs || ['src'],
  };

  const verified = [];
  const missing = [];
  for (const symbol of symbols) {
    const r = verifySymbol(symbol, context);
    if (r.status === 'missing') missing.push(r);
    else verified.push(r);
  }

  const summary = {
    total: symbols.length,
    verified: verified.length,
    missing: missing.length,
    byStatus: verified.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {}),
  };

  // ─── Emergent SERF: register plan-verification signal ───────────
  try {
    const { registerPlanSignal } = require('../unified/emergent-coherency');
    registerPlanSignal(missing.length, symbols.length);
  } catch { /* emergent module not available */ }

  return {
    intent,
    symbols,
    verified,
    missing,
    summary,
    ok: missing.length === 0 && symbols.length > 0,
    ts: new Date().toISOString(),
  };
}

module.exports = {
  planFromIntent,
  verifySymbol,
  scanForDefinition,
};
