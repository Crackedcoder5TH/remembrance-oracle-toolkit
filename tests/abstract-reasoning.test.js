'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reason,
  findAnalogy,
  buildMetaphor,
  findConceptualBridge,
  detectIdentity,
  DEEP_CONCEPTS,
} = require('../src/core/abstract-reasoning');

test('DEEP_CONCEPTS exposes 5 core concepts each spanning 5 domains', () => {
  assert.equal(Object.keys(DEEP_CONCEPTS).length, 5);
  for (const [conceptId, concept] of Object.entries(DEEP_CONCEPTS)) {
    assert.equal(typeof concept.essence, 'string');
    assert.ok(concept.manifests_as);
    assert.ok(Array.isArray(concept.predictions));
    assert.equal(Object.keys(concept.manifests_as).length, 5,
      `${conceptId} should span 5 domains`);
  }
});

test('findAnalogy returns null for same-domain pairs', () => {
  const a = { name: 'physics/p1', domain: 'physics', tags: [] };
  const b = { name: 'physics/p2', domain: 'physics', tags: [] };
  assert.equal(findAnalogy(a, b, 0.9), null);
});

test('findAnalogy produces statement + transferable properties', () => {
  const a = { name: 'physics/Legendre_P2', domain: 'physics', tags: [] };
  const b = { name: 'markets/NASDAQ',       domain: 'markets', tags: [] };
  const result = findAnalogy(a, b, 0.95);
  assert.ok(result);
  assert.equal(result.level, 'analogy');
  assert.match(result.statement, /is like/);
  assert.deepEqual(result.domains.sort(), ['markets', 'physics']);
  assert.ok(result.deepConcepts.length > 0,
    'should find deep concepts spanning physics + markets');
});

test('findConceptualBridge declares shared essence for related domains', () => {
  const a = { name: 'physics/Legendre_P2', domain: 'physics', tags: [] };
  const b = { name: 'markets/NASDAQ',       domain: 'markets', tags: [] };
  const bridge = findConceptualBridge(a, b, 0.95);
  assert.ok(bridge.essence);
  assert.ok(bridge.universality >= 3,
    'core concepts should span 3+ domains');
});

test('detectIdentity returns null below 0.70 correlation', () => {
  const a = { name: 'physics/p', domain: 'physics', tags: [] };
  const b = { name: 'markets/m', domain: 'markets', tags: [] };
  assert.equal(detectIdentity(a, b, 0.69), null);
});

test('detectIdentity declares Physics IS Markets at 0.95 correlation', () => {
  const a = { name: 'physics/Legendre_P2', domain: 'physics', tags: [] };
  const b = { name: 'markets/NASDAQ',       domain: 'markets', tags: [] };
  const id = detectIdentity(a, b, 0.95);
  assert.ok(id);
  assert.equal(id.level, 'identity');
  assert.match(id.declaration, /Physics IS Markets|Markets IS Physics/);
  assert.ok(Array.isArray(id.reasoning));
  assert.ok(id.reasoning.length >= 5);
});

test('reason() pipeline produces all 4 levels for strong cascade', () => {
  const cascadeMatches = [
    { domain: 'markets/NASDAQ',       correlation: 0.95, type: 'resonant' },
    { domain: 'consciousness/flow',   correlation: 0.85, type: 'resonant' },
    { domain: 'music/harmony',        correlation: 0.55, type: 'resonant' },
    { domain: 'code/architecture',    correlation: 0.42, type: 'weak' },
  ];
  const sourcePattern = { name: 'physics/Legendre_P2', domain: 'physics' };
  const result = reason(cascadeMatches, sourcePattern);

  assert.ok(result.analogies.length > 0,    'should find analogies');
  assert.ok(result.bridges.length > 0,      'should find bridges');
  assert.ok(result.identities.length > 0,   'should find at least one identity');
  assert.ok(result.deepestInsight,          'should pick a deepest insight');
  assert.equal(result.deepestInsight.level, 'identity',
    'deepest insight should be identity-level when corr >= 0.70');
  assert.ok(typeof result.durationMs === 'number');
});

test('reason() skips noise-level correlations', () => {
  const cascadeMatches = [
    { domain: 'markets/m', correlation: 0.05, type: 'noise' },
  ];
  const result = reason(cascadeMatches, { name: 'physics/p', domain: 'physics' });
  assert.equal(result.analogies.length, 0);
  assert.equal(result.bridges.length, 0);
  assert.equal(result.identities.length, 0);
});

test('buildMetaphor produces structured mapping with predictions', () => {
  const correlations = [
    { patternA: 'physics/p1', patternB: 'markets/m1', correlation: 0.85 },
    { patternA: 'physics/p2', patternB: 'markets/m2', correlation: 0.78 },
  ];
  const m = buildMetaphor('physics', 'markets', correlations);
  assert.equal(m.level, 'metaphor');
  assert.match(m.statement, /Markets IS Physics/);
  assert.ok(Array.isArray(m.bridges));
  assert.ok(Array.isArray(m.predictions));
  assert.equal(m.supportingCorrelations, 2);
});
