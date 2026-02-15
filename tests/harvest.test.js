const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { harvestFunctions, splitFunctions, extractBody, extractPythonBlock } = require('../src/ci/harvest');

describe('GitHub Harvester', () => {
  let tmpDir;
  let oracle;
  let srcDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
    srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('extractBody', () => {
    it('extracts a brace-delimited function body', () => {
      const code = 'function add(a, b) { return a + b; }';
      const body = extractBody(code, 0);
      assert.equal(body, code);
    });

    it('handles nested braces', () => {
      const code = 'function f() { if (true) { return 1; } return 0; }';
      const body = extractBody(code, 0);
      assert.equal(body, code);
    });

    it('returns null when no opening brace', () => {
      const body = extractBody('no brace here', 0);
      assert.equal(body, null);
    });

    it('returns null for unbalanced braces', () => {
      const body = extractBody('function f() { if (true) {', 0);
      assert.equal(body, null);
    });
  });

  describe('extractPythonBlock', () => {
    it('extracts an indented block', () => {
      const code = 'def greet(name):\n    return f"Hello {name}"\n\ndef other():';
      const body = extractPythonBlock(code, 0);
      assert.ok(body.includes('def greet(name):'));
      assert.ok(body.includes('return f"Hello {name}"'));
    });

    it('stops at dedented line', () => {
      const code = 'def foo():\n    x = 1\n    return x\nnot_part_of_foo()';
      const body = extractPythonBlock(code, 0);
      assert.ok(body.includes('x = 1'));
      assert.ok(!body.includes('not_part_of_foo'));
    });

    it('returns null for def with no body', () => {
      const body = extractPythonBlock('def empty():', 0);
      assert.equal(body, null);
    });
  });

  describe('splitFunctions', () => {
    it('splits JavaScript functions', () => {
      const code = `
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}
`;
      const fns = splitFunctions(code, 'javascript');
      assert.ok(fns.length >= 2);
      assert.ok(fns.some(f => f.name === 'add'));
      assert.ok(fns.some(f => f.name === 'multiply'));
    });

    it('skips test/describe/it functions', () => {
      const code = `
function describe() { return 1; }
function it() { return 2; }
function test() { return 3; }
function realFunction() { return 4; }
`;
      const fns = splitFunctions(code, 'javascript');
      assert.ok(!fns.some(f => f.name === 'describe'));
      assert.ok(!fns.some(f => f.name === 'it'));
      assert.ok(!fns.some(f => f.name === 'test'));
    });

    it('splits Python functions', () => {
      const code = `def hello(name):\n    return f"Hello {name}"\n\ndef goodbye(name):\n    return f"Bye {name}"\n`;
      const fns = splitFunctions(code, 'python');
      assert.ok(fns.length >= 2);
      assert.ok(fns.some(f => f.name === 'hello'));
    });

    it('skips private Python functions', () => {
      const code = `def _private():\n    pass\n\ndef public_fn():\n    return "hello world!!"\n`;
      const fns = splitFunctions(code, 'python');
      assert.ok(!fns.some(f => f.name === '_private'));
    });

    it('splits Go functions', () => {
      const code = `func Add(a, b int) int {\n\treturn a + b\n}\n\nfunc (s *Server) Start() {\n\ts.running = true\n}\n`;
      const fns = splitFunctions(code, 'go');
      assert.ok(fns.length >= 2);
      assert.ok(fns.some(f => f.name === 'Add'));
      assert.ok(fns.some(f => f.name === 'Start'));
    });

    it('splits Rust functions', () => {
      const code = `pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n\nfn multiply(a: i32, b: i32) -> i32 {\n    a * b\n}\n`;
      const fns = splitFunctions(code, 'rust');
      assert.ok(fns.length >= 2);
      assert.ok(fns.some(f => f.name === 'add'));
      assert.ok(fns.some(f => f.name === 'multiply'));
    });

    it('returns empty for unknown language', () => {
      const fns = splitFunctions('some code', 'brainfuck');
      assert.equal(fns.length, 0);
    });
  });

  describe('harvestFunctions', () => {
    it('harvests JavaScript files', () => {
      fs.writeFileSync(path.join(srcDir, 'math.js'), `
function add(a, b) { return a + b; }
function sub(a, b) { return a - b; }
`);
      const results = harvestFunctions(tmpDir);
      assert.ok(results.length >= 1);
      assert.ok(results.some(r => r.language === 'javascript'));
      assert.ok(results.some(r => r.functions.includes('add')));
    });

    it('filters by language', () => {
      fs.writeFileSync(path.join(srcDir, 'code.js'), 'function jsFunc() { return 1; }');
      fs.writeFileSync(path.join(srcDir, 'code.py'), 'def py_func():\n    return 1\n');
      const jsOnly = harvestFunctions(tmpDir, { language: 'javascript' });
      assert.ok(jsOnly.every(r => r.language === 'javascript'));
    });

    it('skips node_modules and .git', () => {
      const nmDir = path.join(tmpDir, 'node_modules', 'pkg');
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, 'index.js'), 'function hidden() { return 1; }');
      const results = harvestFunctions(tmpDir);
      assert.ok(!results.some(r => r.file.includes('node_modules')));
    });

    it('respects maxFileSize', () => {
      const big = 'function big() {\n' + '// padding\n'.repeat(10000) + '}\n';
      fs.writeFileSync(path.join(srcDir, 'big.js'), big);
      const results = harvestFunctions(tmpDir, { maxFileSize: 100 });
      assert.ok(!results.some(r => r.file.includes('big.js')));
    });

    it('respects minFunctions', () => {
      fs.writeFileSync(path.join(srcDir, 'one.js'), 'function only() { return 1; }');
      const none = harvestFunctions(tmpDir, { minFunctions: 3 });
      assert.ok(!none.some(r => r.file.includes('one.js')));
    });

    it('handles non-existent directory', () => {
      const results = harvestFunctions('/nonexistent/dir/abc');
      assert.equal(results.length, 0);
    });
  });

  describe('harvest integration', () => {
    it('harvests from a local directory (dry run)', () => {
      fs.writeFileSync(path.join(srcDir, 'util.js'), `
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function lerp(a, b, t) { return a + (b - a) * t; }
`);
      const { harvest } = require('../src/ci/harvest');
      const result = harvest(oracle, tmpDir, { dryRun: true });
      assert.ok(result.harvested >= 1);
      assert.ok(result.patterns.length >= 1);
      assert.equal(result.registered, 0); // dry run
    });

    it('registers harvested patterns', () => {
      fs.writeFileSync(path.join(srcDir, 'helpers.js'), `
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function truncate(s, len) { return s.length > len ? s.slice(0, len) + '...' : s; }
`);
      const { harvest } = require('../src/ci/harvest');
      const result = harvest(oracle, tmpDir, { splitMode: 'file' });
      assert.ok(result.registered >= 1 || result.skipped >= 1);
      assert.ok(result.harvested >= 1);
    });

    it('splits by function mode', () => {
      fs.writeFileSync(path.join(srcDir, 'funcs.js'), `
function alpha() {
  return 'alpha function result';
}

function beta() {
  return 'beta function result here';
}
`);
      const { harvest } = require('../src/ci/harvest');
      const result = harvest(oracle, tmpDir, { splitMode: 'function' });
      assert.ok(result.harvested >= 1);
    });

    it('throws for nonexistent path', () => {
      const { harvest } = require('../src/ci/harvest');
      assert.throws(() => harvest(oracle, '/nonexistent/path/xyz'));
    });

    it('emits harvest_complete event', () => {
      fs.writeFileSync(path.join(srcDir, 'ev.js'), 'function evTest() { return 42; }');
      let emitted = false;
      oracle.on(ev => { if (ev.type === 'harvest_complete') emitted = true; });
      const { harvest } = require('../src/ci/harvest');
      harvest(oracle, tmpDir);
      assert.ok(emitted);
    });
  });

  describe('MCP oracle_harvest', () => {
    it('exposes harvest tool', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const server = new MCPServer(oracle);
      const tools = await server.handleRequest({ id: 1, method: 'tools/list' });
      const harvestTool = tools.result.tools.find(t => t.name === 'oracle_harvest');
      assert.ok(harvestTool, 'oracle_harvest tool should exist');
      assert.ok(harvestTool.inputSchema.properties.path);
    });

    it('handles harvest via MCP', async () => {
      fs.writeFileSync(path.join(srcDir, 'mcp.js'), 'function mcpTest() { return "hello"; }');
      const { MCPServer } = require('../src/mcp/server');
      const server = new MCPServer(oracle);
      const resp = await server.handleRequest({
        id: 2,
        method: 'tools/call',
        params: { name: 'oracle_harvest', arguments: { path: tmpDir, dryRun: true } },
      });
      const data = JSON.parse(resp.result.content[0].text);
      assert.ok(data.harvested >= 0);
      assert.ok(Array.isArray(data.patterns));
    });
  });
});
