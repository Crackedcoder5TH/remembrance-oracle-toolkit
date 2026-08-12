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

/**
 * Position-aware require extraction (2026-08-09 precision upgrade).
 *
 * A require at module scope runs at LOAD TIME and can deadlock module
 * init; a require inside a function body or an expression-bodied arrow
 * (`() => require('./x').f()` — the house lazy-require cure) runs at
 * CALL TIME and cannot. The first census read raw text and counted both
 * as the same edge — so the cure was invisible to the gate, and the
 * measured "62-file cycle" turned out to be lexical coupling, not load
 * order: measured on the load-time graph alone, src/ is ACYCLIC.
 * Recorded as trap 26. Both surfaces matter, so both are censused:
 *   load    — top-level edges only. The hard gate; baseline ZERO.
 *   lexical — every edge. Coupling debt; shrinks through real
 *             decomposition, ratcheted exactly as before.
 * Tokenizer-backed, same instrument as the covenant scanners.
 */
function _requireEdges(code, fromFile, tracked) {
  const { tokenize } = require('../src/audit/parser');
  let toks;
  try { toks = tokenize(code).filter((t) => t.type !== 'comment'); } catch { return null; }
  let depth = 0;
  const fnBody = [];      // depths where a braced function body opened
  const exprArrow = [];   // depths where an expression-bodied arrow began
  const load = [], lexical = [];
  const resolve = (spec) => {
    if (!spec.startsWith('.')) return null;
    const t = path.join(path.dirname(fromFile), spec);
    for (const cand of [t, t + '.js', path.join(t, 'index.js')]) {
      if (tracked.has(cand)) return cand;
    }
    return null;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.value === '(' || t.value === '[') depth++;
    else if (t.value === '{') {
      depth++;
      const prev = toks[i - 1];
      if (prev && prev.value === '=>') fnBody.push(depth);
      else if (prev && prev.value === ')') {
        let d = 0, j = i - 1;
        for (; j >= 0; j--) { if (toks[j].value === ')') d++; else if (toks[j].value === '(') { d--; if (d === 0) break; } }
        const before = toks[j - 1];
        if (before && (before.type === 'identifier' || (before.type === 'keyword' && before.value === 'function'))) fnBody.push(depth);
      }
    } else if (t.value === ')' || t.value === ']' || t.value === '}') {
      if (t.value === '}' && fnBody.length && fnBody[fnBody.length - 1] === depth) fnBody.pop();
      depth--;
      while (exprArrow.length && depth < exprArrow[exprArrow.length - 1]) exprArrow.pop();
    } else if (t.value === '=>') {
      const nxt = toks[i + 1];
      if (nxt && nxt.value !== '{') exprArrow.push(depth);
    } else if (t.value === ',' || t.value === ';') {
      while (exprArrow.length && exprArrow[exprArrow.length - 1] === depth) exprArrow.pop();
    } else if (t.type === 'identifier' && t.value === 'require' && toks[i + 1] && toks[i + 1].value === '(') {
      const arg = toks[i + 2];
      if (arg && arg.type === 'string') {
        const target = resolve(arg.value.slice(1, -1));
        if (target) {
          lexical.push(target);
          if (fnBody.length === 0 && exprArrow.length === 0) load.push(target);
        }
      }
    }
  }
  return { load, lexical };
}
_requireEdges.atomicProperties = {
  charge: 0, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

/** Build both require graphs over git-tracked src/*.js and return SCCs >1 for each. */
function censusCycles() {
  const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));
  const tracked = new Set(files);
  const loadGraph = new Map(), lexGraph = new Map();
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const edges = _requireEdges(code, f, tracked);
    if (!edges) {
      // tokenize failure: fall back to raw lexical scan, load-time unknown →
      // count as load edges too (never silently narrower than the old gate)
      const deps = [];
      for (const m of code.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        const t = path.join(path.dirname(f), m[1]);
        for (const cand of [t, t + '.js', path.join(t, 'index.js')]) {
          if (tracked.has(cand)) { deps.push(cand); break; }
        }
      }
      loadGraph.set(f, deps); lexGraph.set(f, deps);
      continue;
    }
    loadGraph.set(f, edges.load);
    lexGraph.set(f, edges.lexical);
  }
  const graphs = { load: loadGraph, lexical: lexGraph };
  const out = {};
  for (const [name, graph] of Object.entries(graphs)) {
    // Tarjan SCC, iterative (the lexical component recurses deeper than it looks)
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
    out[name] = sccs;
  }
  return out;
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
  const lexFiles = current.lexical.reduce((s, c) => s + c.length, 0);
  const loadFiles = current.load.reduce((s, c) => s + c.length, 0);

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    const data = JSON.stringify({
      note: 'cycle-ratchet baseline — require-graph SCCs in src/. load = top-level edges (the hard gate; held at ZERO since 2026-08-09). lexical = every edge (coupling debt; shrinks through real decomposition). Both lists only untangle.',
      savedAt: new Date().toISOString(),
      loadCycles: current.load.map((c) => ({ size: c.length, members: c })),
      cycles: current.lexical.map((c) => ({ size: c.length, members: c })),
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    const prevN = prev ? prev.cycles.length : 'none';
    console.log(`[cycle-ratchet] baseline saved: lexical ${prevN} -> ${current.lexical.length} cycles/${lexFiles} files · load ${current.load.length} cycles/${loadFiles} files`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[cycle-ratchet] no baseline — run --save-baseline first');
    return argv.includes('--json') ? (console.log(JSON.stringify({ ok: false, reason: 'no baseline' })), 1) : 1;
  }
  // LOAD-TIME gate: held at the baseline's load surface (zero since the
  // precision upgrade). Any load-time cycle beyond it blocks — a module
  // graph that deadlocks init is never a baseline candidate.
  const baseLoad = (baseline.loadCycles || []).map((c) => c.members);
  const vLoad = compareCycles(current.load, baseLoad);
  const vLex = compareCycles(current.lexical, baseline.cycles.map((c) => c.members));
  const ok = vLoad.ok && vLex.ok;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok, load: { cycles: current.load.length, files: loadFiles, ...vLoad }, lexical: { cycles: current.lexical.length, files: lexFiles, ...vLex } }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[cycle-ratchet] ✓ holds — load: ${current.load.length} cycles (gate at ${baseLoad.length}) · lexical: ${current.lexical.length} cycles / ${lexFiles} files (baseline ${baseline.cycles.length} / ${baseline.cycles.reduce((s, c) => s + c.size, 0)})`);
    if (vLex.shrunk || current.lexical.length < baseline.cycles.length) {
      console.log('  the lexical knot shrank — run --save-baseline to ratchet down');
    }
    return 0;
  }
  if (!vLoad.ok) {
    console.error('[cycle-ratchet] ✗ BLOCKED — a LOAD-TIME require cycle appeared (module init can deadlock):');
    for (const c of vLoad.newCycles) console.error(`  NEW load cycle[${c.length}]: ${c.join(' <-> ')}`);
    for (const g of vLoad.grownCycles) console.error(`  GREW load cycle ${g.baseSize} -> ${g.size}: +${g.extra.join(', +')}`);
    for (const m of vLoad.merged) console.error(`  MERGED load cycles into one of ${m.cycle.length}`);
    console.error('  defer the require to call time (() => require(...)) or decompose — the load graph stays acyclic.');
  }
  if (!vLex.ok) {
    console.error('[cycle-ratchet] ✗ BLOCKED — the lexical require graph tangled further:');
    for (const c of vLex.newCycles) console.error(`  NEW cycle[${c.length}]: ${c.join(' <-> ')}`);
    for (const g of vLex.grownCycles) console.error(`  GREW cycle ${g.baseSize} -> ${g.size}: +${g.extra.join(', +')}`);
    for (const m of vLex.merged) console.error(`  MERGED cycles (${m.joins.join(' + ')}) into one of ${m.cycle.length}`);
    console.error('  untangle with a real decomposition — never widen the knot.');
  }
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
