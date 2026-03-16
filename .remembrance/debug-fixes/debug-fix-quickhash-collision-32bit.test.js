const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

function stableCodeHash(str) {
  if (!str) return '0';
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

// The broken version for comparison
function _quickHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

describe('stable code hash vs broken quickHash', () => {
  it('never produces negative-prefixed hashes', () => {
    // The old hash can produce negative results
    const inputs = ['test', 'function foo() {}', 'a'.repeat(10000)];
    for (const input of inputs) {
      const hash = stableCodeHash(input);
      assert.ok(!hash.startsWith('-'), `hash should not start with minus: ${hash}`);
    }
  });

  it('produces consistent 12-char hex strings', () => {
    const hash = stableCodeHash('hello world');
    assert.strictEqual(hash.length, 12);
    assert.ok(/^[0-9a-f]{12}$/.test(hash));
  });

  it('handles empty string', () => {
    assert.strictEqual(stableCodeHash(''), '0');
    assert.strictEqual(stableCodeHash(null), '0');
  });

  it('distinguishes similar strings (no collision)', () => {
    const a = stableCodeHash('function add(a, b) { return a + b; }');
    const b = stableCodeHash('function add(a, b) { return a - b; }');
    assert.notStrictEqual(a, b);
  });

  it('demonstrates old hash collision risk with similar inputs', () => {
    // Generate many hashes and check for collisions
    const oldHashes = new Set();
    const newHashes = new Set();
    let oldCollisions = 0;
    let newCollisions = 0;

    for (let i = 0; i < 1000; i++) {
      const input = `function fn${i}(x) { return x + ${i}; }`;
      const oh = _quickHash(input);
      const nh = stableCodeHash(input);
      if (oldHashes.has(oh)) oldCollisions++;
      if (newHashes.has(nh)) newCollisions++;
      oldHashes.add(oh);
      newHashes.add(nh);
    }
    // New hash should have zero collisions for 1000 distinct inputs
    assert.strictEqual(newCollisions, 0);
  });
});
