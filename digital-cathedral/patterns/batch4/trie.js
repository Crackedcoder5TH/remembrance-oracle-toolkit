/**
 * Trie — prefix tree for string operations
 * createTrie() → { insert, search, startsWith, remove }
 */
function createTrie() {
  const root = { children: {}, isEnd: false };

  function insert(word) {
    let node = root;
    for (const char of word) {
      if (!node.children[char]) {
        node.children[char] = { children: {}, isEnd: false };
      }
      node = node.children[char];
    }
    node.isEnd = true;
  }

  function search(word) {
    let node = root;
    for (const char of word) {
      if (!node.children[char]) return false;
      node = node.children[char];
    }
    return node.isEnd;
  }

  function startsWith(prefix) {
    let node = root;
    for (const char of prefix) {
      if (!node.children[char]) return false;
      node = node.children[char];
    }
    return true;
  }

  function remove(word) {
    function _remove(node, word, depth) {
      if (depth === word.length) {
        if (!node.isEnd) return false;
        node.isEnd = false;
        return Object.keys(node.children).length === 0;
      }
      const char = word[depth];
      if (!node.children[char]) return false;
      const shouldDelete = _remove(node.children[char], word, depth + 1);
      if (shouldDelete) {
        delete node.children[char];
        return !node.isEnd && Object.keys(node.children).length === 0;
      }
      return false;
    }
    _remove(root, word, 0);
  }

  return { insert, search, startsWith, remove };
}

module.exports = { createTrie };
