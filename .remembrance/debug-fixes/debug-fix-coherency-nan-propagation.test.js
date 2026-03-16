const { describe, it } = require('node:test');
const assert = require('node:assert');

function safeHistoricalReliability(successCount, usageCount, fallback = 0.5) {
  if (usageCount === 0 || !Number.isFinite(usageCount)) return fallback;
  const ratio = successCount / usageCount;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : fallback;
}

function safeAverage(sum, count, fallback = 0) {
  if (count === 0 || !Number.isFinite(count)) return fallback;
  const avg = sum / count;
  return Number.isFinite(avg) ? avg : fallback;
}

describe('NaN-safe arithmetic', () => {
  it('returns fallback for 0/0', () => {
    assert.strictEqual(safeHistoricalReliability(0, 0), 0.5);
  });

  it('computes correct ratio for valid inputs', () => {
    assert.strictEqual(safeHistoricalReliability(8, 10), 0.8);
  });

  it('clamps ratio to [0, 1]', () => {
    assert.strictEqual(safeHistoricalReliability(15, 10), 1);
    assert.strictEqual(safeHistoricalReliability(-5, 10), 0);
  });

  it('handles Infinity in usage count', () => {
    assert.strictEqual(safeHistoricalReliability(5, Infinity), 0.5);
  });

  it('handles NaN in usage count', () => {
    assert.strictEqual(safeHistoricalReliability(5, NaN), 0.5);
  });

  it('safeAverage returns fallback for empty set', () => {
    assert.strictEqual(safeAverage(0, 0), 0);
  });

  it('safeAverage computes correctly', () => {
    assert.strictEqual(safeAverage(10, 4), 2.5);
  });
});
