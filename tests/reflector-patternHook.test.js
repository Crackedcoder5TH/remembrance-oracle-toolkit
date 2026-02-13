const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');

const {
  extractFileHints,
  queryPatternsForFile,
  buildHealingContext,
  hookBeforeHeal,
  batchPatternLookup,
  recordPatternHookUsage,
  patternHookStats,
  formatPatternHook,
} = require('../src/reflector/patternHook');

// ─── Helpers ───

const TEST_ROOT = join(__dirname, '__tmp_patternhook_test__');

function setup() {
  mkdirSync(join(TEST_ROOT, '.remembrance'), { recursive: true });
  mkdirSync(join(TEST_ROOT, 'src'), { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── extractFileHints ───

describe('extractFileHints', () => {
  it('should extract language and tags from code', () => {
    const code = `
/**
 * Debounce utility for rate-limiting function calls
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
module.exports = { debounce };
`;
    const hints = extractFileHints(code, 'src/debounce.js');
    assert.equal(hints.language, 'javascript');
    assert.ok(hints.description.includes('Debounce') || hints.description.includes('debounce'));
    assert.ok(hints.tags.length > 0);
    assert.ok(hints.tags.includes('debounce'));
  });

  it('should use filename when no comments', () => {
    const code = 'const x = 1;\nmodule.exports = { x };\n';
    const hints = extractFileHints(code, 'src/my-utils.js');
    assert.ok(hints.description.includes('my') || hints.description.includes('utils'));
    assert.equal(hints.language, 'javascript');
  });

  it('should extract Python hints', () => {
    const code = '# Helper for string operations\ndef capitalize(s):\n    return s.upper()\n';
    const hints = extractFileHints(code, 'helpers.py');
    assert.equal(hints.language, 'python');
    assert.ok(hints.description.includes('Helper') || hints.description.includes('string'));
  });

  it('should limit tags to 10', () => {
    const code = Array.from({ length: 20 }, (_, i) => `function fn${i}() {}`).join('\n');
    const hints = extractFileHints(code, 'many-fns.js');
    assert.ok(hints.tags.length <= 15); // 10 from functions + file name parts
  });
});

// ─── buildHealingContext ───

describe('buildHealingContext', () => {
  it('should return no-examples context for empty matches', () => {
    const ctx = buildHealingContext([]);
    assert.ok(!ctx.hasExamples);
    assert.equal(ctx.suggestedStrategy, 'default');
    assert.ok(ctx.summary.includes('No similar patterns'));
  });

  it('should return no-examples for null', () => {
    const ctx = buildHealingContext(null);
    assert.ok(!ctx.hasExamples);
  });

  it('should build context from matches', () => {
    const matches = [
      { name: 'debounce', code: 'function debounce() {}', language: 'javascript', relevance: 0.8, coherency: 0.9 },
      { name: 'throttle', code: 'function throttle() {}', language: 'javascript', relevance: 0.6, coherency: 0.85 },
    ];
    const ctx = buildHealingContext(matches);
    assert.ok(ctx.hasExamples);
    assert.equal(ctx.examples.length, 2);
    assert.equal(ctx.bestPattern, 'debounce');
    assert.equal(ctx.suggestedStrategy, 'pattern-guided');
    assert.ok(ctx.summary.includes('debounce'));
  });

  it('should suggest pattern-inspired for medium relevance', () => {
    const matches = [
      { name: 'retry', code: 'function retry() {}', language: 'javascript', relevance: 0.5, coherency: 0.7 },
    ];
    const ctx = buildHealingContext(matches);
    assert.equal(ctx.suggestedStrategy, 'pattern-inspired');
  });

  it('should suggest default for low relevance', () => {
    const matches = [
      { name: 'unknown', code: '...', language: 'javascript', relevance: 0.3, coherency: 0.6 },
    ];
    const ctx = buildHealingContext(matches);
    assert.equal(ctx.suggestedStrategy, 'default');
  });
});

// ─── queryPatternsForFile ───

describe('queryPatternsForFile', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return empty matches when no patterns exist', () => {
    const code = 'function hello() { return "world"; }\n';
    writeFileSync(join(TEST_ROOT, 'src', 'hello.js'), code);
    const result = queryPatternsForFile(code, join(TEST_ROOT, 'src', 'hello.js'), {
      storeDir: join(TEST_ROOT, '.remembrance'),
    });
    assert.ok(Array.isArray(result.matches));
    assert.equal(result.decision, 'generate');
    assert.ok(result.query);
    assert.equal(result.query.language, 'javascript');
  });

  it('should handle invalid storeDir gracefully', () => {
    const result = queryPatternsForFile('const x = 1;', 'fake.js', {
      storeDir: '/nonexistent/path/.remembrance',
    });
    assert.ok(Array.isArray(result.matches));
    assert.equal(result.decision, 'generate');
  });
});

// ─── hookBeforeHeal ───

describe('hookBeforeHeal', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return unguided result for existing file', () => {
    const filePath = join(TEST_ROOT, 'src', 'test.js');
    writeFileSync(filePath, 'const x = 1;\nmodule.exports = { x };\n');
    const result = hookBeforeHeal(filePath, { rootDir: TEST_ROOT });
    assert.equal(result.filePath, filePath);
    assert.ok(result.healingContext);
    assert.ok(!result.patternGuided); // No patterns in empty library
    assert.equal(result.healingContext.suggestedStrategy, 'default');
  });

  it('should handle non-existent file gracefully', () => {
    const result = hookBeforeHeal('/nonexistent/file.js', { rootDir: TEST_ROOT });
    assert.equal(result.filePath, '/nonexistent/file.js');
    assert.ok(!result.patternGuided);
    assert.ok(result.healingContext);
  });

  it('should include query info', () => {
    const filePath = join(TEST_ROOT, 'src', 'utils.js');
    writeFileSync(filePath, '/** String utilities */\nfunction trim(s) { return s.trim(); }\nmodule.exports = { trim };\n');
    const result = hookBeforeHeal(filePath, { rootDir: TEST_ROOT });
    assert.ok(result.query === null || result.query.language === 'javascript');
  });
});

// ─── batchPatternLookup ───

describe('batchPatternLookup', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should look up patterns for multiple files', () => {
    const file1 = join(TEST_ROOT, 'src', 'a.js');
    const file2 = join(TEST_ROOT, 'src', 'b.js');
    writeFileSync(file1, 'const a = 1;\n');
    writeFileSync(file2, 'const b = 2;\n');

    const results = batchPatternLookup([file1, file2], { rootDir: TEST_ROOT });
    assert.ok(results instanceof Map);
    assert.equal(results.size, 2);
    assert.ok(results.has(file1));
    assert.ok(results.has(file2));
  });

  it('should return empty map for empty array', () => {
    const results = batchPatternLookup([], { rootDir: TEST_ROOT });
    assert.equal(results.size, 0);
  });
});

// ─── recordPatternHookUsage & patternHookStats ───

describe('patternHookStats', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return zero stats for empty log', () => {
    const stats = patternHookStats(TEST_ROOT);
    assert.equal(stats.totalHealings, 0);
    assert.equal(stats.patternGuided, 0);
    assert.equal(stats.patternGuidedRate, 0);
  });

  it('should record usage and compute stats', () => {
    recordPatternHookUsage(TEST_ROOT, { filePath: 'a.js', patternGuided: true, patternName: 'debounce', improvement: 0.15 });
    recordPatternHookUsage(TEST_ROOT, { filePath: 'b.js', patternGuided: false, improvement: 0.05 });
    recordPatternHookUsage(TEST_ROOT, { filePath: 'c.js', patternGuided: true, patternName: 'debounce', improvement: 0.20 });

    const stats = patternHookStats(TEST_ROOT);
    assert.equal(stats.totalHealings, 3);
    assert.equal(stats.patternGuided, 2);
    assert.ok(stats.patternGuidedRate > 0.6);
    assert.ok(stats.avgImprovement.guided > 0.1);
    assert.ok(stats.avgImprovement.unguided > 0);
    assert.ok(stats.topPatterns.length > 0);
    assert.equal(stats.topPatterns[0].name, 'debounce');
    assert.equal(stats.topPatterns[0].count, 2);
  });
});

// ─── formatPatternHook ───

describe('formatPatternHook', () => {
  it('should format unguided result', () => {
    const text = formatPatternHook({
      filePath: 'src/test.js',
      patternGuided: false,
      decision: 'generate',
      matches: [],
      healingContext: { suggestedStrategy: 'default', summary: 'No patterns.' },
    });
    assert.ok(text.includes('Pattern Library Hook'));
    assert.ok(text.includes('src/test.js'));
    assert.ok(text.includes('generate'));
    assert.ok(text.includes('No'));
  });

  it('should format guided result with matches', () => {
    const text = formatPatternHook({
      filePath: 'src/utils.js',
      patternGuided: true,
      decision: 'pull',
      matches: [
        { name: 'debounce', relevance: 0.85, coherency: 0.9 },
      ],
      healingContext: { suggestedStrategy: 'pattern-guided', summary: 'Found 1 pattern.' },
    });
    assert.ok(text.includes('Yes'));
    assert.ok(text.includes('debounce'));
    assert.ok(text.includes('pattern-guided'));
  });
});

// ─── Exports ───

describe('Pattern Library Hook — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorHookBeforeHeal, 'function');
    assert.strictEqual(typeof index.reflectorBatchPatternLookup, 'function');
    assert.strictEqual(typeof index.reflectorQueryPatternsForFile, 'function');
    assert.strictEqual(typeof index.reflectorBuildHealingContext, 'function');
    assert.strictEqual(typeof index.reflectorPatternHookStats, 'function');
    assert.strictEqual(typeof index.reflectorRecordPatternHookUsage, 'function');
    assert.strictEqual(typeof index.reflectorFormatPatternHook, 'function');
    assert.strictEqual(typeof index.reflectorExtractFileHints, 'function');
  });
});

// ─── MCP Tools ───

describe('Pattern Library Hook — MCP tools', () => {
  it('should have oracle_reflector_pattern_hook tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_pattern_hook');
    assert.ok(tool);
    assert.ok(tool.description.includes('pattern'));
    assert.ok(tool.inputSchema.properties.filePath);
  });

  it('should have oracle_reflector_pattern_hook_stats tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_pattern_hook_stats');
    assert.ok(tool);
    assert.ok(tool.description.includes('statistics') || tool.description.includes('stat'));
  });
});
