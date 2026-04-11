const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('knapsack', () => {
  it('should solve a basic knapsack problem', () => {
    const items = [
      { weight: 2, value: 3 },
      { weight: 3, value: 4 },
      { weight: 4, value: 5 },
      { weight: 5, value: 6 }
    ];
    const result = knapsack(items, 5);
    assert.strictEqual(result.maxValue, 7);
    assert.deepStrictEqual(result.selectedItems, [0, 1]);
  });

  it('should return 0 for empty items', () => {
    const result = knapsack([], 10);
    assert.strictEqual(result.maxValue, 0);
    assert.deepStrictEqual(result.selectedItems, []);
  });

  it('should return 0 when capacity is 0', () => {
    const items = [{ weight: 1, value: 10 }];
    const result = knapsack(items, 0);
    assert.strictEqual(result.maxValue, 0);
    assert.deepStrictEqual(result.selectedItems, []);
  });

  it('should skip items that are too heavy', () => {
    const items = [
      { weight: 10, value: 100 },
      { weight: 1, value: 5 }
    ];
    const result = knapsack(items, 5);
    assert.strictEqual(result.maxValue, 5);
    assert.deepStrictEqual(result.selectedItems, [1]);
  });

  it('should select all items if they fit', () => {
    const items = [
      { weight: 1, value: 10 },
      { weight: 2, value: 20 },
      { weight: 3, value: 30 }
    ];
    const result = knapsack(items, 10);
    assert.strictEqual(result.maxValue, 60);
    assert.deepStrictEqual(result.selectedItems, [0, 1, 2]);
  });
});
