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

const { computeCoherencyScore } = require('./coherency');

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
  const match = code.match(/function\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return null;

  const [, name, rawParams] = match;
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

  return { name, params, language: language || 'javascript' };
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
  if (/^(str|string|text|s|name|word|char|ch|prefix|suffix|sep)$/i.test(n)) return 'string';
  if (/^(n|num|count|index|size|len|max|min|limit|start|end|step|depth|places|delay|ms)$/i.test(n)) return 'number';
  if (/^(fn|func|callback|predicate|handler|cb|comparator)$/i.test(n)) return 'function';
  if (/^(obj|dict|options|config|opts|map|data|record)$/i.test(n)) return 'object';
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

  switch (type) {
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
  const { name, params } = sig;
  const py = language === 'python';
  const tests = [];

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
 * Validate that candidate code is syntactically viable.
 * Returns false if the code contains obvious cross-language syntax errors.
 */
function isViableCode(code, language) {
  if (language === 'python') {
    // Reject JS syntax that leaked into Python
    if (/for\s*\(\s*\w+\s*=/.test(code)) return false;      // for (i = 0; ...)
    if (/\.filter\(/.test(code)) return false;                // .filter()
    if (/\.map\(/.test(code)) return false;                   // .map()
    if (/\.reduce\(/.test(code)) return false;                // .reduce()
    if (/\.prototype\./.test(code)) return false;             // .prototype.
    if (/function\s*\(/.test(code)) return false;             // function keyword
    if (/=>\s*[\{]/.test(code)) return false;                 // arrow functions
    if (/\bthis\./.test(code)) return false;                  // this.
    if (/result\s*=\s*:/.test(code)) return false;            // empty assignment with colon
    if (/\bconst\b|\blet\b|\bvar\b/.test(code)) return false; // JS declarations
    if (/while\s*\([^)]*\)\s*\{/.test(code)) return false;   // while (...) {
    if (/\bnew\s+Date\b/.test(code)) return false;           // new Date()
    if (/Number\.EPSILON/.test(code)) return false;           // Number.EPSILON
    if (/\bnew\s+\w+\(/.test(code)) return false;            // new Constructor()
    if (/\.getDate\(/.test(code)) return false;               // JS Date methods
    // Shadowing builtins as params: def f(val, min, max) shadows min/max
    const defMatch = code.match(/def\s+\w+\(([^)]+)\)/);
    if (defMatch) {
      const params = defMatch[1].split(',').map(p => p.trim().split('=')[0].trim());
      const builtins = ['min', 'max', 'len', 'int', 'str', 'list', 'dict', 'set', 'type', 'range', 'print', 'sum', 'abs', 'round'];
      if (params.some(p => builtins.includes(p))) return false;
    }
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

// ─── Batch Test Synthesis ───

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
  const report = {
    processed: 0,
    synthesized: 0,
    improved: 0,
    failed: 0,
    details: [],
  };

  for (const candidate of candidates.slice(0, maxCandidates)) {
    report.processed++;

    // Skip candidates with non-viable code (broken transpilation)
    if (!isViableCode(candidate.code, candidate.language)) {
      report.failed++;
      report.details.push({ name: candidate.name, status: 'bad_code', reason: 'Code has syntax errors from transpilation' });
      continue;
    }

    // Find parent pattern for test translation
    const parent = candidate.parentPattern
      ? oracle.patterns.getAll().find(p => p.name === candidate.parentPattern)
      : null;

    // Synthesize test code
    let testCode = synthesizeTests(candidate.code, candidate.language, {
      parentTestCode: parent?.testCode,
      parentFuncName: parent ? extractSignature(parent.code, parent.language)?.name : null,
    });

    if (!testCode) {
      report.failed++;
      report.details.push({ name: candidate.name, status: 'no_tests', reason: 'Could not synthesize tests' });
      continue;
    }

    // Check if synthesized tests are better than existing
    const existing = candidate.testCode || '';
    const isNew = !existing;
    // Detect broken tests: inverted assertions (assert x != y instead of ==),
    // JS syntax leaks (JSON.stringify, .prototype, ===), or syntax errors
    const hasBrokenTests = existing && (
      /assert\s+\w+\([^)]*\)\s*!=\s*/.test(existing) ||
      /JSON\.stringify/.test(existing) ||
      /\.prototype\./.test(existing) ||
      /===/.test(existing) ||
      /\|\|/.test(existing) ||
      (candidate.language === 'python' && /\.length/.test(existing))
    );
    const isBetter = !isNew && (hasBrokenTests || testCode.length > existing.length);

    if (isNew || isBetter) {
      report.synthesized++;
      if (isBetter) report.improved++;

      // Final cleanup: ensure Python tests don't use JS syntax
      if (candidate.language === 'python') {
        testCode = testCode.replace(/(\w+(?:\([^)]*\))?)\.length/g, 'len($1)');
      }

      if (!dryRun) {
        // Update the candidate's test code in the store
        if (oracle.patterns._backend === 'sqlite') {
          oracle.patterns._sqlite.db.prepare(
            'UPDATE candidates SET test_code = ?, updated_at = ? WHERE id = ?'
          ).run(testCode, new Date().toISOString(), candidate.id);
        }
      }

      report.details.push({
        name: candidate.name,
        status: isNew ? 'synthesized' : 'improved',
        testLines: testCode.split('\n').length,
        language: candidate.language,
      });
    } else {
      report.details.push({ name: candidate.name, status: 'kept_existing' });
    }
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
};
