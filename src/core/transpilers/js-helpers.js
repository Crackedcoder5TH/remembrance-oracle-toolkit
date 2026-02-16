/**
 * JS → Python / TypeScript transpilation helpers.
 *
 * Extracted from recycler.js to keep the main recycler focused on the
 * healing / variant-generation loop.
 *
 * Exports:
 *  - canTranspileToPython(code)
 *  - extractBody(jsFunc)
 *  - jsToPythonParams(params)
 *  - jsToPythonBody(body)
 *  - jsToPythonTest(testCode, jsFuncName, pyFuncName)
 *  - jsArrayToPy(str)
 *  - inferTypeScriptParams(params, code)
 *  - findMatchingParen(str, openPos)
 *  - shouldSkipForGeneration(code)
 */

const { isTestFile, isDataFile, requiresExternalModules } = require('../../evolution/test-synth');
const {
  VARIANT_GENERATION,
  MAX_TERNARY_NESTING,
} = require('../../constants/thresholds');

// ─── Skip-check ───

/**
 * Check if a pattern should be skipped for candidate generation.
 * Test files, data files, and module-heavy code don't produce viable candidates.
 */
function shouldSkipForGeneration(code) {
  if (isTestFile(code)) return true;
  if (isDataFile(code)) return true;
  if (requiresExternalModules(code)) return true;
  // Skip very large files — they're usually complex modules
  if (code.split('\n').length > VARIANT_GENERATION.LARGE_FILE_THRESHOLD) return true;
  return false;
}

// ─── JS → Python Helpers ───

/**
 * Check whether a JS function is simple enough to transpile to Python.
 * Reject patterns that use: regex literals, typeof, closures, new Set/Map,
 * prototype methods, Promise/async, class syntax, arrow functions with closures.
 */
function canTranspileToPython(code) {
  // Reject regex literal usage in method calls (Python uses re module)
  if (code.includes('.replace(/') || code.includes('.match(/') || code.includes('.test(/') || code.includes('.search(/')) return false;

  // Reject typeof (no Python equivalent in same form)
  if (/\btypeof\b/.test(code)) return false;

  // Reject closures / returning functions
  if (/return\s+function/.test(code)) return false;
  if (/return\s*\(?\s*\w+\s*\)?\s*=>/.test(code)) return false;

  // Reject new WeakMap/WeakSet (no Python equivalents)
  if (/new\s+(?:WeakMap|WeakSet)/.test(code)) return false;

  // Reject Promise (async/await would need asyncio, too complex)
  if (/\bPromise\b/.test(code)) return false;

  // Reject class syntax
  if (/\bclass\s+\w+/.test(code)) return false;

  // Reject .prototype, JSON.
  if (/\bJSON\./.test(code)) return false;
  if (/\.prototype\b/.test(code)) return false;

  // Reject arrow functions used as callbacks (body arrow functions)
  if (/=>\s*\{/.test(code)) return false;
  // Reject expression arrow functions in callback position (.map(x => ...), etc.)
  if (/\.\w+\([^)]*=>/.test(code)) return false;

  // Reject ternary with complex nesting (3+ levels)
  const ternaries = (code.match(/\?[^:]+:/g) || []).length;
  if (ternaries > MAX_TERNARY_NESTING) return false;

  // Reject >>> (unsigned right shift — no Python equivalent)
  if (/>>>/.test(code)) return false;

  // Reject .split('') — empty string split doesn't work in Python
  if (/\.split\s*\(\s*['"]\s*['"]\s*\)/.test(code)) return false;

  // Reject inline ternary used in return with complex conditions
  if (/return\s+\w+\s*\?.*\?/.test(code)) return false;

  // Reject multi-variable declaration (let a = 0, b = 0)
  if (/(?:const|let|var)\s+\w+\s*=\s*[^,;]+,\s*\w+\s*=/.test(code)) return false;

  // Reject while loops with assignment in condition
  if (/while\s*\([^)]*\s=(?!=)/.test(code)) return false;

  // Reject single-line for loops (body on same line as for — hard to indent for Python)
  if (/for\s*\([^)]+\)\s+\w/.test(code) && !/for\s*\([^)]+\)\s*\{/.test(code)) return false;

  // Reject multi-statement lines (a = x; b = y; on same line — can't transpile cleanly)
  const bodyLines = code.split('\n');
  for (const line of bodyLines) {
    const trimLine = line.trim();
    // Count semicolons that aren't in strings (simplified check)
    const semis = trimLine.replace(/'[^']*'|"[^"]*"/g, '').split(';').length - 1;
    if (semis > 1) return false;
  }

  // Reject while loops with braces on same line as body
  if (/while\s*\([^)]+\)\s*\{[^}]+\}/.test(code.replace(/\n/g, ' '))) return false;

  // Reject inline ternary in return (complex to transpile: s ? x : y)
  if (/return\s+\w+\s*\?/.test(code)) return false;

  // Reject .length in comparisons when param is named 'len' (Python builtin shadowing)
  if (/\w+\.length\s*<\s*\w+/.test(code) && /function\s+\w+\([^)]*\blen\b/.test(code)) return false;

  // Reject Number.EPSILON, Number.MAX_SAFE_INTEGER, etc.
  if (/Number\.\w+/.test(code)) return false;

  // Reject Array.from (Python uses list())
  if (/Array\.from/.test(code)) return false;

  // Reject complex .slice() patterns with expressions (hard to transpile correctly)
  if (/\.slice\([^)]*[+\-*]\s*[^)]+\)/.test(code)) return false;

  // Reject new Constructor() patterns (no Python equivalent)
  if (/\bnew\s+(?!Set|Map)\w+\s*\(/.test(code)) return false;

  // Reject this. keyword
  if (/\bthis\./.test(code)) return false;

  // Reject .filter/.map/.reduce callbacks (Python uses list comprehensions)
  if (/\.filter\s*\(/.test(code)) return false;
  if (/\.map\s*\(/.test(code)) return false;
  if (/\.reduce\s*\(/.test(code)) return false;
  if (/\.forEach\s*\(/.test(code)) return false;

  // Reject .splice() — no direct Python equivalent
  if (/\.splice\s*\(/.test(code)) return false;

  // Reject try/catch blocks — different syntax in Python
  if (/\btry\s*\{/.test(code)) return false;

  // Reject throw (Python uses raise)
  if (/\bthrow\s+/.test(code)) return false;

  // Reject complex destructuring: const { a, b } = or const [a, b] =
  if (/(?:const|let|var)\s*\{[^}]+\}\s*=/.test(code)) return false;
  if (/(?:const|let|var)\s*\[[^\]]+\]\s*=/.test(code)) return false;

  return true;
}

function extractBody(jsFunc) {
  const start = jsFunc.indexOf('{');
  const end = jsFunc.lastIndexOf('}');
  if (start === -1 || end === -1) return jsFunc;
  return jsFunc.slice(start + 1, end).trim();
}

function jsToPythonParams(params) {
  return params
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      // Handle default values
      if (p.includes('=')) {
        const [name, val] = p.split('=').map(s => s.trim());
        const pyVal = val === 'null' ? 'None'
          : val === 'undefined' ? 'None'
          : val === 'true' ? 'True'
          : val === 'false' ? 'False'
          : val;
        return `${name}=${pyVal}`;
      }
      return p;
    })
    .join(', ');
}

function jsToPythonBody(body) {
  // Split into lines for line-by-line processing
  const lines = body.split('\n');
  const pyLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip empty braces-only lines
    if (trimmed === '{' || trimmed === '}' || trimmed === '') {
      if (trimmed === '') pyLines.push('');
      continue;
    }

    // Get indentation
    const indentMatch = line.match(/^(\s*)/);
    const pad = indentMatch ? indentMatch[1] : '';

    let py = trimmed;

    // Remove trailing semicolons
    py = py.replace(/;\s*$/, '');

    // Remove trailing braces (closing)
    py = py.replace(/\s*\}\s*$/, '');

    // const/let/var → remove
    py = py.replace(/\b(?:const|let|var)\s+/g, '');

    // === → ==, !== → !=
    py = py.replace(/===/g, '==').replace(/!==/g, '!=');

    // null/undefined → None
    py = py.replace(/\bnull\b/g, 'None').replace(/\bundefined\b/g, 'None');

    // true/false → True/False
    py = py.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');

    // .length → len()
    py = py.replace(/(\w+)\.length/g, 'len($1)');

    // Math builtins
    py = py.replace(/Math\.max\(/g, 'max(');
    py = py.replace(/Math\.min\(/g, 'min(');
    py = py.replace(/Math\.floor\(/g, 'int(');
    py = py.replace(/Math\.ceil\(([^)]+)\)/g, '-(-$1 // 1)');
    py = py.replace(/Math\.abs\(/g, 'abs(');
    py = py.replace(/Math\.round\(/g, 'round(');
    py = py.replace(/Math\.pow\(([^,]+),\s*([^)]+)\)/g, '$1 ** $2');
    py = py.replace(/Math\.sqrt\(([^)]+)\)/g, '$1 ** 0.5');

    // .push(x) → .append(x)
    py = py.replace(/\.push\(/g, '.append(');

    // .pop() stays the same
    // .shift() → .pop(0)
    py = py.replace(/\.shift\(\)/g, '.pop(0)');

    // .toUpperCase() → .upper(), .toLowerCase() → .lower()
    py = py.replace(/\.toUpperCase\(\)/g, '.upper()');
    py = py.replace(/\.toLowerCase\(\)/g, '.lower()');

    // .join(sep) → sep.join(arr)  (best effort — simple cases)
    py = py.replace(/(\w+)\.join\(([^)]*)\)/g, '$2.join($1)');

    // .includes(x) → x in arr
    py = py.replace(/(\w+)\.includes\(([^)]+)\)/g, '$2 in $1');

    // Object.keys(x) → list(x.keys()), Object.values(x) → list(x.values())
    py = py.replace(/Object\.keys\((\w+)\)/g, 'list($1.keys())');
    py = py.replace(/Object\.values\((\w+)\)/g, 'list($1.values())');
    py = py.replace(/Object\.entries\((\w+)\)/g, 'list($1.items())');
    py = py.replace(/Object\.assign\(\{\},\s*(\w+)\)/g, 'dict($1)');

    // new Set(x) → set(x), new Map(x) → dict(x)
    py = py.replace(/new\s+Set\(([^)]*)\)/g, 'set($1)');
    py = py.replace(/new\s+Map\(([^)]*)\)/g, 'dict($1)');

    // Array.isArray(x) → isinstance(x, list)
    py = py.replace(/Array\.isArray\((\w+)\)/g, 'isinstance($1, list)');

    // .indexOf(x) → .index(x) (note: Python throws ValueError, JS returns -1)
    py = py.replace(/\.indexOf\(/g, '.index(');

    // console.log → print
    py = py.replace(/console\.log\(/g, 'print(');

    // .slice(a, b) → [a:b]  (handles expressions like n-1, not just identifiers)
    py = py.replace(/\.slice\(([^,)]+)(?:,\s*([^)]+))?\)/g, (_, a, b) => b ? `[${a.trim()}:${b.trim()}]` : `[${a.trim()}:]`);

    // .concat(b) → + b
    py = py.replace(/\.concat\((\w+)\)/g, ' + $1');

    // Simple ternary: a ? b : c → b if a else c
    py = py.replace(/^(return\s+)?(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/, (_, ret, cond, ifTrue, ifFalse) => {
      return `${ret || ''}${ifTrue} if ${cond} else ${ifFalse}`;
    });

    // for (let i = 0; i < n; i++) { → for i in range(n):
    // Handles variable starts, < and <=, ++ and +=1
    const forMatch = py.match(/^for\s*\(\s*(\w+)\s*=\s*(\w+)\s*;\s*\1\s*(<=?)\s*(\w+(?:\s*[-+]\s*\d+)?)\s*;\s*\1(?:\+\+|\s*\+=\s*1)\s*\)\s*\{?\s*$/);
    if (forMatch) {
      const [, varName, start, op, end] = forMatch;
      const rangeEnd = op === '<=' ? `${end} + 1` : end;
      py = start === '0' ? `for ${varName} in range(${rangeEnd}):` : `for ${varName} in range(${start}, ${rangeEnd}):`;
      pyLines.push(pad + py);
      continue;
    }

    // for (let i = n; i >= 0; i--) → for i in range(n, -1, -1):
    // Handles >= and >, -- and -=1
    const forDownMatch = py.match(/^for\s*\(\s*(\w+)\s*=\s*(\w+)\s*;\s*\1\s*(>=?)\s*(\w+)\s*;\s*\1(?:--|\s*-=\s*1)\s*\)\s*\{?\s*$/);
    if (forDownMatch) {
      const [, varName, start, op, end] = forDownMatch;
      const endVal = op === '>=' ? (end === '0' ? '-1' : `${end} - 1`) : end;
      py = `for ${varName} in range(${start}, ${endVal}, -1):`;
      pyLines.push(pad + py);
      continue;
    }

    // for (const x of arr) { → for x in arr:
    const forOfMatch = py.match(/^(?:const|let|var)\s+(\w+)\s+of\s+(.+?)\s*\{?\s*$/);
    if (forOfMatch || /^for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\s+(.+?)\s*\)\s*\{?\s*$/.test(py)) {
      const m = py.match(/(?:const|let|var)\s+(\w+)\s+of\s+(.+?)(?:\)?\s*\{?\s*)$/);
      if (m) {
        py = `for ${m[1]} in ${m[2].replace(/\)\s*$/, '')}:`;
        pyLines.push(pad + py);
        continue;
      }
    }

    // for (const x in obj) { → for x in obj:
    const forInMatch = py.match(/^for\s*\(\s*(?:const|let|var)\s+(\w+)\s+in\s+(.+?)\s*\)\s*\{?\s*$/);
    if (forInMatch) {
      py = `for ${forInMatch[1]} in ${forInMatch[2]}:`;
      pyLines.push(pad + py);
      continue;
    }

    // Spread: [...arr] → [*arr], {...obj} → {**obj}
    py = py.replace(/\[\.\.\.(\w+)\]/g, '[*$1]');
    py = py.replace(/\{\.\.\.(\w+)\}/g, '{**$1}');

    // if (...) { → if ...:
    if (/^if\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^if\s*\((.+)\)\s*\{?\s*$/, 'if $1:');
    }

    // } else if (...) { → elif ...:
    if (/^(?:\}\s*)?else\s+if\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^(?:\}\s*)?else\s+if\s*\((.+)\)\s*\{?\s*$/, 'elif $1:');
    }

    // } else { → else:
    if (/^(?:\}\s*)?else\s*\{?\s*$/.test(py)) {
      py = 'else:';
    }

    // while (...) { → while ...:
    if (/^while\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^while\s*\((.+)\)\s*\{?\s*$/, 'while $1:');
    }

    // Single-line if: if (cond) return x; → if cond: return x
    if (/^if\s*\((.+)\)\s+return\s+(.+)$/.test(py)) {
      py = py.replace(/^if\s*\((.+)\)\s+return\s+(.+)$/, 'if $1:\n' + pad + '    return $2');
    }

    // ++ / --
    py = py.replace(/(\w+)\+\+/, '$1 += 1');
    py = py.replace(/(\w+)--/, '$1 -= 1');

    // || for defaults → or
    py = py.replace(/\s*\|\|\s*/g, ' or ');
    // && → and
    py = py.replace(/\s*&&\s*/g, ' and ');
    // ! → not (at word boundary)
    py = py.replace(/!\s*(\w)/g, 'not $1');

    // Remove remaining { at end
    py = py.replace(/\s*\{\s*$/, ':');

    // Skip pure-brace lines after processing
    if (py.trim() === '' || py.trim() === ':') continue;

    pyLines.push(pad + py);
  }

  // Clean up
  let result = pyLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim() || 'pass';
}

function jsToPythonTest(testCode, jsFuncName, pyFuncName) {
  const lines = testCode.split('\n').filter(l => l.trim());
  const pyLines = [];

  for (const line of lines) {
    // if (expr !== expected) throw → assert expr == expected
    // The JS pattern: if (value !== expected) throw means "fail when not equal"
    // So the Python assertion is: assert value == expected (assert they ARE equal)
    const throwMatch = line.match(/if\s*\((.+?)\s*(!==?|===?)\s*(.+?)\)\s*throw/);
    if (throwMatch) {
      let [, left, op, right] = throwMatch;
      left = left.replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);

      // Clean right side — remove trailing ) and throw... remnants
      right = right.replace(/\)\s*throw.*$/, '').trim();
      // If right side has extra closing paren from outer if(), remove it
      const leftParens = (left.match(/\(/g) || []).length;
      const leftClose = (left.match(/\)/g) || []).length;
      const rightParens = (right.match(/\(/g) || []).length;
      const rightClose = (right.match(/\)/g) || []).length;
      if (rightClose > rightParens) {
        right = right.replace(/\)\s*$/, '');
      }

      // JS arrays to Python lists + value translation
      left = jsArrayToPy(left);
      right = jsArrayToPy(right);

      // Translate values
      left = left.replace(/===/g, '==').replace(/!==/g, '!=')
        .replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False')
        .replace(/\bnull\b/g, 'None');
      right = right.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False')
        .replace(/\bnull\b/g, 'None');

      // Remove JSON.stringify — Python compares lists directly
      left = left.replace(/JSON\.stringify\(([^)]+)\)/g, '$1');
      right = right.replace(/JSON\.stringify\(([^)]+)\)/g, '$1');

      // Remove .toString()
      left = left.replace(/\.toString\(\)/g, '');
      right = right.replace(/\.toString\(\)/g, '');

      // Convert string-wrapped arrays to actual Python lists
      // e.g., '[[1,2],[3,4],[5]]' → [[1,2],[3,4],[5]]
      right = right.replace(/^['"](\[.*\])['"]$/, '$1');

      // Flip the operator: if (x !== y) throw → assert x == y
      // if (x === y) throw → assert x != y
      let assertOp;
      if (op === '!==' || op === '!=') {
        assertOp = '==';  // "throw when not equal" → "assert equal"
      } else {
        assertOp = '!=';  // "throw when equal" → "assert not equal"
      }

      pyLines.push(`assert ${left} ${assertOp} ${right}`);
      continue;
    }

    // Direct assertion: if (!expr) throw → assert expr
    const negMatch = line.match(/if\s*\(\s*!\s*(.+?)\s*\)\s*throw/);
    if (negMatch) {
      let expr = negMatch[1].replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);
      expr = jsArrayToPy(expr);
      pyLines.push(`assert ${expr}`);
      continue;
    }
  }

  return pyLines.length > 0 ? pyLines.join('\n') : '';
}

function jsArrayToPy(str) {
  // Convert [1, 2, 3] (JS array literals are the same in Python)
  // Convert .length to len()
  let result = str;
  result = result.replace(/(\w+)\.length/g, 'len($1)');
  result = result.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
  result = result.replace(/\bnull\b/g, 'None');
  return result;
}

// ─── TypeScript Type Inference ───

function inferTypeScriptParams(params, code) {
  return params
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(param => {
      const name = param.split('=')[0].trim();

      // Infer from usage in code
      if (/\barray\b/i.test(name) || code.includes(`${name}.length`) || code.includes(`${name}[`) || code.includes(`${name}.map`)) {
        return `${name}: any[]`;
      }
      if (/\bstr\b|string|text|name|desc/i.test(name) || code.includes(`${name}.split`) || code.includes(`${name}.trim`)) {
        return `${name}: string`;
      }
      if (/\bnum\b|count|index|size|len|max|min|limit|places|start|end/i.test(name)) {
        return `${name}: number`;
      }
      if (/\bfn\b|func|callback|predicate|handler/i.test(name)) {
        return `${name}: Function`;
      }
      if (/\bobj\b|options|config|opts/i.test(name)) {
        return `${name}: Record<string, any>`;
      }
      if (param.includes('=')) {
        const [, defVal] = param.split('=').map(s => s.trim());
        if (defVal === 'true' || defVal === 'false') return `${name}: boolean`;
        if (/^\d+$/.test(defVal)) return `${name}: number`;
        if (/^['"]/.test(defVal)) return `${name}: string`;
        if (defVal === '[]') return `${name}: any[]`;
        if (defVal === '{}') return `${name}: Record<string, any>`;
      }
      return `${name}: any`;
    })
    .join(', ');
}

// ─── Utility: find matching closing paren ───

function findMatchingParen(str, openPos) {
  let depth = 0;
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = {
  shouldSkipForGeneration,
  canTranspileToPython,
  extractBody,
  jsToPythonParams,
  jsToPythonBody,
  jsToPythonTest,
  jsArrayToPy,
  inferTypeScriptParams,
  findMatchingParen,
};
