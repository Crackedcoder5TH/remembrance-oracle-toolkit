'use strict';

/**
 * Verifies the case-mismatch fallback in `gh()`: on 404, the helper resolves
 * the canonical owner/repo casing from `/repos/X/Y` (which redirects) and
 * retries the original sub-path. Without the fix, a lowercase repo name
 * against a mixed-case GitHub repo returns 404 with no recovery.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('ecosystem-sweep — canonical repo casing recovery', () => {
  let originalFetch;
  let calls;
  let sweep;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/core/ecosystem-sweep')];
    process.env.ECOSYSTEM_PAT = 'test-token';
    process.env.ECOSYSTEM_OWNER = 'Crackedcoder5TH';
    sweep = require('../src/core/ecosystem-sweep');
    sweep._canonicalCache.clear();
    calls = [];
    originalFetch = global.fetch;
  });

  function installFakeFetch(routes) {
    global.fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET' });
      const u = new URL(url);
      const handler = routes[u.pathname + u.search] || routes[u.pathname];
      if (!handler) return { ok: false, status: 404, json: async () => ({}), text: async () => 'no route' };
      return handler();
    };
  }

  function restoreFetch() { global.fetch = originalFetch; }

  it('returns data without retry when the path is already canonical', async () => {
    installFakeFetch({
      '/repos/Crackedcoder5TH/Void-Data-Compressor/pulls?state=open&per_page=50': () => ({
        ok: true, status: 200,
        json: async () => [{ number: 22, title: 'docs', head: { ref: 'feat', sha: 'abc' } }],
      }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/commits?per_page=1': () => ({
        ok: true, status: 200,
        json: async () => [{ commit: { author: { date: new Date().toISOString() } } }],
      }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/actions/runs?per_page=5': () => ({
        ok: true, status: 200,
        json: async () => ({ workflow_runs: [{ conclusion: 'success' }] }),
      }),
    });
    try {
      const r = await sweep.probeRepo('Void-Data-Compressor');
      assert.equal(r.status === 'error', false, `unexpected error: ${r.error}`);
      // No canonical resolve roundtrip should have happened.
      const resolveCalls = calls.filter(c => /^\/repos\/[^/]+\/[^/]+$/.test(new URL(c.url).pathname));
      assert.equal(resolveCalls.length, 0, 'should not have resolved canonical name when path works');
    } finally { restoreFetch(); }
  });

  it('recovers from 404 by resolving canonical casing and retrying once', async () => {
    let resolved = false;
    installFakeFetch({
      // First call: lowercase name 404s
      '/repos/Crackedcoder5TH/void-data-compressor/pulls?state=open&per_page=50': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => '{"message":"Not Found"}',
      }),
      '/repos/Crackedcoder5TH/void-data-compressor/commits?per_page=1': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => '{"message":"Not Found"}',
      }),
      '/repos/Crackedcoder5TH/void-data-compressor/actions/runs?per_page=5': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => '{"message":"Not Found"}',
      }),
      // Resolution endpoint: returns canonical full_name
      '/repos/Crackedcoder5TH/void-data-compressor': () => {
        resolved = true;
        return {
          ok: true, status: 200,
          json: async () => ({ full_name: 'Crackedcoder5TH/Void-Data-Compressor' }),
        };
      },
      // Retry with canonical casing succeeds
      '/repos/Crackedcoder5TH/Void-Data-Compressor/pulls?state=open&per_page=50': () => ({
        ok: true, status: 200,
        json: async () => [],
      }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/commits?per_page=1': () => ({
        ok: true, status: 200,
        json: async () => [{ commit: { author: { date: new Date().toISOString() } } }],
      }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/actions/runs?per_page=5': () => ({
        ok: true, status: 200,
        json: async () => ({ workflow_runs: [{ conclusion: 'success' }] }),
      }),
    });
    try {
      const r = await sweep.probeRepo('void-data-compressor');
      assert.notEqual(r.status, 'error', `unexpected error after retry: ${r.error}`);
      assert.equal(resolved, true, 'should have hit the canonical resolution endpoint');
    } finally { restoreFetch(); }
  });

  it('caches canonical resolution — second call to same repo skips the resolve roundtrip', async () => {
    let resolveCount = 0;
    installFakeFetch({
      '/repos/Crackedcoder5TH/void-data-compressor/pulls?state=open&per_page=50': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => 'nf',
      }),
      '/repos/Crackedcoder5TH/void-data-compressor/commits?per_page=1': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => 'nf',
      }),
      '/repos/Crackedcoder5TH/void-data-compressor/actions/runs?per_page=5': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => 'nf',
      }),
      '/repos/Crackedcoder5TH/void-data-compressor': () => {
        resolveCount++;
        return { ok: true, status: 200, json: async () => ({ full_name: 'Crackedcoder5TH/Void-Data-Compressor' }) };
      },
      '/repos/Crackedcoder5TH/Void-Data-Compressor/pulls?state=open&per_page=50': () => ({ ok: true, status: 200, json: async () => [] }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/commits?per_page=1': () => ({ ok: true, status: 200, json: async () => [] }),
      '/repos/Crackedcoder5TH/Void-Data-Compressor/actions/runs?per_page=5': () => ({ ok: true, status: 200, json: async () => ({ workflow_runs: [] }) }),
    });
    try {
      await sweep.probeRepo('void-data-compressor');
      await sweep.probeRepo('void-data-compressor');
      assert.equal(resolveCount, 1, 'canonical resolution should be cached across probes');
    } finally { restoreFetch(); }
  });

  it('gives up gracefully when canonical lookup also fails (truly missing repo)', async () => {
    installFakeFetch({
      '/repos/Crackedcoder5TH/no-such-repo/pulls?state=open&per_page=50': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => 'nf',
      }),
      '/repos/Crackedcoder5TH/no-such-repo': () => ({
        ok: false, status: 404, json: async () => ({}), text: async () => 'nf',
      }),
      // commits + runs use .catch in probeRepo so they're allowed to fail
    });
    try {
      const r = await sweep.probeRepo('no-such-repo');
      assert.equal(r.status, 'error');
      assert.match(r.error, /404/);
    } finally { restoreFetch(); }
  });
});
