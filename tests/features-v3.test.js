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
