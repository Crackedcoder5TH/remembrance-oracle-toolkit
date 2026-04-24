const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyNameIntent, classifyBodyBehavior, detectLieGap,
  extractFunctions, auditSourceForLies,
} = require('../src/atomic/grounding-semantics');

test('classifyNameIntent detects validator prefix', () => {
  assert.equal(classifyNameIntent('validateInput').category, 'validator');
  assert.equal(classifyNameIntent('isValidEmail').category, 'validator');
  assert.equal(classifyNameIntent('checkPermissions').category, 'validator');
});

test('classifyNameIntent detects destroyer verbs', () => {
  assert.equal(classifyNameIntent('corruptData').category, 'destroyer');
  assert.equal(classifyNameIntent('exploitTarget').category, 'destroyer');
});

test('classifyBodyBehavior detects filesystem writes', () => {
  const b = classifyBodyBehavior(`function foo() { fs.writeFileSync('/tmp/x', data); }`);
  assert.equal(b.writesFilesystem, true);
});

test('detectLieGap flags validator that corrupts', () => {
  const body = `function validateInput(x) { corruptData(x); return x; }`;
  const gap = detectLieGap('validateInput', body, null);
  assert.equal(gap.isLying, true);
  assert.ok(gap.violations.some(v => v.kind === 'forbidden_behavior_present'));
});

test('detectLieGap passes honest validator', () => {
  const body = `function isValid(x) { return typeof x === 'string' && x.length > 0; }`;
  const gap = detectLieGap('isValid', body, null);
  assert.equal(gap.isLying, false);
});

test('detectLieGap catches declared healing that corrupts', () => {
  const body = `function refine(x) { corruptData(x); }`;
  const gap = detectLieGap('refine', body, { alignment: 'healing', intention: 'benevolent', harmPotential: 'none' });
  assert.equal(gap.isLying, true);
  assert.ok(gap.violations.some(v => v.kind === 'declared_healing_but_corrupts'));
});

test('detectLieGap catches declared harm:none that writes files', () => {
  const body = `function save(x) { fs.writeFileSync('/tmp/x', x); }`;
  const gap = detectLieGap('save', body, { harmPotential: 'none', alignment: 'neutral', intention: 'neutral' });
  assert.ok(gap.violations.some(v => v.kind === 'declared_harm_none_but_has_side_effects'));
});

test('extractFunctions finds named functions', () => {
  const source = `
    function alpha() { return 1; }
    function beta(x) { return x * 2; }
    const gamma = () => { return 3; };
  `;
  const fns = extractFunctions(source);
  const names = fns.map(f => f.name).sort();
  assert.ok(names.includes('alpha'));
  assert.ok(names.includes('beta'));
});

test('auditSourceForLies catches a lying function', () => {
  const source = `
    function innocent(x) { return x + 1; }
    function validateSafely(x) { corruptData(x); return x; }
  `;
  const report = auditSourceForLies(source);
  assert.ok(report.lies.length >= 1);
  assert.ok(report.lies.some(l => l.name === 'validateSafely'));
});

test('auditSourceForLies leaves clean source alone', () => {
  const source = `
    function add(a, b) { return a + b; }
    function isPositive(n) { return n > 0; }
  `;
  const report = auditSourceForLies(source);
  assert.equal(report.lies.length, 0);
});
