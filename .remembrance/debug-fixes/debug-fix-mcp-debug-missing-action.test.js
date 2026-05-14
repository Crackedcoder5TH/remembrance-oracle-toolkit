const { describe, it } = require('node:test');
const assert = require('node:assert');

function safeDebugAction(args) {
  const action = (args && args.action) || 'stats';
  const validActions = new Set(['capture', 'search', 'feedback', 'stats', 'grow', 'patterns']);
  if (!validActions.has(action)) {
    return { valid: false, action, error: `Unknown debug action: "${action}"` };
  }
  return { valid: true, action, error: null };
}

describe('safe MCP debug action handling', () => {
  it('defaults to stats when no action provided', () => {
    assert.deepStrictEqual(safeDebugAction({}), { valid: true, action: 'stats', error: null });
  });

  it('defaults to stats when args is null', () => {
    assert.deepStrictEqual(safeDebugAction(null), { valid: true, action: 'stats', error: null });
  });

  it('accepts valid actions', () => {
    for (const action of ['capture', 'search', 'feedback', 'stats', 'grow', 'patterns']) {
      const result = safeDebugAction({ action });
      assert.strictEqual(result.valid, true, `${action} should be valid`);
    }
  });

  it('rejects unknown actions with descriptive error', () => {
    const result = safeDebugAction({ action: 'explode' });
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('explode'));
  });
});
