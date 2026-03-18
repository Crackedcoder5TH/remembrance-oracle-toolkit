'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('Session Tracker — Enforcement Features', () => {
  let tracker;

  beforeEach(() => {
    // Fresh import each time to reset module state
    delete require.cache[require.resolve('../src/core/session-tracker')];
    tracker = require('../src/core/session-tracker');
    tracker.resetSession();
  });

  describe('Query-before-write tracking', () => {
    it('wasSearchRecent returns false when no search has been done', () => {
      assert.ok(!tracker.wasSearchRecent());
    });

    it('wasSearchRecent returns true after a search', () => {
      tracker.trackSearch('debounce', [{ name: 'debounce', matchScore: 0.9 }], { mode: 'hybrid' });
      assert.ok(tracker.wasSearchRecent());
    });

    it('wasSearchRecent respects threshold', () => {
      tracker.trackSearch('debounce', [], {});
      // With a 0ms threshold, it should be stale
      assert.ok(!tracker.wasSearchRecent(0));
    });

    it('getLastSearchTimestamp returns null initially', () => {
      assert.equal(tracker.getLastSearchTimestamp(), null);
    });

    it('getLastSearchTimestamp returns ISO timestamp after search', () => {
      tracker.trackSearch('throttle', [], {});
      const ts = tracker.getLastSearchTimestamp();
      assert.ok(ts);
      assert.ok(!isNaN(new Date(ts).getTime()));
    });
  });

  describe('Feedback gap detection', () => {
    it('getPendingFeedback returns empty when no resolves', () => {
      const pending = tracker.getPendingFeedback();
      assert.deepEqual(pending, []);
    });

    it('getPendingFeedback returns pulled patterns without feedback', () => {
      tracker.trackResolve(
        { decision: 'pull', confidence: 0.9, pattern: { id: 'abc', name: 'debounce', coherencyScore: 0.8 } },
        { description: 'debounce function' }
      );
      const pending = tracker.getPendingFeedback();
      assert.equal(pending.length, 1);
      assert.equal(pending[0].patternId, 'abc');
      assert.equal(pending[0].patternName, 'debounce');
    });

    it('getPendingFeedback excludes patterns with feedback', () => {
      tracker.trackResolve(
        { decision: 'pull', confidence: 0.9, pattern: { id: 'abc', name: 'debounce', coherencyScore: 0.8 } },
        { description: 'debounce function' }
      );
      tracker.trackFeedback('abc');
      const pending = tracker.getPendingFeedback();
      assert.equal(pending.length, 0);
    });

    it('getPendingFeedback ignores GENERATE decisions', () => {
      tracker.trackResolve(
        { decision: 'generate', confidence: 0.3, reasoning: 'no match found' },
        { description: 'new utility' }
      );
      const pending = tracker.getPendingFeedback();
      assert.equal(pending.length, 0);
    });

    it('trackFeedback handles null gracefully', () => {
      tracker.trackFeedback(null);
      tracker.trackFeedback(undefined);
      assert.deepEqual(tracker.getPendingFeedback(), []);
    });
  });

  describe('End sweep enforcement', () => {
    it('hasUnsubmittedWork returns false for fresh session', () => {
      assert.ok(!tracker.hasUnsubmittedWork());
    });

    it('hasUnsubmittedWork returns true after resolve', () => {
      tracker.trackResolve(
        { decision: 'pull', confidence: 0.8, pattern: { id: 'x', name: 'test', coherencyScore: 0.7 } },
        { description: 'test' }
      );
      assert.ok(tracker.hasUnsubmittedWork());
    });

    it('hasUnsubmittedWork returns true after search', () => {
      tracker.trackSearch('something', [], {});
      assert.ok(tracker.hasUnsubmittedWork());
    });
  });
});
