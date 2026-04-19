const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createTrie', () => {
  it('should insert and search words', () => {
    const trie = createTrie();
    trie.insert('hello');
    trie.insert('help');
    assert.strictEqual(trie.search('hello'), true);
    assert.strictEqual(trie.search('help'), true);
    assert.strictEqual(trie.search('hell'), false);
    assert.strictEqual(trie.search('world'), false);
  });

  it('should check prefixes with startsWith', () => {
    const trie = createTrie();
    trie.insert('apple');
    trie.insert('app');
    assert.strictEqual(trie.startsWith('app'), true);
    assert.strictEqual(trie.startsWith('ap'), true);
    assert.strictEqual(trie.startsWith('b'), false);
  });

  it('should remove words without breaking other words', () => {
    const trie = createTrie();
    trie.insert('apple');
    trie.insert('app');
    trie.remove('apple');
    assert.strictEqual(trie.search('apple'), false);
    assert.strictEqual(trie.search('app'), true);
  });

  it('should handle single character words', () => {
    const trie = createTrie();
    trie.insert('a');
    assert.strictEqual(trie.search('a'), true);
    assert.strictEqual(trie.startsWith('a'), true);
  });

  it('should handle empty string', () => {
    const trie = createTrie();
    trie.insert('');
    assert.strictEqual(trie.search(''), true);
    assert.strictEqual(trie.startsWith(''), true);
  });
});
