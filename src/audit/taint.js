'use strict';

/**
 * Taint tracking for the security checker.
 *
 * We mark a variable as "tainted" if it originated from an untrusted source:
 *
 *   SOURCES (tainted):
 *     - Function parameters (could be anything)
 *     - req.body, req.params, req.query, req.headers (Express)
 *     - process.argv, process.env (depending on strictness)
 *     - fs.readFileSync on user-controlled path
 *     - User input: prompt, readline
 *     - Anything returned from a tainted-returning function
 *
 *   SINKS (dangerous if tainted reaches them):
 *     - execFile/exec/execSync/spawn with string args
 *     - new Function, eval
 *     - db.exec, db.query, db.prepare with template-literal SQL
 *     - fs.writeFile(userPath, ...)
 *
 *   SANITIZERS (remove taint):
 *     - JSON.parse(x) followed by structural access
 *     - escapeHtml, sanitize, validator functions
 *     - String.prototype.replace with a safe pattern
 *     - parseInt/parseFloat/Number()
 *
 * The analysis is intra-function only and flow-insensitive: if any
 * assignment anywhere in the function makes `x` tainted, we consider `x`
 * tainted at every sink. That produces some false positives on rebound
 * variables, but the alternative (full SSA) is out of scope.
 */

// ─── Source / Sink tables ────────────────────────────────────────────────────

const PARAM_SOURCE = true; // treat every parameter as tainted

// Member-chain prefixes whose read produces tainted data.
const TAINTED_CHAINS = [
  ['req', 'body'],
  ['req', 'params'],
  ['req', 'query'],
  ['req', 'headers'],
  ['request', 'body'],
  ['request', 'params'],
  ['request', 'query'],
  ['ctx', 'request', 'body'],
  ['process', 'argv'],
  ['process', 'env'],
];

// Sink definitions: a member chain that, when called, triggers a finding if
// any argument is tainted. Represented as dotted suffix patterns.
const SINK_CHAINS = [
  { chain: ['eval'],               rule: 'eval',             message: 'eval() with tainted input enables arbitrary code execution' },
  { chain: ['Function'],           rule: 'new-Function',     message: 'new Function() with tainted input enables arbitrary code execution' },
  { chain: ['execSync'],           rule: 'shell-exec',       message: 'execSync with tainted input enables shell injection' },
  { chain: ['exec'],               rule: 'shell-exec',       message: 'exec with tainted input enables shell injection (prefer execFile)' },
  { chain: ['execFile'],           rule: 'shell-exec',       message: 'execFile command path from tainted input may be attacker-controlled' },
  { chain: ['spawn'],              rule: 'shell-exec',       message: 'spawn with tainted input enables shell injection (use { shell: false })' },
  { chain: ['spawnSync'],          rule: 'shell-exec',       message: 'spawnSync with tainted input enables shell injection' },
];

// Method-name sinks (matched by the LAST identifier of the call chain).
const SINK_METHODS = [
  { name: 'exec',       rule: 'sql-exec',       message: 'db.exec with tainted input — use parameterized prepared statements' },
  { name: 'query',      rule: 'sql-query',      message: 'db.query with tainted input — use parameterized prepared statements' },
  { name: 'run',        rule: 'sql-run',        message: 'db.run with tainted input — use parameterized prepared statements' },
  { name: 'prepare',    rule: 'sql-prepare',    message: 'db.prepare with tainted SQL — bind values via ? placeholders instead' },
  { name: 'innerHTML',  rule: 'xss-innerhtml',  message: 'innerHTML assignment with tainted input enables XSS' },
];

// Functions whose return value removes taint from their argument.
const SANITIZERS = new Set([
  'escapeHtml', 'sanitize', 'sanitizeHtml', 'DOMPurify',
  'parseInt', 'parseFloat', 'Number', 'Boolean',
  'encodeURIComponent', 'encodeURI',
  'validator', 'escape',
]);

// ─── Taint analysis ──────────────────────────────────────────────────────────

/**
 * Compute the set of tainted identifiers within a function body.
 *
 * @param {object} fn - FunctionDeclaration/MethodLike from parser
 * @returns {Set<string>} names of tainted variables/parameters
 */
function computeTainted(fn) {
  const tainted = new Set();
  if (PARAM_SOURCE) {
    for (const p of fn.params || []) {
      if (p && p.name) tainted.add(p.name);
    }
  }

  const tokens = fn.bodyTokens || [];

  // Walk the body and find taint-propagating assignments
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // `const x = req.body.foo` → x tainted
    // `let x = arg` where arg is a param → x tainted
    if (t.type === 'keyword' && (t.value === 'const' || t.value === 'let' || t.value === 'var')) {
      const nameTok = tokens[i + 1];
      const eq = tokens[i + 2];
      if (nameTok?.type === 'identifier' && eq?.value === '=') {
        // Scan RHS until ; or , (top-level)
        const rhs = [];
        let j = i + 3;
        let depth = 0;
        while (j < tokens.length) {
          const tk = tokens[j];
          if (depth === 0 && (tk.value === ';' || tk.value === ',')) break;
          if (tk.value === '(' || tk.value === '[' || tk.value === '{') depth++;
          if (tk.value === ')' || tk.value === ']' || tk.value === '}') depth--;
          rhs.push(tk);
          j++;
        }
        if (rhsIsTainted(rhs, tainted)) {
          tainted.add(nameTok.value);
        }
      }
    }

    // `x = something tainted` (plain assignment)
    if (t.type === 'identifier' && tokens[i + 1]?.value === '=' && tokens[i - 1]?.value !== '.') {
      const rhs = [];
      let j = i + 2;
      let depth = 0;
      while (j < tokens.length) {
        const tk = tokens[j];
        if (depth === 0 && (tk.value === ';' || tk.value === ',')) break;
        if (tk.value === '(' || tk.value === '[' || tk.value === '{') depth++;
        if (tk.value === ')' || tk.value === ']' || tk.value === '}') depth--;
        rhs.push(tk);
        j++;
      }
      if (rhsIsTainted(rhs, tainted)) {
        tainted.add(t.value);
      }
    }
  }

  return tainted;
}

/**
 * Decide whether an RHS token sequence is tainted given the current taint set.
 */
function rhsIsTainted(rhsTokens, tainted) {
  // Sanitized calls clear taint.
  if (rhsTokens.length && rhsTokens[0].type === 'identifier' &&
      SANITIZERS.has(rhsTokens[0].value) && rhsTokens[1]?.value === '(') {
    return false;
  }

  for (let i = 0; i < rhsTokens.length; i++) {
    const t = rhsTokens[i];
    if (t.type !== 'identifier') continue;

    // Direct reference to a tainted variable
    if (tainted.has(t.value)) {
      // Skip if it's actually a property access target: `obj.body` where body matches.
      const prev = rhsTokens[i - 1];
      if (prev?.value === '.') continue;
      return true;
    }

    // Member chain matching a tainted source (req.body, process.argv, etc.)
    const chain = readMemberChain(rhsTokens, i);
    if (chain.length > 0) {
      for (const pattern of TAINTED_CHAINS) {
        if (matchesChainPrefix(chain, pattern)) return true;
      }
      i += chain.length - 1;
    }
  }
  return false;
}

/**
 * Read a chained member access starting at tokens[i]. Returns the list of
 * dotted identifier names, e.g. `req.body.foo` → ['req', 'body', 'foo'].
 */
function readMemberChain(tokens, start) {
  if (tokens[start]?.type !== 'identifier') return [];
  const chain = [tokens[start].value];
  let j = start + 1;
  while (j < tokens.length) {
    if (tokens[j]?.value === '.' && tokens[j + 1]?.type === 'identifier') {
      chain.push(tokens[j + 1].value);
      j += 2;
      continue;
    }
    break;
  }
  return chain;
}

function matchesChainPrefix(chain, pattern) {
  if (pattern.length > chain.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== chain[i]) return false;
  }
  return true;
}

// ─── Sink matching ───────────────────────────────────────────────────────────

/**
 * Find sink call sites in a function body and report any that are
 * reached with tainted input.
 *
 * @param {object} fn - function node with bodyTokens
 * @param {Set<string>} tainted - pre-computed tainted vars
 * @param {(finding) => void} emit - callback to push a finding
 */
function findSinkCalls(fn, tainted, emit) {
  const tokens = fn.bodyTokens || [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;

    // Skip property-name positions (the `body` in `req.body`) — they're
    // part of a member chain we've already processed from the head.
    if (tokens[i - 1]?.value === '.') continue;

    // Read a member chain starting here to test sink patterns. For a chain
    // of length N (e.g. ['db', 'exec'] → 2), the last token sits at index
    // `i + (N - 1) * 2` because each hop is identifier + dot.
    const chain = readMemberChain(tokens, i);
    if (chain.length === 0) continue;
    const chainEnd = i + (chain.length - 1) * 2;
    const after = tokens[chainEnd + 1];
    if (after?.value !== '(') { i += Math.max(0, chain.length - 1); continue; }

    // Check full-chain sinks (eval, Function, execFile, ...)
    let matchedSink = null;
    for (const sink of SINK_CHAINS) {
      if (matchesChainSuffix(chain, sink.chain)) { matchedSink = sink; break; }
    }
    // Check method-name sinks (db.exec, el.innerHTML assignment handled elsewhere)
    if (!matchedSink) {
      const last = chain[chain.length - 1];
      for (const sink of SINK_METHODS) {
        if (sink.name === last && chain.length > 1) { matchedSink = sink; break; }
      }
    }
    if (!matchedSink) { i += chain.length - 1; continue; }

    // Extract call arguments
    const argsStart = chainEnd + 2; // one past the `(`
    const args = extractArgs(tokens, chainEnd + 1);
    if (args === null) { i += chain.length - 1; continue; }

    // Check taint across any argument
    let tainteArg = null;
    for (const arg of args) {
      if (argIsTainted(arg, tainted)) { tainteArg = arg; break; }
    }

    if (tainteArg) {
      emit({
        line: t.line,
        column: t.column,
        bugClass: 'security',
        ruleId: `security/${matchedSink.rule}`,
        assumption: `Call to ${chain.join('.')} with safe input`,
        reality: matchedSink.message,
        severity: 'high',
        suggestion: suggestionFor(matchedSink.rule),
        code: chain.join('.') + '(...)',
      });
    }

    i += chain.length - 1;
  }
}

function matchesChainSuffix(chain, pattern) {
  if (pattern.length > chain.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[pattern.length - 1 - i] !== chain[chain.length - 1 - i]) return false;
  }
  return true;
}

/**
 * Extract top-level arguments from a call whose `(` is at tokens[openIdx].
 * Returns an array of per-arg token arrays, or null on imbalance.
 */
function extractArgs(tokens, openIdx) {
  if (tokens[openIdx]?.value !== '(') return null;
  const args = [];
  let current = [];
  let depth = 1;
  let i = openIdx + 1;
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
    if (t.value === ')' || t.value === ']' || t.value === '}') {
      depth--;
      if (depth === 0) break;
    }
    if (depth === 1 && t.value === ',') {
      args.push(current);
      current = [];
    } else {
      current.push(t);
    }
    i++;
  }
  if (current.length) args.push(current);
  return args;
}

/**
 * Is a single argument token array tainted?
 *
 * Rules:
 *   - A template literal with any interpolation → tainted if any expr part
 *     references a tainted variable. A template with NO interpolation is
 *     always safe (constant string).
 *   - A plain identifier in the tainted set → tainted
 *   - A string concat (`'prefix' + x`) where x is tainted → tainted
 *   - A member chain matching a tainted source → tainted
 */
function argIsTainted(argTokens, tainted) {
  for (let i = 0; i < argTokens.length; i++) {
    const t = argTokens[i];

    // Sanitized call — stop considering this arg.
    if (t.type === 'identifier' && SANITIZERS.has(t.value) && argTokens[i + 1]?.value === '(') {
      return false;
    }

    // Template literal
    if (t.type === 'template') {
      const info = t.value;
      if (!info.hasInterp) continue; // constant → safe
      for (const part of info.parts) {
        if (part.type !== 'expr') continue;
        // Re-tokenize the expression text against our tainted set by a
        // simple identifier scan. We don't need perfect parsing because
        // ANY mention of a tainted identifier taints the arg.
        for (const word of tokenizeWords(part.value)) {
          if (tainted.has(word)) return true;
        }
      }
      continue;
    }

    if (t.type === 'identifier') {
      const prev = argTokens[i - 1];
      if (prev?.value === '.') continue; // property name
      if (tainted.has(t.value)) return true;
      const chain = readMemberChain(argTokens, i);
      for (const pattern of TAINTED_CHAINS) {
        if (matchesChainPrefix(chain, pattern)) return true;
      }
    }
  }
  return false;
}

function tokenizeWords(text) {
  return text.split(/[^A-Za-z0-9_$]/).filter(Boolean);
}

function suggestionFor(rule) {
  switch (rule) {
    case 'eval':
    case 'new-Function':
      return 'Avoid eval/new Function. Use JSON.parse, a template engine, or a whitelist of operations.';
    case 'shell-exec':
      return 'Use execFile(cmd, [args]) with a fixed command and sanitized arg array. Never interpolate into the command string.';
    case 'sql-exec':
    case 'sql-query':
    case 'sql-run':
    case 'sql-prepare':
      return 'Use a prepared statement with ? placeholders: db.prepare("SELECT * FROM t WHERE id = ?").get(id).';
    case 'xss-innerhtml':
      return 'Use textContent for plain text, or sanitize with DOMPurify/escapeHtml first.';
    default:
      return 'Sanitize untrusted input before passing it to this sink.';
  }
}

module.exports = {
  computeTainted,
  findSinkCalls,
  readMemberChain,
  SINK_CHAINS,
  SINK_METHODS,
  SANITIZERS,
};
