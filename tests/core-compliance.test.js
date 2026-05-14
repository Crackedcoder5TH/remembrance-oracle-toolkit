'use strict';

/**
 * Tests for the session compliance ledger + commit gate.
 *
 * Coverage:
 *   - startSession / getCurrentSession / endSession lifecycle
 *   - recordEvent for every ledger-tracked event kind
 *   - scoreCompliance math across all five checks
 *   - checkCommitAllowed with and without ORACLE_WORKFLOW=enforce
 *   - Bypass protocol drops a file from the violations list
 *   - wireCompliance subscribes to the event bus and records everything
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  startSession, endSession, getCurrentSession, saveSession,
  recordEvent, scoreCompliance, checkCommitAllowed,
  wireCompliance, resetCompliance,
} = require('../src/core/compliance');
const { resetEventBus, getEventBus } = require('../src/core/events');

describe('compliance: lifecycle', () => {
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetCompliance();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-'));
  });
  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.ORACLE_WORKFLOW;
  });

  it('startSession creates a session and persists it', () => {
    const s = startSession(tmp);
    assert.ok(s.id);
    assert.ok(s.startedAt);
    assert.equal(s.endedAt, null);
    assert.deepEqual(s.filesWritten, []);
    // Reload from disk
    const s2 = getCurrentSession(tmp);
    assert.equal(s2.id, s.id);
  });

  it('startSession is idempotent — re-calling returns the open session', () => {
    const s1 = startSession(tmp);
    const s2 = startSession(tmp);
    assert.equal(s1.id, s2.id);
  });

  it('endSession closes the session and leaves it queryable', () => {
    startSession(tmp);
    const ended = endSession(tmp);
    assert.ok(ended.endedAt);
    assert.equal(ended.sessionEndCalled, true);
  });
});

describe('compliance: scoring', () => {
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetCompliance();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-'));
  });
  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('empty session is partial (no hooks, no end sweep yet)', () => {
    const s = startSession(tmp);
    const score = scoreCompliance(s);
    assert.ok(score.score < 1.0);
    assert.ok(score.violations.some(v => v.check === 'hooksInstalled'));
    assert.ok(score.violations.some(v => v.check === 'sessionEndCalled'));
  });

  it('write without search drops queryBeforeWrite + auditOnWrite', () => {
    const s = startSession(tmp);
    recordEvent(s, 'write', { file: 'foo.js' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(score.violations.some(v => v.check === 'queryBeforeWrite'));
    assert.ok(score.violations.some(v => v.check === 'auditOnWrite'));
  });

  it('search + audit + hooks + end = full compliance', () => {
    const s = startSession(tmp);
    recordEvent(s, 'hooks.installed', {});
    recordEvent(s, 'search', { file: 'foo.js' });
    recordEvent(s, 'write', { file: 'foo.js' });
    recordEvent(s, 'audit', { file: 'foo.js' });
    recordEvent(s, 'session.end', {});
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.equal(score.score, 1.0);
    assert.equal(score.status, 'compliant');
    assert.equal(score.violations.length, 0);
  });

  it('pulled pattern without feedback drops feedbackLoop', () => {
    const s = startSession(tmp);
    recordEvent(s, 'hooks.installed', {});
    recordEvent(s, 'pattern.pulled', { id: 'pat-1', file: 'foo.js' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(score.violations.some(v => v.check === 'feedbackLoop'));
  });

  it('feedback event resolves the feedbackLoop violation', () => {
    const s = startSession(tmp);
    recordEvent(s, 'pattern.pulled', { id: 'pat-1', file: 'foo.js' });
    recordEvent(s, 'pattern.feedback', { id: 'pat-1' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(!score.violations.some(v => v.check === 'feedbackLoop'));
  });

  it('bypass removes a file from the violations list', () => {
    const s = startSession(tmp);
    recordEvent(s, 'write', { file: 'new.js' });
    recordEvent(s, 'bypass', { reason: 'bootstrapping', files: ['new.js'] });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    // queryBeforeWrite should NOT flag new.js because it's bypassed
    const qbw = score.violations.find(v => v.check === 'queryBeforeWrite');
    assert.ok(!qbw, 'bypassed file should not be flagged');
  });
});

describe('compliance: commit gate', () => {
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetCompliance();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-'));
  });
  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.ORACLE_WORKFLOW;
  });

  it('allows when not enforced', () => {
    const s = startSession(tmp);
    recordEvent(s, 'write', { file: 'foo.js' });
    saveSession(s, tmp);
    delete process.env.ORACLE_WORKFLOW;
    const r = checkCommitAllowed(tmp, ['foo.js']);
    assert.equal(r.allowed, true);
    assert.ok(r.stagedViolations.length > 0); // still reports them
  });

  it('blocks when enforced and file was written without search', () => {
    const s = startSession(tmp);
    recordEvent(s, 'write', { file: 'foo.js' });
    saveSession(s, tmp);
    process.env.ORACLE_WORKFLOW = 'enforce';
    const r = checkCommitAllowed(tmp, ['foo.js']);
    assert.equal(r.allowed, false);
    assert.ok(r.stagedViolations.length > 0);
  });

  it('allows when enforced and search was recorded', () => {
    const s = startSession(tmp);
    recordEvent(s, 'search', { file: 'foo.js' });
    recordEvent(s, 'write', { file: 'foo.js' });
    saveSession(s, tmp);
    process.env.ORACLE_WORKFLOW = 'enforce';
    const r = checkCommitAllowed(tmp, ['foo.js']);
    assert.equal(r.allowed, true);
  });

  it('allows when enforced and file is bypassed', () => {
    const s = startSession(tmp);
    recordEvent(s, 'write', { file: 'foo.js' });
    recordEvent(s, 'bypass', { reason: 'test', files: ['foo.js'] });
    saveSession(s, tmp);
    process.env.ORACLE_WORKFLOW = 'enforce';
    const r = checkCommitAllowed(tmp, ['foo.js']);
    assert.equal(r.allowed, true);
  });

  it('reports no-session as not allowed', () => {
    process.env.ORACLE_WORKFLOW = 'enforce';
    const r = checkCommitAllowed(tmp, ['foo.js']);
    assert.equal(r.allowed, false);
    assert.match(r.reason || '', /no active session/);
  });
});

describe('compliance: event bus wiring', () => {
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetCompliance();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-'));
  });
  afterEach(() => {
    resetCompliance();
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('wireCompliance captures search events from the bus', () => {
    wireCompliance(tmp);
    const bus = getEventBus();
    bus.emitSync('search', { file: 'foo.js', term: 'divisor guard' });
    const s = getCurrentSession(tmp);
    assert.ok(s);
    assert.ok(s.filesSearched.includes('foo.js'));
  });

  it('wireCompliance captures write and audit events', () => {
    wireCompliance(tmp);
    const bus = getEventBus();
    bus.emitSync('write', { file: 'foo.js' });
    bus.emitSync('audit.file-scanned', { file: 'foo.js' });
    const s = getCurrentSession(tmp);
    assert.ok(s.filesWritten.includes('foo.js'));
    assert.ok(s.filesAudited.includes('foo.js'));
  });

  it('wireCompliance captures hooks.installed', () => {
    wireCompliance(tmp);
    const bus = getEventBus();
    bus.emitSync('hooks.installed', {});
    const s = getCurrentSession(tmp);
    assert.equal(s.hooksInstalled, true);
  });

  it('wireCompliance is idempotent', () => {
    wireCompliance(tmp);
    wireCompliance(tmp);
    const bus = getEventBus();
    bus.emitSync('search', { file: 'foo.js' });
    const s = getCurrentSession(tmp);
    // File should appear exactly once
    const count = s.filesSearched.filter(f => f === 'foo.js').length;
    assert.equal(count, 1);
  });
});
