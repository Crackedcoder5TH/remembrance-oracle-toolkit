/**
 * The field-contribution census, tested adversarially (the trap ledger's
 * DO for every census): feed it the shapes it was measured missing on
 * 2026-10-01 and require it to see them —
 *   · another repo's src/ (--root), the wrapper form fieldContribute({…});
 *   · a literal fallback beside a coherency name (`? x.coherency : 0.85`);
 *   · an invented factor on a real reading (`* (ok ? 1 : 0.5)`), via a local;
 *   · a definition — function or class method — is NOT a write site.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'audit-field-contributions.js');

function audit(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fca-'));
  fs.mkdirSync(path.join(root, 'src'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, 'src', name), body);
  const out = execFileSync(process.execPath, [SCRIPT, '--root', root, '--json'], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('--root reaches another repo and the fieldContribute wrapper form', () => {
  const rows = audit({ 'a.js': "fieldContribute({ coherence: reading.coherency, source: 'x' });\n" });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'MEASURED');
});

test('a literal fallback beside a coherency name is not a measurement', () => {
  const rows = audit({ 'a.js': "fieldContribute({ coherence: typeof m.coherency === 'number' ? m.coherency : 0.85, source: 'x' });\n" });
  assert.strictEqual(rows[0].kind, 'SUBSTITUTED');
  assert.match(rows[0].why, /literal beside a coherency/);
});

test('an invented factor on a real reading is caught through the local', () => {
  const rows = audit({
    'a.js': [
      'function f(r, ok) {',
      "  const coh = (typeof r.coherency === 'number' ? r.coherency : 0) * (ok ? 1 : 0.5);",
      "  fieldContribute({ coherence: coh, source: 'x' });",
      '}', '',
    ].join('\n'),
  });
  assert.strictEqual(rows[0].kind, 'SUBSTITUTED');
  assert.match(rows[0].why, /via coh/);
});

test('definitions — function or class method — are not write sites', () => {
  const rows = audit({
    'a.js': [
      'function fieldContribute({ coherence, source } = {}) {',
      '  return coherence;',
      '}',
      'class E {',
      '  contribute({ cost = 1.0, coherence = null } = {}) {',
      '    return coherence;',
      '  }',
      '}', '',
    ].join('\n'),
  });
  assert.strictEqual(rows.length, 0);
});

test('a bare literal is a constant', () => {
  const rows = audit({ 'a.js': "fieldContribute({ coherence: 0.5, source: 'x' });\n" });
  assert.strictEqual(rows[0].kind, 'CONSTANT');
});
