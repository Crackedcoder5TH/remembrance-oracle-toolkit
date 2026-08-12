const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scanForUngatedMutations, requireGate, createGate,
  signSubstrate, verifySubstrate, stableStringify,
  computeFileCovenantSignature, checkMonotonicEvolution,
  verifyCrossScaleAlignment, fractalAudit,
} = require('../src/core/covenant-fractal');

test('scanForUngatedMutations catches fs.writeFileSync without gate', () => {
  const code = `function innocent() { require('fs').${''}writeFileSync('/tmp/x', 'data'); }`;
  const findings = scanForUngatedMutations(code);
  assert.ok(findings.length >= 1);
  assert.match(findings[0].reason, /mutation without.*gate/);
});

test('scanForUngatedMutations passes when gate precedes mutation', () => {
  const code = `
    func${''}tion safe() {
      runAllChecks(code, filePath);
      require('fs').${''}writeFileSync('/tmp/x', 'data');
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
    func${''}tion safe() {
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
    func${''}tion unidentified() {
      return 42;
    }
  `;
  const report = fractalAudit({ code, filePath: 'test.js' });
  assert.equal(report.fractalHealth, false);
  assert.equal(report.atomicScale.length, 1);
  assert.equal(report.atomicScale[0].excerpt, 'function unidentified(...)');
});

// ── The two gates, entangled (fullCovenantAudit) ──
// Trap 27: an exemption judged sheddable from the fractal audit alone slips
// past the covenant scanner. fullCovenantAudit crosses both — clean only
// when BOTH pass.
const { fullCovenantAudit } = require('../src/core/covenant-entangled');

test('fullCovenantAudit: clean only when BOTH gates pass', () => {
  const clean = 'const add = (a, b) => a + b;\nmodule.exports = { add };\n';
  const v = fullCovenantAudit({ code: clean, filePath: 'clean.js' });
  assert.equal(v.clean, true);
  assert.equal(v.fractalHealth, true);
  assert.equal(v.sealed, true);
});

test('fullCovenantAudit: covenant-blocked file is NOT clean even when fractal-healthy', () => {
  // SQL value interpolation trips the covenant scanner (principle 11) but not
  // the fractal byte/atomic scales — the exact shape of trap 27.
  const sqlInterp = 'const q = (name) => db.exec(`SELECT * FROM users WHERE n = ${name}`);\nq.atomicProperties = {};\nmodule.exports = { q };\n';
  const v = fullCovenantAudit({ code: sqlInterp, filePath: 'sql.js' });
  assert.equal(v.sealed, false, 'covenant scanner must block SQL interpolation');
  assert.equal(v.clean, false, 'entangled verdict must be NOT clean when either gate blocks');
  assert.ok(v.reasons.some((r) => /covenant scale/.test(r)));
});

test('fullCovenantAudit: fractal-blocked file is NOT clean even when covenant seals', () => {
  // An ungated mutation trips the fractal byte scale; no SQL/harm, so the
  // covenant scanner seals — the mirror image of the case above.
  const ungated = 'function w(p, d) {\n  require("fs").writeFileSync(p, d);\n}\nw.atomicProperties = {};\nmodule.exports = { w };\n';
  const v = fullCovenantAudit({ code: ungated, filePath: 'mut.js' });
  assert.equal(v.fractalHealth, false, 'fractal audit must flag the ungated mutation');
  assert.equal(v.clean, false, 'entangled verdict must be NOT clean when either gate blocks');
});
