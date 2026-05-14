'use strict';

/**
 * Read-time grounding check for AI-generated code.
 *
 * The hallucination defense: when an agent writes code that calls a
 * function it never saw, that's the textbook fabrication failure mode.
 * `oracle ground <file>` parses the file's identifier references,
 * cross-checks each one against (a) the session ledger's known
 * touched-identifier set, (b) a built-in JS/Node allowlist, and (c)
 * the symbols defined in the file itself, and reports any unknowns.
 *
 * Used by the Claude Code PostToolUse hook to catch fabricated API
 * calls at write-time instead of commit-time.
 *
 * Approach:
 *   1. Tokenize the file using the existing audit parser.
 *   2. Extract every identifier that appears in a function-call
 *      position (`name(`) or member-access position (`.name`).
 *   3. Skip identifiers that are defined in the same file (function
 *      decls, const/let/var bindings, parameters, imports).
 *   4. Skip identifiers in the built-in allowlist.
 *   5. Skip identifiers in the session ledger's touchedIdentifiers
 *      set (anything that's been observed in a previously read file).
 *   6. Report the remainder as candidate hallucinations.
 *
 * False-positive guardrails:
 *   - Member access on dynamic objects (e.g. `result.foo`) is too
 *     noisy to flag. We only flag bare identifiers in call position.
 *   - Properties of `this`, `process`, `console`, `Math` etc. are
 *     trusted via the built-in allowlist.
 *   - Common loop variables (i, j, k, _) are always allowed.
 *   - The check returns INFO, not an error, so it doesn't block
 *     edits — it surfaces a warning the agent can act on.
 */

const fs = require('fs');
const { tokenize } = require('../audit/parser');

// JavaScript built-ins, Node.js globals, and common DOM/Web APIs.
// Anything in here is always considered grounded.
const BUILTINS = new Set([
  // Primitive constructors
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'ReferenceError', 'EvalError', 'URIError', 'AggregateError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect',
  'JSON', 'Math', 'Intl', 'Atomics', 'DataView', 'ArrayBuffer',
  'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'Uint8ClampedArray',
  // Global functions
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI',
  'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'eval', 'globalThis',
  // Node.js globals
  'require', 'module', 'exports', '__dirname', '__filename',
  'process', 'Buffer', 'console', 'global', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate',
  'queueMicrotask', 'structuredClone',
  // Browser globals
  'window', 'document', 'navigator', 'location', 'history', 'localStorage',
  'sessionStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'URL',
  'URLSearchParams', 'FormData', 'Headers', 'Request', 'Response',
  'Blob', 'File', 'FileReader', 'Image', 'Audio', 'Worker', 'Notification',
  'crypto', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  // Mocha/Node test runner
  'describe', 'it', 'before', 'after', 'beforeEach', 'afterEach',
  'test', 'expect', 'assert', 'suite',
  // Common loop variables and conventions
  'i', 'j', 'k', 'n', 'm', 'x', 'y', 'z', '_', 'self', 'this',
]);

// Words that look like identifiers but are JavaScript syntax / keywords.
// Tokenizer marks keywords as 'keyword', so most of these never reach
// us, but a few quirky ones (await, async outside function context,
// yield outside generator) can be tokenized as identifiers.
const KEYWORDS_FALLBACK = new Set([
  'await', 'async', 'yield', 'static', 'as', 'from', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'new', 'delete', 'typeof',
  'instanceof', 'void', 'return', 'throw', 'if', 'else', 'while',
  'for', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'try', 'catch', 'finally', 'function', 'class', 'extends', 'super',
  'const', 'let', 'var', 'import', 'export',
]);

/**
 * Parse file content and return the set of identifiers it DEFINES
 * locally. These don't need to be grounded against external knowledge
 * because they're declared in the same file.
 *
 * Detection rules (lexical, deliberately simple):
 *   - `function NAME(` → defines NAME
 *   - `const NAME = ` / `let NAME = ` / `var NAME = ` → defines NAME
 *   - `class NAME` → defines NAME
 *   - `(NAME, NAME, NAME)` after `function` → parameter names
 *   - `const { A, B } = ` → destructured names
 *   - `import { A, B } from` / `import A from` → imported names
 *   - `const A = require(...)` → imported name (handled by const rule)
 */
function extractDefinedIdentifiers(tokens) {
  const defined = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'keyword' && t.type !== 'identifier') continue;

    // function NAME(
    if (t.value === 'function' && tokens[i + 1]?.type === 'identifier') {
      defined.add(tokens[i + 1].value);
      continue;
    }
    // class NAME
    if (t.value === 'class' && tokens[i + 1]?.type === 'identifier') {
      defined.add(tokens[i + 1].value);
      continue;
    }
    // const/let/var NAME = ...
    if (t.value === 'const' || t.value === 'let' || t.value === 'var') {
      let j = i + 1;
      // const { a, b } = ... — destructuring
      if (tokens[j]?.value === '{') {
        j++;
        while (j < tokens.length && tokens[j].value !== '}') {
          if (tokens[j].type === 'identifier') {
            defined.add(tokens[j].value);
            // Skip aliases: `{ a: b }` adds b (the binding name)
            if (tokens[j + 1]?.value === ':' && tokens[j + 2]?.type === 'identifier') {
              defined.delete(tokens[j].value);
              defined.add(tokens[j + 2].value);
              j += 2;
            }
          }
          j++;
        }
      } else if (tokens[j]?.value === '[') {
        // const [a, b] = ... — array destructuring
        j++;
        while (j < tokens.length && tokens[j].value !== ']') {
          if (tokens[j].type === 'identifier') defined.add(tokens[j].value);
          j++;
        }
      } else if (tokens[j]?.type === 'identifier') {
        defined.add(tokens[j].value);
      }
      continue;
    }
    // import { A, B } from '...' / import A from '...'
    if (t.value === 'import') {
      let j = i + 1;
      if (tokens[j]?.value === '{') {
        j++;
        while (j < tokens.length && tokens[j].value !== '}') {
          if (tokens[j].type === 'identifier') defined.add(tokens[j].value);
          j++;
        }
      } else if (tokens[j]?.type === 'identifier') {
        defined.add(tokens[j].value);
      }
      continue;
    }
  }

  // Pick up function parameter names. Two shapes:
  //   function foo(a, b, c) { ... }  — params after `function [name]`
  //   (a, b) => { ... }              — params before `=>`
  //   x => ...                        — single param before `=>`
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Shape 1: `function [name](params)`
    if (t.value === 'function') {
      let j = i + 1;
      if (tokens[j]?.type === 'identifier') j++;
      if (tokens[j]?.value !== '(') continue;
      j++;
      let depth = 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].value === '(') depth++;
        else if (tokens[j].value === ')') depth--;
        if (depth > 0 && tokens[j].type === 'identifier') {
          defined.add(tokens[j].value);
        }
        j++;
      }
      continue;
    }
    // Shape 2/3: `...(params) =>` or `name =>` — work backwards from `=>`
    if (t.value === '=>') {
      // Case: `name =>` (single bare-identifier param before arrow)
      const prev = tokens[i - 1];
      if (prev?.type === 'identifier') {
        defined.add(prev.value);
        continue;
      }
      // Case: `(a, b, c) =>` — prev is `)`, walk back to matching `(`
      if (prev?.value === ')') {
        let depth = 1;
        let j = i - 2;
        while (j >= 0 && depth > 0) {
          if (tokens[j].value === ')') depth++;
          else if (tokens[j].value === '(') depth--;
          if (depth > 0 && tokens[j].type === 'identifier') {
            defined.add(tokens[j].value);
          }
          j--;
        }
      }
    }
  }

  return defined;
}

/**
 * Find identifiers used in CALL position — `foo(` — anywhere in the
 * token stream. Member access (`x.foo(`) is NOT included because it
 * resolves at runtime against an object whose shape we don't know.
 */
function extractCalledIdentifiers(tokens) {
  const calls = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    if (tokens[i + 1]?.value !== '(') continue;
    // Skip member-access calls like `obj.foo(`
    if (tokens[i - 1]?.value === '.') continue;
    // Skip function declarations / function expressions:
    //   function NAME(...)    — `function` precedes NAME
    //   class NAME            — not in call position, already skipped
    //   NAME is a definition, not a call.
    if (tokens[i - 1]?.value === 'function') continue;
    // Skip object-getter/setter shorthand: `get name(` / `set name(`.
    // The tokenizer emits `get`/`set` as identifiers, not keywords,
    // so we can't rely on token.type — check the previous token value.
    const prevVal = tokens[i - 1]?.value;
    if (prevVal === 'get' || prevVal === 'set') continue;
    // Skip method shorthand in object/class bodies where the method
    // name is preceded by `{` or `,` (shape: `{ method() {...}, next() {...} }`).
    // These are definitions, not calls.
    if (prevVal === '{' || prevVal === ',') {
      // Only treat as definition if the tokens after `(` look like
      // a param list followed by `{` (a body). Otherwise it could be
      // a call in a sequence expression.
      let j = i + 2;
      let depth = 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].value === '(') depth++;
        else if (tokens[j].value === ')') depth--;
        j++;
      }
      if (tokens[j]?.value === '{') continue;
    }
    calls.push({ name: t.value, line: t.line, column: t.column });
  }
  return calls;
}

/**
 * Public entry point. Ground a single file against a set of known
 * identifiers (typically the union of every previously-touched file's
 * exported and called identifiers, plus the built-in allowlist).
 *
 * @param {string} filePath
 * @param {Set<string>} knownIdentifiers - cross-session known set
 * @param {object} [options]
 *   - allowlist: extra identifiers to whitelist
 *   - includeBuiltins: default true
 * @returns {{
 *   file, totalCalls, definedLocally, grounded, ungrounded, summary
 * }}
 */
function groundFile(filePath, knownIdentifiers, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, error: 'not found', ungrounded: [], totalCalls: 0 };
  }
  let source;
  try { source = fs.readFileSync(filePath, 'utf-8'); }
  catch (e) { return { file: filePath, error: e.message, ungrounded: [], totalCalls: 0 }; }

  let tokens;
  try { tokens = tokenize(source); }
  catch (e) { return { file: filePath, error: 'parse failed: ' + e.message, ungrounded: [], totalCalls: 0 }; }

  const defined = extractDefinedIdentifiers(tokens);
  const calls = extractCalledIdentifiers(tokens);

  const allowed = new Set(knownIdentifiers || []);
  if (options.includeBuiltins !== false) {
    for (const b of BUILTINS) allowed.add(b);
    for (const k of KEYWORDS_FALLBACK) allowed.add(k);
  }
  if (options.allowlist) {
    for (const a of options.allowlist) allowed.add(a);
  }

  const ungrounded = [];
  const groundedHits = [];
  for (const call of calls) {
    if (defined.has(call.name)) {
      groundedHits.push({ ...call, source: 'local' });
      continue;
    }
    if (allowed.has(call.name)) {
      groundedHits.push({ ...call, source: 'known' });
      continue;
    }
    ungrounded.push(call);
  }

  // ─── Emergent SERF: register grounding signal ──────────────────
  try {
    const { registerGroundSignal } = require('../unified/emergent-coherency');
    registerGroundSignal(ungrounded.length, calls.length);
  } catch { /* emergent module not available */ }

  return {
    file: filePath,
    totalCalls: calls.length,
    definedLocally: defined.size,
    grounded: groundedHits.length,
    ungrounded,
    summary: {
      grounded: groundedHits.length,
      ungrounded: ungrounded.length,
      groundedRate: calls.length > 0 ? groundedHits.length / calls.length : 1,
    },
  };
}

/**
 * Extract ALL identifiers that appear in a file (defined or called).
 * Used by the session-tracker side to populate the touched-identifier
 * set after a Read tool call: anything the agent has SEEN can be used
 * as ground truth for future writes.
 */
function extractAllIdentifiers(source) {
  let tokens;
  try { tokens = tokenize(source); }
  catch { return new Set(); }
  const all = new Set();
  for (const t of tokens) {
    if (t.type === 'identifier') all.add(t.value);
  }
  return all;
}

// ─── Indirection Resolution ─────────────────────────────────────────────────
//
// Detect obfuscated identifiers produced by string concatenation, template
// literals with constant-only parts, computed property access, and variable
// aliasing. Returns an array of { resolved, original, line } entries for
// every indirection that resolves to a known harmful identifier.

const HARMFUL_IDENTIFIERS = new Set([
  'eval', 'exec', 'execSync', 'child_process', 'Function', 'spawn', 'fork',
]);

/**
 * Try to resolve a string-literal token to its unquoted value.
 * Returns null if the token is not a string literal.
 */
function unquoteString(tok) {
  if (!tok || tok.type !== 'string') return null;
  const v = tok.value;
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return null;
}

/**
 * Resolve a run of string concatenation tokens starting at index `start`.
 * Handles patterns like: 'ev' + 'al', 'child' + '_process'
 *
 * Returns { resolved, endIndex } or null if not a pure-string concatenation.
 */
function resolveStringConcat(tokens, start) {
  const first = unquoteString(tokens[start]);
  if (first === null) return null;

  let result = first;
  let j = start + 1;

  while (j < tokens.length) {
    // Expect a '+' operator
    if (tokens[j].type !== 'operator' || tokens[j].value !== '+') break;
    // Expect another string literal
    const next = unquoteString(tokens[j + 1]);
    if (next === null) break;
    result += next;
    j += 2;
  }

  // Only report if we actually concatenated (consumed at least one '+')
  if (j === start + 1) return null;
  return { resolved: result, endIndex: j - 1 };
}

/**
 * Resolve a template literal with only constant parts (no dynamic
 * expressions, or all expressions are string literals).
 *
 * The tokenizer produces template tokens with a `parts` array where each
 * part is either { type: 'str', value } or { type: 'expr', value }.
 * For expression parts we check if the expression is a bare string literal.
 */
function resolveTemplateLiteral(tok) {
  if (!tok || tok.type !== 'template') return null;
  const parts = tok.value?.parts;
  if (!parts || !Array.isArray(parts)) return null;

  let resolved = '';
  for (const part of parts) {
    if (part.type === 'str') {
      resolved += part.value;
    } else if (part.type === 'expr') {
      // Check if the expression is a bare string literal like 'ev'
      const trimmed = part.value.trim();
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
          (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        resolved += trimmed.slice(1, -1);
      } else {
        // Dynamic expression — cannot resolve statically
        return null;
      }
    }
  }

  // Only report if there was interpolation (otherwise it's just a plain string)
  const hasInterp = tok.value?.hasInterp;
  if (!hasInterp) return null;

  return resolved;
}

/**
 * Resolve indirections in source code.
 *
 * Tokenizes the source and walks the token stream looking for:
 *   1. String concatenation: 'ev' + 'al' -> 'eval'
 *   2. Template literals with constant parts: `${'ev'}${'al'}` -> 'eval'
 *   3. Computed property access: obj['ev' + 'al'] -> obj.eval
 *   4. Variable assignment from concatenation: const x = 'ev' + 'al'; x(...) -> flags x as alias
 *
 * @param {string} code — raw source code (before stripping)
 * @returns {Array<{ resolved: string, original: string, line: number }>}
 */
function resolveIndirections(code) {
  let tokens;
  try { tokens = tokenize(code); }
  catch { return []; }

  // Filter out comments for analysis
  const toks = tokens.filter(t => t.type !== 'comment');
  const results = [];
  const seen = new Set(); // Deduplicate by "resolved:line"

  function addResult(resolved, original, line) {
    const key = `${resolved}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ resolved, original, line });
  }

  // Track variable assignments from concatenation: const x = 'ev' + 'al'
  // Maps variable name -> resolved string value
  const aliasMap = new Map();

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];

    // ── Pattern 1 & 4: String concatenation (standalone or in assignment) ──
    if (t.type === 'string' && toks[i + 1]?.value === '+') {
      const concat = resolveStringConcat(toks, i);
      if (concat && HARMFUL_IDENTIFIERS.has(concat.resolved)) {
        // Reconstruct original expression
        const originalParts = [];
        for (let k = i; k <= concat.endIndex; k++) {
          if (toks[k].type === 'string' || toks[k].value === '+') {
            originalParts.push(toks[k].type === 'string' ? toks[k].value : '+');
          }
        }
        const original = originalParts.join(' ');
        addResult(concat.resolved, original, t.line);
      }

      // Check if this concatenation is a variable assignment: const/let/var NAME = 'ev' + 'al'
      if (concat && i >= 2 &&
          toks[i - 1]?.value === '=' &&
          toks[i - 2]?.type === 'identifier') {
        // Verify there's a const/let/var before the identifier
        if (i >= 3 && (toks[i - 3]?.value === 'const' || toks[i - 3]?.value === 'let' || toks[i - 3]?.value === 'var')) {
          aliasMap.set(toks[i - 2].value, concat.resolved);
        }
      }

      // Check if this is inside a require() call: require('child' + '_process')
      if (concat && i >= 2 &&
          toks[i - 1]?.value === '(' &&
          toks[i - 2]?.type === 'identifier' && toks[i - 2]?.value === 'require') {
        if (HARMFUL_IDENTIFIERS.has(concat.resolved)) {
          const original = `require(${toks.slice(i, concat.endIndex + 1).map(tt => tt.type === 'string' ? tt.value : tt.value).join(' ')})`;
          addResult(concat.resolved, original, toks[i - 2].line);
        }
      }

      // Check if this is inside computed property access: obj['ev' + 'al']
      if (concat && i >= 1 && toks[i - 1]?.value === '[') {
        if (HARMFUL_IDENTIFIERS.has(concat.resolved)) {
          const originalParts = [];
          for (let k = i; k <= concat.endIndex; k++) {
            if (toks[k].type === 'string' || toks[k].value === '+') {
              originalParts.push(toks[k].type === 'string' ? toks[k].value : '+');
            }
          }
          const original = `[${originalParts.join(' ')}]`;
          addResult(concat.resolved, original, t.line);
        }
      }
    }

    // ── Pattern 2: Template literals with constant parts ──
    if (t.type === 'template') {
      const resolved = resolveTemplateLiteral(t);
      if (resolved && HARMFUL_IDENTIFIERS.has(resolved)) {
        addResult(resolved, t.value.raw || String(t.value), t.line);
      }
    }

    // ── Pattern 4 (usage): Variable alias used in call or property access ──
    if (t.type === 'identifier' && aliasMap.has(t.value)) {
      const resolved = aliasMap.get(t.value);
      if (HARMFUL_IDENTIFIERS.has(resolved)) {
        // Check if it's used in a call position: x(...) or obj[x]
        const next = toks[i + 1];
        const prev = toks[i - 1];
        if ((next && next.value === '(') ||  // direct call: x(...)
            (prev && prev.value === '[') ||   // computed access: obj[x]
            (next && next.value === ']')) {    // also computed access
          addResult(resolved, `${t.value} (alias)`, t.line);
        }
      }
    }
  }

  return results;
}

module.exports = {
  groundFile,
  extractAllIdentifiers,
  extractDefinedIdentifiers,
  extractCalledIdentifiers,
  resolveIndirections,
  BUILTINS,
};

// ── Atomic self-description (batch-generated) ────────────────────
groundFile.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
extractAllIdentifiers.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 9, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
extractDefinedIdentifiers.atomicProperties = {
  charge: 0, valence: 2, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'inert', electronegativity: 1, group: 2, period: 4,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
extractCalledIdentifiers.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
resolveIndirections.atomicProperties = {
  charge: 0, valence: 2, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 1, group: 8, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'security',
};
