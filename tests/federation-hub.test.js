const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { FederationHub, HubClient } = require('../src/federation/hub');

function createTestHub(options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-test-'));
  return new FederationHub({ dataDir: tmpDir, teamName: 'test-team', ...options });
}

function cleanup(hub) {
  hub.stop();
  try {
    fs.rmSync(hub.dataDir, { recursive: true, force: true });
  } catch {}
}

function makePattern(overrides = {}) {
  return {
    name: overrides.name || 'test-pattern',
    code: overrides.code || 'function test() { return 42; }',
    language: overrides.language || 'javascript',
    description: overrides.description || 'A test pattern',
    tags: overrides.tags || ['test'],
    coherencyTotal: overrides.coherencyTotal || 0.85,
    testCode: overrides.testCode || 'assert.equal(test(), 42)',
    author: overrides.author || 'tester',
  };
}

// ─── Member Management ───

describe('FederationHub members', () => {
  let hub;
  beforeEach(() => { hub = createTestHub(); });
  afterEach(() => cleanup(hub));

  it('registers a member and returns API key', () => {
    const result = hub.registerMember('alice');
    assert.equal(result.name, 'alice');
    assert.ok(result.apiKey);
    assert.ok(result.apiKey.length >= 32);
    assert.equal(result.role, 'contributor');
  });

  it('rejects duplicate member registration', () => {
    hub.registerMember('bob');
    assert.throws(() => hub.registerMember('bob'), /already registered/);
  });

  it('removes a member', () => {
    hub.registerMember('charlie');
    assert.ok(hub.removeMember('charlie'));
    assert.ok(!hub.removeMember('charlie')); // Already removed
  });

  it('lists members without exposing API keys', () => {
    hub.registerMember('dev1');
    hub.registerMember('dev2');
    const members = hub.listMembers();
    assert.equal(members.length, 2);
    assert.ok(!members[0].apiKey); // API key should NOT be exposed
    assert.ok(members[0].name);
    assert.ok(members[0].joinedAt);
  });

  it('authenticates by API key', () => {
    const { apiKey } = hub.registerMember('auth-test');
    const member = hub.authenticate(apiKey);
    assert.ok(member);
    assert.equal(member.name, 'auth-test');
  });

  it('rejects invalid API key', () => {
    assert.equal(hub.authenticate('invalid-key-123'), null);
  });
});

// ─── Pattern Push ───

describe('FederationHub push', () => {
  let hub;
  beforeEach(() => { hub = createTestHub(); });
  afterEach(() => cleanup(hub));

  it('accepts patterns that meet coherency threshold', () => {
    const result = hub.pushPatterns([makePattern()], 'tester');
    assert.equal(result.accepted, 1);
    assert.equal(result.rejected, 0);
    assert.equal(result.total, 1);
  });

  it('rejects patterns below coherency threshold', () => {
    const result = hub.pushPatterns([
      makePattern({ coherencyTotal: 0.3 }),
    ], 'tester');
    assert.equal(result.accepted, 0);
    assert.equal(result.rejected, 1);
    assert.ok(result.results[0].reason.includes('Coherency'));
  });

  it('rejects patterns missing required fields', () => {
    const result = hub.pushPatterns([{ name: 'x' }], 'tester');
    assert.equal(result.rejected, 1);
    assert.ok(result.results[0].reason.includes('Missing'));
  });

  it('deduplicates by name+language, keeps highest coherency', () => {
    hub.pushPatterns([makePattern({ name: 'sort', coherencyTotal: 0.8 })], 'alice');
    const result = hub.pushPatterns([makePattern({ name: 'sort', coherencyTotal: 0.9 })], 'bob');
    assert.equal(result.duplicates, 1);
    assert.equal(result.results[0].status, 'updated');

    // Verify the stored version is the higher one
    const pulled = hub.pullPatterns({});
    const sort = pulled.patterns.find(p => p.name === 'sort');
    assert.equal(sort.coherencyTotal, 0.9);
    assert.equal(sort.contributor, 'bob');
  });

  it('skips duplicate with equal or lower coherency', () => {
    hub.pushPatterns([makePattern({ name: 'cache', coherencyTotal: 0.9 })], 'alice');
    const result = hub.pushPatterns([makePattern({ name: 'cache', coherencyTotal: 0.85 })], 'bob');
    assert.equal(result.results[0].status, 'skipped');
  });

  it('tracks member push count', () => {
    hub.registerMember('counter-test');
    hub.pushPatterns([makePattern(), makePattern({ name: 'p2' })], 'counter-test');
    const members = hub.listMembers();
    const member = members.find(m => m.name === 'counter-test');
    assert.equal(member.pushCount, 2);
  });
});

// ─── Pattern Pull ───

describe('FederationHub pull', () => {
  let hub;
  beforeEach(() => {
    hub = createTestHub();
    hub.pushPatterns([
      makePattern({ name: 'sort', language: 'javascript', coherencyTotal: 0.9, tags: ['algorithm'] }),
      makePattern({ name: 'sort', language: 'python', coherencyTotal: 0.8, tags: ['algorithm'] }),
      makePattern({ name: 'debounce', language: 'javascript', coherencyTotal: 0.85, tags: ['timing'] }),
    ], 'seed');
  });
  afterEach(() => cleanup(hub));

  it('pulls all patterns', () => {
    const result = hub.pullPatterns({});
    assert.equal(result.count, 3);
  });

  it('filters by language', () => {
    const result = hub.pullPatterns({ language: 'python' });
    assert.equal(result.count, 1);
    assert.equal(result.patterns[0].language, 'python');
  });

  it('filters by min coherency', () => {
    const result = hub.pullPatterns({ minCoherency: 0.85 });
    assert.ok(result.count >= 2);
    for (const p of result.patterns) {
      assert.ok(p.coherencyTotal >= 0.85);
    }
  });

  it('filters by tags', () => {
    const result = hub.pullPatterns({ tags: ['timing'] });
    assert.equal(result.count, 1);
    assert.equal(result.patterns[0].name, 'debounce');
  });

  it('limits result count', () => {
    const result = hub.pullPatterns({ limit: 2 });
    assert.equal(result.count, 2);
  });

  it('sorts by coherency descending', () => {
    const result = hub.pullPatterns({});
    for (let i = 1; i < result.patterns.length; i++) {
      assert.ok(result.patterns[i - 1].coherencyTotal >= result.patterns[i].coherencyTotal);
    }
  });
});

// ─── Search ───

describe('FederationHub search', () => {
  let hub;
  beforeEach(() => {
    hub = createTestHub();
    hub.pushPatterns([
      makePattern({ name: 'quicksort', tags: ['sort', 'algorithm'], description: 'Sort an array with quicksort' }),
      makePattern({ name: 'debounce', tags: ['timing', 'rate-limit'], description: 'Debounce function calls' }),
      makePattern({ name: 'deep-clone', tags: ['clone', 'copy'], description: 'Deep clone an object' }),
    ], 'seed');
  });
  afterEach(() => cleanup(hub));

  it('searches by name', () => {
    const results = hub.search('quicksort');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'quicksort');
  });

  it('searches by tag', () => {
    const results = hub.search('timing');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'debounce');
  });

  it('searches by description', () => {
    const results = hub.search('clone object');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'deep-clone');
  });

  it('returns empty for no match', () => {
    const results = hub.search('xyznotfound12345');
    assert.equal(results.length, 0);
  });
});

// ─── Analytics ───

describe('FederationHub stats', () => {
  let hub;
  beforeEach(() => { hub = createTestHub(); });
  afterEach(() => cleanup(hub));

  it('returns comprehensive stats', () => {
    hub.registerMember('alice');
    hub.pushPatterns([
      makePattern({ name: 'a', language: 'javascript' }),
      makePattern({ name: 'b', language: 'python' }),
    ], 'alice');

    const stats = hub.stats();
    assert.equal(stats.teamName, 'test-team');
    assert.equal(stats.totalPatterns, 2);
    assert.equal(stats.totalMembers, 1);
    assert.ok(stats.avgCoherency > 0);
    assert.ok(stats.languages.javascript > 0);
    assert.ok(stats.languages.python > 0);
    assert.ok(stats.topContributors.length > 0);
  });
});

// ─── Activity Feed ───

describe('FederationHub activity', () => {
  let hub;
  beforeEach(() => { hub = createTestHub(); });
  afterEach(() => cleanup(hub));

  it('records activity events', () => {
    hub.registerMember('active-user');
    hub.pushPatterns([makePattern()], 'active-user');

    const activity = hub.activityFeed();
    assert.ok(activity.length >= 2); // member_joined + patterns_pushed
    assert.equal(activity[0].type, 'patterns_pushed');
    assert.equal(activity[1].type, 'member_joined');
  });
});

// ─── HTTP Server ───

describe('FederationHub HTTP server', () => {
  let hub;
  let port;

  beforeEach(async () => {
    hub = createTestHub();
    // Use random high port to avoid conflicts
    port = 30000 + Math.floor(Math.random() * 30000);
    await hub.start(port);
  });

  afterEach(() => cleanup(hub));

  it('serves health endpoint', async () => {
    const client = new HubClient(`http://127.0.0.1:${port}`, '');
    const health = await client.health();
    assert.equal(health.status, 'healthy');
    assert.equal(health.team, 'test-team');
  });

  it('serves stats endpoint', async () => {
    const stats = await new HubClient(`http://127.0.0.1:${port}`, '').stats();
    assert.equal(stats.teamName, 'test-team');
    assert.equal(typeof stats.totalPatterns, 'number');
  });

  it('push and pull via HTTP', async () => {
    // Register member
    const { apiKey } = hub.registerMember('http-test');
    const client = new HubClient(`http://127.0.0.1:${port}`, apiKey);

    // Push
    const pushResult = await client.push([makePattern({ name: 'http-sort' })]);
    assert.equal(pushResult.accepted, 1);

    // Pull
    const pullResult = await client.pull({});
    assert.equal(pullResult.count, 1);
    assert.equal(pullResult.patterns[0].name, 'http-sort');
  });

  it('rejects unauthorized requests', async () => {
    const client = new HubClient(`http://127.0.0.1:${port}`, 'bad-key');
    const result = await client.push([makePattern()]);
    assert.equal(result.error, 'Invalid API key');
  });

  it('searches via HTTP', async () => {
    const { apiKey } = hub.registerMember('search-test');
    const client = new HubClient(`http://127.0.0.1:${port}`, apiKey);

    await client.push([
      makePattern({ name: 'quicksort', tags: ['sort'] }),
      makePattern({ name: 'debounce', tags: ['timing'] }),
    ]);

    const result = await client.search('sort');
    assert.ok(result.results.length > 0);
    assert.equal(result.results[0].name, 'quicksort');
  });
});

// ─── HubClient ───

describe('HubClient', () => {
  it('constructs with URL and API key', () => {
    const client = new HubClient('http://localhost:3580', 'test-key');
    assert.equal(client.hubUrl, 'http://localhost:3580');
    assert.equal(client.apiKey, 'test-key');
  });

  it('strips trailing slash from URL', () => {
    const client = new HubClient('http://localhost:3580/', 'key');
    assert.equal(client.hubUrl, 'http://localhost:3580');
  });
});
