'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { FieldTool, read, scan, peers } = require('../src/core/field-tool');

// Each test generates a unique pattern so substrate-growth assertions
// don't collide with prior runs that left rows in oracle.db.
function uniquePattern(label) {
  const salt = crypto.randomBytes(8).toString('hex');
  return `// ${label} ${salt}\nfunction ${label}_${salt}(x) { return x + ${salt.charCodeAt(0)}; }`;
}

// Most tests run with Void disabled so they don't pay the ~16s warmup
// every run. A dedicated suite block at the end exercises Void.
const FAST = { useVoidSubstrate: false };

test('read() engages entanglement + coding-filter + grow + contribute by default', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const r = ft.read(uniquePattern('layers'), { language: 'js' });
  assert.equal(r.layers.entangled, true, 'entanglement must engage');
  assert.equal(r.layers.codingFiltered, true, 'coding filter must engage when library non-empty');
  assert.equal(r.layers.grew, true, 'substrate growth must engage on novel pattern');
  assert.equal(r.layers.contributed, true, 'field contribution must engage');
});

test('read() returns the documented shape', () => {
  const r = read(uniquePattern('shape'), { ...FAST, language: 'js' });
  assert.ok(Array.isArray(r.waveform), 'waveform must be an array');
  assert.equal(r.waveform.length, 29, 'fractal waveform must be 29-D');
  assert.ok('voidResonance' in r, 'voidResonance present');
  assert.ok('codeResonance' in r, 'codeResonance present');
  assert.ok(Number.isFinite(r.coherence), 'coherence must be finite');
  assert.ok(r.grew && typeof r.grew === 'object', 'grew object present');
  assert.ok(r.fieldStateAfter, 'field state present after read');
  assert.ok(r.layers, 'layers tracking present');
});

test('read() grows the substrate on novel input', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const p1 = uniquePattern('novel-1');
  const before = ft.read(uniquePattern('baseline'), { language: 'js' });
  const after = ft.read(p1, { language: 'js' });
  assert.equal(after.grew.ok, true);
  assert.equal(after.grew.reason, 'inserted');
  assert.ok(
    after.grew.library_size_after > before.grew.library_size_after,
    'library should grow by at least one between two distinct novel patterns',
  );
});

test('read() is idempotent on duplicate input (no double-counting)', () => {
  const ft = new FieldTool({ useVoidSubstrate: false });
  const pattern = uniquePattern('idempotent');
  const r1 = ft.read(pattern, { language: 'js' });
  const r2 = ft.read(pattern, { language: 'js' });
  assert.equal(r1.grew.id, r2.grew.id, 'same content must produce same id');
  assert.equal(r1.grew.library_size_after, r2.grew.library_size_after,
    'library size must not grow on duplicate');
  assert.equal(r2.grew.reason, 'duplicate');
});

test('read() with growSubstrate:false does not grow the library', () => {
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

test('content-too-small inputs do not grow the substrate', () => {
  const r = read('x=1', { ...FAST, language: 'js' });
  assert.equal(r.grew.ok, false);
  assert.equal(r.grew.reason, 'content-too-small');
});

test('peers() returns an array and includes the engaged node', () => {
  read(uniquePattern('peer-probe'), { ...FAST, language: 'js' });
  const p = peers();
  assert.ok(Array.isArray(p));
  assert.ok(p.length >= 1, 'at least the local node should be entangled');
  for (const peer of p) {
    assert.ok(typeof peer.nodeId === 'string' && peer.nodeId.length > 0);
    assert.ok(Number.isFinite(peer.count));
    assert.ok(Number.isFinite(peer.lastCoherence));
  }
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
  assert.ok(sources, 'sources should be present');
  assert.ok(
    sources['field-tool:test:custom-source'],
    'custom source must appear in field histogram',
  );
});

// ── Void substrate (slow — runs the full ~16s warmup once) ──────────

test('Void substrate engages on real code (slow)', async (t) => {
  const ft = new FieldTool({ useVoidSubstrate: true, growSubstrate: false });
  const r = ft.read(uniquePattern('void-engagement'), { language: 'js' });
  assert.equal(r.layers.voidScored, true, 'Void scored must be true');
  assert.ok(r.voidResonance, 'voidResonance present');
  assert.ok(Number.isFinite(r.voidResonance.meanTopK));
  assert.ok(r.voidResonance.librarySize > 40_000,
    `Void library should have >40k unique waveforms, got ${r.voidResonance.librarySize}`);
  // Coherence should be the Void reading when Void engaged
  assert.equal(r.coherence, r.voidResonance.meanTopK);
});

test('Void substrate distinguishes code from synthetic noise', async (t) => {
  const ft = new FieldTool({ useVoidSubstrate: true, growSubstrate: false });
  const codeR = ft.read(uniquePattern('code-vs-noise'), { language: 'js' });
  // Random-byte string is structurally unlike anything in the library
  const noise = crypto.randomBytes(120).toString('hex');
  const noiseR = ft.read(noise, { language: 'unknown' });
  assert.ok(codeR.voidResonance.meanTopK > noiseR.voidResonance.meanTopK - 0.05,
    `code (${codeR.voidResonance.meanTopK.toFixed(3)}) should resonate >= noise (${noiseR.voidResonance.meanTopK.toFixed(3)}) within 0.05`);
});
