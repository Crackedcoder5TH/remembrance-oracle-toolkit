// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('generateSecurityHeaders', () => {
  it('returns 6 security headers', () => {
    const headers = generateSecurityHeaders();
    assert.equal(headers.length, 6);
  });

  it('includes HSTS with correct max-age', () => {
    const headers = generateSecurityHeaders();
    const hsts = headers.find(h => h.key === 'Strict-Transport-Security');
    assert.ok(hsts);
    assert.ok(hsts.value.includes('max-age=31536000'));
    assert.ok(hsts.value.includes('includeSubDomains'));
    assert.ok(hsts.value.includes('preload'));
  });

  it('includes X-Frame-Options DENY', () => {
    const headers = generateSecurityHeaders();
    // find() returns undefined when the header is absent, and reading .value
    // off it throws a TypeError — which fails the test with a stack trace
    // about undefined instead of "the header is missing". Assert presence
    // first so a regression names itself.
    const xfo = headers.find(h => h.key === 'X-Frame-Options');
    assert.ok(xfo, 'X-Frame-Options header is present');
    assert.equal(xfo.value, 'DENY');
  });

  it('includes CSP with upgrade-insecure-requests', () => {
    const headers = generateSecurityHeaders();
    const csp = headers.find(h => h.key === 'Content-Security-Policy');
    assert.ok(csp, 'Content-Security-Policy header is present');
    assert.ok(csp.value.includes('upgrade-insecure-requests'));
    assert.ok(csp.value.includes("frame-ancestors 'none'"));
  });

  it('allows custom connectSrc', () => {
    const headers = generateSecurityHeaders({ connectSrc: 'https://api.example.com' });
    const csp = headers.find(h => h.key === 'Content-Security-Policy');
    assert.ok(csp, 'Content-Security-Policy header is present');
    assert.ok(csp.value.includes('https://api.example.com'));
  });

  it('allows custom hstsMaxAge', () => {
    const headers = generateSecurityHeaders({ hstsMaxAge: 86400 });
    const hsts = headers.find(h => h.key === 'Strict-Transport-Security');
    assert.ok(hsts, 'Strict-Transport-Security header is present');
    assert.ok(hsts.value.includes('max-age=86400'));
  });
});
