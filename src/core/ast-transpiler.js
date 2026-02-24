/**
 * AST-Based Transpiler — structural code transformation via parse trees.
 *
 * Instead of fragile regex replacements, this module:
 *   1. Parses JavaScript source into a simplified AST (see ast-parser.js)
 *   2. Transforms the AST nodes for the target language
 *   3. Generates idiomatic output code
 *
 * Language generators are extracted into per-language modules under transpilers/.
 * Supports: JS → Python, JS → TypeScript, JS → Go, JS → Rust
 */

const { parseJS, tokenize } = require('./ast-parser');

// ─── Per-Language Generators ───

const { toPython, detectPythonImports } = require('./transpilers/python');
const { toTypeScript, toTsExpr, inferType, inferReturnType } = require('./transpilers/typescript');
const { toGo, toGoExpr, detectGoImports } = require('./transpilers/go');
const { toRust, toRustExpr } = require('./transpilers/rust');
const { toSnakeCase, capitalize } = require('./transpilers/shared');

// ─── Public API ───

/**
 * Transpile JavaScript code to target language using AST.
 * @param {string} code - JavaScript source code
 * @param {string} targetLanguage - 'python' | 'typescript' | 'go' | 'rust'
 * @returns {object} { code, ast, success, error?, imports? }
 */
function transpile(code, targetLanguage) {
  try {
    const ast = parseJS(code);

    let output;
    let imports = [];
    switch (targetLanguage) {
      case 'python': {
        output = toPython(ast);
        imports = detectPythonImports(output);
        if (imports.length > 0) {
          output = imports.join('\n') + '\n\n' + output;
        }
        break;
      }
      case 'typescript':
        output = toTypeScript(ast);
        break;
      case 'go':
        output = toGo(ast);
        imports = detectGoImports(output);
        break;
      case 'rust':
        output = toRust(ast);
        break;
      default:
        return { code: null, ast, success: false, error: `Unsupported target: ${targetLanguage}` };
    }

    return { code: output, ast, success: true, imports };
  } catch (err) {
    return { code: null, ast: null, success: false, error: err.message };
  }
}

// ─── Test Code Generation ───

/**
 * Extract function names and their call signatures from JS test code.
 */
function extractTestCalls(testCode) {
  const calls = [];
  const assertRe = /(\w+)\(([^)]*)\)\s*(?:===|!==|==|!=)\s*([^\s;,)]+)/g;
  let m;
  while ((m = assertRe.exec(testCode)) !== null) {
    calls.push({ func: m[1], args: m[2].trim(), expected: m[3].trim(), op: testCode.slice(m.index).includes('!==') || testCode.slice(m.index).includes('!=') ? '!=' : '==' });
  }
  const throwRe = /if\s*\(\s*(\w+)\(([^)]*)\)\s*(!==|!= |===|==)\s*([^)]+)\)\s*throw/g;
  while ((m = throwRe.exec(testCode)) !== null) {
    calls.push({ func: m[1], args: m[2].trim(), expected: m[4].trim(), op: m[3].includes('!') ? '!=' : '==' });
  }
  return calls;
}

/**
 * Generate Go test code from JavaScript test patterns.
 */
function generateGoTest(goCode, jsTestCode, funcName) {
  if (!jsTestCode || !funcName) return null;

  const calls = extractTestCalls(jsTestCode);
  if (calls.length === 0) {
    return `package main\n\nimport "testing"\n\nfunc TestCompiles(t *testing.T) {\n\t// Compilation test — verifies code is valid Go\n\tt.Log("Code compiles successfully")\n}\n`;
  }

  const testFuncs = calls.map((c, i) => {
    const goArgs = convertArgs(c.args, 'go');
    const goExpected = convertValue(c.expected, 'go');
    const testName = `Test${capitalize(c.func)}${i > 0 ? i + 1 : ''}`;

    if (c.op === '==') {
      return `func ${testName}(t *testing.T) {\n\tresult := ${c.func}(${goArgs})\n\tif result != ${goExpected} {\n\t\tt.Errorf("expected ${goExpected}, got %v", result)\n\t}\n}`;
    }
    return `func ${testName}(t *testing.T) {\n\tresult := ${c.func}(${goArgs})\n\tif result == ${goExpected} {\n\t\tt.Errorf("expected not ${goExpected}, got %v", result)\n\t}\n}`;
  });

  return `package main\n\nimport "testing"\n\n${testFuncs.join('\n\n')}\n`;
}

/**
 * Generate Rust test code from JavaScript test patterns.
 */
function generateRustTest(rustCode, jsTestCode, funcName) {
  if (!jsTestCode || !funcName) return null;

  const calls = extractTestCalls(jsTestCode);

  if (calls.length === 0) {
    return `    use super::*;\n\n    #[test]\n    fn test_compiles() {\n        // Compilation test\n        assert!(true);\n    }\n`;
  }

  const testFuncs = calls.map((c, i) => {
    const rustFunc = toSnakeCase(c.func);
    const rustArgs = convertArgs(c.args, 'rust');
    const rustExpected = convertValue(c.expected, 'rust');
    const testName = `test_${rustFunc}${i > 0 ? '_' + (i + 1) : ''}`;

    if (c.op === '==') {
      return `    #[test]\n    fn ${testName}() {\n        assert_eq!(${rustFunc}(${rustArgs}), ${rustExpected});\n    }`;
    }
    return `    #[test]\n    fn ${testName}() {\n        assert_ne!(${rustFunc}(${rustArgs}), ${rustExpected});\n    }`;
  });

  return `    use super::*;\n\n${testFuncs.join('\n\n')}\n`;
}

// ─── Argument/Value Converters ───

function convertArgs(args, lang) {
  if (!args) return '';
  return args.split(',').map(a => convertValue(a.trim(), lang)).join(', ');
}

function convertValue(val, lang) {
  if (val === 'true' || val === 'false') return val;
  if (/^-?\d+$/.test(val)) return val;
  if (/^-?\d+\.\d+$/.test(val)) return val;
  if (lang === 'rust' && /^["'](.*)["']$/.test(val)) return `String::from(${val.replace(/'/g, '"')})`;
  if (/^["']/.test(val)) return val.replace(/'/g, '"');
  return val;
}

// ─── Transpilation Verification ───

/**
 * Verify transpiled code compiles by running the sandbox.
 */
function verifyTranspilation(code, testCode, language) {
  try {
    const { sandboxExecute } = require('./sandbox');
    const result = sandboxExecute(code, testCode, language, { timeout: 30000 });
    return { compiled: result.passed === true, output: result.output || '', sandboxed: true };
  } catch (err) {
    return { compiled: false, output: err.message, sandboxed: false };
  }
}

module.exports = {
  transpile,
  parseJS,
  tokenize,
  toPython,
  toTypeScript,
  toGo,
  toRust,
  toSnakeCase,
  inferType,
  inferReturnType,
  detectPythonImports,
  detectGoImports,
  generateGoTest,
  generateRustTest,
  extractTestCalls,
  verifyTranspilation,
};
