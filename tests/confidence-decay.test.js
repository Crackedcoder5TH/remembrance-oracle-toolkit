'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const {
  computeDecayFactor,
  applyDecayToScore,
  computeFreshnessBoost,
  decayPass,
  DECAY_DEFAULTS,
  daysBetween,
} = require('../src/unified/decay');

const NOW = new Date('2026-03-15T00:00:00Z');

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

describe('Confidence Decay', () => {
  describe('daysBetween', () => {
    it('computes days between two dates', () => {
      const a = new Date('2026-01-01');
      const b = new Date('2026-01-11');
      assert.strictEqual(daysBetween(a, b), 10);
    });

    it('returns 0 for same date', () => {
      const d = new Date('2026-03-15');
      assert.strictEqual(daysBetween(d, d), 0);
    });

    it('returns 0 when b is before a', () => {
      const a = new Date('2026-03-15');
      const b = new Date('2026-03-01');
      assert.strictEqual(daysBetween(a, b), 0);
    });
  });

  describe('computeDecayFactor', () => {
    it('returns 1.0 for recently used pattern (within grace period)', () => {
      const pattern = { lastUsed: daysAgo(5), createdAt: daysAgo(100) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.strictEqual(result.factor, 1.0);
      assert.strictEqual(result.decayed, false);
    });

    it('returns 1.0 for newly created pattern without usage', () => {
      const pattern = { createdAt: daysAgo(10) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.strictEqual(result.factor, 1.0);
      assert.strictEqual(result.decayed, false);
    });

    it('decays patterns unused beyond grace period', () => {
      const pattern = { lastUsed: daysAgo(120), createdAt: daysAgo(200) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.ok(result.factor < 1.0, `Expected decay, got factor ${result.factor}`);
      assert.strictEqual(result.decayed, true);
    });

    it('half-life: factor ≈ 0.5 at halfLifeDays past grace period', () => {
      const daysIdle = DECAY_DEFAULTS.gracePeriodDays + DECAY_DEFAULTS.halfLifeDays;
      const pattern = { lastUsed: daysAgo(daysIdle) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.ok(Math.abs(result.factor - 0.5) < 0.01,
        `Expected ~0.5 at half-life, got ${result.factor}`);
    });

    it('never decays below minScore', () => {
      const pattern = { lastUsed: daysAgo(9999) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.ok(result.factor >= DECAY_DEFAULTS.minScore,
        `Factor ${result.factor} below min ${DECAY_DEFAULTS.minScore}`);
    });

    it('returns 1.0 for pattern with no timestamps', () => {
      const result = computeDecayFactor({}, { now: NOW });
      assert.strictEqual(result.factor, 1.0);
    });

    it('uses createdAt when lastUsed is absent', () => {
      const pattern = { createdAt: daysAgo(200) };
      const result = computeDecayFactor(pattern, { now: NOW });
      assert.ok(result.factor < 1.0, 'Should decay based on createdAt');
    });
  });

  describe('applyDecayToScore', () => {
    it('preserves score for fresh patterns', () => {
      const pattern = { lastUsed: daysAgo(5) };
      const result = applyDecayToScore(0.9, pattern, { now: NOW });
      assert.strictEqual(result.adjusted, 0.9);
      assert.strictEqual(result.original, 0.9);
      assert.strictEqual(result.factor, 1.0);
    });

    it('reduces score for stale patterns', () => {
      const pattern = { lastUsed: daysAgo(200) };
      const result = applyDecayToScore(0.9, pattern, { now: NOW });
      assert.ok(result.adjusted < 0.9, `Expected reduced score, got ${result.adjusted}`);
      assert.strictEqual(result.original, 0.9);
    });

    it('never reduces below minScore', () => {
      const pattern = { lastUsed: daysAgo(9999) };
      const result = applyDecayToScore(0.9, pattern, { now: NOW });
      assert.ok(result.adjusted >= DECAY_DEFAULTS.minScore);
    });
  });

  describe('computeFreshnessBoost', () => {
    it('returns 0 for patterns with no usage data', () => {
      assert.strictEqual(computeFreshnessBoost({}), 0);
    });

    it('returns boost for recently used patterns', () => {
      const pattern = {
        lastUsed: daysAgo(3),
        usageCount: 10,
        successCount: 8,
      };
      const boost = computeFreshnessBoost(pattern, { now: NOW });
      assert.ok(boost > 0, `Expected positive boost, got ${boost}`);
      assert.ok(boost <= DECAY_DEFAULTS.maxBoost, `Boost ${boost} exceeds max`);
    });

    it('returns 0 for patterns used long ago', () => {
      const pattern = { lastUsed: daysAgo(60), usageCount: 5, successCount: 5 };
      const boost = computeFreshnessBoost(pattern, { now: NOW });
      assert.strictEqual(boost, 0);
    });

    it('scales with success rate', () => {
      const high = computeFreshnessBoost(
        { lastUsed: daysAgo(2), usageCount: 10, successCount: 10 },
        { now: NOW }
      );
      const low = computeFreshnessBoost(
        { lastUsed: daysAgo(2), usageCount: 10, successCount: 0 },
        { now: NOW }
      );
      assert.ok(high > low, `High success boost (${high}) should exceed low (${low})`);
    });
  });

  describe('decayPass', () => {
    it('returns empty report for empty input', () => {
      const report = decayPass([]);
      assert.strictEqual(report.total, 0);
      assert.strictEqual(report.decayed, 0);
      assert.strictEqual(report.fresh, 0);
    });

    it('processes multiple patterns', () => {
      const patterns = [
        { id: 'fresh', name: 'fresh', lastUsed: daysAgo(5), coherencyScore: { total: 0.9 } },
        { id: 'stale', name: 'stale', lastUsed: daysAgo(200), coherencyScore: { total: 0.9 } },
        { id: 'ancient', name: 'ancient', lastUsed: daysAgo(500), coherencyScore: { total: 0.8 } },
      ];
      const report = decayPass(patterns, { now: NOW });
      assert.strictEqual(report.total, 3);
      assert.ok(report.decayed >= 2, `Expected ≥2 decayed, got ${report.decayed}`);
      assert.ok(report.fresh >= 1, `Expected ≥1 fresh, got ${report.fresh}`);

      const freshP = report.patterns.find(p => p.id === 'fresh');
      const staleP = report.patterns.find(p => p.id === 'stale');
      assert.ok(freshP.adjusted >= staleP.adjusted,
        `Fresh pattern (${freshP.adjusted}) should score ≥ stale (${staleP.adjusted})`);
    });

    it('handles patterns without coherency scores', () => {
      const patterns = [{ id: 'no-score', name: 'no-score', lastUsed: daysAgo(100) }];
      const report = decayPass(patterns, { now: NOW });
      assert.strictEqual(report.total, 1);
      // Should not throw
    });
  });

  describe('integration with decision engine', () => {
    it('stale patterns get lower effective coherency than fresh ones', () => {
      const fresh = { lastUsed: daysAgo(5), coherencyScore: { total: 0.8 } };
      const stale = { lastUsed: daysAgo(200), coherencyScore: { total: 0.8 } };

      const freshResult = applyDecayToScore(0.8, fresh, { now: NOW });
      const staleResult = applyDecayToScore(0.8, stale, { now: NOW });

      assert.ok(freshResult.adjusted > staleResult.adjusted,
        `Fresh (${freshResult.adjusted}) should exceed stale (${staleResult.adjusted})`);
    });

    it('a high-coherency stale pattern can still beat a low-coherency fresh one', () => {
      const staleHigh = { lastUsed: daysAgo(100), coherencyScore: { total: 0.95 } };
      const freshLow = { lastUsed: daysAgo(5), coherencyScore: { total: 0.5 } };

      const staleResult = applyDecayToScore(0.95, staleHigh, { now: NOW });
      const freshResult = applyDecayToScore(0.5, freshLow, { now: NOW });

      assert.ok(staleResult.adjusted > freshResult.adjusted,
        `Stale high (${staleResult.adjusted}) should still beat fresh low (${freshResult.adjusted})`);
    });
  });
});
