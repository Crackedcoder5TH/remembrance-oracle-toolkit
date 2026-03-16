const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

function uniqueHash(input) {
  const nonce = crypto.randomBytes(8).toString('hex');
  return crypto.createHash('sha256')
    .update(input + Date.now().toString() + nonce)
    .digest('hex')
    .slice(0, 16);
}

describe('unique hash ID generation', () => {
  it('produces different IDs for same input called rapidly', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(uniqueHash('identical-code'));
    }
    // All 100 should be unique even though input and timestamp may match
    assert.strictEqual(ids.size, 100);
  });

  it('produces 16-character hex strings', () => {
    const id = uniqueHash('test');
    assert.strictEqual(id.length, 16);
    assert.ok(/^[0-9a-f]{16}$/.test(id));
  });

  it('is deterministic-length regardless of input', () => {
    const short = uniqueHash('x');
    const long = uniqueHash('x'.repeat(100000));
    assert.strictEqual(short.length, 16);
    assert.strictEqual(long.length, 16);
  });
});
