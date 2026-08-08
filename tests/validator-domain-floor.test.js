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

describe('validator — domain floor → LRE field contribution', () => {
  const { peekField } = require('../src/core/field-coupling');

  it('contributes validator:domain:<domain> when domain is set', () => {
    const before = peekField();
    if (!before) return; // field unavailable — best-effort path
    const beforeKeys = new Set(Object.keys(before.sources || {}));

    validateCode(GOOD_CODE, { language: 'javascript', domain: 'security' });

    const after = peekField();
    const newKey = 'validator:domain:security';
    assert.ok(after.sources[newKey] || beforeKeys.has(newKey), 'expected validator:domain:security in histogram');
  });

  it('emits an additional ratchet event when floor lifts the threshold', () => {
    const before = peekField();
    if (!before) return;

    // security domain + threshold below 0.65 → ratchets up
    validateCode(GOOD_CODE, { language: 'javascript', domain: 'security', threshold: 0.50 });

    const after = peekField();
    const ratchetKey = 'validator:domain-floor-ratchet:security';
    assert.ok(after.sources[ratchetKey], 'expected ratchet event in histogram');
  });

  it('does NOT emit ratchet when threshold is already >= floor', () => {
    const before = peekField();
    if (!before) return;
    const beforeCount = before.sources?.['validator:domain-floor-ratchet:performance']?.count || 0;

    // performance floor = 0.52; caller threshold 0.80 dominates — no ratchet
    validateCode(GOOD_CODE, { language: 'javascript', domain: 'performance', threshold: 0.80 });

    const after = peekField();
    const afterCount = after.sources?.['validator:domain-floor-ratchet:performance']?.count || 0;
    assert.equal(afterCount, beforeCount, 'ratchet event should not fire when caller threshold dominates');
  });

  it('does NOT contribute when no domain is provided', () => {
    const before = peekField();
    if (!before) return;
    const beforeUpdateCount = before.updateCount;
    const validatorKeys = Object.keys(before.sources || {}).filter(k => k.startsWith('validator:'));
    const beforeValidatorCount = validatorKeys.reduce((s, k) => s + (before.sources[k]?.count || 0), 0);

    validateCode(GOOD_CODE, { language: 'javascript' });

    const after = peekField();
    const afterValidatorCount = validatorKeys.reduce((s, k) => s + (after.sources[k]?.count || 0), 0);
    assert.equal(afterValidatorCount, beforeValidatorCount, 'no validator: sources should grow without a domain');
  });
});
