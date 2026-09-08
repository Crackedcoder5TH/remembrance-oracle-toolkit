'use strict';
/**
 * goggles-instrument — the sections every read carries beside the file.
 *
 * These tests pin the HONESTY rules: absence prints as absence with the verb
 * that fills it; ages are stated; the coin/gate/denial lines say exactly what
 * the working tree and the lock say. Nothing here measures.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const gi = require('../src/tools/goggles-instrument');

test('age() states minutes, hours, days — and never invents one for a bad stamp', () => {
  assert.strictEqual(gi.age(new Date(Date.now() - 5 * 60000).toISOString()), '5m ago');
  assert.strictEqual(gi.age(new Date(Date.now() - 3 * 3600000).toISOString()), '3h ago');
  assert.strictEqual(gi.age(new Date(Date.now() - 5 * 86400000).toISOString()), '5d ago');
  assert.strictEqual(gi.age('not a date'), 'unknown age');
});

test('gateLockState recomputes every locked gate against the lock (no gate required)', () => {
  const g = gi.gateLockState();
  assert.ok(typeof g.ok === 'boolean');
  if (g.gates) {
    assert.ok(g.gates >= 18, 'the gate family is at least the 18 first locked');
    assert.ok(Array.isArray(g.drift));
  }
});

test('wallLines: a repo without a coin ledger reads pre-epoch; a modified file reads unminted', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q', '.'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git('add', 'a.txt'); git('commit', '-q', '--no-verify', '-m', 'no coin');
  let lines = gi.wallLines(repo, 'a.txt').join('\n');
  assert.match(lines, /carries NO coin — pre-epoch/);
  assert.match(lines, /unchanged since HEAD/);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'two\n');
  lines = gi.wallLines(repo, 'a.txt').join('\n');
  assert.match(lines, /MODIFIED since HEAD — unminted until: git add → goggles --do mint/);
  assert.match(lines, /gates\s+/);
  assert.match(lines, /denials\s+\d+ refused bypass/);
});

test('resonanceFieldLines / contractsLines print absence as absence, with the verb', () => {
  // Point at an empty Void so the cached summaries are absent.
  const saved = process.env.VOID_ROOT;
  process.env.VOID_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-void-'));
  try {
    delete require.cache[require.resolve('../src/tools/goggles-instrument')];
    const fresh = require('../src/tools/goggles-instrument');
    assert.match(fresh.resonanceFieldLines().join('\n'), /not computed on this host — goggles --do resonance/);
    assert.match(fresh.contractsLines().join('\n'), /never run on this host — goggles --do contracts/);
  } finally {
    if (saved === undefined) delete process.env.VOID_ROOT; else process.env.VOID_ROOT = saved;
    delete require.cache[require.resolve('../src/tools/goggles-instrument')];
  }
});

test('instrumentLines never throws: every section is best-effort and named when unavailable', () => {
  const lines = gi.instrumentLines({ root: null, project: '', rel: 'nowhere.js' });
  assert.ok(Array.isArray(lines) && lines.length > 0);
  const text = lines.join('\n');
  for (const s of ['STATE', 'RESONANCE FIELD', 'CONTRACTS', 'WALL']) assert.match(text, new RegExp(s));
});
