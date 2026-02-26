const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock localStorage for testing
const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

describe('createCookieConsent', () => {
  it('returns false before accepting', () => {
    const consent = createCookieConsent('test-consent');
    assert.equal(consent.hasConsented(), false);
  });

  it('returns true after accepting', () => {
    const consent = createCookieConsent('test-consent-2');
    consent.acceptConsent();
    assert.equal(consent.hasConsented(), true);
  });

  it('returns false after resetting', () => {
    const consent = createCookieConsent('test-consent-3');
    consent.acceptConsent();
    assert.equal(consent.hasConsented(), true);
    consent.resetConsent();
    assert.equal(consent.hasConsented(), false);
  });

  it('uses default key when none provided', () => {
    const consent = createCookieConsent();
    consent.acceptConsent();
    assert.equal(store['cookie-consent'], 'accepted');
    consent.resetConsent();
  });
});
