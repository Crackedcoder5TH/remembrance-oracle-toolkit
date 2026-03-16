const { describe, it } = require('node:test');
const assert = require('node:assert');

function safeParseAuditDetail(detailStr) {
  if (!detailStr) return {};
  try {
    return JSON.parse(detailStr);
  } catch {
    return { _parseError: true, raw: String(detailStr).slice(0, 200) };
  }
}

describe('safe audit log detail parsing', () => {
  it('parses valid JSON', () => {
    const result = safeParseAuditDetail('{"action":"add","coherency":0.95}');
    assert.deepStrictEqual(result, { action: 'add', coherency: 0.95 });
  });

  it('returns empty object for null/undefined', () => {
    assert.deepStrictEqual(safeParseAuditDetail(null), {});
    assert.deepStrictEqual(safeParseAuditDetail(undefined), {});
    assert.deepStrictEqual(safeParseAuditDetail(''), {});
  });

  it('returns parse error marker for malformed JSON', () => {
    const result = safeParseAuditDetail('{broken json!!!');
    assert.strictEqual(result._parseError, true);
    assert.ok(result.raw.includes('broken json'));
  });

  it('truncates long malformed strings', () => {
    const long = 'x'.repeat(500);
    const result = safeParseAuditDetail(long);
    assert.strictEqual(result._parseError, true);
    assert.strictEqual(result.raw.length, 200);
  });
});
