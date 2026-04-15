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

module.exports = {
  groundFile,
  extractAllIdentifiers,
  extractDefinedIdentifiers,
  extractCalledIdentifiers,
  BUILTINS,
};
