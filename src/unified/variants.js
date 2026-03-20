'use strict';

/**
 * Unified Variant Generator — single engine for language transpilation.
 *
 * Replaces two separate variant generation systems:
 *   - src/evolution/recycler.js LANG_TEMPLATES + _generateLanguageVariants + _toPython/_toTypeScript/_toASTLanguage
 *   - src/debug/debug-oracle.js generateFixVariants + jsToPythonFix/jsToGoFix/jsToTsFix
 *
 * Both transpile code across languages but shared zero code. This module
 * provides one set of templates and transpilation functions used by both.
 */

// ─── Language Templates ───

const LANG_TEMPLATES = {
  javascript: {
    functionDecl: (name, params, body) => `function ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if (!(${expr})) throw new Error(${JSON.stringify(msg)});`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr};`,
    varDecl: (name, val) => `const ${name} = ${val};`,
    forLoop: (init, cond, inc, body) => `for (${init}; ${cond}; ${inc}) {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
  python: {
    functionDecl: (name, params, body) => `def ${name}(${params}):\n${indent(body, 4)}`,
    testAssert: (expr, msg) => `assert ${expr}, ${JSON.stringify(msg)}`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr}`,
    varDecl: (name, val) => `${name} = ${val}`,
    forLoop: (varName, iterable, body) => `for ${varName} in ${iterable}:\n${indent(body, 4)}`,
    comment: (text) => `# ${text}`,
  },
  typescript: {
    functionDecl: (name, params, body) => `function ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if (!(${expr})) throw new Error(${JSON.stringify(msg)});`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr};`,
    varDecl: (name, val) => `const ${name} = ${val};`,
    forLoop: (init, cond, inc, body) => `for (${init}; ${cond}; ${inc}) {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
  go: {
    functionDecl: (name, params, body) => `func ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if !(${expr}) { t.Fatalf(${JSON.stringify(msg)}) }`,
    arrayLiteral: (items) => `[]interface{}{${items.join(', ')}}`,
    returnStmt: (expr) => `return ${expr}`,
    varDecl: (name, val) => `${name} := ${val}`,
    forLoop: (init, cond, inc, body) => `for ${init}; ${cond}; ${inc} {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
};

// ─── Approach Swaps ───

const APPROACH_SWAPS = [
  {
    from: 'recursive',
    to: 'iterative',
    detect: (code) => /function\s+\w+[^{]*\{[\s\S]*\b(?:return\s+\w+\s*\()/.test(code),
    hint: 'Convert recursion to iteration using a stack or accumulator',
  },
  {
    from: 'for-loop',
    to: 'functional',
    detect: (code) => /for\s*\(/.test(code) && !code.includes('.map(') && !code.includes('.reduce('),
    hint: 'Replace for-loop with map/filter/reduce',
  },
  {
    from: 'imperative',
    to: 'declarative',
    detect: (code) => {
      const assignments = (code.match(/\b(?:let|var)\s+\w+\s*=/g) || []).length;
      return assignments >= 3;
    },
    hint: 'Replace imperative mutations with declarative pipeline',
  },
  {
    from: 'linear-search',
    to: 'binary-search',
    detect: (code) => /for\s*\(.*(?:indexOf|find|includes)/.test(code) || /\.indexOf\(/.test(code),
    hint: 'Replace linear scan with binary search on sorted input',
  },
  {
    from: 'mutable',
    to: 'immutable',
    detect: (code) => {
      const lets = (code.match(/\blet\s+/g) || []).length;
      const pushes = (code.match(/\.push\(/g) || []).length;
      return lets >= 2 || pushes >= 2;
    },
    hint: 'Replace mutations with immutable operations (spread, concat, map)',
  },
];

// ─── Quick Transpilers (for debug fix variants) ───

/**
 * Quick JS → Python transpilation for fix code snippets.
 */
function jsToPython(code) {
  return code
    .replace(/\/\/\s*(.*)/g, '# $1')
    .replace(/const |let |var /g, '')
    .replace(/;$/gm, '')
    .replace(/\{/g, ':')
    .replace(/\}/g, '')
    .replace(/===?/g, '==')
    .replace(/!==?/g, '!=')
    .replace(/\|\|/g, ' or ')
    .replace(/&&/g, ' and ')
    .replace(/!/g, 'not ')
    .replace(/null|undefined/g, 'None')
    .replace(/true/g, 'True')
    .replace(/false/g, 'False')
    .replace(/console\.log/g, 'print')
    .replace(/function\s+(\w+)\s*\((.*?)\)\s*:/g, 'def $1($2):')
    .replace(/(\w+)\s*=>\s*:/g, 'lambda $1:')
    .replace(/\bnew\s+(\w+)/g, '$1')
    .replace(/\.length/g, '.__len__()')
    .replace(/\.push\(/g, '.append(')
    .replace(/\.indexOf\(/g, '.index(')
    .replace(/\.includes\(/g, '.__contains__(')
    .replace(/\bthrow\s+new\s+Error\(/g, 'raise Exception(')
    .replace(/\btry\s*:/g, 'try:')
    .replace(/\bcatch\s*\(\w+\)\s*:/g, 'except Exception as e:')
    .replace(/\bfor\s*\(\s*let\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\w+)\s*;\s*\1\+\+\s*\)\s*:/g, 'for $1 in range($2, $3):')
    .replace(/\bvar\s+/g, '');
}

/**
 * Quick JS → Go transpilation for fix code snippets.
 */
function jsToGo(code) {
  return code
    .replace(/\/\/\s*(.*)/g, '// $1')
    .replace(/const |let |var /g, '')
    .replace(/;$/gm, '')
    .replace(/===?/g, '==')
    .replace(/!==?/g, '!=')
    .replace(/console\.log\(/g, 'fmt.Println(')
    .replace(/function\s+(\w+)\s*\((.*?)\)\s*\{/g, 'func $1($2) {')
    .replace(/null|undefined/g, 'nil')
    .replace(/true/g, 'true')
    .replace(/false/g, 'false')
    .replace(/\.length/g, ')')
    .replace(/\.push\(/g, ' = append($1, ')
    .replace(/\bnew\s+(\w+)/g, '$1{}')
    .replace(/\bthrow\s+new\s+Error\(/g, 'panic(')
    .replace(/\btry\s*\{/g, '// error handling with if err != nil {')
    .replace(/\bcatch\s*\(.*?\)\s*\{/g, '// }');
}

/**
 * Quick JS → TypeScript variant (adds type annotations).
 */
function jsToTypeScript(code) {
  return code
    .replace(/function\s+(\w+)\s*\(([^)]*)\)/g, (match, name, params) => {
      const typedParams = params.split(',').map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        return `${trimmed}: unknown`;
      }).join(', ');
      return `function ${name}(${typedParams}): unknown`;
    })
    .replace(/\bvar\s+/g, 'let ');
}

// ─── Unified Variant Generation ───

/**
 * Generate language variants from a code snippet.
 * Used by both main pattern recycler and debug oracle.
 *
 * @param {string} code - Source code to transpile
 * @param {string} sourceLanguage - Source language
 * @param {string[]} [targetLanguages] - Languages to transpile to
 * @returns {Array<{ code: string, language: string }>}
 */
function generateLanguageVariants(code, sourceLanguage, targetLanguages) {
  const targets = targetLanguages || ['python', 'typescript', 'go'];
  const lang = (sourceLanguage || '').toLowerCase();
  const variants = [];

  for (const target of targets) {
    const targetLang = target.toLowerCase();
    if (targetLang === lang) continue;

    let transpiled = null;
    try {
      if (lang === 'javascript' || lang === 'js') {
        switch (targetLang) {
          case 'python': case 'py':
            transpiled = jsToPython(code);
            break;
          case 'go': case 'golang':
            transpiled = jsToGo(code);
            break;
          case 'typescript': case 'ts':
            transpiled = jsToTypeScript(code);
            break;
        }
      }
      // For non-JS sources, attempt AST-based transpilation
      if (!transpiled) {
        try {
          const { transpileCode } = require('../core/ast-transpiler');
          transpiled = transpileCode(code, lang, targetLang);
        } catch (_) {
          // AST transpiler not available — skip this variant
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`[unified-variants] ${lang} → ${targetLang} failed:`, e?.message || e);
    }

    if (transpiled && transpiled.trim() !== code.trim()) {
      variants.push({ code: transpiled, language: targetLang });
    }
  }

  return variants;
}

/**
 * Generate error message variants for debug patterns.
 * Creates alternative error messages that map to the same fix.
 *
 * @param {string} errorMessage - Original error message
 * @param {string} category - Error category
 * @returns {string[]} Variant error messages
 */
function generateErrorVariants(errorMessage, category) {
  const variants = [];
  const normalized = (errorMessage || '').toLowerCase();

  const VARIANT_PATTERNS = {
    type: [
      'TypeError: Cannot read properties of undefined',
      'TypeError: Cannot read properties of null',
      'TypeError: is not a function',
      'TypeError: Cannot set properties of undefined',
    ],
    reference: [
      'ReferenceError: is not defined',
      'ReferenceError: Cannot access before initialization',
    ],
    syntax: [
      'SyntaxError: Unexpected token',
      'SyntaxError: Missing initializer',
      'SyntaxError: Unexpected end of input',
    ],
    runtime: [
      'RangeError: Maximum call stack size exceeded',
      'RangeError: Invalid array length',
    ],
    network: [
      'Error: connect ECONNREFUSED',
      'Error: ETIMEDOUT',
      'FetchError: request timeout',
    ],
    async: [
      'UnhandledPromiseRejectionWarning',
      'Error: Timeout - Async callback was not invoked',
    ],
  };

  const patterns = VARIANT_PATTERNS[category] || [];
  for (const variant of patterns) {
    if (!normalized.includes(variant.toLowerCase().slice(0, 20))) {
      variants.push(variant);
    }
  }

  return variants.slice(0, 3); // Cap at 3 variants
}

// ─── Helpers ───

function indent(code, spaces) {
  const pad = ' '.repeat(spaces);
  return code.split('\n').map(line => line.trim() ? pad + line : line).join('\n');
}

module.exports = {
  LANG_TEMPLATES,
  APPROACH_SWAPS,
  generateLanguageVariants,
  generateErrorVariants,
  jsToPython,
  jsToGo,
  jsToTypeScript,
  indent,
  // Backwards-compatible aliases for debug-oracle
  generateFixVariants: generateLanguageVariants,
  jsToPythonFix: jsToPython,
  jsToGoFix: jsToGo,
  jsToTsFix: jsToTypeScript,
};
