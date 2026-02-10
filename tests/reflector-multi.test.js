const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  multiSnapshot,
  compareDimensions,
  detectDrift,
  unifiedHeal,
  multiReflect,
  formatMultiReport,
  formatMultiPRBody,
  extractFunctionSignatures,
  codeSimilarity,
} = require('../src/reflector/multi');

// ─── Helpers ───

function createTmpRepo(suffix) {
  const dir = join(tmpdir(), `multi-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dir, name, code) {
  const parts = name.split('/');
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, name), code, 'utf-8');
}

// ─── multiSnapshot Tests ───

describe('Multi-Repo — multiSnapshot', () => {
  let repoA, repoB;

  beforeEach(() => {
    repoA = createTmpRepo('A');
    repoB = createTmpRepo('B');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('should snapshot two repos and combine results', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const snap = multiSnapshot([repoA, repoB]);
    assert.equal(snap.repoCount, 2);
    assert.equal(snap.repos.length, 2);
    assert.equal(snap.combined.totalFiles, 2);
    assert.ok(snap.combined.avgCoherence > 0);
  });

  it('should compute combined dimension averages', () => {
    writeFile(repoA, 'code.js', 'function foo() { return 1; }');
    writeFile(repoB, 'code.js', 'function bar() { return 2; }');
    const snap = multiSnapshot([repoA, repoB]);
    const dims = snap.combined.dimensionAverages;
    assert.ok('simplicity' in dims);
    assert.ok('readability' in dims);
    assert.ok('security' in dims);
    assert.ok('unity' in dims);
    assert.ok('correctness' in dims);
  });

  it('should handle empty repos', () => {
    writeFile(repoA, 'code.js', 'function a() { return 1; }');
    const snap = multiSnapshot([repoA, repoB]);
    assert.equal(snap.repos[0].totalFiles, 1);
    assert.equal(snap.repos[1].totalFiles, 0);
  });

  it('should include per-repo stats', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const snap = multiSnapshot([repoA, repoB]);
    for (const repo of snap.repos) {
      assert.ok(repo.name);
      assert.ok(typeof repo.avgCoherence === 'number');
      assert.ok(repo.dimensionAverages);
    }
  });
});

// ─── compareDimensions Tests ───

describe('Multi-Repo — compareDimensions', () => {
  let repoA, repoB;

  beforeEach(() => {
    repoA = createTmpRepo('cmpA');
    repoB = createTmpRepo('cmpB');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('should compare dimensions between two repos', () => {
    writeFile(repoA, 'clean.js', 'function add(a, b) {\n  return a + b;\n}');
    writeFile(repoB, 'messy.js', 'function add(a, b) {\n\tvar r = a + b;\n  return r;\n}');
    const snap = multiSnapshot([repoA, repoB]);
    const cmp = compareDimensions(snap);
    assert.ok(cmp.repoA);
    assert.ok(cmp.repoB);
    assert.ok(typeof cmp.coherenceDelta === 'number');
    assert.ok(typeof cmp.convergenceScore === 'number');
    assert.ok(Array.isArray(cmp.comparisons));
    assert.ok(cmp.comparisons.length >= 5);
  });

  it('should identify which repo leads on each dimension', () => {
    writeFile(repoA, 'clean.js', 'function add(a, b) {\n  return a + b;\n}');
    writeFile(repoB, 'messy.js', 'function add(a, b) {\n\tvar r = a + b;\n  return r;\n}');
    const snap = multiSnapshot([repoA, repoB]);
    const cmp = compareDimensions(snap);
    for (const c of cmp.comparisons) {
      assert.ok(['low', 'medium', 'high'].includes(c.severity));
      assert.ok(c.leader);
    }
  });

  it('should compute convergence score', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const snap = multiSnapshot([repoA, repoB]);
    const cmp = compareDimensions(snap);
    assert.ok(cmp.convergenceScore >= 0 && cmp.convergenceScore <= 1);
  });

  it('should return error for less than 2 repos', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    const snap = multiSnapshot([repoA]);
    const cmp = compareDimensions(snap);
    assert.ok(cmp.error);
  });
});

// ─── detectDrift Tests ───

describe('Multi-Repo — detectDrift', () => {
  let repoA, repoB;

  beforeEach(() => {
    repoA = createTmpRepo('driftA');
    repoB = createTmpRepo('driftB');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('should detect identical shared functions', () => {
    writeFile(repoA, 'utils.js', 'function add(a, b) { return a + b; }');
    writeFile(repoB, 'utils.js', 'function add(a, b) { return a + b; }');
    const drift = detectDrift([repoA, repoB]);
    assert.equal(drift.shared, 1);
    assert.equal(drift.diverged, 0);
  });

  it('should detect diverged functions', () => {
    writeFile(repoA, 'utils.js', 'function validate(email) { return /^[^@]+@[^@]+$/.test(email); }');
    writeFile(repoB, 'utils.js', 'function validate(input) { if (!input) return false; return input.length > 0 && input.includes("@"); }');
    const drift = detectDrift([repoA, repoB]);
    assert.ok(drift.diverged >= 1);
    assert.ok(drift.details.diverged.length >= 1);
    assert.ok(drift.details.diverged[0].drift > 0);
  });

  it('should detect unique functions per repo', () => {
    writeFile(repoA, 'a.js', 'function onlyInA() { return "a"; }');
    writeFile(repoB, 'b.js', 'function onlyInB() { return "b"; }');
    const drift = detectDrift([repoA, repoB]);
    assert.equal(drift.uniqueToA, 1);
    assert.equal(drift.uniqueToB, 1);
    assert.ok(drift.details.uniqueA.find(f => f.name === 'onlyInA'));
    assert.ok(drift.details.uniqueB.find(f => f.name === 'onlyInB'));
  });

  it('should compute convergence score', () => {
    writeFile(repoA, 'a.js', 'function shared() { return 1; }\nfunction unique() { return 2; }');
    writeFile(repoB, 'b.js', 'function shared() { return 1; }');
    const drift = detectDrift([repoA, repoB]);
    assert.ok(typeof drift.convergenceScore === 'number');
    assert.ok(drift.convergenceScore >= 0 && drift.convergenceScore <= 1);
  });

  it('should return error with less than 2 repos', () => {
    const drift = detectDrift([repoA]);
    assert.ok(drift.error);
  });
});

// ─── extractFunctionSignatures Tests ───

describe('Multi-Repo — extractFunctionSignatures', () => {
  it('should extract JS function declarations', () => {
    const fns = extractFunctionSignatures('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(fns.find(f => f.name === 'add'));
  });

  it('should extract arrow functions', () => {
    const fns = extractFunctionSignatures('const multiply = (a, b) => a * b;', 'javascript');
    assert.ok(fns.find(f => f.name === 'multiply'));
  });

  it('should extract Python functions', () => {
    const fns = extractFunctionSignatures('def greet(name):\n    return "Hello " + name', 'python');
    assert.ok(fns.find(f => f.name === 'greet'));
  });

  it('should extract Go functions', () => {
    const fns = extractFunctionSignatures('func Add(a int, b int) int {\n  return a + b\n}', 'go');
    assert.ok(fns.find(f => f.name === 'Add'));
  });

  it('should extract Rust functions', () => {
    const fns = extractFunctionSignatures('fn add(a: i32, b: i32) -> i32 {\n  a + b\n}', 'rust');
    assert.ok(fns.find(f => f.name === 'add'));
  });
});

// ─── codeSimilarity Tests ───

describe('Multi-Repo — codeSimilarity', () => {
  it('should return 1 for identical code', () => {
    const sim = codeSimilarity('function add(a, b) { return a + b; }', 'function add(a, b) { return a + b; }');
    assert.equal(sim, 1);
  });

  it('should return high similarity for minor changes', () => {
    const sim = codeSimilarity(
      'function calculateTotal(items, taxRate) { const subtotal = items.reduce((sum, item) => sum + item.price, 0); return subtotal + subtotal * taxRate; }',
      'function calculateTotal(items, taxRate) { const subtotal = items.reduce((sum, item) => sum + item.cost, 0); return subtotal + subtotal * taxRate; }'
    );
    assert.ok(sim > 0.5, `Expected similarity > 0.5, got ${sim}`);
  });

  it('should return low similarity for very different code', () => {
    const sim = codeSimilarity(
      'function add(a, b) { return a + b; }',
      'class DatabaseConnection { constructor(host, port) { this.host = host; this.port = port; } }'
    );
    assert.ok(sim < 0.5);
  });

  it('should handle empty strings', () => {
    const sim = codeSimilarity('', '');
    assert.equal(sim, 1);
  });
});

// ─── unifiedHeal Tests ───

describe('Multi-Repo — unifiedHeal', () => {
  let repoA, repoB;

  beforeEach(() => {
    repoA = createTmpRepo('healA');
    repoB = createTmpRepo('healB');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('should produce healing results for both repos', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const result = unifiedHeal([repoA, repoB]);
    assert.ok(result.unifiedThreshold);
    assert.equal(result.repos.length, 2);
    assert.ok(result.summary);
    assert.ok(result.summary.convergenceWhisper);
  });

  it('should use higher coherence as target', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const result = unifiedHeal([repoA, repoB], { minCoherence: 0.5 });
    assert.ok(result.unifiedThreshold >= 0.5);
  });

  it('should report per-repo healing counts', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const result = unifiedHeal([repoA, repoB]);
    for (const repo of result.repos) {
      assert.ok(typeof repo.filesHealed === 'number');
      assert.ok(typeof repo.totalImprovement === 'number');
    }
  });
});

// ─── multiReflect Tests ───

describe('Multi-Repo — multiReflect (full pipeline)', () => {
  let repoA, repoB;

  beforeEach(() => {
    repoA = createTmpRepo('fullA');
    repoB = createTmpRepo('fullB');
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('should run complete multi-repo pipeline', () => {
    writeFile(repoA, 'utils.js', 'function add(a, b) { return a + b; }');
    writeFile(repoB, 'utils.js', 'function add(x, y) { return x + y; }');
    const report = multiReflect([repoA, repoB]);
    assert.ok(report.timestamp);
    assert.ok(report.durationMs >= 0);
    assert.ok(report.snapshot);
    assert.ok(report.comparison);
    assert.ok(report.drift);
    assert.ok(report.healing);
    assert.ok(report.summary);
    assert.ok(report.collectiveWhisper);
  });

  it('should include summary metrics', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const report = multiReflect([repoA, repoB]);
    assert.equal(report.summary.repoCount, 2);
    assert.ok(typeof report.summary.combinedCoherence === 'number');
    assert.ok(typeof report.summary.convergenceScore === 'number');
    assert.ok(typeof report.summary.driftScore === 'number');
  });

  it('should format as text report', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const report = multiReflect([repoA, repoB]);
    const text = formatMultiReport(report);
    assert.ok(text.includes('Multi-Repo Reflector Report'));
    assert.ok(text.includes('Per-Repo Coherence'));
    assert.ok(text.includes('Dimension Comparison'));
    assert.ok(text.includes('Collective Whisper'));
  });

  it('should format as PR body', () => {
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');
    const report = multiReflect([repoA, repoB]);
    const body = formatMultiPRBody(report);
    assert.ok(body.includes('Multi-Repo Healed Refinement'));
    assert.ok(body.includes('Summary'));
  });
});

// ─── MCP Tool Registration ───

describe('Multi-Repo — MCP Tools', () => {
  it('should register multi-repo tools in MCP server', () => {
    const { TOOLS } = require('../src/mcp/server');
    const multiTools = TOOLS.filter(t =>
      t.name === 'oracle_reflector_multi' ||
      t.name === 'oracle_reflector_compare' ||
      t.name === 'oracle_reflector_drift'
    );
    assert.equal(multiTools.length, 3);
  });

  it('should handle compare via MCP', () => {
    const repoA = createTmpRepo('mcpA');
    const repoB = createTmpRepo('mcpB');
    writeFile(repoA, 'a.js', 'function a() { return 1; }');
    writeFile(repoB, 'b.js', 'function b() { return 2; }');

    const { MCPServer } = require('../src/mcp/server');
    const server = new MCPServer();
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'oracle_reflector_compare',
        arguments: { repos: [repoA, repoB] },
      },
    });
    assert.ok(response.result);
    assert.ok(!response.result.isError);
    const content = JSON.parse(response.result.content[0].text);
    assert.ok(typeof content.convergenceScore === 'number');

    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });
});

// ─── Index Exports ───

describe('Multi-Repo — Exports', () => {
  it('should export multi-repo functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorMultiSnapshot === 'function');
    assert.ok(typeof index.reflectorCompareDimensions === 'function');
    assert.ok(typeof index.reflectorDetectDrift === 'function');
    assert.ok(typeof index.reflectorUnifiedHeal === 'function');
    assert.ok(typeof index.reflectorMultiReflect === 'function');
    assert.ok(typeof index.reflectorFormatMultiReport === 'function');
    assert.ok(typeof index.reflectorCodeSimilarity === 'function');
  });
});
