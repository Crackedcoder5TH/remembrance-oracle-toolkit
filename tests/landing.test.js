const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createLandingServer } = require('../src/landing/server');

// ─── HTTP helpers ───

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── WaitlistStore ───

describe('WaitlistStore', () => {
  it('stores email signup', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    const result = landing.waitlist.add('user@example.com');
    assert.equal(result.success, true);
    assert.ok(result.message.includes('Added') || result.message.includes('waitlist'));
  });

  it('rejects duplicate email', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    landing.waitlist.add('dupe@example.com');
    const result = landing.waitlist.add('dupe@example.com');
    assert.equal(result.success, true);
    assert.ok(result.message.includes('Already'));
  });

  it('returns count', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    assert.equal(landing.waitlist.count(), 0);
    landing.waitlist.add('a@example.com');
    landing.waitlist.add('b@example.com');
    assert.equal(landing.waitlist.count(), 2);
  });

  it('rejects invalid email format', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    const result = landing.waitlist.add('not-an-email');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Invalid'));
  });

  it('rejects empty email', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    const result = landing.waitlist.add('');
    assert.equal(result.success, false);
  });

  it('normalizes email to lowercase', () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    landing.waitlist.add('User@Example.COM');
    const result = landing.waitlist.add('user@example.com');
    assert.equal(result.success, true);
    assert.ok(result.message.includes('Already'));
  });
});

// ─── Landing Server Routes ───

describe('Landing server routes', () => {
  let landing;
  let baseUrl;

  before(async () => {
    landing = createLandingServer({ port: 0, oracle: null });
    await new Promise(resolve => landing.server.listen(0, '127.0.0.1', resolve));
    const addr = landing.server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (landing) await landing.close();
  });

  it('GET / returns HTML with correct content', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.data.includes('Remembrance'));
    assert.ok(res.data.includes('Oracle'));
  });

  it('GET /api/stats returns JSON with pattern/language counts', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok('totalPatterns' in data);
    assert.ok('languages' in data);
    assert.ok('communityPatterns' in data);
    assert.ok('mcpTools' in data);
    assert.ok('waitlistSize' in data);
    assert.equal(typeof data.totalPatterns, 'number');
    assert.equal(typeof data.languages, 'number');
  });

  it('POST /api/waitlist with valid email returns success', async () => {
    const res = await postJSON(`${baseUrl}/api/waitlist`, { email: 'test@example.com' });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.equal(data.success, true);
    assert.ok(data.message);
  });

  it('POST /api/waitlist with invalid email returns error', async () => {
    const res = await postJSON(`${baseUrl}/api/waitlist`, { email: 'bad-email' });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.data);
    assert.equal(data.success, false);
    assert.ok(data.error.includes('Invalid'));
  });

  it('POST /api/waitlist with duplicate email returns already-on-waitlist', async () => {
    await postJSON(`${baseUrl}/api/waitlist`, { email: 'dupe-route@example.com' });
    const res = await postJSON(`${baseUrl}/api/waitlist`, { email: 'dupe-route@example.com' });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.equal(data.success, true);
    assert.ok(data.message.includes('Already'));
  });

  it('GET /health returns healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.equal(data.status, 'healthy');
    assert.equal(data.service, 'landing');
    assert.ok(data.timestamp);
    assert.equal(typeof data.uptime, 'number');
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
    const data = JSON.parse(res.data);
    assert.ok(data.error);
  });

  it('handles CORS OPTIONS request', async () => {
    const res = await fetch(`${baseUrl}/api/stats`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
  });
});

// ─── HTML Content Verification ───

describe('HTML content verification', () => {
  let html;

  before(async () => {
    const landing = createLandingServer({ port: 0, oracle: null });
    await new Promise(resolve => landing.server.listen(0, '127.0.0.1', resolve));
    const addr = landing.server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    html = res.data;
    landing.server.close();
  });

  it('contains "Remembrance Oracle" title', () => {
    assert.ok(html.includes('Remembrance'));
    assert.ok(html.includes('Oracle'));
    assert.ok(html.includes('<title>'));
    assert.ok(html.includes('Remembrance Oracle'));
  });

  it('contains "AI-Native Code Memory" subtitle', () => {
    assert.ok(html.includes('AI-Native Code Memory'));
  });

  it('contains pricing section', () => {
    assert.ok(html.includes('id="pricing"'));
    assert.ok(html.includes('Pricing'));
    assert.ok(html.includes('pricing-grid'));
    assert.ok(html.includes('Free'));
    assert.ok(html.includes('Pro'));
    assert.ok(html.includes('Team'));
    // Prices are rendered as <span class="currency">$</span>0, etc.
    assert.ok(html.includes('currency'));
    assert.ok(html.includes('>0<'));
    assert.ok(html.includes('>19<'));
    assert.ok(html.includes('>49<'));
  });

  it('contains all 6 feature cards', () => {
    assert.ok(html.includes('Zero Dependencies'));
    assert.ok(html.includes('Covenant-Protected'));
    assert.ok(html.includes('Coherency Scored'));
    assert.ok(html.includes('Self-Healing'));
    assert.ok(html.includes('Federated'));
    assert.ok(html.includes('AI-Native MCP'));

    // Count feature-card occurrences
    const featureCardCount = (html.match(/feature-card/g) || []).length;
    // Each feature-card class appears in CSS and in HTML elements; ensure at least 6 HTML cards
    assert.ok(featureCardCount >= 6, `Expected at least 6 feature-card references, got ${featureCardCount}`);
  });

  it('contains responsive CSS', () => {
    assert.ok(html.includes('@media'));
    assert.ok(html.includes('max-width: 900px'));
    assert.ok(html.includes('max-width: 600px'));
    assert.ok(html.includes('viewport'));
  });

  it('contains How It Works section', () => {
    assert.ok(html.includes('id="how-it-works"'));
    assert.ok(html.includes('How It Works'));
    assert.ok(html.includes('Submit Code'));
    assert.ok(html.includes('Prove It Works'));
    assert.ok(html.includes('Query Anywhere'));
  });

  it('contains waitlist form', () => {
    assert.ok(html.includes('waitlistForm'));
    assert.ok(html.includes('Join Waitlist'));
    assert.ok(html.includes('you@company.com'));
  });

  it('contains footer', () => {
    assert.ok(html.includes('<footer>'));
    assert.ok(html.includes('remembrance.oracle'));
    assert.ok(html.includes('GitHub'));
    assert.ok(html.includes('Documentation'));
  });
});
