'use strict';

/**
 * Tests for the cross-subsystem event reactions.
 *
 * We construct minimal oracle stand-ins (just the methods each reaction
 * calls) and verify that a single bus emit fans out to every reaction
 * target without throwing or holding up the emit path.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getEventBus, resetEventBus, EVENTS } = require('../src/core/events');
const { wireReactions, resetReactions } = require('../src/core/reactions');

describe('core/reactions: cross-subsystem event fan-out', () => {
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetReactions();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-react-'));
  });
  afterEach(() => {
    resetReactions();
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('feedback.fix updates the audit calibration store', () => {
    const oracle = { patterns: {}, debug: null };
    wireReactions(oracle, { storageRoot: tmp });
    const bus = getEventBus();
    bus.emitSync(EVENTS.FEEDBACK_FIX, { ruleId: 'type/division-by-zero' });

    const { summarizeStore } = require('../src/audit/feedback');
    const summary = summarizeStore(tmp);
    const rule = summary.rules.find(r => r.ruleId === 'type/division-by-zero');
    assert.ok(rule, 'rule should be recorded');
    assert.equal(rule.fixed, 1);
  });

  it('feedback.dismiss updates calibration with the dismiss counter', () => {
    const oracle = { patterns: {}, debug: null };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.FEEDBACK_DISMISS, { ruleId: 'state-mutation/sort' });

    const { summarizeStore } = require('../src/audit/feedback');
    const rule = summarizeStore(tmp).rules.find(r => r.ruleId === 'state-mutation/sort');
    assert.ok(rule);
    assert.equal(rule.dismissed, 1);
  });

  it('feedback.fix with patternId calls library.recordUsage(id, true)', () => {
    let seen = null;
    const oracle = {
      patterns: {
        recordUsage: (id, success) => { seen = { id, success }; return { id }; },
      },
    };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.FEEDBACK_FIX, { ruleId: 'any', patternId: 'pat-123' });
    assert.deepEqual(seen, { id: 'pat-123', success: true });
  });

  it('feedback.dismiss with patternId calls library.recordUsage(id, false)', () => {
    let seen = null;
    const oracle = {
      patterns: {
        recordUsage: (id, success) => { seen = { id, success }; return { id }; },
      },
    };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.FEEDBACK_DISMISS, { ruleId: 'any', patternId: 'pat-123' });
    assert.deepEqual(seen, { id: 'pat-123', success: false });
  });

  it('heal.succeeded at level=generate increments pattern usage', () => {
    let seen = null;
    const oracle = {
      patterns: {
        recordUsage: (id, success) => { seen = { id, success }; return { id }; },
      },
    };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.HEAL_SUCCEEDED, { level: 'generate', patternId: 'lib-42' });
    assert.deepEqual(seen, { id: 'lib-42', success: true });
  });

  it('heal.succeeded at level=confident implicitly fixes the rule', () => {
    const oracle = { patterns: {} };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.HEAL_SUCCEEDED, { level: 'confident', rule: 'type/division-by-zero' });
    const { summarizeStore } = require('../src/audit/feedback');
    const rule = summarizeStore(tmp).rules.find(r => r.ruleId === 'type/division-by-zero');
    assert.ok(rule);
    assert.equal(rule.fixed, 1);
  });

  it('audit.finding nudges debug oracle amplitude via recordObservation', () => {
    const seen = [];
    const oracle = {
      patterns: {},
      debug: {
        recordObservation: (p) => { seen.push(p); },
      },
    };
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.AUDIT_FINDING, { ruleId: 'type/div', file: 'x.js' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].ruleId, 'type/div');
  });

  it('is idempotent — wiring twice does not produce duplicate side effects', () => {
    let count = 0;
    const oracle = {
      patterns: { recordUsage: () => { count++; } },
    };
    wireReactions(oracle, { storageRoot: tmp });
    wireReactions(oracle, { storageRoot: tmp });
    getEventBus().emitSync(EVENTS.HEAL_SUCCEEDED, { level: 'generate', patternId: 'x' });
    assert.equal(count, 1);
  });

  it('isolates reaction errors — a thrower does not break siblings', () => {
    let sibling = 0;
    const oracle = {
      patterns: {
        recordUsage: () => { throw new Error('boom'); },
      },
      debug: {
        recordObservation: () => { sibling++; },
      },
    };
    wireReactions(oracle, { storageRoot: tmp });
    // heal.succeeded → recordUsage throws; audit.finding → recordObservation still fires
    getEventBus().emitSync(EVENTS.HEAL_SUCCEEDED, { level: 'generate', patternId: 'x' });
    getEventBus().emitSync(EVENTS.AUDIT_FINDING, { ruleId: 'rule' });
    assert.equal(sibling, 1, 'sibling should still fire despite peer throwing');
  });
});
