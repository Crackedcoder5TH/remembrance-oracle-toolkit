'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');

const { makeTempDir, cleanTempDir, createTestOracle } = require('./helpers');
const { submitNonCode, nonCodeFeedback, NON_CODE_DEFAULTS } = require('../src/api/oracle-noncode');

describe('Non-Code Domain Entry Points', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => {
    cleanTempDir(tmpDir);
  });

  describe('submitNonCode', () => {
    it('accepts a valid non-code submission', () => {
      const result = submitNonCode({
        content: 'When facing a decision with unclear outcomes, list all options, assign probability and impact scores, and choose the option with the highest expected value.',
        description: 'Expected value decision framework for uncertain outcomes',
        tags: ['decision-making', 'framework'],
        domain: 'decision',
        author: 'test-user',
      }, oracle.store);

      assert.strictEqual(result.success, true, `Error: ${result.error}`);
      assert.ok(result.entry, 'Should have an entry');
      assert.ok(result.entry.id, 'Should have an ID');
      assert.strictEqual(result.entry.language, 'non-code');
      assert.strictEqual(result.entry.nonCode, true);
      assert.ok(result.entry.coherencyScore.total > 0, 'Should have positive coherency');
      assert.ok(result.structured, 'Should have structured description');
    });

    it('rejects submission without content', () => {
      const result = submitNonCode({
        content: '',
        description: 'Some description here',
      }, oracle.store);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Content'));
    });

    it('rejects submission without description', () => {
      const result = submitNonCode({
        content: 'Some content',
        description: 'short',
      }, oracle.store);
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Description') || result.error.includes('description'));
    });

    it('rejects null submission', () => {
      const result = submitNonCode(null, oracle.store);
      assert.strictEqual(result.success, false);
    });

    it('accepts a pre-built structured description', () => {
      const result = submitNonCode({
        content: 'Retry with exponential backoff: wait 1s, 2s, 4s, 8s between attempts.',
        description: 'Exponential backoff retry strategy for unreliable operations',
        structuredDescription: {
          inputs: ['operation', 'maxRetries'],
          transform: 'retry',
          outputs: ['result'],
          constraints: ['idempotent'],
          domain: 'workflow',
          freeform: 'Exponential backoff retry strategy',
        },
      }, oracle.store);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.structured.domain, 'workflow');
    });

    it('starts with base coherency below PULL threshold', () => {
      const result = submitNonCode({
        content: 'Always validate user input before processing.',
        description: 'Input validation pattern for user-facing systems',
        tags: ['validation'],
      }, oracle.store);

      assert.strictEqual(result.success, true);
      assert.ok(result.entry.coherencyScore.total < 0.68,
        `Coherency ${result.entry.coherencyScore.total} should be below PULL threshold (0.68)`);
    });

    it('tags include non-code marker', () => {
      const result = submitNonCode({
        content: 'Design review checklist for architecture decisions.',
        description: 'Architecture review checklist pattern',
        tags: ['architecture'],
      }, oracle.store);

      assert.strictEqual(result.success, true);
      assert.ok(result.entry.tags.includes('non-code'), 'Should be tagged as non-code');
    });
  });

  describe('nonCodeFeedback', () => {
    it('boosts coherency on positive feedback', () => {
      const sub = submitNonCode({
        content: 'Break complex problems into smaller sub-problems.',
        description: 'Decomposition strategy for complex problem solving',
      }, oracle.store);
      assert.strictEqual(sub.success, true);

      const feedback = nonCodeFeedback(sub.entry.id, true, oracle.store);
      assert.strictEqual(feedback.success, true);
      assert.ok(feedback.newCoherency > feedback.previousCoherency,
        `New (${feedback.newCoherency}) should exceed previous (${feedback.previousCoherency})`);
    });

    it('reduces coherency on negative feedback', () => {
      const sub = submitNonCode({
        content: 'Always use the first solution that comes to mind.',
        description: 'Quick decision making for time-constrained situations',
      }, oracle.store);
      assert.strictEqual(sub.success, true);

      const feedback = nonCodeFeedback(sub.entry.id, false, oracle.store);
      assert.strictEqual(feedback.success, true);
      assert.ok(feedback.newCoherency < feedback.previousCoherency,
        `New (${feedback.newCoherency}) should be less than previous (${feedback.previousCoherency})`);
    });

    it('returns error for missing ID', () => {
      const result = nonCodeFeedback(null, true, oracle.store);
      assert.strictEqual(result.success, false);
    });

    it('returns error for unknown ID', () => {
      const result = nonCodeFeedback('nonexistent-id', true, oracle.store);
      assert.strictEqual(result.success, false);
    });

    it('coherency never exceeds maximum', () => {
      const sub = submitNonCode({
        content: 'Proven strategy that always works.',
        description: 'Hypothetical perfect decision framework pattern',
      }, oracle.store);
      assert.strictEqual(sub.success, true);

      // Spam positive feedback
      for (let i = 0; i < 20; i++) {
        nonCodeFeedback(sub.entry.id, true, oracle.store);
      }

      // Check it hasn't exceeded MAX
      const entries = oracle.store.getAll();
      const updated = entries.find(e => e.id === sub.entry.id);
      const coherency = updated?.coherencyScore?.total ?? 0;
      assert.ok(coherency <= NON_CODE_DEFAULTS.MAX_COHERENCY,
        `Coherency ${coherency} should not exceed max ${NON_CODE_DEFAULTS.MAX_COHERENCY}`);
    });
  });

  describe('integration', () => {
    it('non-code patterns are searchable alongside code patterns', () => {
      // Submit a non-code pattern
      submitNonCode({
        content: 'When debugging, always reproduce the bug first before attempting a fix.',
        description: 'Debug-first approach: reproduce before fixing bugs',
        tags: ['debugging', 'workflow'],
      }, oracle.store);

      // The pattern should be in the store
      const entries = oracle.store.getAll();
      const nonCodeEntries = entries.filter(e => e.language === 'non-code');
      assert.ok(nonCodeEntries.length > 0, 'Should have non-code entries in store');
    });

    it('multiple feedback cycles build confidence', () => {
      const sub = submitNonCode({
        content: 'Code review checklist: readability, correctness, performance, security.',
        description: 'Comprehensive code review checklist for pull requests',
        tags: ['code-review', 'quality'],
      }, oracle.store);

      const initial = sub.entry.coherencyScore.total;

      // 5 positive feedbacks
      for (let i = 0; i < 5; i++) {
        nonCodeFeedback(sub.entry.id, true, oracle.store);
      }

      const entries = oracle.store.getAll();
      const updated = entries.find(e => e.id === sub.entry.id);
      const final = updated?.coherencyScore?.total ?? initial;

      assert.ok(final > initial,
        `After 5 positive feedbacks, coherency (${final}) should exceed initial (${initial})`);
    });
  });
});
