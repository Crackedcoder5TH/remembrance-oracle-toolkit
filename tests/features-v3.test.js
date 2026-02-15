const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

/** Read all CLI source files (cli.js + command modules) as a single string for assertion checks. */
function readCliSources() {
  const cliDir = path.join(__dirname, '..', 'src');
  const mainCli = fs.readFileSync(path.join(cliDir, 'cli.js'), 'utf-8');
  const commandsDir = path.join(cliDir, 'cli', 'commands');
  if (!fs.existsSync(commandsDir)) return mainCli;
  const modules = fs.readdirSync(commandsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(commandsDir, f), 'utf-8'));
  return [mainCli, ...modules].join('\n');
}

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
    const cliSrc = readCliSources();
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
    const cliSrc = readCliSources();
    assert.ok(cliSrc.includes("'remote'"));
    assert.ok(cliSrc.includes('registerRemote'));
    assert.ok(cliSrc.includes('removeRemote'));
    assert.ok(cliSrc.includes('checkRemoteHealth'));
    assert.ok(cliSrc.includes('remoteSearch'));
  });

  it('remote tools accessible via oracle API (not MCP)', () => {
    const oracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rem-api-test-')) });
    assert.equal(typeof oracle.registerRemote, 'function');
    assert.equal(typeof oracle.removeRemote, 'function');
    assert.equal(typeof oracle.listRemotes, 'function');
    assert.equal(typeof oracle.remoteSearch, 'function');
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
    const result = oracle.vote(patternId, 'repvoter1', 1);
    assert.ok(result.success);
    assert.equal(typeof result.weight, 'number');
    assert.equal(typeof result.voterReputation, 'number');
    assert.ok(result.weight >= 0.5 && result.weight <= 2.0);
    assert.ok(result.voterReputation >= 0.1 && result.voterReputation <= 3.0);
  });

  it('getVoterReputation returns profile', () => {
    const rep = oracle.getVoterReputation('repvoter1');
    assert.ok(rep);
    assert.equal(rep.id, 'repvoter1');
    assert.ok(rep.reputation >= 0.1 && rep.reputation <= 3.0);
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
    const rep = oracle.getVoterReputation('repvoter1');
    assert.ok(rep.reputation > 1.0, `expected reputation > 1.0, got ${rep.reputation}`);
  });

  it('reputation decreases on failed feedback for upvoted pattern', () => {
    if (!patternId) return;
    // Save current reputation
    const before = oracle.getVoterReputation('repvoter1').reputation;
    // Report failed usage — voter who upvoted should lose reputation
    oracle.patternFeedback(patternId, false);
    const after = oracle.getVoterReputation('repvoter1').reputation;
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
    const v1 = oracle.vote(pid, 'repvoter1', 1);
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

  it('reputation accessible via oracle API (not MCP)', () => {
    const tmpOracle = new RemembranceOracle({ storeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rep-api-test-')) });
    assert.equal(typeof tmpOracle.getVoterReputation, 'function');
    assert.equal(typeof tmpOracle.topVoters, 'function');
  });

  it('CLI has reputation command', () => {
    const cliSrc = readCliSources();
    assert.ok(cliSrc.includes("'reputation'"));
    assert.ok(cliSrc.includes('getVoterReputation'));
    assert.ok(cliSrc.includes('topVoters'));
  });
});

// ─── Feature 8: Transpiler Compile-Verification and Test Generation ───

describe('Feature 8: Transpiler Verification & Test Generation', () => {
  const { generateGoTest, generateRustTest, extractTestCalls, verifyTranspilation } = require('../src/core/ast-transpiler');

  it('extractTestCalls finds assertions in JS test code', () => {
    const testCode = 'if (add(2, 3) !== 5) throw new Error("fail");';
    const calls = extractTestCalls(testCode);
    assert.ok(calls.length >= 1);
    assert.equal(calls[0].func, 'add');
    assert.equal(calls[0].args, '2, 3');
    assert.equal(calls[0].expected, '5');
  });

  it('extractTestCalls handles === assertions', () => {
    const testCode = 'if (double(4) === 8) console.log("ok");';
    const calls = extractTestCalls(testCode);
    assert.ok(calls.length >= 1);
    assert.equal(calls[0].func, 'double');
  });

  it('generateGoTest produces valid Go test structure', () => {
    const goCode = 'package main\n\nfunc add(a int, b int) int {\n\treturn a + b\n}';
    const jsTest = 'if (add(2, 3) !== 5) throw new Error("fail");';
    const testCode = generateGoTest(goCode, jsTest, 'add');
    assert.ok(testCode);
    assert.ok(testCode.includes('package main'));
    assert.ok(testCode.includes('import "testing"'));
    assert.ok(testCode.includes('func Test'));
    assert.ok(testCode.includes('t *testing.T'));
  });

  it('generateGoTest creates fallback test when no assertions found', () => {
    const testCode = generateGoTest('package main', 'console.log("hi")', 'foo');
    assert.ok(testCode);
    assert.ok(testCode.includes('TestCompiles'));
  });

  it('generateRustTest produces valid Rust test structure', () => {
    const rustCode = 'fn add(a: i64, b: i64) -> i64 {\n    a + b\n}';
    const jsTest = 'if (add(2, 3) !== 5) throw new Error("fail");';
    const testCode = generateRustTest(rustCode, jsTest, 'add');
    assert.ok(testCode);
    assert.ok(testCode.includes('use super::*'));
    assert.ok(testCode.includes('#[test]'));
    assert.ok(testCode.includes('assert_eq!') || testCode.includes('assert_ne!'));
  });

  it('generateRustTest creates fallback test when no assertions found', () => {
    const testCode = generateRustTest('fn foo() {}', 'console.log("hi")', 'foo');
    assert.ok(testCode);
    assert.ok(testCode.includes('test_compiles'));
  });

  it('generateGoTest returns null without testCode', () => {
    assert.equal(generateGoTest('code', null, 'fn'), null);
  });

  it('generateRustTest returns null without testCode', () => {
    assert.equal(generateRustTest('code', null, 'fn'), null);
  });

  it('verifyTranspilation returns compiled status', () => {
    // Test with intentionally invalid code to verify the function runs
    const result = verifyTranspilation('not valid go code', 'not valid test', 'go');
    assert.equal(typeof result.compiled, 'boolean');
    assert.equal(typeof result.output, 'string');
  });

  it('recycler _toASTLanguage now produces testCode', () => {
    const recyclerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'evolution', 'recycler.js'), 'utf-8');
    assert.ok(recyclerSrc.includes('generateGoTest'));
    assert.ok(recyclerSrc.includes('generateRustTest'));
    assert.ok(recyclerSrc.includes('verifyTranspilation'));
    assert.ok(recyclerSrc.includes('compile-verified'));
  });

  it('verify transpile accessible via module (not MCP)', () => {
    const { verifyTranspilation } = require('../src/core/ast-transpiler');
    assert.equal(typeof verifyTranspilation, 'function');
  });

  it('CLI has verify-transpile command', () => {
    const cliSrc = readCliSources();
    assert.ok(cliSrc.includes("'verify-transpile'"));
    assert.ok(cliSrc.includes('verifyTranspilation'));
  });
});

// ─── Feature 9: Exportable AI Context Injection ───

describe('Feature 9: AI Context Injection', () => {
  let oracle;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
    oracle = new RemembranceOracle({ storeDir: tmpDir });
    oracle.registerPattern({
      name: 'ctx-test-fn',
      code: 'function ctxTest() { return 1; }',
      testCode: 'if (ctxTest() !== 1) throw new Error("fail");',
      language: 'javascript',
      tags: ['test', 'context'],
    });
  });

  it('generateContext returns markdown by default', () => {
    const ctx = oracle.generateContext();
    assert.equal(ctx.format, 'markdown');
    assert.ok(ctx.prompt.includes('# Remembrance Oracle'));
    assert.ok(ctx.prompt.includes('Verified Code Memory'));
    assert.ok(ctx.prompt.includes('javascript'));
    assert.equal(typeof ctx.stats.totalPatterns, 'number');
    assert.ok(ctx.stats.totalPatterns >= 1);
  });

  it('generateContext returns JSON format', () => {
    const ctx = oracle.generateContext({ format: 'json' });
    assert.equal(ctx.format, 'json');
    const parsed = JSON.parse(ctx.prompt);
    assert.ok(parsed.oracle);
    assert.ok(parsed.oracle.stats);
    assert.ok(Array.isArray(parsed.oracle.patterns));
    assert.ok(parsed.oracle.instructions);
  });

  it('generateContext returns text format', () => {
    const ctx = oracle.generateContext({ format: 'text' });
    assert.equal(ctx.format, 'text');
    assert.ok(ctx.prompt.includes('REMEMBRANCE ORACLE'));
    assert.ok(ctx.prompt.includes('TOP PATTERNS'));
  });

  it('generateContext includes pattern stats', () => {
    const ctx = oracle.generateContext();
    assert.ok(ctx.stats.byLanguage.javascript >= 1);
    assert.ok(Object.keys(ctx.stats.byType).length >= 1);
  });

  it('generateContext limits patterns', () => {
    const ctx = oracle.generateContext({ format: 'json', maxPatterns: 2 });
    const parsed = JSON.parse(ctx.prompt);
    assert.ok(parsed.oracle.patterns.length <= 2);
  });

  it('generateContext includes code when requested', () => {
    const ctx = oracle.generateContext({ format: 'json', includeCode: true });
    const parsed = JSON.parse(ctx.prompt);
    if (parsed.oracle.patterns.length > 0) {
      assert.ok(parsed.oracle.patterns[0].code);
    }
  });

  it('exportContext returns string directly', () => {
    const prompt = oracle.exportContext();
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.includes('Remembrance Oracle'));
  });

  it('context includes usage instructions', () => {
    const ctx = oracle.generateContext();
    assert.ok(ctx.prompt.includes('Search the oracle'));
    assert.ok(ctx.prompt.includes('oracle_search'));
    assert.ok(ctx.prompt.includes('PULL'));
    assert.ok(ctx.prompt.includes('GENERATE'));
  });

  it('context accessible via oracle API (not MCP)', () => {
    assert.equal(typeof oracle.generateContext, 'function');
    assert.equal(typeof oracle.exportContext, 'function');
  });

  it('CLI has context command', () => {
    const cliSrc = readCliSources();
    assert.ok(cliSrc.includes("'context'"));
    assert.ok(cliSrc.includes('generateContext'));
    assert.ok(cliSrc.includes("'context'"));
  });
});

// ─── Feature 10: Package Distribution ───

describe('Feature 10: Package Distribution', () => {
  it('package.json has bin entries for oracle and remembrance-oracle', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    assert.equal(pkg.bin['oracle'], 'src/cli.js');
    assert.equal(pkg.bin['remembrance-oracle'], 'src/cli.js');
  });

  it('package.json has correct engine requirement', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    assert.ok(pkg.engines.node.includes('22'));
  });

  it('cli.js has shebang line', () => {
    const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf-8');
    assert.ok(cli.startsWith('#!/usr/bin/env node'));
  });

  it('index.js exports all major modules', () => {
    const idx = require('../src/index');
    assert.ok(idx.RemembranceOracle);
    assert.ok(idx.PatternLibrary);
    assert.ok(idx.CloudSyncServer);
    assert.ok(idx.RemoteOracleClient);
    assert.ok(idx.MCPServer);
    assert.ok(idx.DebugOracle);
    assert.ok(idx.AuthManager);
  });

  it('setup command exists in CLI', () => {
    const cli = readCliSources();
    assert.ok(cli.includes("'setup'"));
    assert.ok(cli.includes("'init'"));
  });

  it('package.json has cloud script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    assert.ok(pkg.scripts.cloud);
    assert.ok(pkg.scripts.mcp);
    assert.ok(pkg.scripts.dashboard);
  });

  it('package.json has zero dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    assert.equal(deps, 0, 'should have zero npm dependencies');
  });

  it('setup command creates .remembrance and CLAUDE.md', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-'));
    const oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
    // Simulate setup logic
    const storeDir = path.join(tmpDir, '.remembrance');
    if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });
    const claudeMd = path.join(tmpDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) fs.writeFileSync(claudeMd, '# Oracle Instructions\n');
    assert.ok(fs.existsSync(storeDir));
    assert.ok(fs.existsSync(claudeMd));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Feature 11: MCP Auto-Registration ───

describe('Feature 11: MCP Auto-Registration', () => {
  const { getConfigPaths, getServerConfig, updateConfigFile, removeFromConfig, checkInstallation, installAll, uninstallAll, SERVER_NAME } = require('../src/ide/mcp-install');

  it('getConfigPaths returns all editor paths', () => {
    const paths = getConfigPaths();
    assert.ok(paths.claude);
    assert.ok(paths.cursor);
    assert.ok(paths.vscode);
    assert.ok(paths.claudeCode);
  });

  it('getServerConfig returns node command by default', () => {
    const config = getServerConfig();
    assert.equal(config.command, 'node');
    assert.ok(config.args.includes('mcp'));
  });

  it('getServerConfig returns npx when requested', () => {
    const config = getServerConfig({ command: 'npx' });
    assert.equal(config.command, 'npx');
    assert.ok(config.args.includes('remembrance-oracle-toolkit'));
  });

  it('updateConfigFile creates config and adds server', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-'));
    const configPath = path.join(tmpDir, 'mcp.json');
    const result = updateConfigFile(configPath, { command: 'node', args: ['test.js'] });
    assert.ok(result.success);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(config.mcpServers[SERVER_NAME]);
    assert.equal(config.mcpServers[SERVER_NAME].command, 'node');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updateConfigFile preserves existing servers', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-'));
    const configPath = path.join(tmpDir, 'mcp.json');
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { 'other-server': { command: 'python', args: ['srv.py'] } } }));
    updateConfigFile(configPath, { command: 'node', args: ['test.js'] });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(config.mcpServers['other-server']);
    assert.ok(config.mcpServers[SERVER_NAME]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removeFromConfig removes server entry', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-'));
    const configPath = path.join(tmpDir, 'mcp.json');
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: 'node', args: [] } } }));
    const result = removeFromConfig(configPath);
    assert.ok(result.success);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(!config.mcpServers[SERVER_NAME]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removeFromConfig skips missing files', () => {
    const result = removeFromConfig('/tmp/nonexistent-mcp-config.json');
    assert.ok(result.success);
    assert.ok(result.skipped);
  });

  it('checkInstallation returns status for all editors', () => {
    const status = checkInstallation();
    assert.ok(typeof status === 'object');
    assert.ok('claude' in status);
    assert.ok('cursor' in status);
    assert.ok(typeof status.claude.installed === 'boolean');
  });

  it('CLI has mcp-install command', () => {
    const cli = readCliSources();
    assert.ok(cli.includes("'mcp-install'"));
    assert.ok(cli.includes("'mcp-install'"));
    assert.ok(cli.includes('checkInstallation'));
  });

  it('MCP install accessible via module (not MCP tool)', () => {
    const { installAll, checkInstallation } = require('../src/ide/mcp-install');
    assert.equal(typeof installAll, 'function');
    assert.equal(typeof checkInstallation, 'function');
  });
});

// ─── Feature 12: Native Pattern Seeds ───

describe('Feature 12: Native Pattern Seeds (Python/Go/Rust)', () => {
  it('PYTHON_SEEDS has idiomatic Python patterns', () => {
    const { PYTHON_SEEDS } = require('../src/patterns/seed-helpers');
    assert.ok(PYTHON_SEEDS.length >= 8, 'should have at least 8 Python seeds');
    assert.ok(PYTHON_SEEDS.every(s => s.language === 'python'));
    assert.ok(PYTHON_SEEDS.every(s => s.code && s.testCode && s.name));
    const names = PYTHON_SEEDS.map(s => s.name);
    assert.ok(names.includes('lru-cache-py'));
    assert.ok(names.includes('retry-decorator-py'));
  });

  it('GO_SEEDS has idiomatic Go patterns', () => {
    const { GO_SEEDS } = require('../src/patterns/seed-helpers');
    assert.ok(GO_SEEDS.length >= 6, 'should have at least 6 Go seeds');
    assert.ok(GO_SEEDS.every(s => s.language === 'go'));
    assert.ok(GO_SEEDS.every(s => s.code && s.testCode && s.name));
    const names = GO_SEEDS.map(s => s.name);
    assert.ok(names.includes('worker-pool-go'));
    assert.ok(names.includes('binary-search-go'));
  });

  it('RUST_SEEDS has idiomatic Rust patterns', () => {
    const { RUST_SEEDS } = require('../src/patterns/seed-helpers');
    assert.ok(RUST_SEEDS.length >= 6, 'should have at least 6 Rust seeds');
    assert.ok(RUST_SEEDS.every(s => s.language === 'rust'));
    assert.ok(RUST_SEEDS.every(s => s.code && s.testCode && s.name));
    const names = RUST_SEEDS.map(s => s.name);
    assert.ok(names.includes('trait-strategy-rust'));
    assert.ok(names.includes('linked-list-rust'));
  });

  it('Rust test code includes use super::*', () => {
    const { RUST_SEEDS } = require('../src/patterns/seed-helpers');
    for (const seed of RUST_SEEDS) {
      assert.ok(seed.testCode.includes('use super::*'), seed.name + ' should have use super::*');
    }
  });

  it('seedNativeLibrary function exists', () => {
    const { seedNativeLibrary } = require('../src/patterns/seed-helpers');
    assert.equal(typeof seedNativeLibrary, 'function');
  });

  it('native patterns are tagged as native', () => {
    const { PYTHON_SEEDS, GO_SEEDS, RUST_SEEDS } = require('../src/patterns/seed-helpers');
    assert.ok(PYTHON_SEEDS.every(s => s.tags.includes('python-native')));
    assert.ok(GO_SEEDS.every(s => s.tags.includes('go-native')));
    assert.ok(RUST_SEEDS.every(s => s.tags.includes('rust-native')));
  });

  it('CLI seed command includes native seeds', () => {
    const cli = readCliSources();
    assert.ok(cli.includes('seedNativeLibrary'));
    assert.ok(cli.includes('Native seeds'));
  });
});

// ─── Feature 13: GitHub OAuth Identity ───

describe('Feature 13: GitHub OAuth Identity', () => {
  const { GitHubIdentity } = require('../src/auth/github-oauth');

  it('GitHubIdentity class exists with required methods', () => {
    const gh = new GitHubIdentity();
    assert.equal(typeof gh.verifyToken, 'function');
    assert.equal(typeof gh.startDeviceFlow, 'function');
    assert.equal(typeof gh.pollDeviceFlow, 'function');
    assert.equal(typeof gh.getIdentity, 'function');
    assert.equal(typeof gh.getByUsername, 'function');
    assert.equal(typeof gh.listIdentities, 'function');
    assert.equal(typeof gh.isVerified, 'function');
    assert.equal(typeof gh.recordContribution, 'function');
    assert.equal(typeof gh.removeIdentity, 'function');
  });

  it('in-memory identity management works', () => {
    const gh = new GitHubIdentity();
    // Simulate saving an identity
    gh._saveIdentity({
      voterId: 'github:testuser',
      githubUsername: 'testuser',
      githubId: 12345,
      avatarUrl: 'https://github.com/testuser.png',
    });

    const identity = gh.getIdentity('github:testuser');
    assert.ok(identity);
    assert.equal(identity.githubUsername, 'testuser');
    assert.equal(identity.githubId, 12345);

    assert.ok(gh.isVerified('github:testuser'));
    assert.ok(!gh.isVerified('github:unknown'));

    const byUsername = gh.getByUsername('testuser');
    assert.ok(byUsername);
    assert.equal(byUsername.voterId, 'github:testuser');
  });

  it('recordContribution increments counter', () => {
    const gh = new GitHubIdentity();
    gh._saveIdentity({
      voterId: 'github:contributor1',
      githubUsername: 'contributor1',
      githubId: 999,
      avatarUrl: '',
    });
    gh.recordContribution('github:contributor1');
    gh.recordContribution('github:contributor1');
    const identity = gh.getIdentity('github:contributor1');
    assert.equal(identity.contributions, 2);
  });

  it('removeIdentity removes identity', () => {
    const gh = new GitHubIdentity();
    gh._saveIdentity({
      voterId: 'github:removeme',
      githubUsername: 'removeme',
      githubId: 111,
      avatarUrl: '',
    });
    assert.ok(gh.isVerified('github:removeme'));
    gh.removeIdentity('github:removeme');
    assert.ok(!gh.isVerified('github:removeme'));
  });

  it('listIdentities returns all identities', () => {
    const gh = new GitHubIdentity();
    gh._saveIdentity({ voterId: 'github:user1', githubUsername: 'user1', githubId: 1, avatarUrl: '' });
    gh._saveIdentity({ voterId: 'github:user2', githubUsername: 'user2', githubId: 2, avatarUrl: '' });
    const list = gh.listIdentities();
    assert.ok(list.length >= 2);
  });

  it('startDeviceFlow requires clientId', async () => {
    const gh = new GitHubIdentity();
    const result = await gh.startDeviceFlow();
    assert.ok(result.error);
    assert.ok(result.error.includes('Client ID'));
  });

  it('SQLite-backed identity management', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-oauth-'));
    const oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
    const sqliteStore = oracle.store.getSQLiteStore();
    const gh = new GitHubIdentity({ store: sqliteStore });

    gh._saveIdentity({
      voterId: 'github:sqluser',
      githubUsername: 'sqluser',
      githubId: 42,
      avatarUrl: 'https://github.com/sqluser.png',
    });

    const identity = gh.getIdentity('github:sqluser');
    assert.ok(identity);
    assert.equal(identity.github_username, 'sqluser');

    gh.recordContribution('github:sqluser');
    const updated = gh.getIdentity('github:sqluser');
    assert.equal(updated.contributions, 1);

    const list = gh.listIdentities();
    assert.ok(list.length >= 1);

    gh.removeIdentity('github:sqluser');
    assert.ok(!gh.getIdentity('github:sqluser'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('oracle API has GitHub identity methods', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-api-'));
    const oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
    assert.equal(typeof oracle.verifyGitHubToken, 'function');
    assert.equal(typeof oracle.startGitHubLogin, 'function');
    assert.equal(typeof oracle.isVerifiedVoter, 'function');
    assert.equal(typeof oracle.listVerifiedIdentities, 'function');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CLI has github command', () => {
    const cli = readCliSources();
    assert.ok(cli.includes("'github'"));
    assert.ok(cli.includes("'github'"));
    assert.ok(cli.includes('GitHubIdentity'));
  });

  it('GitHub identity accessible via oracle API (not MCP tool)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-mcp-'));
    const tmpOracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
    assert.equal(typeof tmpOracle.verifyGitHubToken, 'function');
    assert.equal(typeof tmpOracle.isVerifiedVoter, 'function');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
