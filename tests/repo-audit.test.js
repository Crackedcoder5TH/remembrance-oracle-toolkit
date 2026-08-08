'use strict';
const { rmFixture, writeFixture } = require('./helpers');

/**
 * repo-audit.test.js — the audit-by-URL/path surface behind the
 * remembrance-audit CLI and the oracle_audit_repo MCP tool.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { auditRepo, formatReport } = require('../src/audit/repo-audit');

const fixtureRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-audit-fixture-'));
  fs.mkdirSync(path.join(dir, 'src'));
  writeFixture(path.join(dir, 'src', 'metrics.js'),
    'function averageLatency(samples, window) {\n'
    + '  const rate = samples.length / window\n'
    + '  return rate\n'
    + '}\nmodule.exports = { averageLatency };\n');
  writeFixture(path.join(dir, 'src', 'clean.js'),
    'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n');
  writeFixture(path.join(dir, 'README.md'), '# fixture\n\nA tiny audit fixture repo.\n');
  return dir;
};

test('auditRepo on a local path: map + checker findings + confidentiality', () => {
  const dir = fixtureRepo();
  try {
    const r = auditRepo(dir, { maxCheckerFiles: 10 });
    assert.equal(r.ok, true);
    assert.ok(r.audited.files >= 1, 'mapped at least one file');
    assert.ok(r.audited.checkerFiles >= 2, 'both JS files went through the checkers');
    const div = r.correctness.findings.find((f) => f.bugClass === 'type' && f.file.endsWith('metrics.js'));
    assert.ok(div, 'the seeded unguarded division is found');
    assert.equal(div.line, 2);
    assert.ok(div.fix, 'finding carries a fix suggestion');
    assert.match(r.confidentiality, /did not grow the substrate/);
    // Distribution, not an average — the audit reports median/min/max, every
    // one of which is a reading some file in the target actually measured.
    // meanCoherence was removed: no file has it and the compressor never
    // produced it.
    assert.equal(r.structure.meanCoherence, undefined, 'no mean is reported');
    assert.ok(Number.isFinite(r.structure.medianCoherence));
    assert.ok(Number.isFinite(r.structure.minCoherence));
    assert.ok(Number.isFinite(r.structure.maxCoherence));
    assert.ok(r.structure.minCoherence <= r.structure.medianCoherence);
    assert.ok(r.structure.medianCoherence <= r.structure.maxCoherence);
  } finally {
    rmFixture(dir, { recursive: true, force: true });
  }
});

test('auditRepo on a missing target reports honestly', () => {
  const r = auditRepo('/no/such/dir/exists/here');
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/);
});

test('formatReport renders both outcomes', () => {
  const dir = fixtureRepo();
  try {
    const good = formatReport(auditRepo(dir, { maxCheckerFiles: 10 }));
    assert.match(good, /REMEMBRANCE AUDIT/);
    assert.match(good, /correctness:/);
    assert.match(good, /did not grow the substrate/);
    const bad = formatReport({ ok: false, error: 'x' });
    assert.match(bad, /audit failed/);
  } finally {
    rmFixture(dir, { recursive: true, force: true });
  }
});

test('auditRepo refuses dangerous clone transports (argument-injection / RCE guard)', () => {
  const attacks = [
    'ext::sh -c touch /tmp/pwned',
    '--upload-pack=touch /tmp/pwned',
    'file:///etc/passwd',
    'fd::17/foo',
    '-oProxyCommand=evil',
  ];
  for (const a of attacks) {
    const r = auditRepo(a, {});
    assert.equal(r.ok, false, `must refuse: ${a}`);
    assert.match(r.error, /refused|not found|not an allowed/, `clean refusal for: ${a}`);
  }
});

test('auditRepo returns a clean error (never throws) on an unreachable clone', () => {
  const r = auditRepo('https://example.invalid/nope.git', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /clone failed/);
});
