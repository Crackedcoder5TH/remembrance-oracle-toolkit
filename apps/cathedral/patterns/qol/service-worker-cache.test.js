const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createCacheStrategy', function() {
  it('getCacheName returns the provided cache name', function() {
    const cs = createCacheStrategy('my-cache-v2', ['/']);
    assert.equal(cs.getCacheName(), 'my-cache-v2');
  });

  it('getCacheName returns default when not provided', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.getCacheName(), 'app-cache-v1');
  });

  it('getPrecacheUrls returns a copy of the urls array', function() {
    const urls = ['/', '/about', '/contact'];
    const cs = createCacheStrategy('cache', urls);
    const result = cs.getPrecacheUrls();
    assert.deepEqual(result, ['/', '/about', '/contact']);
    result.push('/extra');
    assert.equal(cs.getPrecacheUrls().length, 3);
  });

  it('getPrecacheUrls defaults to ["/"]', function() {
    const cs = createCacheStrategy();
    assert.deepEqual(cs.getPrecacheUrls(), ['/']);
  });

  it('shouldCache returns false for /api/ routes', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.shouldCache('/api/users'), false);
    assert.equal(cs.shouldCache('/api/data/123'), false);
  });

  it('shouldCache returns true for non-api routes', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.shouldCache('/'), true);
    assert.equal(cs.shouldCache('/about'), true);
    assert.equal(cs.shouldCache('/contact'), true);
  });

  it('shouldCache returns false for empty or null url', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.shouldCache(''), false);
    assert.equal(cs.shouldCache(null), false);
    assert.equal(cs.shouldCache(undefined), false);
  });

  it('isGetRequest returns true for GET', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.isGetRequest('GET'), true);
  });

  it('isGetRequest returns false for non-GET methods', function() {
    const cs = createCacheStrategy();
    assert.equal(cs.isGetRequest('POST'), false);
    assert.equal(cs.isGetRequest('PUT'), false);
    assert.equal(cs.isGetRequest('DELETE'), false);
  });
});
