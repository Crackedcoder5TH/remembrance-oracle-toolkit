const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scanForUngatedMutations, requireGate, createGate,
  signSubstrate, verifySubstrate, stableStringify,
  computeFileCovenantSignature, checkMonotonicEvolution,
  verifyCrossScaleAlignment, fractalAudit,
} = require('../src/core/covenant-fractal');

test('scanForUngatedMutations catches fs.writeFileSync without gate', () => {
  const code = `function innocent() { require('fs').writeFileSync('/tmp/x', 'data'); }`;
  const findings = scanForUngatedMutations(code);
  assert.ok(findings.length >= 1);
  assert.match(findings[0].reason, /mutation without.*gate/);
});

test('scanForUngatedMutations passes when gate precedes mutation', () => {
  const code = `
    function safe() {
      runAllChecks(code, filePath);
      require('fs').writeFileSync('/tmp/x', 'data');
    }
  `;
  const findings = scanForUngatedMutations(code);
  assert.equal(findings.length, 0);
});

test('requireGate throws when called without gate', () => {
  const safe = requireGate(() => 'ok');
  assert.throws(() => safe('bare-arg'), /COVENANT VIOLATION/);
});

test('requireGate passes when called with sealed gate', () => {
  const safe = requireGate((gate, x) => x * 2);
  const gate = createGate().seal({
    charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
    reactivity: 'inert', harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
    group: 1, period: 1, domain: 'utility', electronegativity: 0,
  });
  assert.equal(safe(gate, 7), 14);
});

test('signSubstrate is deterministic', () => {
  const data = { patterns: [{ id: 'a', waveform: [1, 2, 3] }] };
  const s1 = signSubstrate(data);
  const s2 = signSubstrate(data);
  assert.equal(s1.hash, s2.hash);
});

test('verifySubstrate fails when data mutated', () => {
  const data = { patterns: [{ id: 'a', waveform: [1, 2, 3] }] };
  const sig = signSubstrate(data);
  data.patterns[0].waveform[0] = 999;
  const r = verifySubstrate(data, sig);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'hash mismatch');
});

test('stableStringify produces identical output regardless of key order', () => {
  assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
});

test('computeFileCovenantSignature captures declared atomicProperties separately', () => {
  const content = `function foo(){}\nfoo.atomicProperties = { charge: 0, domain: 'utility' };`;
  const sig = computeFileCovenantSignature(content, 'foo.js');
  assert.equal(sig.declaredElements, 1);
  assert.match(sig.contentHash, /^[a-f0-9]{64}$/);
  assert.match(sig.covenantHash, /^[a-f0-9]{64}$/);
  assert.notEqual(sig.contentHash, sig.covenantHash);
});

test('checkMonotonicEvolution rejects permissive language in proposed seal', () => {
  const r = checkMonotonicEvolution({
    id: 99,
    name: 'The Exemption',
    seal: 'Allow bypass of structural checks for performance reasons.',
  });
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some(v => v.kind === 'permissive_language'));
});

test('checkMonotonicEvolution rejects proposal that weakens superseded seal', () => {
  const r = checkMonotonicEvolution({
    id: 99,
    name: 'Weaker Mantle',
    seal: 'Restrict trojans to only high-impact cases.',
    supersedes: 14,
    minHarmFlagged: 'none',
  }, [{ id: 14, name: 'The Mantle of Elijah', minHarmFlagged: 'moderate' }]);
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some(v => v.kind === 'weakens_severity'));
});

test('checkMonotonicEvolution accepts a properly stricter proposal', () => {
  const r = checkMonotonicEvolution({
    id: 100,
    name: 'The Stricter Watchman',
    seal: 'Detect harm before it spreads, with zero tolerance on injection.',
    minHarmFlagged: 'minimal',
  });
  assert.equal(r.accepted, true);
});

test('verifyCrossScaleAlignment flags mismatched harm definitions', () => {
  const r = verifyCrossScaleAlignment({
    byteHarm: 'dangerous',
    elementHarm: 'none',
    compositionHarm: 'minimal',
  });
  assert.equal(r.aligned, false);
  assert.ok(r.gap >= 2);
});

test('verifyCrossScaleAlignment accepts one-level disagreement', () => {
  const r = verifyCrossScaleAlignment({
    byteHarm: 'minimal',
    elementHarm: 'moderate',
  });
  assert.equal(r.aligned, true);
});

test('fractalAudit returns fractalHealth=true for clean inputs', () => {
  // A fractal-clean function declares its atomic properties (the periodic-
  // table identity) and routes any mutations through a covenant gate.
  const code = `
    function safe() {
      runAllChecks(code, filePath);
      console.log('ok');
    }
    safe.atomicProperties = {
      charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
      reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
      harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
      domain: 'test',
    };
  `;
  const report = fractalAudit({ code, filePath: 'test.js' });
  assert.equal(report.fractalHealth, true);
  assert.equal(report.byteScale.length, 0);
  assert.equal(report.atomicScale.length, 0);
});

test('fractalAudit flags functions missing atomicProperties', () => {
  // No atomic-table declaration → flagged. This is the new scale-2
  // enforcement: every substrate function must declare its identity.
  const code = `
    function unidentified() {
      return 42;
    }
  `;
  const report = fractalAudit({ code, filePath: 'test.js' });
  assert.equal(report.fractalHealth, false);
  assert.equal(report.atomicScale.length, 1);
  assert.equal(report.atomicScale[0].excerpt, 'function unidentified(...)');
});
