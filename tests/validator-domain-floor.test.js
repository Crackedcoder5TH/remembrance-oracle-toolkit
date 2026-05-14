const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateCode } = require('../src/core/validator');
const { MIN_COHERENCY_THRESHOLD, getDomainFloor } = require('../src/constants/thresholds');

const GOOD_CODE = [
  'function processItems(items, transform) {',
  '  if (!Array.isArray(items)) return [];',
  '  return items.map(transform).filter(Boolean);',
  '}',
  'module.exports = { processItems };',
].join('\n');

describe('validator — domain floor', () => {
  it('uses MIN_COHERENCY_THRESHOLD when neither threshold nor domain are given', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript' });
    assert.equal(r.threshold, MIN_COHERENCY_THRESHOLD);
    assert.equal(r.domain, null);
  });

  it('uses domain floor when only domain is provided', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 'security' });
    assert.equal(r.threshold, 0.65);
    assert.equal(r.domain, 'security');
    assert.equal(r.threshold, getDomainFloor('security'));
  });

  it('honors explicit threshold when ABOVE the domain floor', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 'performance', threshold: 0.80 });
    // performance floor is 0.52; caller asks 0.80 — caller wins
    assert.equal(r.threshold, 0.80);
    assert.equal(r.domain, 'performance');
  });

  it('RATCHETS UP an explicit threshold below the domain floor (security)', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 'security', threshold: 0.60 });
    // 0.60 < 0.65 → must be raised to security floor
    assert.equal(r.threshold, 0.65);
  });

  it('does not ratchet when explicit threshold equals or exceeds floor (performance)', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 'performance', threshold: 0.60 });
    // performance floor 0.52 < 0.60 → caller's 0.60 stands
    assert.equal(r.threshold, 0.60);
  });

  it('falls back to MIN_COHERENCY_THRESHOLD for unknown domains', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 'totally-made-up-domain' });
    assert.equal(r.threshold, MIN_COHERENCY_THRESHOLD);
    assert.equal(r.domain, 'totally-made-up-domain');
  });

  it('ignores non-string domain values', () => {
    const r = validateCode(GOOD_CODE, { language: 'javascript', domain: 42 });
    assert.equal(r.domain, null);
    assert.equal(r.threshold, MIN_COHERENCY_THRESHOLD);
  });
});
