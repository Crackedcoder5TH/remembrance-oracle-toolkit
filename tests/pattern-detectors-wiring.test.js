'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state

/**
 * pattern-detectors-wiring.test.js — the ten audit-pattern detectors must
 * be reachable THROUGH the engine (auditCode), not merely importable.
 *
 * Every detector under src/patterns/audit-patterns/ was implemented and
 * unit-tested yet had zero callers (trap #24 — the unwired-capability
 * species; updateVoterReputation was the first specimen). Unit tests
 * proved the pieces; this proves the path. If the bridge is ever
 * unplugged, this fails — a capability is only real when a consumer
 * reaches it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { auditCode } = require('../src/audit/ast-checkers');

const SHELL_SAMPLE = [
  "const cp = require('child_process');",
  'function go(userInput) {',
  '  cp.execSync(`ls ${userInput}`);',
  '}',
].join('\n');

const FALSY_SAMPLE = [
  'function pick(count) {',
  '  const n = count || 0;',
  '  return n;',
  '}',
].join('\n');

test('shell-injection detector fires through the engine by default', () => {
  const out = auditCode(SHELL_SAMPLE);
  const hits = out.findings.filter((f) => f.ruleId === 'pattern/shell-injection-detection');
  assert.ok(hits.length >= 1, 'the wired detector must surface through auditCode');
  assert.equal(hits[0].bugClass, 'security');
  assert.equal(hits[0].severity, 'high');
  assert.ok(hits[0].line >= 1);
});

test('advisory-tier detectors stay silent unless opted in', () => {
  const quiet = auditCode(FALSY_SAMPLE);
  assert.equal(
    quiet.findings.filter((f) => f.ruleId === 'pattern/falsy-zero-coercion').length, 0,
    'advisory detectors must not fire by default — measured 558/582 of the noise');
  const loud = auditCode(FALSY_SAMPLE, { advisoryPatterns: true });
  assert.ok(
    loud.findings.filter((f) => f.ruleId === 'pattern/falsy-zero-coercion').length >= 1,
    'advisory detectors must fire when opted in');
});

test('bugClasses filter governs the bridged detectors too', () => {
  const out = auditCode(SHELL_SAMPLE, { bugClasses: 'edge-case' });
  assert.equal(
    out.findings.filter((f) => f.ruleId && f.ruleId.startsWith('pattern/') && f.bugClass === 'security').length, 0,
    'a security detector must respect a non-security bugClasses filter');
});
