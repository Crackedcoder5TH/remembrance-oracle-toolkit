'use strict';
// ONE representation. The width gate's census finds a consumer that reads a
// depth checkpoint, the L1 alone, or the retired 256-sample waveform, and
// leaves the decoder, the refusals and the instrument's own chunk window alone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../scripts/width-ratchet');

const hit = (line) => W.PATTERNS.find((p) => p.re.test(line));

test('reads of a non-canonical vector are found', () => {
  assert.equal(hit("const v = idx[k].composed_v1;").id, 'checkpoint-key');
  assert.equal(hit("if (v.length === 116) lib.push(v);").id, 'width-116');
  assert.equal(hit("const DIM = 116;").id, 'width-116');
  assert.equal(hit("wf = np.interp(np.linspace(0, raw.size - 1, 256), np.arange(raw.size), raw)").id, 'byte-waveform-256');
  assert.equal(hit("const waveform = new Array(256).fill(0);").id, 'byte-waveform-256');
  assert.equal(hit("const c = _cosineL1(entry.fractal, e.fractal);").id, 'l1-as-vector');
  assert.equal(hit("vec = v.get('fractal')").id, 'l1-as-vector');
});

test('the canonical vector, the refusals and template names are not consumers', () => {
  assert.equal(hit("const v = idx[k].composed; if (v.length === 232) lib.push(v);"), undefined);
  assert.equal(hit("resonantTemplate: { fractal: resonant.fractal, resonance: resonant.resonance }"), undefined);
  assert.equal(hit("handlers['fractal'] = (args) => {"), undefined);
  assert.equal(hit("if (voices.fractal.isCode) signals.push(1);"), undefined);
});

test('the live census is empty: every consumer reads the 232-D decoder', () => {
  const c = W.census();
  assert.equal(c.total, 0, c.sites.map((s) => `${s.file}:${s.line} [${s.id}] ${s.text}`).join('\n'));
});

test('the decoder, the one space and the compressor internals are allowed by name with a reason', () => {
  for (const f of ['src/core/decoder-stack.js', 'src/core/resonance-space.js', 'Void-Data-Compressor/void_compressor_v5.py']) {
    const a = W.ALLOW.find(([re]) => re.test('/home/user/x/' + f) || re.test('/home/user/' + f));
    assert.ok(a && a[1].length > 10, `${f} allowed with a reason`);
  }
});
