const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { HostedHub, startHostedHub } = require('../src/federation/hosted-hub');

// ─── Helpers ───

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-hub-test-'));
}

function cleanDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
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

function httpRequest(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── 1. HostedHub Construction ───

describe('HostedHub construction', () => {
  it('creates data directory if missing', () => {
    const tmpDir = createTmpDir();
    const dataDir = path.join(tmpDir, 'nested', 'deep', 'hosted-hub');
    const hub = new HostedHub({ dataDir });
    assert.ok(fs.existsSync(dataDir), 'data directory should be created recursively');
    hub.stop();
    cleanDir(tmpDir);
  });

  it('initializes with empty team map', () => {
    const tmpDir = createTmpDir();
    const hub = new HostedHub({ dataDir: tmpDir });
    const stats = hub.globalStats();
    assert.equal(stats.totalTeams, 0);
    assert.equal(stats.totalPatterns, 0);
    assert.equal(stats.totalMembers, 0);
    assert.ok(Array.isArray(stats.teams));
    assert.equal(stats.teams.length, 0);
    hub.stop();
    cleanDir(tmpDir);
  });
});

// ─── 2. Team Management ───

describe('HostedHub team management', () => {
  let hub, tmpDir;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('createTeam creates a team and returns team info + owner API key', () => {
    const result = hub.createTeam('alpha-team', 'alice');
    assert.ok(result.teamId, 'should return a teamId');
    assert.equal(typeof result.teamId, 'string');
    assert.ok(result.teamId.length > 0);
    assert.equal(result.name, 'alpha-team');
    assert.equal(result.owner, 'alice');
    assert.ok(result.ownerApiKey, 'should return an owner API key');
    assert.ok(result.ownerApiKey.length >= 32);
    assert.ok(result.settings);
    assert.equal(result.settings.minCoherency, 0.65);
    assert.equal(result.settings.maxPatterns, 10000);
    assert.equal(result.settings.isPublic, false);
  });

  it('createTeam rejects missing team name', () => {
    assert.throws(() => hub.createTeam('', 'owner'), /Team name is required/);
    assert.throws(() => hub.createTeam(null, 'owner'), /Team name is required/);
  });

  it('createTeam rejects missing owner name', () => {
    assert.throws(() => hub.createTeam('valid-name', ''), /Owner name is required/);
    assert.throws(() => hub.createTeam('valid-name', null), /Owner name is required/);
  });

  it('createTeam with duplicate name creates a separate team (unique teamId)', () => {
    const t1 = hub.createTeam('dup-name', 'owner1');
    const t2 = hub.createTeam('dup-name', 'owner2');
    assert.notEqual(t1.teamId, t2.teamId, 'each team should get a unique teamId');
    assert.equal(t1.name, t2.name, 'names can be the same');
    assert.notEqual(t1.ownerApiKey, t2.ownerApiKey, 'API keys should differ');
  });

  it('getTeamStats returns stats for an existing team', () => {
    const team = hub.createTeam('stats-team', 'stat-owner');
    const teamHub = hub.getHub(team.teamId);
    assert.ok(teamHub, 'hub should exist for the new team');
    const stats = teamHub.stats();
    assert.equal(stats.teamName, 'stats-team');
    assert.equal(typeof stats.totalPatterns, 'number');
    assert.equal(typeof stats.totalMembers, 'number');
    assert.equal(typeof stats.avgCoherency, 'number');
  });

  it('deleteTeam removes team (owner only)', () => {
    const team = hub.createTeam('delete-target', 'del-owner');
    assert.ok(hub.getHub(team.teamId), 'hub should exist before delete');

    const result = hub.deleteTeam(team.teamId, 'del-owner');
    assert.equal(result, true);
    assert.equal(hub.getHub(team.teamId), null, 'hub should be removed after delete');

    // Verify team directory is cleaned up
    const teamDir = path.join(tmpDir, team.teamId);
    assert.ok(!fs.existsSync(teamDir), 'team data directory should be removed');
  });

  it('deleteTeam rejects non-owner deletion', () => {
    const team = hub.createTeam('protected-team', 'real-owner');
    assert.throws(
      () => hub.deleteTeam(team.teamId, 'intruder'),
      /Only the team owner can delete/
    );
    // Verify team still exists
    assert.ok(hub.getHub(team.teamId), 'team should survive unauthorized delete attempt');
  });

  it('deleteTeam throws for non-existent team', () => {
    assert.throws(
      () => hub.deleteTeam('nonexistent-id-12345', 'anyone'),
      /Team not found/
    );
  });
});

// ─── 3. Member Management ───

describe('HostedHub member management', () => {
  let hub, tmpDir, team;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
    team = hub.createTeam('member-team', 'team-admin');
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('registerMember within a team returns API key', () => {
    const result = hub.registerMember(team.teamId, 'dev-alice');
    assert.ok(result.apiKey, 'should return an API key');
    assert.ok(result.apiKey.length >= 32);
    assert.equal(result.teamId, team.teamId);
    assert.equal(result.memberName, 'dev-alice');
    assert.equal(result.role, 'contributor');
  });

  it('API key is scoped to the correct team', () => {
    const result = hub.registerMember(team.teamId, 'dev-bob');
    const auth = hub.authenticate(result.apiKey);
    assert.ok(auth, 'authentication should succeed');
    assert.equal(auth.isAdmin, false);
    assert.equal(auth.teamId, team.teamId, 'API key should be scoped to the team');
    assert.equal(auth.memberName, 'dev-bob');
  });

  it('API key from one team does not authenticate for another', () => {
    const team2 = hub.createTeam('other-team', 'other-owner');
    const member = hub.registerMember(team.teamId, 'dev-charlie');
    const auth = hub.authenticate(member.apiKey);
    assert.ok(auth);
    assert.notEqual(auth.teamId, team2.teamId, 'key should not match a different team');
  });

  it('authenticate verifies team-scoped API keys', () => {
    const result = hub.registerMember(team.teamId, 'dev-dave');
    const auth = hub.authenticate(result.apiKey);
    assert.ok(auth);
    assert.equal(auth.teamId, team.teamId);
    assert.equal(auth.memberName, 'dev-dave');
    assert.equal(auth.role, 'contributor');
  });

  it('authenticate returns null for invalid API key', () => {
    const auth = hub.authenticate('completely-invalid-key-xyz');
    assert.equal(auth, null);
  });

  it('authenticate returns null for empty/missing key', () => {
    assert.equal(hub.authenticate(''), null);
    assert.equal(hub.authenticate(null), null);
    assert.equal(hub.authenticate(undefined), null);
  });

  it('registerMember throws for non-existent team', () => {
    assert.throws(
      () => hub.registerMember('fake-team-id', 'someone'),
      /Team not found/
    );
  });

  it('admin keys are recognized by authenticate', () => {
    const admin = hub.createAdminKey('test-admin');
    const auth = hub.authenticate(admin.apiKey);
    assert.ok(auth);
    assert.equal(auth.isAdmin, true);
  });
});

// ─── 4. Pattern Operations ───

describe('HostedHub pattern operations', () => {
  let hub, tmpDir, team;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
    team = hub.createTeam('pattern-team', 'pat-owner');
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('push patterns to team hub', () => {
    const teamHub = hub.getHub(team.teamId);
    const result = teamHub.pushPatterns([makePattern({ name: 'push-test' })], 'pat-owner');
    assert.equal(result.accepted, 1);
    assert.equal(result.rejected, 0);
    assert.equal(result.total, 1);
  });

  it('push enforces minCoherency threshold', () => {
    const teamHub = hub.getHub(team.teamId);
    const result = teamHub.pushPatterns([
      makePattern({ name: 'low-quality', coherencyTotal: 0.2 }),
    ], 'pat-owner');
    assert.equal(result.accepted, 0);
    assert.equal(result.rejected, 1);
    assert.ok(result.results[0].reason.includes('Coherency'));
  });

  it('pull patterns from team hub', () => {
    const teamHub = hub.getHub(team.teamId);
    // Ensure there is at least one pattern
    teamHub.pushPatterns([makePattern({ name: 'pull-target' })], 'pat-owner');
    const result = teamHub.pullPatterns({});
    assert.ok(result.count >= 1, 'should pull at least one pattern');
    assert.ok(result.patterns.length >= 1);
    assert.ok(result.patterns.some(p => p.name === 'pull-target'));
  });

  it('search patterns in team hub', () => {
    const teamHub = hub.getHub(team.teamId);
    teamHub.pushPatterns([
      makePattern({ name: 'quicksort', description: 'Sort an array quickly', tags: ['sort', 'algorithm'] }),
    ], 'pat-owner');

    const results = teamHub.search('quicksort');
    assert.ok(results.length > 0, 'should find at least one result');
    assert.equal(results[0].name, 'quicksort');
  });

  it('push respects maxPatterns limit', () => {
    // Create a team with a very small max patterns limit
    const smallTeam = hub.createTeam('tiny-team', 'tiny-owner', { maxPatterns: 2 });
    const teamHub = hub.getHub(smallTeam.teamId);

    // Push 2 patterns (fills to capacity)
    teamHub.pushPatterns([
      makePattern({ name: 'slot1' }),
      makePattern({ name: 'slot2' }),
    ], 'tiny-owner');

    // Verify the team is at capacity
    const currentCount = Object.keys(teamHub._patterns || {}).length;
    assert.equal(currentCount, 2);

    // The maxPatterns enforcement is in the HTTP route layer (_routeTeam).
    // Verify the metadata records the limit correctly.
    const meta = hub._getTeamMeta(smallTeam.teamId);
    assert.equal(meta.maxPatterns, 2);
    assert.ok(currentCount + 1 > meta.maxPatterns, 'adding another would exceed limit');
  });
});

// ─── 5. Activity Feed ───

describe('HostedHub activity feed', () => {
  let hub, tmpDir;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('activity logged on team creation', () => {
    const team = hub.createTeam('activity-team', 'act-user');
    const teamHub = hub.getHub(team.teamId);
    const activity = teamHub.activityFeed();
    assert.ok(activity.length > 0, 'should have at least one activity event');
    // Creating a team registers the owner as a member, which logs member_joined
    assert.ok(activity.some(a => a.type === 'member_joined'));
  });

  it('activity logged on pattern push', () => {
    const team = hub.createTeam('push-activity', 'pusher');
    const teamHub = hub.getHub(team.teamId);
    teamHub.pushPatterns([makePattern({ name: 'activity-pattern' })], 'pusher');

    const activity = teamHub.activityFeed();
    assert.ok(activity.some(a => a.type === 'patterns_pushed'));
  });

  it('activity feed returns events in order (most recent first)', () => {
    const team = hub.createTeam('ordered-activity', 'orderer');
    const teamHub = hub.getHub(team.teamId);
    teamHub.pushPatterns([makePattern({ name: 'first-push' })], 'orderer');
    teamHub.pushPatterns([makePattern({ name: 'second-push' })], 'orderer');

    const activity = teamHub.activityFeed();
    // activityFeed() reverses the internal array, so most recent is first
    assert.ok(activity.length >= 3, 'should have member_joined + 2 pushes');
    assert.equal(activity[0].type, 'patterns_pushed', 'most recent event should be first');

    // Timestamps should be in descending order
    for (let i = 1; i < activity.length; i++) {
      const prev = new Date(activity[i - 1].timestamp).getTime();
      const curr = new Date(activity[i].timestamp).getTime();
      assert.ok(prev >= curr, 'events should be ordered most recent first');
    }
  });
});

// ─── 6. Rate Limiter ───

describe('HostedHub rate limiter', () => {
  let hub, tmpDir;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('allows requests under limit', () => {
    const limiter = hub._rateLimiter;
    const key = 'under-limit-' + Date.now();
    const result = limiter.check(key);
    assert.equal(result.allowed, true);
    assert.ok(result.remaining > 0);
  });

  it('blocks requests over limit', () => {
    const limiter = hub._rateLimiter;
    const key = 'over-limit-' + Date.now();

    // Default max is 120 per minute window. Exhaust them all.
    for (let i = 0; i < 120; i++) {
      const r = limiter.check(key);
      assert.equal(r.allowed, true, `request ${i + 1} should be allowed`);
    }

    // The 121st request should be blocked
    const blocked = limiter.check(key);
    assert.equal(blocked.allowed, false, 'should be rate-limited after 120 requests');
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterMs > 0, 'should report a retry-after delay');
  });
});

// ─── 7. Global Stats ───

describe('HostedHub global stats', () => {
  let hub, tmpDir;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('returns correct total teams/patterns/members counts', () => {
    // Create 2 teams
    const t1 = hub.createTeam('global-team-1', 'owner1');
    const t2 = hub.createTeam('global-team-2', 'owner2');

    // Push patterns to team 1
    hub.getHub(t1.teamId).pushPatterns([
      makePattern({ name: 'gp1' }),
      makePattern({ name: 'gp2' }),
    ], 'owner1');

    // Push pattern to team 2
    hub.getHub(t2.teamId).pushPatterns([
      makePattern({ name: 'gp3' }),
    ], 'owner2');

    // Add an extra member to team 1
    hub.registerMember(t1.teamId, 'extra-dev');

    const stats = hub.globalStats();
    assert.equal(stats.totalTeams, 2);
    assert.equal(stats.totalPatterns, 3);
    // team1: owner1 + extra-dev = 2, team2: owner2 = 1 => 3 total
    assert.equal(stats.totalMembers, 3);
    assert.ok(Array.isArray(stats.teams));
    assert.equal(stats.teams.length, 2);

    // Verify per-team breakdown
    const team1Stats = stats.teams.find(t => t.teamId === t1.teamId);
    const team2Stats = stats.teams.find(t => t.teamId === t2.teamId);
    assert.ok(team1Stats);
    assert.ok(team2Stats);
    assert.equal(team1Stats.patterns, 2);
    assert.equal(team2Stats.patterns, 1);
    assert.equal(team1Stats.members, 2);
    assert.equal(team2Stats.members, 1);
  });
});

// ─── 8. Public Discovery ───

describe('HostedHub public discovery', () => {
  let hub, tmpDir;

  before(() => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('public teams appear in discover endpoint', () => {
    hub.createTeam('visible-team', 'pub-owner', { isPublic: true });
    const discovered = hub.discoverTeams();
    assert.ok(discovered.length > 0, 'should discover at least one public team');
    const found = discovered.find(t => t.name === 'visible-team');
    assert.ok(found, 'public team should appear in discovery');
    assert.ok(found.teamId);
    assert.equal(typeof found.patterns, 'number');
    assert.equal(typeof found.members, 'number');
    assert.ok(found.createdAt);
  });

  it('private teams do not appear in discover endpoint', () => {
    hub.createTeam('hidden-team', 'priv-owner', { isPublic: false });
    const discovered = hub.discoverTeams();
    const found = discovered.find(t => t.name === 'hidden-team');
    assert.equal(found, undefined, 'private team should not appear in discovery');
  });
});

// ─── 9. HTTP Server ───

describe('HostedHub HTTP server', () => {
  let hub, server, port, tmpDir;

  before(async () => {
    tmpDir = createTmpDir();
    hub = new HostedHub({ dataDir: tmpDir });
    // Use port 0 to let the OS assign an available port
    hub.port = 0;
    server = await hub.start();
    port = server.address().port;
  });

  after(() => {
    hub.stop();
    cleanDir(tmpDir);
  });

  it('health endpoint returns 200', async () => {
    const res = await httpRequest(port, 'GET', '/api/hub/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.service, 'hosted-hub');
    assert.ok(res.body.timestamp);
    assert.equal(typeof res.body.uptime, 'number');
  });

  it('stats endpoint works with authentication', async () => {
    const admin = hub.createAdminKey('http-admin');
    const res = await httpRequest(port, 'GET', '/api/hub/stats', null, {
      'Authorization': `Bearer ${admin.apiKey}`,
    });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.totalTeams, 'number');
    assert.equal(typeof res.body.totalPatterns, 'number');
    assert.equal(typeof res.body.totalMembers, 'number');
    assert.ok(Array.isArray(res.body.teams));
  });

  it('stats endpoint returns 401 without authentication', async () => {
    const res = await httpRequest(port, 'GET', '/api/hub/stats');
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  it('discover endpoint lists public teams', async () => {
    hub.createTeam('http-public-team', 'httpuser', { isPublic: true });
    const res = await httpRequest(port, 'GET', '/api/hub/discover');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.teams));
    assert.ok(res.body.teams.some(t => t.name === 'http-public-team'));
  });

  it('push patterns via HTTP', async () => {
    const team = hub.createTeam('http-push-team', 'http-pusher');
    const apiKey = team.ownerApiKey;

    const res = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [makePattern({ name: 'http-pushed-pattern' })],
    }, { 'Authorization': `Bearer ${apiKey}` });

    assert.equal(res.status, 200);
    assert.equal(res.body.accepted, 1);
    assert.equal(res.body.rejected, 0);
  });

  it('pull patterns via HTTP', async () => {
    const team = hub.createTeam('http-pull-team', 'http-puller');
    const apiKey = team.ownerApiKey;

    // Push first
    await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [makePattern({ name: 'pull-me' })],
    }, { 'Authorization': `Bearer ${apiKey}` });

    // Then pull
    const res = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/pull`, {}, {
      'Authorization': `Bearer ${apiKey}`,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
    assert.ok(res.body.patterns.some(p => p.name === 'pull-me'));
  });

  it('search patterns via HTTP', async () => {
    const team = hub.createTeam('http-search-team', 'http-searcher');
    const apiKey = team.ownerApiKey;

    await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [
        makePattern({ name: 'mergesort', tags: ['sort'], description: 'Merge sort algorithm' }),
        makePattern({ name: 'throttle', tags: ['timing'], description: 'Throttle function calls' }),
      ],
    }, { 'Authorization': `Bearer ${apiKey}` });

    const res = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/search`, {
      query: 'sort',
    }, { 'Authorization': `Bearer ${apiKey}` });

    assert.equal(res.status, 200);
    assert.ok(res.body.results.length > 0);
    assert.equal(res.body.results[0].name, 'mergesort');
  });

  it('push enforces maxPatterns limit via HTTP', async () => {
    const team = hub.createTeam('http-limited-team', 'http-limiter', { maxPatterns: 1 });
    const apiKey = team.ownerApiKey;

    // First push should succeed
    const first = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [makePattern({ name: 'only-one' })],
    }, { 'Authorization': `Bearer ${apiKey}` });
    assert.equal(first.status, 200);
    assert.equal(first.body.accepted, 1);

    // Second push should be rejected (exceeds maxPatterns=1)
    const second = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [makePattern({ name: 'one-too-many' })],
    }, { 'Authorization': `Bearer ${apiKey}` });
    assert.equal(second.status, 400);
    assert.ok(second.body.error.includes('exceed'), 'error should mention exceeding limit');
  });

  it('team-scoped API key cannot access another team', async () => {
    const teamA = hub.createTeam('team-a', 'owner-a');
    const teamB = hub.createTeam('team-b', 'owner-b');

    // Try to push to team-b using team-a's key
    const res = await httpRequest(port, 'POST', `/api/teams/${teamB.teamId}/push`, {
      patterns: [makePattern({ name: 'cross-team' })],
    }, { 'Authorization': `Bearer ${teamA.ownerApiKey}` });

    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('not authorized'));
  });

  it('activity endpoint returns team events', async () => {
    const team = hub.createTeam('http-activity-team', 'http-actor');
    const apiKey = team.ownerApiKey;

    // Push a pattern to generate activity
    await httpRequest(port, 'POST', `/api/teams/${team.teamId}/push`, {
      patterns: [makePattern({ name: 'activity-trigger' })],
    }, { 'Authorization': `Bearer ${apiKey}` });

    const res = await httpRequest(port, 'GET', `/api/teams/${team.teamId}/activity`, null, {
      'Authorization': `Bearer ${apiKey}`,
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.activity));
    assert.ok(res.body.activity.length >= 2, 'should have member_joined + patterns_pushed');
    assert.ok(res.body.activity.some(a => a.type === 'patterns_pushed'));
    assert.ok(res.body.activity.some(a => a.type === 'member_joined'));
  });

  it('delete team via HTTP (owner only)', async () => {
    const team = hub.createTeam('http-delete-target', 'http-deleter');
    const apiKey = team.ownerApiKey;

    const res = await httpRequest(port, 'DELETE', `/api/teams/${team.teamId}`, {}, {
      'Authorization': `Bearer ${apiKey}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, true);
    assert.equal(res.body.teamId, team.teamId);
    assert.equal(hub.getHub(team.teamId), null, 'hub should be removed');
  });

  it('member registration via HTTP', async () => {
    const team = hub.createTeam('http-member-team', 'http-mem-owner');

    const res = await httpRequest(port, 'POST', `/api/teams/${team.teamId}/members/register`, {
      name: 'http-new-member',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.apiKey);
    assert.equal(res.body.teamId, team.teamId);
    assert.equal(res.body.memberName, 'http-new-member');
  });

  it('returns 404 for unknown routes', async () => {
    const admin = hub.createAdminKey('404-test');
    const res = await httpRequest(port, 'GET', '/api/nonexistent', null, {
      'Authorization': `Bearer ${admin.apiKey}`,
    });
    assert.equal(res.status, 404);
  });

  it('returns 404 for unknown team', async () => {
    const admin = hub.createAdminKey('missing-team-test');
    const res = await httpRequest(port, 'GET', '/api/teams/000000000000000000000000/stats', null, {
      'Authorization': `Bearer ${admin.apiKey}`,
    });
    assert.equal(res.status, 404);
    assert.ok(res.body.error.includes('not found'));
  });
});
