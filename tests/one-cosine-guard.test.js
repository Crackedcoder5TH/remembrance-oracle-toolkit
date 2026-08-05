'use strict';

/**
 * one-cosine-guard.test.js — nothing outside decoder-stack.js may carry
 * its own depth-flow.
 *
 * ECOSYSTEM §7 says one decoder, one cosine. That was a rule with no
 * enforcement, and the same defect landed three separate times:
 *
 *   1. decoder-stack.flowCosines itself had CHECK = [29,58,87,116] with
 *      Math.min(116, …) baked in, written when four layers existed and
 *      never lifted when four more activated. Fixed by deriving the
 *      checkpoints from the active layers.
 *   2. coherency-mapper.js kept destructuring that call to [d1,d2,d3,d4]
 *      and hardcoding Math.min(116, …) in coherencyFlow, so every macro
 *      map decided duplicates, orphans and bridges on 116 of 232 dims.
 *   3. defect-resonance.js carried a PRIVATE _flow with
 *      CHECK = [29,58,87,116,145], so the self-teaching channel signed
 *      and matched at 145-D while canonical was 232-D.
 *
 * Each was found by reading, months apart. A copy cannot follow the
 * stack when a layer activates — that is the whole failure mode — so the
 * rule has to be mechanical.
 *
 * The check is deliberately narrow: hardcoded checkpoint ladders, width
 * caps at a known composed boundary, and fixed-arity destructuring of a
 * flow. Comments are stripped first, because the modules above now
 * DESCRIBE these mistakes in prose and describing one is not committing
 * one.
 *
 * fractal-index.js is exempt by design, not by convenience: its
 * searchFlow deliberately reads each pattern at its OWN real depth to
 * remove mixed-depth bias, computing boundaries from LAYER_DIM and
 * MAX_DEPTH rather than a written-down ladder. It follows the stack.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CANONICAL = path.join('src', 'core', 'decoder-stack.js');

// Composed-layer boundaries. A literal cap at one of these is a width
// written down instead of asked for.
const BOUNDARIES = [58, 87, 116, 145, 174, 203, 232];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.git') walk(p, out);
    } else if (/\.(js|cjs|mjs)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function offenders() {
  const files = walk(path.join(ROOT, 'src'));
  const hits = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    if (rel === CANONICAL) continue;
    if (rel === path.join('src', 'core', 'fractal-index.js')) continue; // real-depth contract, see header
    let src;
    try { src = stripComments(fs.readFileSync(abs, 'utf8')); } catch { continue; }

    // A written-down checkpoint ladder.
    if (/\[\s*29\s*,\s*58\s*,\s*87\b/.test(src)) {
      hits.push(`${rel}: hardcoded checkpoint ladder starting [29, 58, 87 …]`);
    }
    // A width cap at a composed boundary.
    for (const b of BOUNDARIES) {
      const re = new RegExp(`Math\\.min\\(\\s*${b}\\s*,`);
      if (re.test(src)) hits.push(`${rel}: width capped at ${b} — ask the stack, do not write the number`);
    }
    // Fixed-arity destructuring of a flow.
    if (/const\s*\[\s*d1\s*,\s*d2\s*,\s*d3\s*,\s*d4\s*\]/.test(src)) {
      hits.push(`${rel}: destructures a flow to d1..d4 — the array is one reading per ACTIVE layer`);
    }
    // classifyFlow given a fixed-arity object literal.
    if (/classifyFlow\(\s*\{\s*d1\s*,\s*d2\s*,\s*d3\s*,\s*d4\s*\}/.test(src)) {
      hits.push(`${rel}: classifies on a fixed d1..d4 object — pass the flow array`);
    }
  }
  return hits;
}

test('one decoder, one cosine — no module carries its own depth-flow', () => {
  const hits = offenders();
  assert.deepStrictEqual(
    hits, [],
    'ECOSYSTEM §7 violation — these compute or truncate a depth-flow locally '
    + 'instead of routing to decoder-stack:\n  ' + hits.join('\n  ')
    + '\n\nUse flowCosines(a, b) and keep the array. deepestFlow(flow) for the '
    + 'deepest reading, Math.min(...flow) for the floor, classifyFlow(flow) for '
    + 'the shape — all follow the stack when a layer activates.',
  );
});

test('the guard actually detects the defect it was written for', () => {
  // A guard that cannot fail is not a guard. This is the exact body
  // coherency-mapper.js carried, run through the same matchers.
  const regression = `
    const flow = _flowCosines(a, b);
    const [d1, d2, d3, d4] = _flowCosines(a, b);
    const shape = classifyFlow({ d1, d2, d3, d4 });
    const d = _cosineLen(x, y, Math.min(116, x.length));
    const CHECK = [29, 58, 87, 116, 145];
  `;
  const src = stripComments(regression);
  assert.ok(/const\s*\[\s*d1\s*,\s*d2\s*,\s*d3\s*,\s*d4\s*\]/.test(src), 'destructure matcher is live');
  assert.ok(/classifyFlow\(\s*\{\s*d1\s*,\s*d2\s*,\s*d3\s*,\s*d4\s*\}/.test(src), 'classifyFlow matcher is live');
  assert.ok(/Math\.min\(\s*116\s*,/.test(src), 'width-cap matcher is live');
  assert.ok(/\[\s*29\s*,\s*58\s*,\s*87\b/.test(src), 'ladder matcher is live');
});

test('comments describing the mistake do not trip the guard', () => {
  const prose = `
    /* It used to be CHECK = [29, 58, 87, 116] with Math.min(116, n). */
    // and callers wrote const [d1, d2, d3, d4] = flowCosines(a, b)
    const flow = flowCosines(a, b);
  `;
  const src = stripComments(prose);
  assert.ok(!/\[\s*29\s*,\s*58\s*,\s*87\b/.test(src));
  assert.ok(!/Math\.min\(\s*116\s*,/.test(src));
  assert.ok(!/const\s*\[\s*d1\s*,\s*d2\s*,\s*d3\s*,\s*d4\s*\]/.test(src));
});
