const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBloomFilter, createOptimalBloomFilter } = require('../seeds/bloom-filter');

describe('bloom-filter', () => {
  it('should confirm membership for added items', () => {
    const bf = createBloomFilter(1000, 5);
    bf.add('hello');
    bf.add('world');
    bf.add('test');

    assert.ok(bf.has('hello'));
    assert.ok(bf.has('world'));
    assert.ok(bf.has('test'));
  });

  it('should have zero false negatives', () => {
    const bf = createBloomFilter(10000, 7);
    const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    items.forEach(item => bf.add(item));

    for (const item of items) {
      assert.ok(bf.has(item), `False negative for ${item}`);
    }
  });

  it('should mostly reject non-members (low false positive rate)', () => {
    const bf = createBloomFilter(10000, 7);
    for (let i = 0; i < 100; i++) bf.add(`member-${i}`);

    let falsePositives = 0;
    for (let i = 0; i < 1000; i++) {
      if (bf.has(`nonmember-${i}`)) falsePositives++;
    }
    // With size=10000, k=7, n=100, theoretical FP rate is ~0.0001
    assert.ok(falsePositives < 50, `Too many false positives: ${falsePositives}`);
  });

  it('should track count', () => {
    const bf = createBloomFilter(100, 3);
    assert.equal(bf.count, 0);
    bf.add('a');
    bf.add('b');
    assert.equal(bf.count, 2);
  });

  it('should report theoretical false positive rate', () => {
    const bf = createBloomFilter(1000, 7);
    assert.equal(bf.falsePositiveRate(), 0); // No items yet
    for (let i = 0; i < 50; i++) bf.add(`item-${i}`);
    const rate = bf.falsePositiveRate();
    assert.ok(rate > 0 && rate < 1);
  });

  it('should reject invalid parameters', () => {
    assert.throws(() => createBloomFilter(0, 3));
    assert.throws(() => createBloomFilter(100, 0));
    assert.throws(() => createBloomFilter(-1, 3));
  });

  it('createOptimalBloomFilter should auto-configure', () => {
    const bf = createOptimalBloomFilter(1000, 0.01);
    for (let i = 0; i < 1000; i++) bf.add(`item-${i}`);

    // All added items should be found
    for (let i = 0; i < 1000; i++) {
      assert.ok(bf.has(`item-${i}`));
    }
  });

  it('should handle numbers and other types', () => {
    const bf = createBloomFilter(1000, 5);
    bf.add(42);
    bf.add(true);
    bf.add(null);
    assert.ok(bf.has(42));
    assert.ok(bf.has(true));
    assert.ok(bf.has(null));
  });
});
