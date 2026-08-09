#!/usr/bin/env node
'use strict';

/**
 * cycle-ratchet — require cycles can only untangle.
 *
 * Measured 2026-08-09: 4 strongly-connected components in the src/
 * require graph — one of 62 files (persistence, reflector, scoring,
 * compression, field organs, covenant and sqlite all in one loop), one
 * of 4 (audit), two of 2. Every decomposition this month hit the tangle
 * (validate↔verbs needed call-time lazy requires). Wanting fewer cycles
 * does not produce fewer cycles; a gate does.
 *
 * THE INVARIANT
 *   - no NEW cycle may appear
 *   - no baseline cycle may gain a member
 *   - two baseline cycles may not merge into one
 *   - when a cycle shrinks or dissolves, --save-baseline follows it
 *     down; a released member can only re-enter by blocking a commit
 *
 *   node scripts/cycle-ratchet.js                 check (exit 1 on growth)
 *   node scripts/cycle-ratchet.js --json          machine-readable verdict
 *   node scripts/cycle-ratchet.js --save-baseline accept current cycles
 *
 * Census only: a cycle count is a count, not a coherency. Nothing here
 * feeds the field.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.cycle-baseline.json');

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** Build the require graph over git-tracked src/*.js and return SCCs >1. */
function censusCycles() {
  const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));
  const tracked = new Set(files);
  const graph = new Map();
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const deps = [];
    for (const m of code.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      const t = path.join(path.dirname(f), m[1]);
      for (const cand of [t, t + '.js', path.join(t, 'index.js')]) {
        if (tracked.has(cand)) { deps.push(cand); break; }
      }
    }
    graph.set(f, deps);
  }
  // Tarjan SCC, iterative (the 62-node component recurses deeper than it looks)
  let idx = 0;
  const num = new Map(), low = new Map(), onStack = new Set(), stack = [];
  const sccs = [];
  for (const root of files) {
    if (num.has(root)) continue;
    const work = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, pi] = frame;
      if (pi === 0) {
        num.set(v, idx); low.set(v, idx); idx++;
        stack.push(v); onStack.add(v);
      }
      const deps = graph.get(v) || [];
      let advanced = false;
      for (let i = pi; i < deps.length; i++) {
        const w = deps[i];
        if (!num.has(w)) {
          frame[1] = i + 1;
          work.push([w, 0]);
          advanced = true;
          break;
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), num.get(w)));
        }
      }
      if (advanced) continue;
      if (low.get(v) === num.get(v)) {
        const comp = [];
        let w;
        do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
        if (comp.length > 1) sccs.push(comp.sort());
      }
      work.pop();
      if (work.length) {
        const [parent] = work[work.length - 1];
        low.set(parent, Math.min(low.get(parent), low.get(v)));
      }
    }
  }
  sccs.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  return sccs;
}
censusCycles.atomicProperties = {
  charge: 0, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}
loadBaseline.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Compare current SCCs to baseline. Growth = new cycle, grown cycle, merge. */
function compareCycles(current, baselineCycles) {
  const verdict = { newCycles: [], grownCycles: [], merged: [], shrunk: 0, ok: true };
  const baseSets = baselineCycles.map((c) => new Set(c));
  for (const cur of current) {
    const touching = [];
    for (let i = 0; i < baseSets.length; i++) {
      if (cur.some((f) => baseSets[i].has(f))) touching.push(i);
    }
    if (touching.length === 0) {
      verdict.newCycles.push(cur);
    } else if (touching.length > 1) {
      verdict.merged.push({ cycle: cur, joins: touching.map((i) => baselineCycles[i].length) });
    } else {
      const base = baseSets[touching[0]];
      const extra = cur.filter((f) => !base.has(f));
      if (extra.length) verdict.grownCycles.push({ size: cur.length, baseSize: base.size, extra });
      else if (cur.length < base.size) verdict.shrunk++;
    }
  }
  verdict.ok = !verdict.newCycles.length && !verdict.grownCycles.length && !verdict.merged.length;
  return verdict;
}
compareCycles.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function main() {
  const argv = process.argv.slice(2);
  const current = censusCycles();
  const totalFiles = current.reduce((s, c) => s + c.length, 0);

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    const data = JSON.stringify({
      note: 'cycle-ratchet baseline — require-graph SCCs in src/. The list only untangles.',
      savedAt: new Date().toISOString(),
      cycles: current.map((c) => ({ size: c.length, members: c })),
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    const prevN = prev ? prev.cycles.length : 'none';
    const prevF = prev ? prev.cycles.reduce((s, c) => s + c.size, 0) : 0;
    console.log(`[cycle-ratchet] baseline saved: ${prevN} cycles/${prevF} files -> ${current.length} cycles/${totalFiles} files`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[cycle-ratchet] no baseline — run --save-baseline first');
    return argv.includes('--json') ? (console.log(JSON.stringify({ ok: false, reason: 'no baseline' })), 1) : 1;
  }
  const v = compareCycles(current, baseline.cycles.map((c) => c.members));
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: v.ok, cycles: current.length, files: totalFiles, ...v }, null, 1));
    return v.ok ? 0 : 1;
  }
  if (v.ok) {
    console.log(`[cycle-ratchet] ✓ holds — ${current.length} cycles / ${totalFiles} files entangled (baseline ${baseline.cycles.length} / ${baseline.cycles.reduce((s, c) => s + c.size, 0)})`);
    if (v.shrunk || current.length < baseline.cycles.length) {
      console.log('  a cycle shrank or dissolved — run --save-baseline to ratchet down');
    }
    return 0;
  }
  console.error(`[cycle-ratchet] ✗ BLOCKED — the require graph tangled further:`);
  for (const c of v.newCycles) console.error(`  NEW cycle[${c.length}]: ${c.join(' <-> ')}`);
  for (const g of v.grownCycles) console.error(`  GREW cycle ${g.baseSize} -> ${g.size}: +${g.extra.join(', +')}`);
  for (const m of v.merged) console.error(`  MERGED cycles (${m.joins.join(' + ')}) into one of ${m.cycle.length}`);
  console.error('  untangle with a call-time lazy require or a real decomposition — never widen the knot.');
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { censusCycles, compareCycles };
