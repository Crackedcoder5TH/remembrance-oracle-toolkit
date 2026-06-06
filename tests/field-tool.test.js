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

test('read() engages all four layers on valid input', () => {
  const ft = new FieldTool();
  const r = ft.read(uniquePattern('layers'), { language: 'js' });
  assert.equal(r.layers.entangled, true, 'entanglement must engage');
  assert.equal(r.layers.scored, true, 'scoring must engage when library is non-empty');
  assert.equal(r.layers.grew, true, 'substrate growth must engage on novel pattern');
  assert.equal(r.layers.contributed, true, 'field contribution must engage');
});

test('read() returns the documented shape', () => {
  const r = read(uniquePattern('shape'), { language: 'js' });
  assert.ok(Array.isArray(r.waveform), 'waveform must be an array');
  assert.equal(r.waveform.length, 29, 'waveform must be 29-D fractal');
  assert.ok('resonance' in r, 'resonance present');
  assert.ok(Number.isFinite(r.coherence), 'coherence must be finite');
  assert.ok(r.grew && typeof r.grew === 'object', 'grew object present');
  assert.ok(r.fieldStateAfter, 'field state present after read');
  assert.ok(r.layers, 'layers tracking present');
});

test('read() grows the substrate on novel input', () => {
  const ft = new FieldTool();
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
  const ft = new FieldTool();
  const pattern = uniquePattern('idempotent');
  const r1 = ft.read(pattern, { language: 'js' });
  const r2 = ft.read(pattern, { language: 'js' });
  assert.equal(r1.grew.id, r2.grew.id, 'same content must produce same id');
  assert.equal(r1.grew.library_size_after, r2.grew.library_size_after,
    'library size must not grow on duplicate');
  assert.equal(r2.grew.reason, 'duplicate');
});

test('read() with growSubstrate:false does not grow the library', () => {
  const ft = new FieldTool();
  const before = ft.read(uniquePattern('size-probe'), { language: 'js' });
  const sizeBefore = before.grew.library_size_after;
  const r = ft.read(uniquePattern('no-grow'), {
    language: 'js',
    growSubstrate: false,
  });
  assert.equal(r.grew.ok, false);
  assert.equal(r.grew.reason, 'disabled');
  const after = ft.read(uniquePattern('size-probe-after'), { language: 'js' });
  // The skipped grow should have left the library at sizeBefore + 1
  // (only the two size-probe reads counted; the no-grow read did not)
  assert.equal(after.grew.library_size_after, sizeBefore + 1);
});

test('content-too-small inputs do not grow the substrate', () => {
  const r = read('x=1', { language: 'js' });
  assert.equal(r.grew.ok, false);
  assert.equal(r.grew.reason, 'content-too-small');
});

test('peers() returns an array and includes the engaged node', () => {
  // engage by reading
  read(uniquePattern('peer-probe'), { language: 'js' });
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
  const r = read({ content, name: 'object-test.js', language: 'js' });
  assert.equal(r.layers.grew, true);
  assert.equal(r.grew.reason, 'inserted');
});

test('object input form with same content produces same id', () => {
  const content = uniquePattern('id-determinism');
  const r1 = read({ content, language: 'js' });
  const r2 = read({ content, language: 'js' });
  assert.equal(r1.grew.id, r2.grew.id);
});

test('coherence equals resonance.meanTopK when scoring engaged', () => {
  const r = read(uniquePattern('coherence-equals'), { language: 'js' });
  if (r.layers.scored && r.resonance) {
    assert.equal(r.coherence, r.resonance.meanTopK);
  }
});

test('layers tracking is honest about what engaged', () => {
  // With growSubstrate:false the grew layer must be false
  const r = read(uniquePattern('honest-layers'), {
    language: 'js',
    growSubstrate: false,
  });
  assert.equal(r.layers.grew, false);
  // The other layers should still engage
  assert.equal(r.layers.entangled, true);
  assert.equal(r.layers.contributed, true);
});

test('FieldTool with custom agentSource tags its contributions', () => {
  // Two tools with distinct sources should both contribute
  const tool = new FieldTool({ agentSource: 'field-tool:test:custom-source' });
  const r = tool.read(uniquePattern('custom-source'), { language: 'js' });
  assert.equal(r.layers.contributed, true);
  // The field state should reflect that the custom source recorded
  const sources = r.fieldStateAfter && r.fieldStateAfter.sources;
  assert.ok(sources, 'sources should be present');
  assert.ok(
    sources['field-tool:test:custom-source'],
    'custom source must appear in field histogram',
  );
});
