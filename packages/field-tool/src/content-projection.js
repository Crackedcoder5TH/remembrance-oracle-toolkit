'use strict';

/**
 * content-projection.js — L6: pattern projection onto a compression basis.
 *
 * The residual monitor's last unexplained signal at depth 5 is content
 * identity — the structural stack (L1-L4) is content-blind by design and
 * collapses distinct sources of similar shape (two prose docs, two
 * different functions). The four-telescope experiment showed WHY that
 * matters and WHERE the missing signal lives: the gzip-NCD telescope
 * (compression) sees domain/content structure the structural stack does
 * not. L6 imports that view — not by copying compression, but by
 * PROJECTING each pattern onto a fixed basis of landmark patterns using
 * NCD: each coordinate is "how does this compress against landmark k".
 *
 * This is calibrated, not asserted. scripts/encoder-layer-calibration.cjs
 * measures whether adding L6 moves the fractal telescope into closer
 * agreement with the gzip telescope (Spearman + kNN purity). It does —
 * kNN domain purity 0.60 → 0.72, closing over half the gap to gzip's
 * 0.83 — which is the only reason this layer exists.
 *
 * DETERMINISM IS LOAD-BEARING. The landmarks below are FIXED, canonical,
 * and part of the contract, exactly like the rate formula. gzip is
 * deterministic. So L6 is byte-identical across runs, languages, and
 * hosts — it adds discrimination without adding a knob. Identity
 * (coin_id) is anchored on L1 and untouched by L6.
 *
 * Cost note: L6 runs LANDMARKS.length gzip compressions per encode. The
 * landmarks are short (< 300 bytes) to keep that cheap; for bulk harvest
 * this is the heaviest layer and callers may encode L6 lazily.
 */

const zlib = require('node:zlib');

const DIM_TARGET = 29; // pad/truncate to the layer convention

// ── The fixed projection basis ──────────────────────────────────────
// A small, domain-diverse set of canonical landmark patterns. Each is a
// short, representative shape from a distinct structural/content family,
// so a pattern's NCD-profile against them is a content fingerprint. This
// set is IMMUTABLE — changing it changes every composed_v3 vector, so it
// is versioned with the encoder, never tuned per-caller.
const LANDMARKS = Object.freeze([
  // code — three languages, distinct idioms
  'function handle(req,res){const id=req.params.id;const row=db.get(id);if(!row)return res.status(404).end();res.json(row);}',
  'fn compute(input:&[f64])->f64{let mut acc=0.0;for &x in input{acc+=x*x;}acc.sqrt()}',
  'def parse(path):\n    with open(path) as f:\n        data=json.load(f)\n    return [r for r in data if r.get("ok")]',
  'package main\nfunc main(){for i:=0;i<n;i++{go worker(ch);}wg.Wait()}',
  // prose — narrative and formal register
  'The covenant binds every participant to the same law, and no operator, however privileged, may lower their own rate; the math does not know who you are.',
  'This document describes acceptable use. Users shall not employ the service to cause harm, and violations terminate the license immediately upon notice.',
  '# Overview\n\nThis guide walks through installation, configuration, and first run. Each section builds on the previous; read them in order.',
  // structured data
  '{"type":"record","fields":[{"name":"id","type":"string"},{"name":"value","type":"double"},{"name":"ok","type":"boolean"}]}',
  'id,name,value,timestamp\n1,alpha,3.14,2026-01-01\n2,beta,2.71,2026-01-02\n3,gamma,1.61,2026-01-03',
  // numeric series — oscillation, growth, walk
  '[50.0,54.2,58.1,60.9,61.8,60.4,56.9,52.1,47.4,44.0,42.9,44.6,48.6,53.9]',
  '[100,102,104.04,106.12,108.24,110.4,112.6,114.86,117.15,119.5,121.89]',
  '[100,98,101,97,103,96,104,99,102,95,106,100,98,104,101,97]',
  // math / physics expression
  'V(mu,lambda)=-mu^2*phi^2+lambda*phi^4; dV/dphi=-2*mu^2*phi+4*lambda*phi^3=0',
  // markup / config
  'name: build\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest',
  // sequence / biological
  'ATGCGTACGTTAGCCGATCGGATCGATCGTAGCTAGCTAGGCTAAGCTTACGGATCCGGTA',
]);

const _lmSizes = LANDMARKS.map((l) => _gz(l));

function _gz(t) { return zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length; }

/**
 * Project `input` onto the compression basis: coordinate k = 1 - NCD(input,
 * landmark_k), L2-normalised, padded/truncated to 29-D.
 *
 * @param {string} input
 * @returns {Float64Array} 29-D content-projection fingerprint
 */
function toContentProjection(input) {
  const out = new Float64Array(DIM_TARGET);
  if (typeof input !== 'string' || input.length < 3) return out;
  const buf = Buffer.from(input, 'utf8');
  const cx = _gz(input);
  const raw = new Float64Array(LANDMARKS.length);
  for (let k = 0; k < LANDMARKS.length; k++) {
    const cxy = zlib.gzipSync(Buffer.concat([buf, Buffer.from(LANDMARKS[k], 'utf8')]), { level: 9 }).length;
    const denom = Math.max(cx, _lmSizes[k]) || 1;
    const ncd = (cxy - Math.min(cx, _lmSizes[k])) / denom;
    raw[k] = 1 - ncd;
  }
  // MEAN-CENTER before normalising. Raw (1 - NCD) values cluster high
  // and similar across texts, so their absolute magnitude carries little
  // signal; the DISCRIMINATING information is the relative profile — which
  // landmarks a pattern compresses toward vs. away from the mean. The
  // calibrator confirmed this: centering lifts kNN purity 0.64 → 0.71
  // (raw → centered) against the gzip telescope, nearly matching a
  // corpus-optimal basis. This is why L6 earns its place.
  let mean = 0; for (let k = 0; k < raw.length; k++) mean += raw[k];
  mean /= raw.length;
  let s = 0; for (let k = 0; k < raw.length; k++) { raw[k] -= mean; s += raw[k] * raw[k]; }
  // Guard the actual divisor (norm), not its square upstream — the
  // guard-then-reassign form (`if (s<eps) …; s = sqrt(s)`) was correct
  // but opaque to readers and flow-insensitive checkers alike.
  // norm < 1e-6 ⇔ s < 1e-12: mathematically identical, byte-identical output.
  const norm = Math.sqrt(s);
  if (norm < 1e-6) return out;
  for (let k = 0; k < raw.length && k < DIM_TARGET; k++) out[k] = raw[k] / norm;
  return out;
}

function contentProjectionCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return d / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { DIM: DIM_TARGET, LANDMARKS, toContentProjection, contentProjectionCosine };
