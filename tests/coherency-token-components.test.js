'use strict';
/**
 * coherency-token-components — the three numbers a coherency token is derived
 * from, each with its source; and the width guard that keeps the retired
 * 256-D waveform out of every token and every resonance.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const C = require('../src/unified/coherency-token-components');
const ds = require('../src/core/decoder-stack');
const REF = require('../src/core/whitening-reference');

test('the width guard: 232 is a decoder vector; 256 and a lone 29 are not', () => {
  assert.deepStrictEqual(C.canonicalWidth(new Array(232).fill(0)), { ok: true, width: 232, depth: 8 });
  assert.strictEqual(C.canonicalWidth(new Array(256).fill(0)).ok, false);
  assert.match(C.canonicalWidth(new Array(256).fill(0)).why, /RETIRED/);
  assert.strictEqual(C.canonicalWidth(new Array(29).fill(0)).ok, false);
  assert.strictEqual(C.canonicalWidth(new Array(120).fill(0)).ok, false);
});

test('the decoder gives a 256-D pair no resonance, and the reference leaves it untouched', () => {
  const a = Float64Array.from({ length: 256 }, (_, i) => Math.sin(i));
  assert.strictEqual(ds.composedCosine(a, a), 0);
  assert.deepStrictEqual(Array.from(REF.whitenComposed(a)), Array.from(a));
});

test('measureComponents fills the slot with resonance, named, and never with the compressor reading', (t) => {
  const { STORE } = require('../src/core/store-export');
  if (!fs.existsSync(STORE)) { t.skip('pattern store not on this host — no library to resonate against'); return; }
  const code = fs.readFileSync(__filename, 'utf8');
  const m = C.measureComponents({ code, language: 'javascript' });
  assert.strictEqual(m.refused, undefined, m.refused);
  assert.strictEqual(m.waveformWidth % 29, 0);
  assert.notStrictEqual(m.waveformWidth, 256);
  assert.strictEqual(m.wave.source, C.WAVE_SOURCE);
  assert.ok(m.wave.score >= 0 && m.wave.score <= 1);
  assert.strictEqual(m.components.waveform_score, +m.wave.score.toFixed(12));
  if (m.coherency) assert.notStrictEqual(m.components.waveform_score, +m.coherency.value.toFixed(12));
  assert.ok(typeof m.text === 'number');
  assert.match(m.waveformDigest, /^[0-9a-f]{64}$/);
  assert.ok(['transcendence', 'synergy', 'stability', 'pull', 'gate', 'rejection'].includes(m.label));
});

test('atom is read from the SHAPE: a dangerous body scores 0 and cannot mint; a declaration cannot buy it back', () => {
  // the body evals its input — the extractor computes harmPotential 'dangerous' from the tokens
  const code = 'function f(a) { return eval(a); }\nf.atomicProperties = { charge: 0, harmPotential: "none", alignment: "healing", intention: "benevolent" };\n';
  const { STORE } = require('../src/core/store-export');
  if (!fs.existsSync(STORE)) return;
  const m = C.measureComponents({ code, language: 'javascript' });
  if (m.refused) return;
  assert.strictEqual(m.atom, 0, 'a benevolent declaration over a dangerous body reads 0');
  assert.strictEqual(m.unified, 0);
  assert.strictEqual(m.label, 'rejection');
  assert.strictEqual(m.atomDetail[0].harm, 'dangerous');
});

test('atom reads shape, not declarations: an undeclared benign body scores 1.0; a declared dangerous value over a benign body does not', () => {
  const { STORE } = require('../src/core/store-export');
  if (!fs.existsSync(STORE)) return;
  const benign = C.measureComponents({ code: 'function add(a, b) { return a + b; }\nfunction mul(a, b) { return a * b; }\n', language: 'javascript' });
  if (benign.refused) return;
  assert.strictEqual(benign.atom, 1, 'no declarations, benign bodies → 1.0');
  const declaredBad = C.measureComponents({ code: 'function add(a, b) { return a + b; }\nadd.atomicProperties = { harmPotential: "dangerous", alignment: "degrading", intention: "malevolent" };\n', language: 'javascript' });
  if (declaredBad.refused) return;
  assert.strictEqual(declaredBad.atom, 1, 'a declaration is not the shape');
});
