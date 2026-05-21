#!/usr/bin/env node
'use strict';

/**
 * check-field-couplings — canonical contract for auto-wired LRE
 * field-coupling blocks.
 *
 * Walks every `oracle:*` source declaration in src/ and validates the
 * four invariants the auto-wire pipeline has historically broken:
 *
 *   1. SOURCE LABEL MATCHES ENCLOSING FUNCTION
 *      source: 'oracle:<module>:<name>' must equal the function the
 *      contribute physically lives inside.
 *
 *   2. REQUIRE PATH RESOLVES TO src/core/field-coupling
 *      Both the literal-string require path and the path.join argument
 *      form must resolve to the canonical helper.
 *
 *   3. CONTRIBUTE IS REACHABLE FROM THE MAIN RETURN PATH
 *      The contribute block must NOT be nested inside an `if (!X) { ... return }`
 *      guard whose own return is the only way to exit the block. (Buried
 *      contributes only fire on the edge case.)
 *
 *   4. COHERENCE EXPRESSION YIELDS A FINITE NUMBER
 *      The value passed to contribute() must come from a numeric
 *      __retVal field. If the field is a string or undefined, the
 *      math reduces to NaN and the field-coupling helper drops the call.
 *
 * Exit codes:
 *   0 — all clean
 *   1 — one or more violations found (CI-blocker)
 *
 * Usage:
 *   node scripts/check-field-couplings.js          # human-readable
 *   node scripts/check-field-couplings.js --json   # machine-readable
 */

const fs = require('fs');
const path = require('path');

const HUB = path.resolve(__dirname, '..');
const SRC = path.join(HUB, 'src');
const CANONICAL_FIELD_COUPLING = path.join(SRC, 'core', 'field-coupling');

const KNOWN_NUMERIC_FIELDS = new Set([
  'score', 'coherency', 'coherence', 'confidence', 'reliability',
  'quality', 'composite', 'total', 'agreement', 'density', 'ratio',
  'similarity', 'unified', 'alignment_score', 'matchScore',
]);

const RESERVED = new Set([
  'for', 'while', 'if', 'switch', 'try', 'catch', 'do', 'return',
  'function', 'else', 'const', 'let', 'var', 'this', 'super', 'new',
  'await', 'throw',
]);

// ── Walk src/ ─────────────────────────────────────────────────────
function* walkJsFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJsFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

// ── Find enclosing function for a position ────────────────────────
function findEnclosingFunctionName(src, pos) {
  const before = src.slice(0, pos);
  const candidates = [];

  // Detect enclosing function. The auto-wire only instruments top-level
  // `function` declarations and class/object method shorthand — not inner
  // arrow helpers (those produced false positives in earlier audits).
  //
  // Pattern 1: function NAME(  /  async function NAME(
  for (const m of before.matchAll(/\n\s*(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) {
    if (!RESERVED.has(m[1])) candidates.push({ pos: m.index, name: m[1] });
  }
  // Pattern 2: method shorthand `\n  NAME(args) {` or async
  for (const m of before.matchAll(/\n\s+(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g)) {
    if (!RESERVED.has(m[1])) candidates.push({ pos: m.index, name: m[1] });
  }
  // Pattern 3: property: (args) => or property: function
  for (const m of before.matchAll(/\n\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?:async\s+)?(?:function\s*\(|\([^)]*\)\s*=>\s*\{)/g)) {
    if (!RESERVED.has(m[1])) candidates.push({ pos: m.index, name: m[1] });
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.pos > b.pos ? a : b)).name;
}

// ── Detect "buried in early-return guard" ─────────────────────────
// A contribute is buried if it lives inside an `if (!X) { ... return ...; }`
// block — those branches only fire on the edge case (empty/null input),
// so the producer never lands on normal use. Detection: find the
// enclosing `if (!X) {`, brace-walk forward to its matching `}`,
// check (a) the contribute is inside that range, (b) the block contains
// `return` (the giveaway of an early-return guard).
function isInsideEarlyReturnGuard(src, contributePos) {
  const lines = src.slice(0, contributePos).split('\n');
  const contribLineIdx = lines.length - 1;
  for (let j = contribLineIdx - 1; j >= Math.max(0, contribLineIdx - 25); j--) {
    if (!/^\s*if\s*\(\s*!\s*[\w.]+\s*\)\s*\{/.test(lines[j])) continue;

    // Find the absolute position of this `if (!X) {` line's opening brace.
    const beforeIfLine = lines.slice(0, j).join('\n');
    const ifLineStart = j === 0 ? 0 : beforeIfLine.length + 1;
    const ifOpenBrace = src.indexOf('{', ifLineStart);
    if (ifOpenBrace < 0) continue;

    // Brace-walk forward from the opening brace until we find its match.
    let depth = 0;
    let blockEnd = -1;
    for (let k = ifOpenBrace; k < src.length && k < ifOpenBrace + 8000; k++) {
      const ch = src[k];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { blockEnd = k; break; }
      }
    }
    if (blockEnd < 0) continue;

    // The contribute must be INSIDE this if-block.
    if (contributePos < ifOpenBrace || contributePos > blockEnd) continue;

    // Block must contain a `return` keyword (the guard giveaway).
    const blockText = src.slice(ifOpenBrace, blockEnd + 1);
    if (/\breturn\b/.test(blockText)) return true;
  }
  return false;
}

// ── Extract the __retVal field name used for coherence ─────────────
function extractCoherenceField(contribLine) {
  // Patterns we expect:
  //   coherence: Math.max(0, Math.min(1, __retVal.NAME || 0))
  //   coherence: Math.max(0, Math.min(1, (... __retVal.NAME ...)))
  const m = contribLine.match(/coherence:[^,]*?__retVal\.([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m ? m[1] : null;
}

// ── Verify the field name yields a number ──────────────────────────
function fieldIsLikelyNumeric(src, retValPos, fieldName) {
  // Look at the __retVal object literal preceding this contribute.
  // Match  const __retVal = { ... fieldName: <expr> ... };
  // We accept the field as numeric IF its expression doesn't look like a string literal.
  const before = src.slice(0, retValPos);
  // Find the nearest `__retVal = {`
  let idx = before.lastIndexOf('__retVal');
  if (idx < 0) return null;
  // Read forward from idx to find the value of fieldName
  const tail = src.slice(idx, retValPos);
  const fieldRe = new RegExp(`\\b${fieldName}\\s*:\\s*([^,\\n}]+?)(?:[,\\n}]|$)`);
  const m = tail.match(fieldRe);
  if (!m) return null;
  const expr = m[1].trim();
  // Heuristic flags for string-valued expressions
  if (/^['"`]/.test(expr)) return false;  // string literal
  if (/\?\s*['"][^'"]*['"]\s*:\s*['"][^'"]*['"]/.test(expr)) return false; // ternary of strings
  // Known string-returning helpers
  if (/^compute(?:Alignment|Intention|HarmPotential|Reactivity|Mass|Spin|Phase|Taint|Domain)\s*\(/.test(expr)) return false;
  return true;  // assume numeric
}

// ── Run the checks ─────────────────────────────────────────────────
function check() {
  const violations = [];

  for (const file of walkJsFiles(SRC)) {
    const src = fs.readFileSync(file, 'utf-8');
    if (!src.includes('LRE field-coupling')) continue;

    const rel = path.relative(HUB, file);

    // For each oracle:* contribute call:
    const re = /__contribute\(\s*\{[^}]*?source:\s*['"]oracle:([^:'"]+):([A-Za-z_$][A-Za-z0-9_$]*)['"]\s*\}\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const moduleLabel = m[1];
      const funcLabel = m[2];
      const contribPos = m.index;

      // (1) Source label matches enclosing function
      const enclosing = findEnclosingFunctionName(src, contribPos);
      if (enclosing && enclosing !== funcLabel) {
        violations.push({
          rule: 'C1-source-label-mismatch',
          file: rel,
          source: `oracle:${moduleLabel}:${funcLabel}`,
          detail: `actual enclosing function is "${enclosing}"`,
        });
      }
    }

    // (2) Require paths must resolve to canonical
    const reqRe = /(['"])((?:\.\.?\/)+core\/field-coupling)\1/g;
    while ((m = reqRe.exec(src)) !== null) {
      const fileDir = path.dirname(file);
      const resolved = path.resolve(fileDir, m[2]);
      if (resolved !== CANONICAL_FIELD_COUPLING) {
        violations.push({
          rule: 'C2-require-path-broken',
          file: rel,
          source: m[2],
          detail: `resolves to ${resolved} (expected ${CANONICAL_FIELD_COUPLING})`,
        });
      }
    }

    // (3) Contribute reachable from main return path
    const contribLineRe = /__contribute\(\s*\{[^}]*?source:\s*['"](oracle:[^'"]+)['"]/g;
    while ((m = contribLineRe.exec(src)) !== null) {
      if (isInsideEarlyReturnGuard(src, m.index)) {
        violations.push({
          rule: 'C3-contribute-buried-in-early-return',
          file: rel,
          source: m[1],
          detail: 'contribute is inside an `if (!X) { ... return }` guard — only fires on the edge case',
        });
      }
    }

    // (4) Coherence expression yields a number
    const lineRe = /__contribute\(\s*\{[^}]*?coherence:[^,]*?__retVal\.([A-Za-z_$][A-Za-z0-9_$]*)[^,]*?source:\s*['"](oracle:[^'"]+)['"][^}]*\}\s*\)/g;
    while ((m = lineRe.exec(src)) !== null) {
      const field = m[1];
      const source = m[2];
      const numeric = fieldIsLikelyNumeric(src, m.index, field);
      if (numeric === false) {
        violations.push({
          rule: 'C4-coherence-field-not-numeric',
          file: rel,
          source,
          detail: `__retVal.${field} appears to be string-valued; Math.max/min reduces to NaN and contribute is dropped`,
        });
      }
    }
  }

  return violations;
}

// ── Main ───────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');

  const violations = check();

  if (asJson) {
    process.stdout.write(JSON.stringify({ ok: violations.length === 0, violations }, null, 2) + '\n');
  } else {
    if (violations.length === 0) {
      console.log('✓ field-coupling contract: 0 violations');
    } else {
      console.log(`✗ field-coupling contract: ${violations.length} violation(s)\n`);
      const byRule = {};
      for (const v of violations) (byRule[v.rule] ||= []).push(v);
      for (const rule of Object.keys(byRule).sort()) {
        console.log(`  ${rule} (${byRule[rule].length}):`);
        for (const v of byRule[rule]) {
          console.log(`    ${v.file}`);
          console.log(`      source: ${v.source}`);
          console.log(`      detail: ${v.detail}`);
        }
        console.log('');
      }
    }
  }

  process.exit(violations.length === 0 ? 0 : 1);
}

module.exports = { check };
