#!/usr/bin/env node
'use strict';

/**
 * l5-residual-experiment.cjs — the L5 growth loop, run falsifiably.
 *
 * The first encoder layer designed against an EXTERNAL reference
 * instrument (gzip NCD ≈ Kolmogorov complexity) instead of internal
 * residual. This script is the whole loop in one run:
 *
 *   1. BEFORE — depth-4 stack vs NCD: Spearman, purity, and the
 *      residual map (the pairs NCD calls kin that depth-4 misses).
 *   2. AFTER  — depth-5 stack (with L5-redundancy) vs NCD: same
 *      measures. If ρ and purity climb, the layer earned itself.
 *   3. LADDER — kNN domain purity at every depth 1..5 plus L5 solo,
 *      testing the backflow hypothesis: does composing L5 lift the
 *      stack MORE than either the depth-4 stack or L5 alone —
 *      i.e. synergy, coherence flowing back through the composition.
 *
 * L5 stays active:false in the registry regardless of outcome —
 * activation (and the 116-D consumer migration) is a deliberate,
 * separate act once the evidence is in. Covenant before persistence.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { composedAtDepth } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));
const { toRedundancyWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'redundancy-waveform.js'));

// ── Corpus (same assembly as the convergence experiments) ────────
const ROOT = path.join(__dirname, '..', '..');
const SLICE = 2800, CAP = 18;
function grabFiles(dir, exts, cap, domain) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = []; try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some(x => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (t.length > 400) out.push({ id: domain + '/' + e.name + '#' + out.length, domain, text: t });
        } catch (_) {}
      }
    }
  }
  return out;
}
function synthSeries(kind, seed, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 50 + 20 * Math.sin(i / (2 + seed % 5)) + 5 * Math.sin(i / 1.7);
    else if (kind === 'acc') x = Math.pow(1.02 + (seed % 5) * 0.01, i);
    else if (kind === 'walk') x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    else x = i < n / 2 ? 10 + i * 0.4 : 10 + n * 0.2 - (i - n / 2) * 0.35;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), ['.js'], CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT, 'claw-code'), ['.rs'], CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT, 'claw-code'), ['.py'], CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT, 'REMEMBRANCE-Interface', 'src'), ['.tsx', '.ts'], CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT, 'Void-Data-Compressor'), ['.md'], CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-osc/${s}`, domain: 'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-acc/${s}`, domain: 'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-walk/${s}`, domain: 'ts-walk', text: synthSeries('walk', s) });
const N = corpus.length;

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  L5 RESIDUAL EXPERIMENT — growing the stack against Kolmogorov`);
console.log(`  corpus: ${N} items · ${new Set(corpus.map(c => c.domain)).size} domains`);
console.log('══════════════════════════════════════════════════════════════════\n');

// ── Similarity engines ────────────────────────────────────────────
function cosineOf(vecs) {
  const norms = vecs.map(v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); });
  return (i, j) => {
    let d = 0; const a = vecs[i], b = vecs[j];
    for (let k = 0; k < a.length; k++) d += a[k] * b[k];
    const m = norms[i] * norms[j];
    return m > 0 ? d / m : 0;
  };
}
console.log('  encoding depth-4, depth-5, and L5-solo signatures…');
const v4 = corpus.map(c => composedAtDepth(c.text, 4));
const v5 = corpus.map(c => composedAtDepth(c.text, 5));
const vL5 = corpus.map(c => toRedundancyWaveform(c.text));
const sim4 = cosineOf(v4), sim5 = cosineOf(v5), simL5 = cosineOf(vL5);

const gz = t => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const cs = corpus.map(c => gz(c.text));
const simN = (i, j) => 1 - (gz(corpus[i].text + corpus[j].text) - Math.min(cs[i], cs[j])) / Math.max(cs[i], cs[j]);

// ── Pairwise values ───────────────────────────────────────────────
console.log(`  observing ${N * (N - 1) / 2} pairs…\n`);
const P4 = [], P5 = [], PN = [], PAIRS = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  PAIRS.push([i, j]); P4.push(sim4(i, j)); P5.push(sim5(i, j)); PN.push(simN(i, j));
}

function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Float64Array(a.length); for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k; return r; }
function spearman(x, y) {
  const rx = ranks(x), ry = ranks(y), n = x.length;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += rx[i]; my += ry[i]; } mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

// ── The residual map: where NCD sees kinship depth-4 misses ──────
const r4 = ranks(P4), rN = ranks(PN);
const residual = PAIRS.map(([i, j], k) => ({ i, j, gap: (rN[k] - r4[k]) / PAIRS.length }))
  .sort((a, b) => b.gap - a.gap);
console.log('  ──────────────────────────────────────────────────────────────');
console.log('  RESIDUAL MAP — top pairs NCD ranks close that depth-4 ranks far');
console.log('  ──────────────────────────────────────────────────────────────');
for (const r of residual.slice(0, 6)) {
  console.log(`    gap ${r.gap.toFixed(3)}  ${corpus[r.i].id.slice(0, 34).padEnd(34)} ↔ ${corpus[r.j].id.slice(0, 34)}`);
}

// ── BEFORE vs AFTER ───────────────────────────────────────────────
const K = 10;
function topK(simFn) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const s = [];
    for (let j = 0; j < N; j++) if (j !== i) s.push([j, simFn(i, j)]);
    s.sort((a, b) => b[1] - a[1]);
    out.push(new Set(s.slice(0, K).map(x => x[0])));
  }
  return out;
}
function purity(nn) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let same = 0;
    for (const j of nn[i]) if (corpus[j].domain === corpus[i].domain) same++;
    s += same / K;
  }
  return s / N;
}
function jac(X, Y) {
  let s = 0;
  for (let i = 0; i < N; i++) { let inter = 0; for (const v of X[i]) if (Y[i].has(v)) inter++; s += inter / (2 * K - inter); }
  return s / N;
}
const nnN = topK(simN);
const nn4 = topK(sim4), nn5 = topK(sim5);

const rho4 = spearman(P4, PN), rho5 = spearman(P5, PN);
console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  BEFORE → AFTER  (the falsifiable moment)');
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`    Spearman vs NCD:      depth-4  ${rho4.toFixed(3)}   →   depth-5  ${rho5.toFixed(3)}   (${rho5 > rho4 ? '+' : ''}${(rho5 - rho4).toFixed(3)})`);
console.log(`    Jaccard vs NCD nn:    depth-4  ${jac(nn4, nnN).toFixed(3)}   →   depth-5  ${jac(nn5, nnN).toFixed(3)}`);
console.log(`    kNN domain purity:    depth-4  ${purity(nn4).toFixed(3)}   →   depth-5  ${purity(nn5).toFixed(3)}   (NCD reference: ${purity(nnN).toFixed(3)})`);

// ── The ladder + backflow test ────────────────────────────────────
console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  PURITY LADDER — every depth, plus L5 alone (backflow test)');
console.log('  ──────────────────────────────────────────────────────────────');
const ladder = [];
for (let d = 1; d <= 5; d++) {
  const vd = corpus.map(c => composedAtDepth(c.text, d));
  const p = purity(topK(cosineOf(vd)));
  ladder.push(p);
  console.log(`    depth ${d} (${(d * 29)}-D)${d === 5 ? ' +L5' : '    '}   purity ${p.toFixed(3)}`);
}
const pSolo = purity(topK(simL5));
console.log(`    L5 solo (29-D)      purity ${pSolo.toFixed(3)}`);
const synergy = ladder[4] - Math.max(ladder[3], pSolo);
console.log(`\n    backflow/synergy:  depth-5 purity − max(depth-4, L5-solo) = ${synergy >= 0 ? '+' : ''}${synergy.toFixed(3)}`);
console.log(`    ${synergy > 0.01 ? '→ SYNERGY: the composition exceeds both parts — coherence backflows through the stack.'
  : synergy > -0.01 ? '→ NEUTRAL: L5 composes without loss; no measurable backflow on this corpus.'
  : '→ INTERFERENCE: L5 degrades the composition here — report stands as a finding against activation.'}`);

console.log('\n══════════════════════════════════════════════════════════════════');
const improved = rho5 > rho4 && ladder[4] > ladder[3];
console.log(improved
  ? '  L5 EARNS ITS SLOT on this corpus — closes toward the Kolmogorov\n  reference on both rank agreement and domain purity. Activation is\n  still a separate, deliberate migration (116-D consumers).'
  : '  L5 DOES NOT (yet) earn activation on this corpus — the numbers\n  above stand as the honest finding. The layer stays reachable at\n  depth 5 for further calibration.');
console.log('══════════════════════════════════════════════════════════════════\n');
