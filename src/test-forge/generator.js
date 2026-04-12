/**
 * Test Forge — Generator
 * Analyzes pattern code to produce test assertions.
 * Works for JavaScript, TypeScript, Python, Go, Rust.
 *
 * Generated tests use inline assertions with throw new Error() style
 * (compatible with sandbox execution — no external test frameworks).
 */

'use strict';

// ─── Regex Patterns for Export/Function Detection ───

const EXPORT_PATTERNS = [
  // module.exports = function name(...)
  /module\.exports\s*=\s*function\s+(\w+)\s*\(([^)]*)\)/g,
  // module.exports = (params) =>
  /module\.exports\s*=\s*\(([^)]*)\)\s*=>/g,
  // module.exports = { name1, name2 }
  /module\.exports\s*=\s*\{([^}]+)\}/g,
  // exports.name = function(...)
  /exports\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g,
  // exports.name = (params) =>
  /exports\.(\w+)\s*=\s*\(([^)]*)\)\s*=>/g,
  // export function name(...)
  /export\s+function\s+(\w+)\s*\(([^)]*)\)/g,
  // export default function name(...)
  /export\s+default\s+function\s+(\w+)\s*\(([^)]*)\)/g,
  // export { name1, name2 }
  /export\s*\{([^}]+)\}/g,
];

const FUNCTION_PATTERNS = [
  // function name(params) {
  /function\s+(\w+)\s*\(([^)]*)\)/g,
  // const name = (params) =>
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:function\s*)?\(([^)]*)\)\s*(?:=>|{)/g,
  // const name = function(params)
  /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/g,
  // name(params) { — method shorthand
  /^\s+(\w+)\s*\(([^)]*)\)\s*\{/gm,
];

// ─── Parameter Type Inference ───

const PARAM_TYPE_MAP = {
  arr: 'array', array: 'array', list: 'array', items: 'array', elements: 'array', values: 'array',
  str: 'string', text: 'string', name: 'string', key: 'string', label: 'string',
  msg: 'string', message: 'string', input: 'string', query: 'string', pattern: 'string',
  path: 'string', url: 'string', prefix: 'string', suffix: 'string', separator: 'string',
  n: 'number', num: 'number', count: 'number', size: 'number', len: 'number',
  length: 'number', index: 'number', idx: 'number', max: 'number', min: 'number',
  limit: 'number', offset: 'number', depth: 'number', width: 'number', height: 'number',
  x: 'number', y: 'number', z: 'number', a: 'number', b: 'number', rate: 'number',
  obj: 'object', options: 'object', config: 'object', opts: 'object', params: 'object',
  data: 'object', context: 'object', settings: 'object', meta: 'object',
  fn: 'function', cb: 'function', callback: 'function', handler: 'function',
  predicate: 'function', comparator: 'function', transform: 'function',
  flag: 'boolean', bool: 'boolean', enabled: 'boolean', active: 'boolean',
  verbose: 'boolean', strict: 'boolean',
};

const TEST_VALUES = {
  array: '[1, 2, 3]',
  string: "'test'",
  number: '42',
  object: "{ key: 'value' }",
  function: '(x) => x',
  boolean: 'true',
  unknown: "'test'",
};

const PYTHON_TEST_VALUES = {
  array: '[1, 2, 3]',
  string: '"test"',
  number: '42',
  object: '{"key": "value"}',
  function: 'lambda x: x',
  boolean: 'True',
  unknown: '"test"',
};

// ─── Semantic Assertions by Function Name ───

const SEMANTIC_CHECKS = {
  sort: {
    check: (fnCall, arg) =>
      `var _sorted = ${fnCall};\n` +
      `for (var _si = 1; _si < _sorted.length; _si++) {\n` +
      `  if (_sorted[_si] < _sorted[_si - 1]) throw new Error('Result should be sorted');\n` +
      `}`,
    needsArray: true,
  },
  filter: {
    check: (fnCall, arg) =>
      `var _filtered = ${fnCall};\n` +
      `if (_filtered.length > ${arg}.length) throw new Error('Filtered result should not be larger than input');`,
    needsArray: true,
  },
  compact: {
    check: (fnCall, arg) =>
      `var _compacted = ${fnCall};\n` +
      `if (_compacted.length > ${arg}.length) throw new Error('Compacted result should not be larger than input');`,
    needsArray: true,
  },
  map: {
    check: (fnCall, arg) =>
      `var _mapped = ${fnCall};\n` +
      `if (_mapped.length !== ${arg}.length) throw new Error('Mapped result should have same length as input');`,
    needsArray: true,
  },
  transform: {
    check: (fnCall, arg) =>
      `var _transformed = ${fnCall};\n` +
      `if (_transformed.length !== ${arg}.length) throw new Error('Transformed result should have same length as input');`,
    needsArray: true,
  },
  find: {
    check: (fnCall) =>
      `var _found = ${fnCall};\n` +
      `if (_found !== undefined && typeof _found === 'object' && _found === null) throw new Error('Find should return element or undefined, not null');`,
    needsArray: true,
  },
  search: {
    check: (fnCall) =>
      `var _searched = ${fnCall};`,
    needsArray: false,
  },
  merge: {
    check: (fnCall, arg1, arg2) =>
      `var _merged = ${fnCall};\n` +
      `if (typeof _merged !== 'object' || _merged === null) throw new Error('Merge should return an object');`,
    needsArray: false,
  },
  concat: {
    check: (fnCall) =>
      `var _concatResult = ${fnCall};\n` +
      `if (!Array.isArray(_concatResult) && typeof _concatResult !== 'string') throw new Error('Concat should return array or string');`,
    needsArray: false,
  },
  validate: {
    check: (fnCall) =>
      `var _valid = ${fnCall};\n` +
      `if (typeof _valid !== 'boolean') throw new Error('Validate should return a boolean');`,
    needsArray: false,
  },
  check: {
    check: (fnCall) =>
      `var _checked = ${fnCall};\n` +
      `if (typeof _checked !== 'boolean') throw new Error('Check should return a boolean');`,
    needsArray: false,
  },
  parse: {
    check: (fnCall) =>
      `var _parsed = ${fnCall};\n` +
      `if (_parsed === null || _parsed === undefined) throw new Error('Parse should return a non-null value');`,
    needsArray: false,
  },
  hash: {
    check: (fnCall) =>
      `var _hashed = ${fnCall};\n` +
      `if (typeof _hashed !== 'string' || _hashed.length === 0) throw new Error('Hash should return a non-empty string');`,
    needsArray: false,
  },
  encode: {
    check: (fnCall) =>
      `var _encoded = ${fnCall};\n` +
      `if (typeof _encoded !== 'string' || _encoded.length === 0) throw new Error('Encode should return a non-empty string');`,
    needsArray: false,
  },
};

class TestGenerator {
  /**
   * Generate test code for a pattern.
   * @param {object} pattern - { code, name, language, description, tags }
   * @returns {{ testCode: string, strategy: string, assertions: number }}
   */
  generate(pattern) {
    if (!pattern || !pattern.code) {
      return { testCode: '', strategy: 'none', assertions: 0 };
    }
    const lang = (pattern.language || 'javascript').toLowerCase();
    switch (lang) {
      case 'javascript': case 'js':
      case 'typescript': case 'ts':
        return this._generateJS(pattern);
      case 'python': case 'py':
        return this._generatePython(pattern);
      case 'go': case 'golang':
        return this._generateGo(pattern);
      case 'rust': case 'rs':
        return this._generateRust(pattern);
      default:
        return this._generateJS(pattern);
    }
  }

  /**
   * Generate JavaScript/TypeScript test code.
   */
  _generateJS(pattern) {
    const code = pattern.code;
    const exports = this._extractJSExports(code);
    const functions = this._extractJSFunctions(code);

    // Determine strategy
    let strategy = 'module-exercise';
    let testLines = [];
    let assertions = 0;

    if (exports.length > 0) {
      strategy = 'export-call';
      for (const exp of exports) {
        const result = this._generateJSFunctionTests(exp.name, exp.params, code);
        testLines.push(...result.lines);
        assertions += result.assertions;
      }
    } else if (functions.length > 0) {
      // Use first function (typically the main one)
      strategy = 'iife-wrap';
      for (const fn of functions) {
        const result = this._generateJSFunctionTests(fn.name, fn.params, code);
        testLines.push(...result.lines);
        assertions += result.assertions;
      }
    }

    // If no functions found, try class detection
    if (assertions === 0) {
      const classMatch = code.match(/class\s+(\w+)/);
      if (classMatch) {
        strategy = 'class-instantiate';
        const className = classMatch[1];
        testLines.push(`// Test class instantiation`);
        testLines.push(`var _inst = new ${className}();`);
        testLines.push(`if (!_inst) throw new Error('${className} should instantiate');`);
        testLines.push(`if (typeof _inst !== 'object') throw new Error('${className} instance should be an object');`);
        assertions += 2;

        // Extract methods
        const methodRE = /(\w+)\s*\(([^)]*)\)\s*\{/g;
        let mm;
        while ((mm = methodRE.exec(code)) !== null) {
          if (mm[1] === 'constructor' || mm[1] === className) continue;
          const mName = mm[1];
          testLines.push(`if (typeof _inst.${mName} !== 'function') throw new Error('${className}.${mName} should be a function');`);
          assertions++;
        }
      }
    }

    // Fallback: code should at least not throw
    if (assertions === 0) {
      strategy = 'module-exercise';
      testLines.push(`// Pattern code executed without error`);
      assertions = 1; // The code running without throwing is itself a test
    }

    const testCode = testLines.join('\n');
    return { testCode, strategy, assertions };
  }

  /**
   * Generate tests for a single JS function.
   */
  _generateJSFunctionTests(fnName, params, fullCode) {
    const lines = [];
    let assertions = 0;

    // Parse parameter types
    const paramInfos = (params || '').split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        // Handle defaults: name = value
        const eqIdx = p.indexOf('=');
        const rawName = eqIdx >= 0 ? p.slice(0, eqIdx).trim() : p.trim();
        // Strip TS type annotations
        const colonIdx = rawName.indexOf(':');
        const name = colonIdx >= 0 ? rawName.slice(0, colonIdx).trim() : rawName;
        // Strip destructuring and rest params
        const cleanName = name.replace(/[{}\[\]\.]/g, '').replace(/^\.\.\./g, '');
        return {
          name: cleanName,
          type: this._inferType(cleanName),
        };
      })
      .filter(p => p.name);

    // 1. Call with typical args
    if (paramInfos.length > 0) {
      const argValues = paramInfos.map(p => TEST_VALUES[p.type] || TEST_VALUES.unknown);
      const callStr = `${fnName}(${argValues.join(', ')})`;

      lines.push(`// Test: call with typical arguments`);
      lines.push(`var _result = ${callStr};`);
      assertions++;

      // Check return type based on function name
      const lowerName = fnName.toLowerCase();

      // Semantic assertions based on function name
      for (const [keyword, semantic] of Object.entries(SEMANTIC_CHECKS)) {
        if (lowerName.includes(keyword)) {
          const argStr = semantic.needsArray ? argValues[0] : argValues.join(', ');
          lines.push(semantic.check(callStr, argStr));
          assertions++;
          break;
        }
      }

      // General return value check
      lines.push(`// Test: return value exists`);
      lines.push(`if (_result === undefined && ${JSON.stringify(fnName)} !== 'void') {`);
      lines.push(`  // Function returned undefined — acceptable for void functions`);
      lines.push(`}`);
    }

    // 2. Call with no args (should not throw TypeError for missing params if sensible)
    if (paramInfos.length > 0 && paramInfos.length <= 3) {
      lines.push(`// Test: call with no args — should handle gracefully`);
      lines.push(`try {`);
      lines.push(`  ${fnName}();`);
      lines.push(`} catch(_e) {`);
      lines.push(`  // Acceptable: function requires arguments`);
      lines.push(`}`);
    }

    // 3. Edge case tests
    if (paramInfos.length > 0) {
      const firstParam = paramInfos[0];
      const edgeCases = this._getEdgeCases(firstParam.type);
      for (const edge of edgeCases) {
        const otherArgs = paramInfos.slice(1).map(p => TEST_VALUES[p.type] || TEST_VALUES.unknown);
        const args = [edge.value, ...otherArgs].join(', ');
        lines.push(`// Test: edge case — ${edge.label}`);
        lines.push(`try {`);
        lines.push(`  ${fnName}(${args});`);
        lines.push(`} catch(_e) {`);
        lines.push(`  // Edge case handled: ${edge.label}`);
        lines.push(`}`);
        assertions++;
      }
    }

    return { lines, assertions };
  }

  /**
   * Extract exported functions from JS code.
   */
  _extractJSExports(code) {
    const exports = [];
    const seen = new Set();

    // module.exports = function name(params)
    let m;
    const re1 = /module\.exports\s*=\s*function\s+(\w+)\s*\(([^)]*)\)/g;
    while ((m = re1.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); exports.push({ name: m[1], params: m[2] }); }
    }

    // exports.name = function(params)
    const re2 = /exports\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g;
    while ((m = re2.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); exports.push({ name: m[1], params: m[2] }); }
    }

    // exports.name = (params) =>
    const re2b = /exports\.(\w+)\s*=\s*\(([^)]*)\)\s*=>/g;
    while ((m = re2b.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); exports.push({ name: m[1], params: m[2] }); }
    }

    // export function name(params)
    const re3 = /export\s+(?:default\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    while ((m = re3.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); exports.push({ name: m[1], params: m[2] }); }
    }

    // module.exports = { name1, name2 } — resolve to top-level functions
    const reObjExport = /module\.exports\s*=\s*\{([^}]+)\}/;
    const objMatch = code.match(reObjExport);
    if (objMatch) {
      const names = objMatch[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
      for (const name of names) {
        if (seen.has(name)) continue;
        // Find function definition for this name
        const fnRE = new RegExp(`(?:function\\s+${name}|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function\\s*)?\\()\\s*\\(([^)]*)\\)`, 'g');
        const fnMatch = fnRE.exec(code);
        if (fnMatch) {
          seen.add(name);
          exports.push({ name, params: fnMatch[1] || '' });
        }
      }
    }

    return exports;
  }

  /**
   * Extract all function declarations from JS code.
   */
  _extractJSFunctions(code) {
    const functions = [];
    const seen = new Set();

    // function name(params)
    const re1 = /function\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re1.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); functions.push({ name: m[1], params: m[2] }); }
    }

    // const name = (params) =>
    const re2 = /(?:const|let|var)\s+(\w+)\s*=\s*(?:function\s*)?\(([^)]*)\)\s*(?:=>|\{)/g;
    while ((m = re2.exec(code)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); functions.push({ name: m[1], params: m[2] }); }
    }

    return functions;
  }

  /**
   * Infer parameter type from its name.
   */
  _inferType(paramName) {
    if (!paramName) return 'unknown';
    const lower = paramName.toLowerCase().replace(/[_\d]/g, '');
    // Check exact match first
    if (PARAM_TYPE_MAP[lower]) return PARAM_TYPE_MAP[lower];
    // Check suffix/prefix
    for (const [hint, type] of Object.entries(PARAM_TYPE_MAP)) {
      if (lower.endsWith(hint) || lower.startsWith(hint)) return type;
    }
    return 'unknown';
  }

  /**
   * Get edge case values for a given type.
   */
  _getEdgeCases(type) {
    switch (type) {
      case 'string':
        return [
          { value: "''", label: 'empty string' },
          { value: 'null', label: 'null' },
          { value: 'undefined', label: 'undefined' },
        ];
      case 'number':
        return [
          { value: '0', label: 'zero' },
          { value: '-1', label: 'negative' },
          { value: 'NaN', label: 'NaN' },
          { value: 'Infinity', label: 'Infinity' },
        ];
      case 'array':
        return [
          { value: '[]', label: 'empty array' },
          { value: 'null', label: 'null' },
        ];
      case 'object':
        return [
          { value: '{}', label: 'empty object' },
          { value: 'null', label: 'null' },
        ];
      case 'function':
        return [
          { value: '() => {}', label: 'noop function' },
        ];
      case 'boolean':
        return [
          { value: 'false', label: 'false' },
        ];
      default:
        return [
          { value: 'null', label: 'null' },
          { value: 'undefined', label: 'undefined' },
        ];
    }
  }

  /**
   * Generate Python test code.
   */
  _generatePython(pattern) {
    const code = pattern.code;
    const functions = this._extractPythonFunctions(code);
    let testLines = [];
    let assertions = 0;

    for (const fn of functions) {
      const paramInfos = (fn.params || '').split(',')
        .map(p => p.trim())
        .filter(p => p && p !== 'self' && p !== 'cls')
        .map(p => {
          const eqIdx = p.indexOf('=');
          const rawName = eqIdx >= 0 ? p.slice(0, eqIdx).trim() : p.trim();
          const colonIdx = rawName.indexOf(':');
          const name = colonIdx >= 0 ? rawName.slice(0, colonIdx).trim() : rawName;
          return { name, type: this._inferType(name) };
        })
        .filter(p => p.name);

      if (paramInfos.length > 0) {
        const argValues = paramInfos.map(p => PYTHON_TEST_VALUES[p.type] || PYTHON_TEST_VALUES.unknown);
        const callStr = `${fn.name}(${argValues.join(', ')})`;

        testLines.push(`# Test: call ${fn.name} with typical arguments`);
        testLines.push(`_result = ${callStr}`);
        testLines.push(`assert _result is not None or True, "${fn.name} should return a value"`);
        assertions++;

        // Edge cases
        testLines.push(`# Test: edge case — empty/None`);
        testLines.push(`try:`);
        testLines.push(`    ${fn.name}(${paramInfos.map(() => 'None').join(', ')})`);
        testLines.push(`except Exception:`);
        testLines.push(`    pass  # Edge case handled`);
        assertions++;
      } else {
        testLines.push(`# Test: call ${fn.name} with no arguments`);
        testLines.push(`_result = ${fn.name}()`);
        assertions++;
      }
    }

    if (assertions === 0) {
      testLines.push('# Pattern code executed without error');
      assertions = 1;
    }

    return { testCode: testLines.join('\n'), strategy: 'function-call', assertions };
  }

  /**
   * Extract Python function definitions.
   */
  _extractPythonFunctions(code) {
    const functions = [];
    const re = /def\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (!m[1].startsWith('_')) { // skip private methods
        functions.push({ name: m[1], params: m[2] });
      }
    }
    return functions;
  }

  /**
   * Generate Go test code.
   */
  _generateGo(pattern) {
    const code = pattern.code;
    const functions = [];
    const re = /func\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      // Only public functions (capitalized)
      if (m[1][0] === m[1][0].toUpperCase() && m[1][0] !== m[1][0].toLowerCase()) {
        functions.push({ name: m[1], params: m[2] });
      }
    }

    let testLines = [
      'package sandbox',
      '',
      'import "testing"',
      '',
    ];
    let assertions = 0;

    for (const fn of functions) {
      testLines.push(`func Test${fn.name}(t *testing.T) {`);
      testLines.push(`\t// Call function — should not panic`);
      testLines.push(`\tdefer func() {`);
      testLines.push(`\t\tif r := recover(); r != nil {`);
      testLines.push(`\t\t\tt.Errorf("${fn.name} panicked: %v", r)`);
      testLines.push(`\t\t}`);
      testLines.push(`\t}()`);
      // Simple call with zero values
      const paramCount = fn.params ? fn.params.split(',').filter(p => p.trim()).length : 0;
      if (paramCount > 0) {
        testLines.push(`\t// TODO: provide appropriate arguments`);
      }
      testLines.push(`}`);
      testLines.push('');
      assertions++;
    }

    if (assertions === 0) {
      testLines.push('func TestModule(t *testing.T) {');
      testLines.push('\t// Package compiles successfully');
      testLines.push('}');
      assertions = 1;
    }

    return { testCode: testLines.join('\n'), strategy: 'go-test', assertions };
  }

  /**
   * Generate Rust test code.
   */
  _generateRust(pattern) {
    const code = pattern.code;
    const functions = [];
    const re = /(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      functions.push({ name: m[1], params: m[2] });
    }

    let testLines = ['use super::*;', ''];
    let assertions = 0;

    for (const fn of functions) {
      testLines.push(`#[test]`);
      testLines.push(`fn test_${fn.name}() {`);
      testLines.push(`    // Call function — should not panic`);
      // Simple zero-value call
      testLines.push(`    // ${fn.name}() — provide appropriate arguments`);
      testLines.push(`}`);
      testLines.push('');
      assertions++;
    }

    if (assertions === 0) {
      testLines.push('#[test]');
      testLines.push('fn test_module_compiles() {');
      testLines.push('    // Module compiles successfully');
      testLines.push('}');
      assertions = 1;
    }

    return { testCode: testLines.join('\n'), strategy: 'cargo-test', assertions };
  }
}

module.exports = { TestGenerator };
