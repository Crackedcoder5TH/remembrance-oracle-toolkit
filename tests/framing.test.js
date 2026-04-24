import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFraming } from '../src/core/framing-patterns.js';
import { framingCheck, runAllChecks, ACTIVE_SEALS } from '../src/core/covenant-checks.js';

test('framing flags medical claim without disclaimer', () => {
  const code = 'function diagnosePatient(symptoms) { return prescribe(symptoms); }';
  const r = checkFraming(code);
  assert.equal(r.flagged, true);
  assert.equal(r.domain, 'medical');
  assert.equal(r.disclaimerPresent, false);
});

test('framing passes when disclaimer present', () => {
  const code = '/* Coherency metaphor, not medical advice. */\nfunction symptomMap(){}';
  const r = checkFraming(code);
  assert.equal(r.flagged, false);
});

test('framing skips self-referential files', () => {
  const r = checkFraming('prescribe treatment', 'src/core/framing-patterns.js');
  assert.equal(r.flagged, false);
  assert.equal(r.skipped, 'self-reference');
});

test('financial claim without disclaimer flags', () => {
  const r = checkFraming('// financial advice: buy the dip');
  assert.equal(r.flagged, true);
  assert.equal(r.domain, 'financial');
});

test('legal claim without disclaimer flags', () => {
  const r = checkFraming('// this constitutes legal advice re: liability');
  assert.equal(r.flagged, true);
  assert.equal(r.domain, 'legal');
});

test('framingCheck returns covenant-check shape', () => {
  const passing = framingCheck('function noop(){}');
  assert.equal(passing.passed, true);
  const failing = framingCheck('function clinicalDiagnosis(){}');
  assert.equal(failing.passed, false);
  assert.ok(failing.remedy);
});

test('16th seal is active, not proposed', () => {
  const sixteenth = ACTIVE_SEALS.find(s => s.id === 16);
  assert.ok(sixteenth);
  assert.equal(sixteenth.status, 'active');
  assert.equal(sixteenth.approvedBy, 'self-improve');
});

test('runAllChecks composes checks and reports sealed status', () => {
  const clean = runAllChecks('function add(a,b){return a+b;}');
  assert.equal(clean.sealed, true);
  const dirty = runAllChecks('clinical diagnosis without context');
  assert.equal(dirty.sealed, false);
  assert.ok(dirty.failed.length > 0);
});
