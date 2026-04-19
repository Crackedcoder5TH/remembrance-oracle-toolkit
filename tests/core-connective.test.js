'use strict';

/**
 * Tests for the connective-tissue modules that close the remaining
 * audit roadmap fractures:
 *
 *   F — src/reflector/bridge.js              (envelope-powered Reflector)
 *   G — library.findByRuleId / findByTag     (secondary indexes)
 *   H — src/audit/prior-promoter.js          (substrate → prior loop)
 *   J — src/core/history.js                  (unified timeline)
 *
 * I (hook expansion) is exercised by the existing hooks.test.js suite
 * via the installHooks / prePushScript code paths. We don't re-drive
 * real git hooks here.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── F: Reflector bridge ────────────────────────────────────────────────────

describe('reflector bridge', () => {
  const bridge = require('../src/reflector/bridge');

  it('reflectorAnalyze returns a full envelope', () => {
    const env = bridge.reflectorAnalyze('function f(a) { return a.sort(); }', 'x.js');
    assert.ok(env.audit);
    assert.ok(env.audit.findings.length > 0);
    assert.equal(env.language, 'javascript');
  });

  it('reflectorScore matches the legacy dimension shape', () => {
    const r = bridge.reflectorScore('const x = 1;', 'x.js');
    assert.equal(typeof r.score, 'number');
    assert.ok(r.dimensions);
    assert.ok(r.findings);
    assert.ok(Array.isArray(r.findings.audit));
    assert.ok(Array.isArray(r.findings.covenant));
  });

  it('reflectorScanDirectory returns one envelope per matching file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refl-scan-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.js'), 'function a() { return 1; }');
      fs.writeFileSync(path.join(dir, 'b.js'), 'function b() { return 2; }');
      fs.writeFileSync(path.join(dir, 'notes.md'), '# README');
      const envs = bridge.reflectorScanDirectory(dir);
      assert.equal(envs.length, 2); // md file skipped by extension filter
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reflectorReport aggregates envelope signals into the legacy shape', () => {
    const envs = [
      bridge.reflectorAnalyze('const x = 1;', 'a.js'),
      bridge.reflectorAnalyze('const y = 2;', 'b.js'),
    ];
    const report = bridge.reflectorReport(envs);
    assert.equal(report.files.length, 2);
    assert.ok(report.aggregate);
    assert.equal(typeof report.aggregate.avgCoherence, 'number');
  });

  it('reflectorHeal wraps the unified pipeline', async () => {
    const r = await bridge.reflectorHeal('function f(a) { return a.sort(); }', { filePath: 'x.js' });
    assert.equal(r.success, true);
    assert.equal(r.level, 'confident');
  });
});

// ─── G: Pattern library indexes ────────────────────────────────────────────

describe('pattern library secondary indexes', () => {
  const { PatternLibrary } = require('../src/patterns/library');
  let dir, lib;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-idx-'));
    lib = new PatternLibrary(dir);
  });
  after(() => {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('findByRuleId reads the rule: tag convention', () => {
    lib.register({
      name: 'safe-sort',
      code: 'function f(a) { return [...a].sort(); }',
      language: 'javascript',
      tags: ['immutable', 'rule:state-mutation/sort'],
    });
    const matches = lib.findByRuleId('state-mutation/sort');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, 'safe-sort');
  });

  it('findByTag is case-insensitive', () => {
    lib.register({
      name: 'guarded',
      code: 'function f(a,b) { return b ? a/b : 0; }',
      language: 'javascript',
      tags: ['Safe-Math'],
    });
    assert.equal(lib.findByTag('safe-math').length, 1);
    assert.equal(lib.findByTag('SAFE-MATH').length, 1);
  });

  it('listTags returns counts sorted descending', () => {
    lib.register({ name: 'a', code: 'const a=1;', language: 'javascript', tags: ['x', 'y'] });
    lib.register({ name: 'b', code: 'const b=2;', language: 'javascript', tags: ['x'] });
    const tags = lib.listTags();
    assert.ok(tags[0].count >= tags[tags.length - 1].count);
    const xEntry = tags.find(t => t.tag === 'x');
    assert.equal(xEntry.count, 2);
  });

  it('invalidates indexes on register so new tags are visible immediately', () => {
    lib.register({ name: 'a', code: 'const a=1;', language: 'javascript', tags: ['first'] });
    assert.equal(lib.findByTag('first').length, 1);
    assert.equal(lib.findByTag('second').length, 0);
    lib.register({ name: 'b', code: 'const b=2;', language: 'javascript', tags: ['second'] });
    assert.equal(lib.findByTag('second').length, 1);
  });
});

// ─── H: Substrate → prior promoter ─────────────────────────────────────────

describe('bayesian prior promoter', () => {
  const { promoteFromSubstrate } = require('../src/audit/prior-promoter');

  it('ignores patterns below the amplitude threshold', () => {
    const oracle = {
      debug: {
        getAll: () => [
          { name: 'weak', amplitude: 0.3, badCode: 'x + 1' },
        ],
      },
    };
    const r = promoteFromSubstrate(oracle, { dryRun: true, amplitudeThreshold: 0.7 });
    assert.equal(r.promoted, 0);
  });

  it('promotes high-amplitude patterns and caps via maxPromote', () => {
    const oracle = {
      debug: {
        getAll: () => [
          { name: 'a', amplitude: 0.95, badCode: 'function a() { return null.x; }' },
          { name: 'b', amplitude: 0.85, badCode: 'function b() { return null.y; }' },
          { name: 'c', amplitude: 0.75, badCode: 'function c() { return null.z; }' },
        ],
      },
    };
    const r = promoteFromSubstrate(oracle, { dryRun: true, maxPromote: 2, amplitudeThreshold: 0.7 });
    assert.equal(r.promoted, 2);
    assert.equal(r.entries.length, 2);
    // Highest-amplitude first
    assert.equal(r.entries[0].name, 'a');
  });

  it('gracefully handles absent debug oracle', () => {
    const r = promoteFromSubstrate({}, { dryRun: true });
    assert.equal(r.considered, 0);
  });

  it('skips patterns with too-short sample code', () => {
    const oracle = {
      debug: {
        getAll: () => [
          { name: 'tiny', amplitude: 0.9, badCode: 'x' },
        ],
      },
    };
    const r = promoteFromSubstrate(oracle, { dryRun: true });
    assert.equal(r.promoted, 0);
    assert.equal(r.skipped, 1);
  });
});

// ─── J: Unified history ────────────────────────────────────────────────────

describe('unified history', () => {
  const { wireHistory, readHistory, summarizeHistory } = require('../src/core/history');
  const { resetEventBus, getEventBus } = require('../src/core/events');
  let tmp;

  beforeEach(() => {
    resetEventBus();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-hist-'));
  });
  after(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('captures events emitted on the bus after wireHistory', () => {
    wireHistory(tmp);
    const bus = getEventBus();
    bus.emitSync('audit.finding', { ruleId: 'type/div', file: 'a.js' });
    bus.emitSync('heal.succeeded', { level: 'confident' });

    const all = readHistory(tmp);
    assert.ok(all.length >= 2);
    const types = all.map(e => e.type);
    assert.ok(types.includes('audit.finding'));
    assert.ok(types.includes('heal.succeeded'));
  });

  it('filters by type', () => {
    wireHistory(tmp);
    const bus = getEventBus();
    bus.emitSync('audit.finding', { ruleId: 'a' });
    bus.emitSync('heal.succeeded', { level: 'serf' });
    bus.emitSync('feedback.fix', { ruleId: 'b' });

    const onlyHeal = readHistory(tmp, { type: 'heal.succeeded' });
    assert.equal(onlyHeal.length, 1);
    assert.equal(onlyHeal[0].type, 'heal.succeeded');
  });

  it('filters by type prefix', () => {
    wireHistory(tmp);
    const bus = getEventBus();
    bus.emitSync('heal.attempt', { level: 'confident' });
    bus.emitSync('heal.succeeded', { level: 'confident' });
    bus.emitSync('audit.finding', { ruleId: 'x' });

    const healEvents = readHistory(tmp, { typePrefix: 'heal.' });
    assert.equal(healEvents.length, 2);
    for (const e of healEvents) assert.ok(e.type.startsWith('heal.'));
  });

  it('summarizes events by type', () => {
    wireHistory(tmp);
    const bus = getEventBus();
    bus.emitSync('audit.finding', { ruleId: 'x' });
    bus.emitSync('audit.finding', { ruleId: 'y' });
    bus.emitSync('heal.succeeded', { level: 'confident' });

    const s = summarizeHistory(tmp, { since: '2000-01-01' });
    assert.equal(s.byType['audit.finding'], 2);
    assert.equal(s.byType['heal.succeeded'], 1);
  });

  it('is idempotent — wiring twice does not duplicate entries', () => {
    wireHistory(tmp);
    wireHistory(tmp);
    const bus = getEventBus();
    bus.emitSync('audit.finding', { ruleId: 'single' });
    const all = readHistory(tmp);
    const singles = all.filter(e => e.payload && e.payload.ruleId === 'single');
    assert.equal(singles.length, 1);
  });
});
