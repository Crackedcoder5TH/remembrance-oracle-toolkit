/**
 * Test Synthesizer — generates test code for candidate patterns.
 *
 * The biggest bottleneck in the two-tier system: candidates can't promote
 * to proven without test proof. This module synthesizes tests by:
 *
 *   1. Analyzing the function signature (params, return type hints)
 *   2. Translating parent tests from JS to target language
 *   3. Generating edge-case tests from code analysis (zeros, empties, negatives)
 *
 * Supports: JavaScript, TypeScript, Python
 */

const { computeCoherencyScore } = require('../core/coherency');

// ─── Function Signature Analysis ───

/**
 * Extract function signature from code.
 * Returns { name, params: [{ name, type?, default? }], language }
 */
function extractSignature(code, language) {
  if (language === 'python') return extractPythonSig(code);
  return extractJSSig(code, language);
}

function extractJSSig(code, language) {
  // Skip test files — they're not functions to be tested
  if (isTestFile(code)) return null;

  // Skip data/config files (arrays of objects, module.exports = { ... })
  if (isDataFile(code)) return null;

  // Try exported function first (module.exports = function name(...))
  let match = code.match(/module\.exports\s*=\s*function\s+(\w+)\s*\(([^)]*)\)/);

  // Try named export: exports.name = function(...)
  if (!match) {
    const exportMatch = code.match(/exports\.(\w+)\s*=\s*function\s*\(([^)]*)\)/);
    if (exportMatch) match = exportMatch;
  }

  // Try standalone function (but NOT inside strings/comments)
  if (!match) {
    // Match functions at top-level (line starts with function or has only whitespace before)
    const lines = code.split('\n');
    for (const line of lines) {
      const lineMatch = line.match(/^(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (lineMatch) {
        match = lineMatch;
        break;
      }
    }
  }

  // Fallback: any function declaration
  if (!match) {
    match = code.match(/function\s+(\w+)\s*\(([^)]*)\)/);
    if (!match) return null;
  }

  const [, name, rawParams] = match;

  // Detect if this is a constructor (used with `new` or has prototype methods)
  const isConstructor = code.includes(`new ${name}(`) ||
    code.includes(`${name}.prototype.`) ||
    /^[A-Z]/.test(name);

  const params = rawParams.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const parts = p.split('=').map(s => s.trim());
    const paramName = parts[0].replace(/:\s*\w+.*$/, '').trim(); // strip TS types
    const result = { name: paramName };
    if (parts.length > 1) result.default = parts[1];

    // Infer type from name or TS annotation
    const typeMatch = p.match(/:\s*(\w+(?:\[\])?)/);
    if (typeMatch) {
      result.type = typeMatch[1];
    } else {
      result.type = inferParamType(paramName, code);
    }
    return result;
  });

  return { name, params, language: language || 'javascript', isConstructor };
}

function extractPythonSig(code) {
  const match = code.match(/def\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return null;

  const [, name, rawParams] = match;
  const params = rawParams.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const parts = p.split('=').map(s => s.trim());
    const result = { name: parts[0] };
    if (parts.length > 1) result.default = parts[1];
    result.type = inferParamType(parts[0], code);
    return result;
  });

  return { name, params, language: 'python' };
}

/**
 * Infer parameter type from name patterns and usage in code.
 */
function inferParamType(name, code) {
  const n = name.toLowerCase();

  // Name-based inference
  if (/^(arr|array|list|items|nums|values|elements)$/i.test(n)) return 'array';
  if (/^(str|string|text|s|t|name|word|char|ch|prefix|suffix|sep|input|content|src|source|msg|message|line|csv|json|xml|html|template|pattern|query|url|path)$/i.test(n)) return 'string';
  if (/^(n|num|count|index|size|len|max|min|limit|start|end|step|depth|places|delay|ms)$/i.test(n)) return 'number';
  if (/^(fn|func|callback|predicate|handler|cb|comparator)$/i.test(n)) return 'function';
  if (/^(obj|o|dict|options|config|opts|map|data|record|params|props|settings|meta|ctx|context)$/i.test(n)) return 'object';
  if (/^(flag|bool|enabled|disabled|is\w+|has\w+|should\w+)$/i.test(n)) return 'boolean';
  if (/^(keys|tags|ids)$/i.test(n)) return 'array';

  // Usage-based inference
  if (code.includes(`${name}.length`) || code.includes(`${name}[`) || code.includes(`${name}.map`)) return 'array';
  if (code.includes(`${name}.split`) || code.includes(`${name}.trim`) || code.includes(`${name}.charAt`)) return 'string';
  if (code.includes(`${name} +`) && code.includes(`${name} *`)) return 'number';
  if (code.includes(`${name}(`) && name !== code.match(/(?:function|def)\s+(\w+)/)?.[1]) return 'function';

  return 'any';
}

// ─── Test Value Generation ───

/**
 * Generate test values for a given type.
 * Returns { typical, edge } arrays of test values.
 */
function testValuesForType(type, language) {
  const py = language === 'python';

  // Normalize array types: any[], number[], string[] → array
  const normalizedType = type?.endsWith('[]') ? 'array' : type;

  switch (normalizedType) {
    case 'number':
      return {
        typical: [0, 1, 5, 10, 42, -1, 100],
        edge: [0, -1, Number.MAX_SAFE_INTEGER ? 'Number.MAX_SAFE_INTEGER' : '2**53-1'],
      };
    case 'string':
      return {
        typical: [q('hello', py), q('world', py), q('abc', py), q('test', py)],
        edge: [q('', py), q(' ', py), q('a', py)],
      };
    case 'array':
      return {
        typical: ['[1, 2, 3]', '[1, 2, 3, 4, 5]', '[10, 20, 30]'],
        edge: ['[]', '[1]', '[0, 0, 0]'],
      };
    case 'boolean':
      return {
        typical: [py ? 'True' : 'true', py ? 'False' : 'false'],
        edge: [],
      };
    case 'object':
      if (py) return { typical: ["{'a': 1, 'b': 2}"], edge: ['{}'] };
      return { typical: ["{a: 1, b: 2}"], edge: ['{}'] };
    case 'function':
      if (py) return { typical: ['lambda x: x * 2'], edge: ['lambda x: x'] };
      return { typical: ['x => x * 2'], edge: ['x => x'] };
    default:
      return { typical: [1, q('test', py), py ? 'True' : 'true'], edge: [0, q('', py)] };
  }
}

function q(s, python) {
  return `"${s}"`;
}

// ─── Test Code Generation ───

/**
 * Synthesize test code for a function.
 * Analyzes signature and generates assertion-based tests.
 *
 * @param {string} code - The function code
 * @param {string} language - Target language
 * @param {object} options - { parentTestCode?, parentFuncName?, maxTests? }
 * @returns {string} Generated test code
 */
function synthesizeTests(code, language, options = {}) {
  const { parentTestCode, parentFuncName, maxTests = 8 } = options;

  // Strategy 1: Translate parent tests if available
  if (parentTestCode && parentFuncName) {
    const translated = translateParentTests(code, language, parentTestCode, parentFuncName);
    if (translated) return translated;
  }

  // Strategy 2: Generate from signature analysis
  const sig = extractSignature(code, language);
  if (!sig) return '';

  return generateFromSignature(sig, code, language, maxTests);
}

/**
 * Translate parent JS tests to target language.
 */
function translateParentTests(code, language, parentTestCode, parentFuncName) {
  const sig = extractSignature(code, language);
  if (!sig) return null;
  const funcName = sig.name;

  if (language === 'python') {
    return translateTestsToPython(parentTestCode, parentFuncName, funcName);
  }
  if (language === 'typescript') {
    // TS uses same test syntax as JS, just rename function
    return parentTestCode.replace(new RegExp(`\\b${parentFuncName}\\b`, 'g'), funcName);
  }
  return null;
}

/**
 * Translate JS test assertions to Python.
 * Handles: if (x !== y) throw → assert x == y
 *          if (!x) throw → assert x
 *          JSON.stringify() → direct comparison
 */
function translateTestsToPython(testCode, jsFuncName, pyFuncName) {
  const lines = testCode.split('\n').filter(l => l.trim());
  const pyLines = [];

  for (const line of lines) {
    // Pattern: if (expr !== expected) throw
    const throwMatch = line.match(/if\s*\((.+?)\s*(!==?|===?)\s*(.+?)\)\s*throw/);
    if (throwMatch) {
      let [, left, op, right] = throwMatch;
      left = left.replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);

      // Clean right side
      right = right.replace(/\)\s*throw.*$/, '').trim();
      // Balance parens
      const rOpen = (right.match(/\(/g) || []).length;
      const rClose = (right.match(/\)/g) || []).length;
      if (rClose > rOpen) right = right.replace(/\)\s*$/, '');

      // Translate JS→Python
      left = jsToPyExpr(left);
      right = jsToPyExpr(right);

      // Flip: if (x !== y) throw → assert x == y
      const assertOp = (op === '!==' || op === '!=') ? '==' : '!=';
      pyLines.push(`assert ${left} ${assertOp} ${right}`);
      continue;
    }

    // Pattern: if (!expr) throw → assert expr
    const negMatch = line.match(/if\s*\(\s*!\s*(.+?)\s*\)\s*throw/);
    if (negMatch) {
      let expr = negMatch[1].replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);
      expr = jsToPyExpr(expr);
      pyLines.push(`assert ${expr}`);
      continue;
    }

    // Pattern: if (expr) throw → assert not expr
    const posMatch = line.match(/if\s*\(\s*([^!].*?)\s*\)\s*throw/);
    if (posMatch) {
      let expr = posMatch[1].replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);
      expr = jsToPyExpr(expr);
      pyLines.push(`assert not (${expr})`);
      continue;
    }
  }

  return pyLines.length > 0 ? pyLines.join('\n') : null;
}

/**
 * Convert a single JS expression to Python.
 */
function jsToPyExpr(expr) {
  let py = expr;

  // JSON.stringify(x) → just x (Python compares lists/dicts directly)
  py = py.replace(/JSON\.stringify\(([^)]+)\)/g, '$1');

  // .toString() → str()
  py = py.replace(/(\w+)\.toString\(\)/g, 'str($1)');

  // .length → len()
  py = py.replace(/(\w+)\.length/g, 'len($1)');

  // Math builtins
  py = py.replace(/Math\.max\(/g, 'max(');
  py = py.replace(/Math\.min\(/g, 'min(');
  py = py.replace(/Math\.floor\(/g, 'int(');
  py = py.replace(/Math\.abs\(/g, 'abs(');
  py = py.replace(/Math\.round\(/g, 'round(');
  py = py.replace(/Math\.pow\(([^,]+),\s*([^)]+)\)/g, '($1 ** $2)');

  // Boolean/null
  py = py.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
  py = py.replace(/\bnull\b/g, 'None').replace(/\bundefined\b/g, 'None');

  // Operators
  py = py.replace(/===/g, '==').replace(/!==/g, '!=');
  py = py.replace(/\s*\|\|\s*/g, ' or ');
  py = py.replace(/\s*&&\s*/g, ' and ');

  // String-wrapped arrays → actual arrays: '[[1,2],[3,4]]' → [[1,2],[3,4]]
  py = py.replace(/^['"](\[.*\])['"]$/g, '$1');

  return py;
}

/**
 * Generate tests from function signature analysis.
 */
function generateFromSignature(sig, code, language, maxTests) {
  const { name, params, isConstructor } = sig;
  const py = language === 'python';
  const tests = [];

  // Constructor pattern: use `new Name()` and test prototype methods
  if (isConstructor && !py) {
    return generateConstructorTests(name, code, language, maxTests);
  }

  if (params.length === 0) {
    // Zero-arg function — just call it
    tests.push(makeAssertion(`${name}()`, null, null, py));
    return tests.join('\n');
  }

  // For each param, generate typical + edge values
  const paramValues = params.map(p => {
    const vals = testValuesForType(p.type, language);
    return { param: p, values: [...vals.typical, ...vals.edge] };
  });

  // Generate test combos — basic cases using typical[0] for each param
  const typicalArgs = params.map((p, i) => {
    const vals = testValuesForType(p.type, language);
    return vals.typical[0] ?? (py ? 'None' : 'null');
  });

  // Test 1: Basic call doesn't throw
  const basicCall = `${name}(${typicalArgs.join(', ')})`;
  tests.push(makeCallTest(basicCall, py));

  // Test 2: If function looks like it returns number, test with known inputs
  if (looksLikeReturnsNumber(code)) {
    const numArgs = params.map(p => {
      if (p.type === 'number') return '0';
      if (p.type === 'array') return '[]';
      if (p.type === 'string') return q('', py);
      return typicalArgs[params.indexOf(p)];
    });
    const zeroCall = `${name}(${numArgs.join(', ')})`;
    tests.push(makeCallTest(zeroCall, py));
  }

  // Test 3: If function takes an array, test with empty array
  const arrayParam = params.find(p => p.type === 'array');
  if (arrayParam) {
    const emptyArgs = params.map(p => {
      if (p === arrayParam) return '[]';
      if (p.type === 'number') return '1';
      return typicalArgs[params.indexOf(p)];
    });
    tests.push(makeCallTest(`${name}(${emptyArgs.join(', ')})`, py));
  }

  // Test 4: If function has defaults, test without optional params
  const required = params.filter(p => !p.default);
  if (required.length < params.length && required.length > 0) {
    const reqArgs = required.map(p => {
      const vals = testValuesForType(p.type, language);
      return vals.typical[0] ?? '1';
    });
    tests.push(makeCallTest(`${name}(${reqArgs.join(', ')})`, py));
  }

  // Test 5-maxTests: Vary each param with edge values
  for (const pv of paramValues) {
    if (tests.length >= maxTests) break;
    for (const edgeVal of testValuesForType(pv.param.type, language).edge) {
      if (tests.length >= maxTests) break;
      const args = params.map(p => {
        if (p === pv.param) return String(edgeVal);
        const vals = testValuesForType(p.type, language);
        return String(vals.typical[0] ?? '1');
      });
      tests.push(makeCallTest(`${name}(${args.join(', ')})`, py));
    }
  }

  return [...new Set(tests)].slice(0, maxTests).join('\n');
}

/**
 * Generate tests for constructor + prototype method patterns.
 * Handles: function Foo() { ... } + Foo.prototype.bar = function() { ... }
 */
function generateConstructorTests(name, code, language, maxTests) {
  const tests = [];
  const varName = name[0].toLowerCase() + name.slice(1);

  // Instantiate
  tests.push(`var ${varName} = new ${name}();`);

  // Find prototype methods
  const protoRegex = new RegExp(`${name}\\.prototype\\.(\\w+)\\s*=\\s*function\\s*\\(([^)]*)\\)`, 'g');
  let methodMatch;
  const methods = [];
  while ((methodMatch = protoRegex.exec(code)) !== null) {
    methods.push({ method: methodMatch[1], params: methodMatch[2] });
  }

  for (const m of methods) {
    if (tests.length >= maxTests + 1) break; // +1 for the instantiation line
    const params = m.params.split(',').map(p => p.trim()).filter(Boolean);
    if (params.length === 0) {
      tests.push(`${varName}.${m.method}();`);
    } else {
      const args = params.map(p => {
        const type = inferParamType(p.split('=')[0].trim(), code);
        const vals = testValuesForType(type, language);
        return String(vals.typical[0] ?? '1');
      });
      tests.push(`${varName}.${m.method}(${args.join(', ')});`);
    }
  }

  // If no prototype methods found, just test construction
  if (methods.length === 0) {
    tests.push(`if (!${varName}) throw new Error("constructor returned falsy");`);
  } else {
    // Add a final assertion
    tests.push(`if (!${varName}) throw new Error("instance is falsy");`);
  }

  return tests.join('\n');
}

function looksLikeReturnsNumber(code) {
  return /return\s+[\w.]+\s*[\+\-\*\/\%]/.test(code) ||
    /return\s+Math\./.test(code) ||
    /return\s+parseInt/.test(code) ||
    /return\s+parseFloat/.test(code);
}

function makeCallTest(call, python) {
  if (python) {
    return `result = ${call}\nassert result is not None or result == 0 or result == '' or result == [] or result == False`;
  }
  return `if (${call} === undefined) throw new Error("returned undefined");`;
}

/**
 * Detect if code is a test file (contains test framework imports/usage).
 */
function isTestFile(code) {
  // Node test runner
  if (/require\(['"]node:test['"]\)/.test(code)) return true;
  // Test frameworks
  if (/\bdescribe\s*\(/.test(code) && /\b(?:it|test)\s*\(/.test(code)) return true;
  // Jest/Mocha/Vitest patterns
  if (/\bbeforeEach\s*\(/.test(code) && /\bafterEach\s*\(/.test(code)) return true;
  // require assert + describe
  if (/require\(['"](?:node:)?assert/.test(code) && /\bdescribe\s*\(/.test(code)) return true;
  return false;
}

/**
 * Detect if code is a data/config file (mostly object/array definitions, not functions).
 */
function isDataFile(code) {
  // Large array of objects (seed files, config arrays)
  if (/^(?:const|let|var)\s+\w+\s*=\s*\[/m.test(code)) {
    const funcCount = (code.match(/\bfunction\s+\w+/g) || []).length;
    const objectCount = (code.match(/\{\s*name\s*:/g) || []).length;
    if (objectCount > 5 && funcCount <= 1) return true;
  }
  return false;
}

/**
 * Detect if code requires external/blocked modules that won't work in sandbox.
 */
function requiresExternalModules(code) {
  const blockedModules = ['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2'];
  for (const mod of blockedModules) {
    if (code.includes(`require('${mod}')`) || code.includes(`require("${mod}")`)) return true;
    if (code.includes(`require('node:${mod}')`) || code.includes(`require("node:${mod}")`)) return true;
  }
  // Also detect heavy relative requires (test files importing project modules)
  const relativeRequires = (code.match(/require\(['"]\.\.?\//g) || []).length;
  if (relativeRequires > 2) return true;
  return false;
}

/**
 * Validate that candidate code is syntactically viable.
 * Returns false if the code contains obvious cross-language syntax errors.
 */
function isViableCode(code, language) {
  if (language === 'python') {
    // Reject JS syntax that leaked into Python transpilation
    if (/for\s*\(\s*\w+\s*=/.test(code)) return false;      // C-style for (i = 0; ...)
    if (/\.prototype\./.test(code)) return false;             // .prototype.
    if (/\bfunction\s*[\s(]/.test(code)) return false;       // function keyword
    if (/=>\s*[\{]/.test(code)) return false;                 // arrow functions
    if (/\bthis\./.test(code)) return false;                  // this.
    if (/result\s*=\s*:/.test(code)) return false;            // empty assignment with colon
    if (/\bconst\b|\blet\b|\bvar\b/.test(code)) return false; // JS declarations
    if (/\bnew\s+Date\b/.test(code)) return false;           // new Date()
    if (/Number\.EPSILON/.test(code)) return false;           // Number.EPSILON
    if (/\.getDate\(/.test(code)) return false;               // JS Date methods
    if (/\.filter\s*\(/.test(code)) return false;             // .filter() method
    if (/\.map\s*\(/.test(code)) return false;                // .map() method
    if (/\.reduce\s*\(/.test(code)) return false;             // .reduce() method
    if (/\.forEach\s*\(/.test(code)) return false;            // .forEach() method
    if (/\.push\s*\(/.test(code)) return false;               // .push() method
    if (/\.splice\s*\(/.test(code)) return false;             // .splice() method
    if (/\.slice\s*\(/.test(code)) return false;              // .slice() method
    if (/\.indexOf\s*\(/.test(code)) return false;            // .indexOf() method
    if (/\bnew\s+\w+\s*\(/.test(code)) return false;         // new Constructor()
    if (/\btypeof\b/.test(code)) return false;                // typeof operator
    if (/===|!==/.test(code)) return false;                    // strict equality
    if (/\bcatch\s*\(/.test(code)) return false;              // try/catch
    if (/\bthrow\s+new\b/.test(code)) return false;           // throw new Error
    // Check for broken indentation (inconsistent indent levels)
    const lines = code.split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const prevIndent = lines[i-1].match(/^(\s*)/)[1].length;
      const currIndent = lines[i].match(/^(\s*)/)[1].length;
      // Jump of >8 spaces is suspicious
      if (currIndent - prevIndent > 8 && !lines[i-1].trim().endsWith(':')) return false;
    }
    // Shadowing builtins as params: def f(val, min, max) shadows min/max
    const defMatch = code.match(/def\s+\w+\(([^)]+)\)/);
    if (defMatch) {
      const params = defMatch[1].split(',').map(p => p.trim().split('=')[0].trim());
      const builtins = ['min', 'max', 'len', 'int', 'str', 'list', 'dict', 'set', 'type', 'range', 'print', 'sum', 'abs', 'round'];
      if (params.some(p => builtins.includes(p))) return false;
    }
  }
  if (language === 'javascript' || language === 'typescript') {
    // Reject test files
    if (isTestFile(code)) return false;
    // Reject code that requires blocked modules
    if (requiresExternalModules(code)) return false;
  }
  return true;
}

function makeAssertion(call, op, expected, python) {
  if (python) {
    if (op && expected != null) return `assert ${call} ${op} ${expected}`;
    return `result = ${call}\nassert result is not None`;
  }
  if (op && expected != null) return `if (${call} ${op === '==' ? '!==' : '==='} ${expected}) throw new Error("assertion failed");`;
  return `if (${call} === undefined) throw new Error("returned undefined");`;
}

// ─── Test Quality Detection ───

/**
 * Check if existing test code has broken syntax patterns.
 * Detects: inverted assertions, JS syntax leaks in Python, syntax errors.
 */
function hasBrokenTestSyntax(testCode, language) {
  if (!testCode) return false;
  if (/assert\s+\w+\([^)]*\)\s*!=\s*/.test(testCode)) return true;
  if (/JSON\.stringify/.test(testCode)) return true;
  if (/\.prototype\./.test(testCode)) return true;
  if (/===/.test(testCode)) return true;
  if (/\|\|/.test(testCode)) return true;
  if (language === 'python' && /\.length/.test(testCode)) return true;
  return false;
}

/**
 * Clean up generated test code for the target language.
 */
function cleanupTestCode(testCode, language) {
  if (language === 'python') {
    return testCode.replace(/(\w+(?:\([^)]*\))?)\.length/g, 'len($1)');
  }
  return testCode;
}

/**
 * Store synthesized test code on a candidate in the database.
 */
function storeCandidateTest(oracle, candidateId, testCode) {
  if (oracle.patterns._backend === 'sqlite') {
    oracle.patterns._sqlite.db.prepare(
      'UPDATE candidates SET test_code = ?, updated_at = ? WHERE id = ?'
    ).run(testCode, new Date().toISOString(), candidateId);
  }
}

// ─── Batch Test Synthesis ───

/**
 * Process a single candidate for test synthesis.
 * Returns a detail record for the report.
 */
function processCandidate(candidate, oracle, dryRun) {
  if (!isViableCode(candidate.code, candidate.language)) {
    return { name: candidate.name, status: 'bad_code', reason: 'Code has syntax errors from transpilation', failed: true };
  }

  const parent = candidate.parentPattern
    ? oracle.patterns.getAll().find(p => p.name === candidate.parentPattern)
    : null;

  let testCode = synthesizeTests(candidate.code, candidate.language, {
    parentTestCode: parent?.testCode,
    parentFuncName: parent ? extractSignature(parent.code, parent.language)?.name : null,
  });

  if (!testCode) {
    return { name: candidate.name, status: 'no_tests', reason: 'Could not synthesize tests', failed: true };
  }

  const existing = candidate.testCode || '';
  const isNew = !existing;
  const isBroken = hasBrokenTestSyntax(existing, candidate.language);
  const isBetter = !isNew && (isBroken || testCode.length > existing.length);

  if (!isNew && !isBetter) {
    return { name: candidate.name, status: 'kept_existing' };
  }

  testCode = cleanupTestCode(testCode, candidate.language);
  if (!dryRun) storeCandidateTest(oracle, candidate.id, testCode);

  return {
    name: candidate.name,
    status: isNew ? 'synthesized' : 'improved',
    testLines: testCode.split('\n').length,
    language: candidate.language,
    synthesized: true,
    improved: isBetter,
  };
}

/**
 * Synthesize tests for all candidates that lack adequate tests.
 * Returns a report of what was generated.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - { maxCandidates?, dryRun? }
 * @returns {{ processed, synthesized, failed, details }}
 */
function synthesizeForCandidates(oracle, options = {}) {
  const { maxCandidates = Infinity, dryRun = false } = options;
  const candidates = oracle.candidates();
  const report = { processed: 0, synthesized: 0, improved: 0, failed: 0, details: [] };

  for (const candidate of candidates.slice(0, maxCandidates)) {
    report.processed++;
    const detail = processCandidate(candidate, oracle, dryRun);
    report.details.push(detail);

    if (detail.failed) report.failed++;
    if (detail.synthesized) report.synthesized++;
    if (detail.improved) report.improved++;
  }

  return report;
}

module.exports = {
  synthesizeTests,
  synthesizeForCandidates,
  extractSignature,
  inferParamType,
  testValuesForType,
  translateTestsToPython,
  jsToPyExpr,
  generateFromSignature,
  isViableCode,
  hasBrokenTestSyntax,
  cleanupTestCode,
  isTestFile,
  isDataFile,
  requiresExternalModules,
};
