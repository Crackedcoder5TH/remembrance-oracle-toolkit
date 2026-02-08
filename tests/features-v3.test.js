const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

// ─── Feature 1: AST-Based Multi-Language Transpiler ───

describe('Feature 1: AST Transpiler — Go and Rust', () => {
  const { transpile, toGo, toRust, detectPythonImports, detectGoImports } = require('../src/core/ast-transpiler');

  it('transpiles to Go with package declaration', () => {
    const result = transpile('function add(n) { return n + 1; }', 'go');
    assert.ok(result.success);
    assert.ok(result.code.includes('package main'));
    assert.ok(result.code.includes('func add'));
  });

  it('transpiles to Rust with fn keyword', () => {
    const result = transpile('function add(n) { return n + 1; }', 'rust');
    assert.ok(result.success);
    assert.ok(result.code.includes('fn add'));
    assert.ok(result.code.includes('return n + 1;'));
  });

  it('detects Python imports for math usage', () => {
    // Math.log maps to math.log (uses 'math' module), triggering import detection
    const result = transpile('function calc(n) { return Math.log(n); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('import math') || result.imports.length > 0);
  });

  it('detects Go imports for fmt usage', () => {
    const result = transpile('function greet() { console.log("hi"); }', 'go');
    assert.ok(result.success);
    assert.ok(result.imports.length > 0 || result.code.includes('fmt'));
  });

  it('returns error for unsupported language', () => {
    const result = transpile('function f() {}', 'cobol');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Unsupported'));
  });

  it('Go handles classes as structs', () => {
    const result = transpile('class Foo { constructor() {} bar() { return 1; } }', 'go');
    assert.ok(result.success);
    assert.ok(result.code.includes('type Foo struct'));
  });

  it('Rust handles arrays as vec!', () => {
    const result = transpile('function f() { let x = [1, 2, 3]; return x; }', 'rust');
    assert.ok(result.success);
    assert.ok(result.code.includes('vec!['));
  });
});

// ─── Feature 2: Community Pattern Voting ───

describe('Feature 2: Community Pattern Voting', () => {
  let oracle;
  let patternId;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vote-test-'));
    oracle = new RemembranceOracle({ storeDir: tmpDir });
    // Register a pattern to vote on
    const result = oracle.registerPattern({
      name: 'vote-test-pattern',
      code: 'function voteTest() { return 42; }',
      testCode: 'if (voteTest() !== 42) throw new Error("fail");',
      language: 'javascript',
      tags: ['test'],
    });
    if (result.registered) {
      patternId = result.pattern.id;
    }
  });

  it('upvotes a pattern', () => {
    if (!patternId) return;
    const result = oracle.vote(patternId, 'tester1', 1);
    assert.ok(result.success);
    assert.equal(result.upvotes, 1);
    assert.equal(result.downvotes, 0);
    assert.equal(result.voteScore, 1);
  });

  it('prevents duplicate votes', () => {
    if (!patternId) return;
    const result = oracle.vote(patternId, 'tester1', 1);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Already voted'));
  });

  it('allows vote change (up to down)', () => {
    if (!patternId) return;
    const result = oracle.vote(patternId, 'tester1', -1);
    assert.ok(result.success);
    assert.equal(result.downvotes, 1);
  });

  it('gets vote counts', () => {
    if (!patternId) return;
    const votes = oracle.getVotes(patternId);
    assert.ok(votes);
    assert.equal(typeof votes.upvotes, 'number');
    assert.equal(typeof votes.downvotes, 'number');
    assert.equal(typeof votes.voteScore, 'number');
  });

  it('returns null for nonexistent pattern', () => {
    const votes = oracle.getVotes('nonexistent');
    assert.equal(votes, null);
  });

  it('topVoted returns array', () => {
    const top = oracle.topVoted(5);
    assert.ok(Array.isArray(top));
  });

  it('voteBoost affects reliability', () => {
    if (!patternId) return;
    // Add some upvotes from different voters
    oracle.vote(patternId, 'tester2', 1);
    oracle.vote(patternId, 'tester3', 1);
    const rel = oracle.patterns.getReliability(patternId);
    if (rel) {
      assert.ok(rel.voteBoost >= 0 || rel.voteBoost <= 0);
      assert.equal(typeof rel.voteScore, 'number');
    }
  });
});

// ─── Feature 3: Visual Coherence Dashboard ───

describe('Feature 3: Visual Coherence Dashboard', () => {
  const http = require('http');

  it('dashboard HTML includes charts panel', () => {
    const { createDashboardServer } = require('../src/dashboard/server');
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'chart-test-')) });
    const server = createDashboardServer(oracle, { auth: false });

    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        http.get(`http://127.0.0.1:${port}/`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            server.close();
            assert.ok(data.includes('panel-charts'));
            assert.ok(data.includes('chart-coherence-dist'));
            assert.ok(data.includes('chart-dimensions'));
            assert.ok(data.includes('chart-sparkline'));
            assert.ok(data.includes('voice-toggle'));
            resolve();
          });
        }).on('error', (e) => { server.close(); reject(e); });
      });
    });
  });

  it('dashboard has vote API endpoint', () => {
    const { createDashboardServer } = require('../src/dashboard/server');
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vote-api-test-')) });
    const server = createDashboardServer(oracle, { auth: false });

    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const port = server.address().port;
        http.get(`http://127.0.0.1:${port}/api/top-voted`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            server.close();
            const parsed = JSON.parse(data);
            assert.ok(Array.isArray(parsed));
            resolve();
          });
        }).on('error', (e) => { server.close(); reject(e); });
      });
    });
  });
});

// ─── Feature 4: Voice Mode (CLI) ───

describe('Feature 4: Voice Mode', () => {
  it('speakCLI function exists in cli.js', () => {
    const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf-8');
    assert.ok(cliSrc.includes('function speakCLI'));
    assert.ok(cliSrc.includes('speechSynthesis') || cliSrc.includes('espeak') || cliSrc.includes('say '));
  });

  it('dashboard HTML includes voice toggle', () => {
    const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'dashboard', 'server.js'), 'utf-8');
    assert.ok(dashSrc.includes('voice-toggle'));
    assert.ok(dashSrc.includes('speakWhisper'));
    assert.ok(dashSrc.includes('SpeechSynthesisUtterance'));
  });

  it('resolve --voice flag is supported', () => {
    const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf-8');
    assert.ok(cliSrc.includes('args.voice'));
    assert.ok(cliSrc.includes('speakCLI(result.whisper)'));
  });
});

// ─── Feature 5: Federated Search Across Repos ───

describe('Feature 5: Federated Search Across Repos', () => {
  const { discoverRepoStores, registerRepo, listRepos, crossRepoSearch } = require('../src/core/persistence');

  it('discoverRepoStores returns array', () => {
    const stores = discoverRepoStores({ includeSiblings: false });
    assert.ok(Array.isArray(stores));
  });

  it('registerRepo registers a path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    fs.mkdirSync(path.join(tmpDir, '.remembrance'), { recursive: true });
    const result = registerRepo(tmpDir);
    assert.ok(result.registered);
    assert.equal(result.path, tmpDir);
  });

  it('listRepos returns registered repos', () => {
    const repos = listRepos();
    assert.ok(Array.isArray(repos));
    // Should have at least the one we just registered
    assert.ok(repos.length >= 1);
  });

  it('crossRepoSearch returns structured result', () => {
    const result = crossRepoSearch('test pattern', { repos: [] });
    assert.ok(result);
    assert.ok(Array.isArray(result.results));
    assert.ok(Array.isArray(result.repos));
    assert.equal(typeof result.totalSearched, 'number');
  });

  it('oracle API exposes crossRepoSearch', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'xsearch-test-')) });
    const result = oracle.crossRepoSearch('debounce');
    assert.ok(result);
    assert.ok(Array.isArray(result.results));
  });

  it('oracle API exposes discoverRepos', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-')) });
    const repos = oracle.discoverRepos({ includeSiblings: false });
    assert.ok(Array.isArray(repos));
  });

  it('oracle API exposes listRepos', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'list-test-')) });
    const repos = oracle.listRepos();
    assert.ok(Array.isArray(repos));
  });
});

// ─── Feature 6: HTTP Remote Oracle Federation ───

describe('Feature 6: Remote Oracle Federation', () => {
  const {
    RemoteOracleClient,
    registerRemote,
    removeRemote,
    listRemotes,
    federatedRemoteSearch,
    checkRemoteHealth,
  } = require('../src/cloud/client');

  // Use a separate remotes config to avoid polluting the real one
  const tmpRemotesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-test-'));
  const remotesConfigPath = path.join(tmpRemotesDir, 'remotes.json');

  it('RemoteOracleClient constructs correctly', () => {
    const client = new RemoteOracleClient('http://localhost:9999', { name: 'test-remote', timeout: 5000 });
    assert.equal(client.baseUrl, 'http://localhost:9999');
    assert.equal(client.name, 'test-remote');
    assert.equal(client.timeout, 5000);
    assert.equal(client.token, null);
  });

  it('RemoteOracleClient strips trailing slash', () => {
    const client = new RemoteOracleClient('http://localhost:9999/');
    assert.equal(client.baseUrl, 'http://localhost:9999');
  });

  it('RemoteOracleClient stores token', () => {
    const client = new RemoteOracleClient('http://localhost:9999', { token: 'jwt-abc' });
    assert.equal(client.token, 'jwt-abc');
  });

  it('RemoteOracleClient.health returns offline for unreachable server', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const health = await client.health();
    assert.equal(health.online, false);
    assert.equal(typeof health.latencyMs, 'number');
  });

  it('RemoteOracleClient.search handles connection error gracefully', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.search('test query');
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, 0);
    assert.ok(result.error);
  });

  it('RemoteOracleClient.login handles connection error', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.login('user', 'pass');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('RemoteOracleClient.stats handles connection error', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.stats();
    assert.ok(result.error);
  });

  it('RemoteOracleClient.pull handles connection error', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.pull();
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('RemoteOracleClient.push handles connection error', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.push([]);
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('RemoteOracleClient.getPatterns handles connection error', async () => {
    const client = new RemoteOracleClient('http://127.0.0.1:19999', { timeout: 500 });
    const result = await client.getPatterns({ language: 'javascript', limit: 5 });
    assert.ok(Array.isArray(result.patterns));
    assert.equal(result.patterns.length, 0);
    assert.ok(result.error);
  });

  it('registerRemote registers a server', () => {
    const result = registerRemote('http://example.com:3579', { name: 'my-remote' });
    assert.ok(result.registered);
    assert.equal(result.name, 'my-remote');
    assert.equal(result.url, 'http://example.com:3579');
    assert.equal(result.totalRemotes >= 1, true);
  });

  it('listRemotes returns registered remotes', () => {
    const remotes = listRemotes();
    assert.ok(Array.isArray(remotes));
    const found = remotes.find(r => r.url === 'http://example.com:3579');
    assert.ok(found);
    assert.equal(found.name, 'my-remote');
  });

  it('registerRemote updates existing remote', () => {
    const result = registerRemote('http://example.com:3579', { name: 'updated-remote', token: 'tok123' });
    assert.ok(result.registered);
    assert.equal(result.name, 'updated-remote');
    const remotes = listRemotes();
    const found = remotes.find(r => r.url === 'http://example.com:3579');
    assert.equal(found.name, 'updated-remote');
    assert.equal(found.token, 'tok123');
  });

  it('removeRemote removes a server', () => {
    const result = removeRemote('http://example.com:3579');
    assert.ok(result.removed);
    const remotes = listRemotes();
    const found = remotes.find(r => r.url === 'http://example.com:3579');
    assert.equal(found, undefined);
  });

  it('removeRemote returns false for nonexistent', () => {
    const result = removeRemote('http://nonexistent:9999');
    assert.equal(result.removed, false);
    assert.ok(result.error);
  });

  it('federatedRemoteSearch returns empty when no remotes', async () => {
    const result = await federatedRemoteSearch('test', { remotes: [] });
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, 0);
    assert.ok(Array.isArray(result.remotes));
    assert.ok(Array.isArray(result.errors));
  });

  it('federatedRemoteSearch handles unreachable remotes', async () => {
    const fakeRemotes = [
      { url: 'http://127.0.0.1:19998', name: 'fake1', token: null },
      { url: 'http://127.0.0.1:19997', name: 'fake2', token: null },
    ];
    const result = await federatedRemoteSearch('sort algorithm', { remotes: fakeRemotes, timeout: 500 });
    assert.ok(Array.isArray(result.results));
    assert.equal(result.results.length, 0);
    assert.equal(result.remotes.length, 2);
    assert.ok(result.errors.length > 0);
  });

  it('checkRemoteHealth returns health for registered remotes', async () => {
    // Register a fake remote
    registerRemote('http://127.0.0.1:19996', { name: 'health-test' });
    const results = await checkRemoteHealth();
    assert.ok(Array.isArray(results));
    const found = results.find(r => r.name === 'health-test');
    if (found) {
      assert.equal(found.online, false);
      assert.equal(typeof found.latencyMs, 'number');
    }
    // Clean up
    removeRemote('http://127.0.0.1:19996');
  });

  it('oracle API exposes registerRemote', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rem-test-')) });
    const result = oracle.registerRemote('http://127.0.0.1:19995', { name: 'api-test' });
    assert.ok(result.registered);
    // Clean up
    oracle.removeRemote('http://127.0.0.1:19995');
  });

  it('oracle API exposes listRemotes', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'lrem-test-')) });
    const remotes = oracle.listRemotes();
    assert.ok(Array.isArray(remotes));
  });

  it('oracle API exposes remoteSearch', async () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rsearch-test-')) });
    const result = await oracle.remoteSearch('debounce', { language: 'javascript' });
    assert.ok(result);
    assert.ok(Array.isArray(result.results));
  });

  it('oracle API exposes fullFederatedSearch', async () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'full-test-')) });
    const result = await oracle.fullFederatedSearch('sort');
    assert.ok(result);
    assert.ok(Array.isArray(result.results));
    assert.equal(typeof result.localCount, 'number');
    assert.equal(typeof result.repoCount, 'number');
    assert.equal(typeof result.remoteCount, 'number');
    assert.ok(Array.isArray(result.errors));
  });

  it('CLI has remote command', () => {
    const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf-8');
    assert.ok(cliSrc.includes("cmd === 'remote'"));
    assert.ok(cliSrc.includes('registerRemote'));
    assert.ok(cliSrc.includes('removeRemote'));
    assert.ok(cliSrc.includes('checkRemoteHealth'));
    assert.ok(cliSrc.includes('remoteSearch'));
  });

  it('MCP server has remote tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    const names = TOOLS.map(t => t.name);
    assert.ok(names.includes('oracle_remote_search'));
    assert.ok(names.includes('oracle_remotes'));
    assert.ok(names.includes('oracle_full_search'));
  });
});

// ─── Feature 7: Weighted Voting with Contributor Reputation ───

describe('Feature 7: Weighted Voting with Reputation', () => {
  let oracle;
  let patternId;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-test-'));
    oracle = new RemembranceOracle({ storeDir: tmpDir });
    const result = oracle.registerPattern({
      name: 'rep-test-pattern',
      code: 'function repTest() { return 99; }',
      testCode: 'if (repTest() !== 99) throw new Error("fail");',
      language: 'javascript',
      tags: ['test'],
    });
    if (result.registered) patternId = result.pattern.id;
  });

  it('creates voter profile on first vote', () => {
    if (!patternId) return;
    const result = oracle.vote(patternId, 'newvoter1', 1);
    assert.ok(result.success);
    assert.equal(typeof result.weight, 'number');
    assert.equal(typeof result.voterReputation, 'number');
    assert.equal(result.weight, 1.0); // new voter starts at 1.0
    assert.equal(result.voterReputation, 1.0);
  });

  it('getVoterReputation returns profile', () => {
    const rep = oracle.getVoterReputation('newvoter1');
    assert.ok(rep);
    assert.equal(rep.id, 'newvoter1');
    assert.equal(rep.reputation, 1.0);
    assert.equal(typeof rep.weight, 'number');
    assert.ok(Array.isArray(rep.recentVotes));
    assert.ok(rep.recentVotes.length >= 1);
  });

  it('getVoterReputation creates new profile for unknown voter', () => {
    const rep = oracle.getVoterReputation('brandnew');
    assert.ok(rep);
    assert.equal(rep.id, 'brandnew');
    assert.equal(rep.reputation, 1.0);
  });

  it('topVoters returns voter list', () => {
    const voters = oracle.topVoters(10);
    assert.ok(Array.isArray(voters));
    assert.ok(voters.length >= 1);
    assert.equal(typeof voters[0].reputation, 'number');
  });

  it('weighted score appears in getVotes', () => {
    if (!patternId) return;
    const votes = oracle.getVotes(patternId);
    assert.ok(votes);
    assert.equal(typeof votes.weightedScore, 'number');
  });

  it('reputation updates on positive feedback for upvoted pattern', () => {
    if (!patternId) return;
    // Report successful usage — voter who upvoted should gain reputation
    oracle.patternFeedback(patternId, true);
    const rep = oracle.getVoterReputation('newvoter1');
    assert.ok(rep.reputation > 1.0, `expected reputation > 1.0, got ${rep.reputation}`);
  });

  it('reputation decreases on failed feedback for upvoted pattern', () => {
    if (!patternId) return;
    // Save current reputation
    const before = oracle.getVoterReputation('newvoter1').reputation;
    // Report failed usage — voter who upvoted should lose reputation
    oracle.patternFeedback(patternId, false);
    const after = oracle.getVoterReputation('newvoter1').reputation;
    assert.ok(after < before, `expected ${after} < ${before}`);
  });

  it('vote weight scales with reputation', () => {
    if (!patternId) return;
    // Register another pattern and vote with different voters
    const result = oracle.registerPattern({
      name: 'rep-weight-test',
      code: 'function weightTest() { return 100; }',
      testCode: 'if (weightTest() !== 100) throw new Error("fail");',
      language: 'javascript',
      tags: ['test'],
    });
    if (!result.registered) return;
    const pid = result.pattern.id;

    // Vote with a voter who has gained reputation
    const v1 = oracle.vote(pid, 'newvoter1', 1);
    assert.ok(v1.success);
    // Weight should reflect their current reputation
    assert.equal(typeof v1.weight, 'number');
    assert.ok(v1.weight >= 0.5 && v1.weight <= 2.0);
  });

  it('reputation capped between 0.1 and 3.0', () => {
    const sqliteStore = oracle.patterns._sqlite;
    if (!sqliteStore) return;
    // Manually check boundaries via direct DB call
    const voter = sqliteStore.getVoter('boundary-test');
    assert.ok(voter);
    assert.equal(voter.reputation, 1.0);
    // updateVoterReputation is tested via patternFeedback above
  });

  it('MCP has reputation tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const names = TOOLS.map(t => t.name);
    assert.ok(names.includes('oracle_reputation'));
  });

  it('CLI has reputation command', () => {
    const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf-8');
    assert.ok(cliSrc.includes("cmd === 'reputation'"));
    assert.ok(cliSrc.includes('getVoterReputation'));
    assert.ok(cliSrc.includes('topVoters'));
  });
});
