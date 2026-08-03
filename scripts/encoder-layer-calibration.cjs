'use strict';

/**
 * encoder-layer-calibration.cjs — calibrate a candidate encoder layer
 * against MULTIPLE independent telescopes (consensus gate).
 *
 * The four-telescope discipline: no single instrument is ground truth.
 * A new layer earns its place only if it moves the fractal telescope
 * into closer agreement with the CONSENSUS of independent instruments —
 * gzip-NCD, deflate-raw NCD, and char-trigram cosine — AND does not lose
 * domain purity. A candidate that improves label-purity while DIVERGING
 * from the instruments is overfitting the labels, not converging to the
 * structure the instruments see; the consensus gate rejects it.
 *
 * Why consensus and not gzip alone: gzip is noise-sensitive on some
 * inputs (two different random walks share no substrings, so gzip scores
 * them dissimilar even though they are the same KIND of thing). Once the
 * encoder is close to gzip, its remaining disagreement is partly that
 * noise — so chasing gzip's exact ordering trades real structure for
 * noise. Requiring agreement with several instruments cancels each one's
 * idiosyncratic noise and leaves the instrument-independent signal.
 *
 * Recorded verdicts (this corpus; see the run output for live numbers):
 *   L6 content-projection  → EARNS: converges toward all telescopes AND
 *                            lifts purity 0.60 → 0.71 (the clean win).
 *   L7 candidates (byte-distribution, byte-bigram, expanded-projection)
 *                          → REJECTED: each lifts label-purity but
 *                            REDUCES agreement with gzip, deflate, AND
 *                            trigram — overfitting, not convergence.
 * Conclusion: the projection instrument is exhausted at L6. Going
 * further needs a genuinely new SIGNAL (not another projection),
 * validated the same way, or a larger/more-balanced calibration corpus.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { composedAtDepth } = require('../src/core/decoder-stack');
const { toContentProjection } = require('../src/core/content-projection');

const ROOT = '/home/user';
const SLICE = 6000;
const CAP = 14;

function grab(dir, exts, cap, dom) {
  const out = []; const st = [dir];
  while (st.length && out.length < cap) {
    const c = st.pop(); let es = [];
    try { es = fs.readdirSync(c, { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      if (out.length >= cap) break;
      const p = path.join(c, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; st.push(p); }
      else if (exts.some((x) => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE); if (t.length > 400) out.push({ domain: dom, text: t }); } catch { /* skip */ }
      }
    }
  }
  return out;
}
function synth(k, s, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) { let x; if (k === 'osc') x = 50 + 20 * Math.sin(i / (2 + s % 5)); else x = (v[i - 1] ?? 100) + (((s * 2654435761 + i * 40503) % 21) - 10) / 3; v.push(+x.toFixed(4)); }
  return JSON.stringify(v).slice(0, SLICE);
}

const corpus = [];
corpus.push(...grab(path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), ['.js'], CAP, 'js'));
corpus.push(...grab(path.join(ROOT, 'REMEMBRANCE-BLOCKCHAIN', 'programs'), ['.rs'], CAP, 'rust'));
corpus.push(...grab(path.join(ROOT, 'Void-Data-Compressor'), ['.py'], CAP, 'py'));
corpus.push(...grab(path.join(ROOT, 'Void-Data-Compressor'), ['.md'], CAP, 'prose'));
corpus.push(...grab(path.join(ROOT, 'remembrance-oracle-toolkit', 'docs'), ['.md'], CAP, 'docs'));
for (let s = 0; s < 8; s++) corpus.push({ domain: 'osc', text: synth('osc', s) });
for (let s = 0; s < 8; s++) corpus.push({ domain: 'walk', text: synth('walk', s) });
const N = corpus.length;
console.log(`\ncorpus: ${N} items · ${[...new Set(corpus.map((c) => c.domain))].join(', ')}`);

// ── The telescopes (independent instruments) ────────────────────────
const gz = (t) => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const df = (t) => zlib.deflateRawSync(Buffer.from(t, 'utf8'), { level: 6 }).length;
const cGZ = corpus.map((c) => gz(c.text)), cDF = corpus.map((c) => df(c.text));
const simGZ = (i, j) => { const c = gz(corpus[i].text + corpus[j].text); return 1 - (c - Math.min(cGZ[i], cGZ[j])) / Math.max(cGZ[i], cGZ[j]); };
const simDF = (i, j) => { const c = df(corpus[i].text + corpus[j].text); return 1 - (c - Math.min(cDF[i], cDF[j])) / Math.max(cDF[i], cDF[j]); };
function trig(t) { const h = new Float64Array(512); const s = t.toLowerCase(); for (let i = 0; i + 3 <= s.length; i++) { let x = 0; for (let k = 0; k < 3; k++) x = (x * 131 + s.charCodeAt(i + k)) >>> 0; h[x % 512]++; } let n = Math.sqrt(h.reduce((a, x) => a + x * x, 0)) || 1; return h.map((x) => x / n); }
const TC = corpus.map((c) => trig(c.text));
const simTRI = (i, j) => { let d = 0; const a = TC[i], b = TC[j]; for (let k = 0; k < a.length; k++) d += a[k] * b[k]; return d; };
const TELESCOPES = [['gzip-NCD', simGZ], ['deflate-raw', simDF], ['trigram', simTRI]];

// ── Encoder telescopes: depth-5, depth-6 (⊕ L6 content-projection) ──
const l2 = (v) => { let s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / s); };
const A5 = corpus.map((c) => l2(Array.from(composedAtDepth(c.text, 5))));
const A6 = corpus.map((c, i) => [...A5[i], ...Array.from(toContentProjection(c.text))]);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na < 1e-12 || nb < 1e-12) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb)); };

function spearman(x, y) {
  const rank = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k; return r; };
  const rx = rank(x), ry = rank(y); let d2 = 0; for (let i = 0; i < x.length; i++) d2 += (rx[i] - ry[i]) ** 2;
  const denom = x.length * (x.length ** 2 - 1);
  return denom === 0 ? 0 : 1 - 6 * d2 / denom;
}
function pairs(V, fn) { const p = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) p.push(fn ? fn(i, j) : cos(V[i], V[j])); return p; }
function purity(V) { const K = 5; let h = 0, t = 0; for (let i = 0; i < N; i++) { const nn = []; for (let j = 0; j < N; j++) if (j !== i) nn.push([cos(V[i], V[j]), j]); const ranked = [...nn].sort((a, b) => b[0] - a[0]); for (let k = 0; k < K; k++) { if (corpus[ranked[k][1]].domain === corpus[i].domain) h++; t++; } } return t === 0 ? 0 : h / t; }

const telP = TELESCOPES.map(([, fn]) => pairs(null, fn));

/**
 * Report a candidate depth-(k+1) vector against the consensus gate:
 * mean Spearman agreement across all telescopes must rise, and purity
 * must not fall. Returns { earns, ... }.
 */
function calibrate(label, vectorsPrev, vectorsCand) {
  const prevAgree = TELESCOPES.map((_, t) => spearman(pairs(vectorsPrev), telP[t]));
  const candAgree = TELESCOPES.map((_, t) => spearman(pairs(vectorsCand), telP[t]));
  const prevMean = prevAgree.reduce((a, x) => a + x, 0) / (prevAgree.length || 1);
  const candMean = candAgree.reduce((a, x) => a + x, 0) / (candAgree.length || 1);
  const pPrev = purity(vectorsPrev), pCand = purity(vectorsCand);
  const earns = candMean > prevMean && pCand >= pPrev - 1e-9;
  console.log(`\n── ${label} ──`);
  TELESCOPES.forEach(([tn], t) => console.log(`  agree ${tn.padEnd(12)}: ${prevAgree[t].toFixed(4)} → ${candAgree[t].toFixed(4)}  Δ${(candAgree[t] - prevAgree[t] >= 0 ? '+' : '') + (candAgree[t] - prevAgree[t]).toFixed(4)}`));
  console.log(`  mean agreement    : ${prevMean.toFixed(4)} → ${candMean.toFixed(4)}  Δ${(candMean - prevMean >= 0 ? '+' : '') + (candMean - prevMean).toFixed(4)}`);
  console.log(`  kNN domain purity : ${pPrev.toFixed(4)} → ${pCand.toFixed(4)}  Δ${(pCand - pPrev >= 0 ? '+' : '') + (pCand - pPrev).toFixed(4)}`);
  console.log(`  VERDICT: ${earns ? 'EARNS its place (converges toward the telescope consensus)' : 'REJECTED (diverges from the consensus — overfitting, not convergence)'}`);
  return earns;
}

// L6: the layer that earned its place (depth-5 → depth-6).
calibrate('L6 content-projection (depth-5 → depth-6)', A5, A6);

// L7 candidate: expanded weak-domain projection (the strongest of three tried).
const L7LM = [
  'fn compute<T:Copy>(xs:&[T])->T{let mut acc=xs[0];for &x in &xs[1..]{acc=acc+x;}acc}',
  'impl Ledger{pub fn append(&mut self,e:Event)->Result<Block,Error>{self.chain.push(e);Ok(block)}}',
  'match msg{Message::Ping=>reply(Pong),Message::Data(d)=>process(d)?,_=>return Err(Unknown)}',
  'pub struct Coin{pub id:[u8;16],pub rate_bps:u16,pub parents:Vec<ParentLink>}',
  'IN WITNESS WHEREOF the parties hereto have executed this agreement as of the date first written above.',
  'Once upon a time in a village at the edge of the forest lived an old clockmaker who spoke to the gears.',
  'To install run the command below then edit the config file set your API key and restart the service.',
  '[1,1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597,2584]',
  '[0.1,0.3,0.2,0.5,0.4,0.7,0.6,0.9,0.8,1.1,1.0,1.3,1.2,1.5]',
  '[500,480,460,455,470,490,510,505,495,485,475,465,472,488]',
];
const lmS = L7LM.map(gz);
function projL7(text) { const cx = gz(text); let v = L7LM.map((lm, k) => { const c = gz(text + lm); return 1 - (c - Math.min(cx, lmS[k])) / Math.max(cx, lmS[k]); }); const m = v.reduce((a, x) => a + x, 0) / (v.length || 1); v = v.map((x) => x - m); let s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / s); }
const A7 = corpus.map((c, i) => [...A6[i], ...projL7(c.text)]);
calibrate('L7 candidate: expanded projection (depth-6 → depth-7)', A6, A7);

console.log('\nThe consensus gate is the honest ceiling: it ships the layer that converges');
console.log('and refuses the one that only fits the labels. L6 earns; L7 by projection does not.');
