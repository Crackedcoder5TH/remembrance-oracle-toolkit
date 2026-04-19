const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('solana-status', () => {
  it('creates checker with default endpoint', () => {
    const checker = createSolanaChecker();
    assert.strictEqual(checker.getConnection().endpoint, 'https://api.testnet.solana.com');
  });

  it('creates checker with custom endpoint', () => {
    const checker = createSolanaChecker('https://api.devnet.solana.com');
    assert.strictEqual(checker.getConnection().endpoint, 'https://api.devnet.solana.com');
  });

  it('getConnection returns singleton', () => {
    const checker = createSolanaChecker();
    assert.strictEqual(checker.getConnection(), checker.getConnection());
  });

  it('getStatus falls back gracefully on error', async () => {
    const checker = createSolanaChecker();
    const status = await checker.getStatus(() => Promise.reject(new Error('offline')));
    assert.strictEqual(status.connected, false);
    assert.strictEqual(status.slot, null);
  });
});
