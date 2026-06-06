'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { FieldTool, read, scan, peers } = require('../src/core/field-tool');

function uniquePattern(label) {
  const salt = crypto.randomBytes(8).toString('hex');
  return `// ${label} ${salt}\nfunction ${label}_${salt}(x) { return x + ${salt.charCodeAt(0)}; }`;
}

// Most tests skip the Void warmup (~2-3s on first call). Tests that
// explicitly verify Void engagement enable it.
const FAST = { useVoidSubstrate: false };

test('read() engages all five layers on valid input (Void enabled)', () => {
  const ft = new FieldTool();
  const r = ft.read(uniquePattern('layers'), { language: 'js' });
  assert.equal(r.layers.entangled, true);
  assert.equal(r.layers.voidScored, true, 'Void 29-D substrate must engage');
  assert.equal(r.layers.codingFiltered, true, 'Oracle coding filter must engage');
  assert.equal(r.layers.grew, true);
  assert.equal(r.layers.contributed, true);
});

test('read() returns the documented shape', () => {
  const r = read(uniquePattern('shape'), { ...FAST, language: 'js' });
  assert.ok(Array.isArray(r.waveform), 'waveform must be an array');
  assert.equal(r.waveform.length, 29, '29-D fractal');
  assert.ok('voidResonance' in r);
  assert.ok('codeResonance' in r);
  assert.ok(Number.isFinite(r.coherence));
  assert.ok(r.grew && typeof r.grew === 'object');
  assert.ok(r.fieldStateAfter);
  assert.ok(r.layers);
});

test('read() grows the substrate on novel input', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const before = ft.read(uniquePattern('baseline'), { language: 'js' });
  const after = ft.read(uniquePattern('novel-1'), { language: 'js' });
  assert.equal(after.grew.ok, true);
  assert.equal(after.grew.reason, 'inserted');
  assert.ok(after.grew.library_size_after > before.grew.library_size_after);
});

test('read() is idempotent on duplicate input', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const pattern = uniquePattern('idempotent');
  const r1 = ft.read(pattern, { language: 'js' });
  const r2 = ft.read(pattern, { language: 'js' });
  assert.equal(r1.grew.id, r2.grew.id);
  assert.equal(r1.grew.library_size_after, r2.grew.library_size_after);
  assert.equal(r2.grew.reason, 'duplicate');
});

test('read() with growSubstrate:false does not grow', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const before = ft.read(uniquePattern('size-probe'), { language: 'js' });
  const sizeBefore = before.grew.library_size_after;
  const r = ft.read(uniquePattern('no-grow'), {
    language: 'js',
    growSubstrate: false,
  });
  assert.equal(r.grew.ok, false);
  assert.equal(r.grew.reason, 'disabled');
  const after = ft.read(uniquePattern('size-probe-after'), { language: 'js' });
  assert.equal(after.grew.library_size_after, sizeBefore + 1);
});

test('content-too-small inputs do not grow', () => {
  const r = read('x=1', { ...FAST, language: 'js' });
  assert.equal(r.grew.ok, false);
  assert.equal(r.grew.reason, 'content-too-small');
});

test('peers() returns array and includes the engaged node', () => {
  read(uniquePattern('peer-probe'), { ...FAST, language: 'js' });
  const p = peers();
  assert.ok(Array.isArray(p));
  assert.ok(p.length >= 1);
});

test('object input form accepts { content, name, language }', () => {
  const content = uniquePattern('object-form');
  const r = read({ content, name: 'object-test.js', language: 'js' }, FAST);
  assert.equal(r.layers.grew, true);
  assert.equal(r.grew.reason, 'inserted');
});

test('object input form with same content produces same id', () => {
  const content = uniquePattern('id-determinism');
  const r1 = read({ content, language: 'js' }, FAST);
  const r2 = read({ content, language: 'js' }, FAST);
  assert.equal(r1.grew.id, r2.grew.id);
});

test('coherence falls back to coding filter when Void disabled', () => {
  const r = read(uniquePattern('fallback'), { ...FAST, language: 'js' });
  if (r.layers.codingFiltered && r.codeResonance) {
    assert.equal(r.coherence, r.codeResonance.meanTopK);
  }
});

test('layers tracking is honest about what engaged', () => {
  const r = read(uniquePattern('honest-layers'), {
    ...FAST,
    language: 'js',
    growSubstrate: false,
  });
  assert.equal(r.layers.grew, false);
  assert.equal(r.layers.voidScored, false, 'Void disabled, must report not engaged');
  assert.equal(r.layers.entangled, true);
  assert.equal(r.layers.contributed, true);
});

test('FieldTool with custom agentSource tags its contributions', () => {
  const tool = new FieldTool({
    agentSource: 'field-tool:test:custom-source',
    useVoidSubstrate: false,
  });
  const r = tool.read(uniquePattern('custom-source'), { language: 'js' });
  assert.equal(r.layers.contributed, true);
  const sources = r.fieldStateAfter && r.fieldStateAfter.sources;
  assert.ok(sources && sources['field-tool:test:custom-source']);
});

test('waveform is the 29-D fractal, not the 256-D byte', () => {
  const r = read(uniquePattern('encoder-check'), { ...FAST, language: 'js' });
  assert.equal(r.waveform.length, 29, 'must be 29-D fractal');
  for (const v of r.waveform) {
    assert.ok(v >= 0 && v <= 1, `fractal dim ${v} out of [0,1]`);
  }
});

// ── Void 29-D substrate (slow first call — ~2-3s warmup) ────────────

test('Void 29-D substrate engages and exposes >40k patterns', () => {
  const ft = new FieldTool({ useVoidSubstrate: true, growSubstrate: false });
  const r = ft.read(uniquePattern('void-engagement'), { language: 'js' });
  assert.equal(r.layers.voidScored, true);
  assert.ok(r.voidResonance);
  assert.ok(Number.isFinite(r.voidResonance.meanTopK));
  assert.ok(r.voidResonance.librarySize > 40_000,
    `Void library should have >40k 29-D fractal patterns, got ${r.voidResonance.librarySize}`);
  assert.equal(r.coherence, r.voidResonance.meanTopK,
    'coherence must come from Void when Void is engaged');
});

test('Void resonance is in honest middle-band (not byte-encoder noise floor)', () => {
  const ft = new FieldTool({ useVoidSubstrate: true, growSubstrate: false });
  const r = ft.read(uniquePattern('honest-band'), { language: 'js' });
  // The deprecated 256-D byte encoder would report ~0.85-0.95 on any text
  // input (uniform noise floor). The 29-D fractal encoder discriminates
  // and reports a moderate band for plain code (typically 0.3-0.9).
  assert.ok(r.voidResonance.meanTopK < 0.95,
    `coherence ${r.voidResonance.meanTopK} is too uniformly high — looks like byte-encoder noise floor`);
});
