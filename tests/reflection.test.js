const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  reflectionLoop,
  formatReflectionResult,
  generateCandidates,
  observeCoherence,
  serfScore,
  innerProduct,
  generateWhisper,
  STRATEGIES,
  DIMENSION_WEIGHTS,
  applySimplify,
  applySecure,
  applyReadable,
  applyUnify,
  applyCorrect,
  scoreSimplicity,
  scoreReadability,
  scoreSecurity,
  scoreUnity,
  scoreCorrectness,
} = require('../src/core/reflection');

// ─── SERF Constants ───

describe('SERF Constants and Strategies', () => {
  it('has 5 strategies', () => {
    assert.equal(STRATEGIES.length, 5);
    const names = STRATEGIES.map(s => s.name);
    assert.deepEqual(names, ['simplify', 'secure', 'readable', 'unify', 'correct']);
  });

  it('dimension weights sum to 1', () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 0.001, `Weights sum to ${total}, expected 1`);
  });
});

// ─── Code Transformations ───

describe('applySimplify', () => {
  it('removes trailing whitespace', () => {
    assert.equal(applySimplify('const x = 1;   \n', 'js'), 'const x = 1;\n');
  });

  it('collapses multiple blank lines', () => {
    const input = 'a\n\n\n\nb';
    assert.equal(applySimplify(input, 'js'), 'a\n\nb');
  });

  it('simplifies === true', () => {
    assert.equal(applySimplify('if (x === true) {}', 'js'), 'if (x) {}');
  });

  it('simplifies arrow function return', () => {
    assert.equal(applySimplify('const f = () => { return 42; }', 'js'), 'const f = () => 42');
  });

  it('removes empty else blocks', () => {
    assert.equal(applySimplify('if (x) { foo(); } else {}', 'js'), 'if (x) { foo(); }');
  });
});

describe('applySecure', () => {
  it('converts var to const', () => {
    const result = applySecure('var x = 5;', 'javascript');
    assert.ok(result.includes('const x = 5;'));
  });

  it('converts == to ===', () => {
    const result = applySecure('if (a == b) {}', 'javascript');
    assert.ok(result.includes('==='));
  });

  it('converts != to !==', () => {
    const result = applySecure('if (a != b) {}', 'javascript');
    assert.ok(result.includes('!=='));
  });

  it('does not modify non-JS code', () => {
    const code = 'def foo():\n    x = 5';
    assert.equal(applySecure(code, 'python'), code);
  });
});

describe('applyReadable', () => {
  it('replaces tabs with spaces', () => {
    const result = applyReadable('\tconst x = 1;', 'js');
    assert.ok(!result.includes('\t'));
  });

  it('adds space after if/for/while', () => {
    const result = applyReadable('if(x) {}', 'js');
    assert.ok(result.includes('if (x)'));
  });
});

describe('applyUnify', () => {
  it('normalizes quotes when singles dominate', () => {
    const code = "const x = 'hello'; const y = 'there'; const z = \"world\";";
    const result = applyUnify(code, 'javascript');
    // Should convert doubles to singles since singles dominate (4 vs 2)
    assert.ok(result.includes("'world'"), `Expected single quotes, got: ${result}`);
  });
});

describe('applyCorrect', () => {
  it('adds default for options parameters', () => {
    const code = 'function init(options) {\n  return options;\n}';
    const result = applyCorrect(code, 'javascript');
    assert.ok(result.includes('options = {}'), `Expected default, got: ${result}`);
  });
});

// ─── Dimension Scorers ───

describe('scoreSimplicity', () => {
  it('returns high score for simple code', () => {
    const score = scoreSimplicity('function add(a, b) { return a + b; }');
    assert.ok(score >= 0.8, `Expected >= 0.8, got ${score}`);
  });

  it('penalizes deep nesting', () => {
    const nested = 'if (a) { if (b) { if (c) { if (d) { if (e) { if (f) { x(); } } } } } }';
    const score = scoreSimplicity(nested);
    const simpleScore = scoreSimplicity('function f() { return 1; }');
    assert.ok(score < simpleScore, `Nested ${score} should be < simple ${simpleScore}`);
  });
});

describe('scoreReadability', () => {
  it('returns high score for clean code', () => {
    const code = `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}`;
    const score = scoreReadability(code);
    assert.ok(score >= 0.7, `Expected >= 0.7, got ${score}`);
  });

  it('penalizes mixed indentation', () => {
    const code = "  const a = 1;\n\tconst b = 2;";
    const score = scoreReadability(code);
    assert.ok(score < 1.0, `Expected < 1.0 for mixed indent, got ${score}`);
  });
});

describe('scoreSecurity', () => {
  it('returns 1 for safe code', () => {
    const score = scoreSecurity('function add(a, b) { return a + b; }');
    assert.equal(score, 1);
  });

  it('returns 0 for covenant-breaking code', () => {
    const score = scoreSecurity('rm -rf /home/user');
    assert.equal(score, 0);
  });

  it('penalizes eval usage', () => {
    const score = scoreSecurity('const result = eval("1+1");');
    assert.ok(score < 1, `Expected < 1 for eval, got ${score}`);
  });
});

describe('scoreUnity', () => {
  it('returns high score for consistent naming', () => {
    const code = 'function getData() {}\nfunction processData() {}\nfunction saveData() {}';
    const score = scoreUnity(code);
    assert.ok(score >= 0.9, `Expected >= 0.9, got ${score}`);
  });

  it('penalizes mixed naming conventions', () => {
    const code = 'function getData() {}\nfunction process_data() {}\nfunction save_data() {}';
    const score = scoreUnity(code);
    assert.ok(score < 1.0, `Expected < 1.0 for mixed naming, got ${score}`);
  });
});

describe('scoreCorrectness', () => {
  it('returns high score for balanced code', () => {
    const score = scoreCorrectness('function f() { return [1, 2]; }', 'js');
    assert.ok(score >= 0.9, `Expected >= 0.9, got ${score}`);
  });

  it('penalizes unbalanced braces', () => {
    const score = scoreCorrectness('function f() { if (x) {', 'js');
    assert.ok(score < 1.0, `Expected < 1.0, got ${score}`);
  });

  it('penalizes TODO markers', () => {
    const score = scoreCorrectness('function f() { /* TODO: fix this */ return 1; }', 'js');
    assert.ok(score < 1.0, `Expected < 1.0, got ${score}`);
  });
});

// ─── Coherence Observation ───

describe('observeCoherence', () => {
  it('returns all 5 dimensions', () => {
    const obs = observeCoherence('function add(a, b) { return a + b; }');
    assert.ok(obs.dimensions.simplicity !== undefined);
    assert.ok(obs.dimensions.readability !== undefined);
    assert.ok(obs.dimensions.security !== undefined);
    assert.ok(obs.dimensions.unity !== undefined);
    assert.ok(obs.dimensions.correctness !== undefined);
    assert.ok(obs.composite >= 0 && obs.composite <= 1);
  });

  it('scores clean code higher than messy code', () => {
    const clean = observeCoherence('function add(a, b) { return a + b; }');
    const messy = observeCoherence('var x=1;var y = 2; function f(){if(a){if(b){if(c){/* TODO */}}}}');
    assert.ok(clean.composite >= messy.composite,
      `Clean ${clean.composite} should >= messy ${messy.composite}`);
  });
});

// ─── Inner Product ───

describe('innerProduct', () => {
  it('returns 1 for identical code', () => {
    const code = 'function add(a, b) { return a + b; }';
    assert.equal(innerProduct(code, code), 1);
  });

  it('returns value between 0 and 1 for different code', () => {
    const a = 'function add(a, b) { return a + b; }';
    const b = 'function multiply(a, b) { return a * b; }';
    const sim = innerProduct(a, b);
    assert.ok(sim > 0 && sim < 1, `Expected between 0 and 1, got ${sim}`);
  });

  it('returns 0 for completely different code', () => {
    const sim = innerProduct('xyz', 'abc');
    assert.ok(sim < 0.5, `Expected near 0, got ${sim}`);
  });
});

// ─── SERF Score ───

describe('serfScore', () => {
  it('returns a value between 0 and 1', () => {
    const candidate = { code: 'const x = 1;', coherence: 0.8 };
    const previous = { code: 'var x = 1;', coherence: 0.7 };
    const score = serfScore(candidate, previous);
    assert.ok(score >= 0 && score <= 1, `Expected 0-1, got ${score}`);
  });

  it('ranks higher-coherence candidates higher', () => {
    const previous = { code: 'var x = 1;', coherence: 0.5 };
    const good = { code: 'const x = 1;', coherence: 0.9 };
    const bad = { code: 'let y = 2;', coherence: 0.3 };
    assert.ok(serfScore(good, previous) > serfScore(bad, previous));
  });

  it('rewards novelty via delta_canvas', () => {
    const previous = { code: 'function f() { return 1; }', coherence: 0.7 };
    // Same coherence, but one is more different
    const similar = { code: 'function f() { return 1; }', coherence: 0.71 };
    const diverse = { code: 'const f = () => 1;', coherence: 0.71 };
    const simSerf = serfScore(similar, previous);
    const divSerf = serfScore(diverse, previous);
    // Diverse should get a canvas bonus
    assert.ok(divSerf >= simSerf, `Diverse ${divSerf} should >= similar ${simSerf}`);
  });
});

// ─── Generate Candidates ───

describe('generateCandidates', () => {
  it('generates 6 candidates (5 individual + heal)', () => {
    const candidates = generateCandidates('var x = 1;', 'javascript');
    assert.equal(candidates.length, 6);
    assert.ok(candidates.some(c => c.strategy === 'heal'));
  });

  it('each candidate has strategy, code, and changed flag', () => {
    const candidates = generateCandidates('function f() {}', 'javascript');
    for (const c of candidates) {
      assert.ok(typeof c.strategy === 'string');
      assert.ok(typeof c.code === 'string');
      assert.ok(typeof c.changed === 'boolean');
    }
  });

  it('at least one candidate differs for improvable code', () => {
    const code = 'var x = 1;   \nvar y = 2;';
    const candidates = generateCandidates(code, 'javascript');
    const changed = candidates.filter(c => c.changed);
    assert.ok(changed.length > 0, 'At least one should change');
  });
});

// ─── Generate Whisper ───

describe('generateWhisper', () => {
  it('returns whisper string and summary', () => {
    const result = generateWhisper(
      { coherence: 0.7 },
      { coherence: 0.85 },
      [{ strategy: 'secure', dimension: 'security', delta: 0.1 }],
      2
    );
    assert.ok(typeof result.whisper === 'string');
    assert.ok(result.whisper.length > 0);
    assert.ok(typeof result.summary === 'string');
    assert.ok(result.healingPath.length > 0);
  });

  it('whisper matches the top strategy', () => {
    const result = generateWhisper(
      { coherence: 0.5 },
      { coherence: 0.8 },
      [
        { strategy: 'simplify', dimension: 'simplicity', delta: 0.3 },
        { strategy: 'secure', dimension: 'security', delta: 0.1 },
      ],
      1
    );
    // simplify had the biggest delta, so whisper should be about simplicity
    assert.ok(result.whisper.includes('simpler'), `Expected simplify whisper, got: ${result.whisper}`);
  });
});

// ─── Reflection Loop ───

describe('reflectionLoop', () => {
  it('returns expected structure', () => {
    const result = reflectionLoop('function add(a, b) { return a + b; }', { language: 'javascript' });
    assert.ok(typeof result.code === 'string');
    assert.ok(typeof result.coherence === 'number');
    assert.ok(typeof result.fullCoherency === 'number');
    assert.ok(result.dimensions);
    assert.ok(typeof result.loops === 'number');
    assert.ok(Array.isArray(result.history));
    assert.ok(typeof result.whisper === 'string');
    assert.ok(typeof result.healingSummary === 'string');
    assert.ok(Array.isArray(result.healingPath));
    assert.ok(result.serf);
    assert.ok(typeof result.serf.I_AM === 'number');
    assert.ok(typeof result.serf.r_eff_base === 'number');
    assert.ok(typeof result.serf.r_eff_alpha === 'number');
    assert.ok(typeof result.serf.epsilon_base === 'number');
    assert.ok(typeof result.serf.delta_canvas === 'number');
    assert.ok(typeof result.serf.delta_void === 'number');
    assert.ok(typeof result.serf.cascadeBoost === 'number');
    assert.ok(typeof result.serf.collectiveIAM === 'number');
    assert.ok(typeof result.serf.finalCoherence === 'number');
    assert.ok(typeof result.serf.improvement === 'number');
  });

  it('history starts with loop 0 (original)', () => {
    const result = reflectionLoop('const x = 1;', { language: 'javascript' });
    assert.equal(result.history[0].loop, 0);
    assert.equal(result.history[0].strategy, 'original');
  });

  it('improves or maintains coherence of improvable code', () => {
    const code = 'var x = 1;   \nvar y  =  2;\nif(x == y) { console.log("yes") }';
    const result = reflectionLoop(code, { language: 'javascript' });
    assert.ok(result.coherence >= result.history[0].coherence,
      `Final ${result.coherence} should >= initial ${result.history[0].coherence}`);
  });

  it('stops early if target coherence reached', () => {
    // Very clean code should already exceed 0.9
    const code = 'function add(a, b) { return a + b; }';
    const result = reflectionLoop(code, { language: 'javascript', targetCoherence: 0.5 });
    // Should stop early (0 loops since it already exceeds target)
    assert.ok(result.loops === 0 || result.coherence >= 0.5);
  });

  it('respects maxLoops', () => {
    const code = 'var x = 1;';
    const result = reflectionLoop(code, { language: 'javascript', maxLoops: 1 });
    assert.ok(result.loops <= 1);
  });

  it('handles Python code', () => {
    const code = 'def greet(name):\n    print(f"Hello {name}")';
    const result = reflectionLoop(code, { language: 'python' });
    assert.ok(result.code.length > 0);
    assert.ok(result.coherence > 0);
  });

  it('handles Go code', () => {
    const code = 'func Add(a, b int) int {\n\treturn a + b\n}';
    const result = reflectionLoop(code, { language: 'go' });
    assert.ok(result.code.length > 0);
    assert.ok(result.coherence > 0);
  });
});

// ─── Format Result ───

describe('formatReflectionResult', () => {
  it('produces readable output', () => {
    const result = reflectionLoop('function f() { return 1; }', { language: 'javascript' });
    const formatted = formatReflectionResult(result);
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.includes('SERF'));
    assert.ok(formatted.includes('I_AM'));
    assert.ok(formatted.includes('Whisper'));
  });
});

// ─── MCP Integration ───

describe('Reflection MCP tool', () => {
  it('oracle_reflect is in the tools list', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflect');
    assert.ok(tool, 'oracle_reflect tool should exist');
    assert.ok(tool.inputSchema.required.includes('code'));
  });

  it('MCP server handles oracle_reflect calls', async () => {
    const { MCPServer } = require('../src/mcp/server');
    const server = new MCPServer();
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'oracle_reflect',
        arguments: { code: 'var x = 1;', language: 'javascript' },
      },
    });
    assert.equal(response.id, 1);
    const result = JSON.parse(response.result.content[0].text);
    assert.ok(result.code);
    assert.ok(typeof result.coherence === 'number');
    assert.ok(result.whisper);
    assert.ok(result.serf);
  });
});
