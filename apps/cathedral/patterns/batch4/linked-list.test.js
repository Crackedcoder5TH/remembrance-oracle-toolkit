const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createLinkedList', () => {
  it('should append and convert to array', () => {
    const list = createLinkedList();
    list.append(1);
    list.append(2);
    list.append(3);
    assert.deepStrictEqual(list.toArray(), [1, 2, 3]);
  });

  it('should prepend elements', () => {
    const list = createLinkedList();
    list.prepend(3);
    list.prepend(2);
    list.prepend(1);
    assert.deepStrictEqual(list.toArray(), [1, 2, 3]);
  });

  it('should track size correctly', () => {
    const list = createLinkedList();
    assert.strictEqual(list.size(), 0);
    list.append(1);
    list.append(2);
    assert.strictEqual(list.size(), 2);
  });

  it('should find elements by predicate', () => {
    const list = createLinkedList();
    list.append(10);
    list.append(20);
    list.append(30);
    assert.strictEqual(list.find(v => v > 15), 20);
    assert.strictEqual(list.find(v => v > 100), undefined);
  });

  it('should remove elements and update size', () => {
    const list = createLinkedList();
    list.append(1);
    list.append(2);
    list.append(3);
    assert.strictEqual(list.remove(2), true);
    assert.deepStrictEqual(list.toArray(), [1, 3]);
    assert.strictEqual(list.size(), 2);
    assert.strictEqual(list.remove(99), false);
  });
});
