'use strict';

/**
 * Audit-focused JavaScript tokenizer + lightweight parser.
 *
 * Zero external dependencies. Produces tokens and a minimal AST structured
 * around what the static checkers actually need:
 *
 *   - Regex literals distinguished from division (fixes the /gi false-positive)
 *   - String, template, and comment ranges so checks don't fire on their content
 *   - Line + column tracking on every token so findings carry locations
 *   - Function boundaries and parameter lists for scope-aware checks
 *   - If-condition tracking for scope-aware null-check narrowing
 *   - Member chains (a.b.c.d()) for security taint + integration checks
 *
 * The parser is deliberately minimal: we only build enough AST to answer
 * the questions the checkers ask. Anything unrecognized is kept as a raw
 * token run, which is still scannable.
 */

// ─── Tokenizer ───────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
  'finally', 'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'null', 'of', 'return', 'set', 'static', 'super', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while',
  'with', 'yield',
]);

// Tokens that can legally precede a regex literal. Anything else → division.
// We keep this tight; the checker side only needs to detect real regex literals
// so it doesn't flag /gi as division-by-zero.
const REGEX_CAN_FOLLOW = new Set([
  '(', '[', '{', ',', ';', ':', '?', '=', '==', '===', '!=', '!==', '<', '>',
  '<=', '>=', '&&', '||', '!', '|', '&', '^', '~', '+', '-', '*', '/', '%',
  '+=', '-=', '*=', '/=', '%=', '&&=', '||=', '??=', '=>', '...', '??',
  'return', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'new',
  'throw', 'yield', 'await', 'case', 'do', 'else',
]);

function tokenize(source) {
  const tokens = [];
  const len = source.length;
  let i = 0;
  let line = 1;
  let col = 1;
  let lastSignificant = null; // last non-comment, non-whitespace token

  function pushTok(type, value, startLine, startCol, startIdx, endIdx) {
    const tok = {
      type,
      value,
      line: startLine,
      column: startCol,
      start: startIdx,
      end: endIdx,
    };
    tokens.push(tok);
    if (type !== 'comment') lastSignificant = tok;
    return tok;
  }

  function advance(n = 1) {
    for (let k = 0; k < n && i < len; k++) {
      if (source[i] === '\n') { line++; col = 1; }
      else col++;
      i++;
    }
  }

  function canStartRegex() {
    if (!lastSignificant) return true;
    const v = lastSignificant.value;
    const t = lastSignificant.type;
    if (t === 'keyword') return REGEX_CAN_FOLLOW.has(v);
    if (t === 'punctuation' || t === 'operator') return REGEX_CAN_FOLLOW.has(v);
    // After an identifier, number, string, template, regex, or `)`, `]`, `}` → division
    return false;
  }

  while (i < len) {
    const ch = source[i];
    const startLine = line;
    const startCol = col;
    const startIdx = i;

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue; }
    if (ch === '\n') { advance(); continue; }

    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      let value = '';
      while (i < len && source[i] !== '\n') { value += source[i]; advance(); }
      pushTok('comment', value, startLine, startCol, startIdx, i);
      continue;
    }

    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      let value = '';
      advance(2); value = '/*';
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        value += source[i]; advance();
      }
      if (i < len) { value += '*/'; advance(2); }
      pushTok('comment', value, startLine, startCol, startIdx, i);
      continue;
    }

    // Regex literal (context-sensitive)
    if (ch === '/' && canStartRegex()) {
      let j = i + 1;
      let inClass = false;
      let escaped = false;
      let ok = false;
      while (j < len) {
        const c = source[j];
        if (escaped) { escaped = false; j++; continue; }
        if (c === '\\') { escaped = true; j++; continue; }
        if (c === '[') { inClass = true; j++; continue; }
        if (c === ']') { inClass = false; j++; continue; }
        if (c === '/' && !inClass) { ok = true; break; }
        if (c === '\n') break; // regex can't contain newline
        j++;
      }
      if (ok) {
        // j points at the closing /
        const bodyEnd = j + 1;
        let flagsEnd = bodyEnd;
        while (flagsEnd < len && /[a-z]/i.test(source[flagsEnd])) flagsEnd++;
        const body = source.slice(i + 1, j);
        const flags = source.slice(bodyEnd, flagsEnd);
        const value = source.slice(i, flagsEnd);
        // Advance past the regex
        while (i < flagsEnd) advance();
        pushTok('regex', { raw: value, body, flags }, startLine, startCol, startIdx, i);
        continue;
      }
      // Not a regex, fall through as operator
    }

    // String literal (single or double)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = quote;
      advance();
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') { value += source[i]; advance(); }
        if (i < len) { value += source[i]; advance(); }
      }
      if (i < len && source[i] === quote) { value += quote; advance(); }
      pushTok('string', value, startLine, startCol, startIdx, i);
      continue;
    }

    // Template literal
    if (ch === '`') {
      let value = '`';
      advance();
      const parts = [];
      let current = '';
      let hasInterp = false;
      while (i < len && source[i] !== '`') {
        if (source[i] === '\\') {
          current += source[i]; advance();
          if (i < len) { current += source[i]; advance(); }
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          hasInterp = true;
          parts.push({ type: 'str', value: current });
          current = '';
          advance(2);
          let depth = 1;
          let expr = '';
          while (i < len && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') { depth--; if (depth === 0) break; }
            expr += source[i];
            advance();
          }
          if (i < len && source[i] === '}') advance();
          parts.push({ type: 'expr', value: expr });
          continue;
        }
        current += source[i]; advance();
      }
      if (current) parts.push({ type: 'str', value: current });
      if (i < len && source[i] === '`') advance();
      value = source.slice(startIdx, i);
      pushTok('template', { raw: value, parts, hasInterp }, startLine, startCol, startIdx, i);
      continue;
    }

    // Number
    if (ch >= '0' && ch <= '9') {
      let value = '';
      while (i < len && /[0-9a-fA-FxXoObBeE._n]/.test(source[i])) { value += source[i]; advance(); }
      pushTok('number', value, startLine, startCol, startIdx, i);
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      let value = '';
      while (i < len && /[A-Za-z0-9_$]/.test(source[i])) { value += source[i]; advance(); }
      const type = KEYWORDS.has(value) ? 'keyword' : 'identifier';
      pushTok(type, value, startLine, startCol, startIdx, i);
      continue;
    }

    // Multi-char operators (order matters — longest first)
    const ops4 = ['>>>='];
    const ops3 = ['===', '!==', '**=', '<<=', '>>=', '>>>', '...', '&&=', '||=', '??='];
    const ops2 = ['==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--',
      '+=', '-=', '*=', '/=', '%=', '**', '=>', '<<', '>>', '|=', '&=', '^='];

    let matched = false;
    for (const op of ops4) {
      if (source.slice(i, i + 4) === op) {
        advance(4); pushTok('operator', op, startLine, startCol, startIdx, i); matched = true; break;
      }
    }
    if (matched) continue;
    for (const op of ops3) {
      if (source.slice(i, i + 3) === op) {
        advance(3); pushTok('operator', op, startLine, startCol, startIdx, i); matched = true; break;
      }
    }
    if (matched) continue;
    for (const op of ops2) {
      if (source.slice(i, i + 2) === op) {
        advance(2); pushTok('operator', op, startLine, startCol, startIdx, i); matched = true; break;
      }
    }
    if (matched) continue;

    // Single-char punctuation/operator
    const singleOps = '+-*/%<>!=&|^~';
    if (singleOps.includes(ch)) {
      advance();
      pushTok('operator', ch, startLine, startCol, startIdx, i);
      continue;
    }
    advance();
    pushTok('punctuation', ch, startLine, startCol, startIdx, i);
  }

  return tokens;
}

// ─── Token stream helpers ────────────────────────────────────────────────────

class TokenStream {
  constructor(tokens) {
    // Filter comments out for parsing but keep them accessible for suppression.
    this.all = tokens;
    this.tokens = tokens.filter(t => t.type !== 'comment');
    this.comments = tokens.filter(t => t.type === 'comment');
    this.pos = 0;
  }
  peek(n = 0) { return this.tokens[this.pos + n] || { type: 'eof', value: '', line: -1, column: -1 }; }
  advance() { return this.tokens[this.pos++] || { type: 'eof', value: '', line: -1, column: -1 }; }
  eof() { return this.pos >= this.tokens.length; }
  check(type, value) {
    const t = this.peek();
    if (type && t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
}

// ─── Minimal AST builder ─────────────────────────────────────────────────────
//
// We build enough structure for the checkers:
//   Program → [TopLevel]
//   TopLevel → FunctionDecl | VarDecl | Class | Other
//   FunctionDecl has { name, params, bodyStart, bodyEnd, ifConditions[] }
//
// The AST is intentionally sparse — anything we don't recognize becomes a
// generic "span" with its token range and any detected member chains.

function parseProgram(source) {
  const tokens = tokenize(source);
  const stream = new TokenStream(tokens);
  const program = {
    type: 'Program',
    source,
    tokens,
    comments: stream.comments,
    lines: source.split('\n'),
    body: [],
    functions: [], // flat list of every function (decl + expr + method)
  };

  while (!stream.eof()) {
    const node = parseTopLevel(stream, program);
    if (node) program.body.push(node);
  }

  return program;
}

function parseTopLevel(stream, program) {
  const t = stream.peek();
  if (t.type === 'eof') return null;

  // Handle function declarations at top level
  if (t.type === 'keyword' && t.value === 'function') {
    return parseFunctionDeclaration(stream, program);
  }
  if (t.type === 'keyword' && t.value === 'async' && stream.peek(1).value === 'function') {
    stream.advance();
    return parseFunctionDeclaration(stream, program, true);
  }

  // Skip this token and return as raw
  stream.advance();
  return null;
}

function parseFunctionDeclaration(stream, program, isAsync = false) {
  const fnTok = stream.advance(); // consume 'function'
  if (fnTok.value !== 'function') return null;

  // Skip generator star
  if (stream.check('operator', '*')) stream.advance();

  const nameTok = stream.peek();
  let name = null;
  if (nameTok.type === 'identifier') {
    name = nameTok.value;
    stream.advance();
  }

  // Expect (
  if (!stream.check('punctuation', '(')) return null;
  stream.advance();

  // Parse param list
  const params = [];
  while (!stream.eof() && !stream.check('punctuation', ')')) {
    const pTok = stream.peek();
    if (pTok.type === 'identifier') {
      const paramName = pTok.value;
      stream.advance();
      // Optional default
      let hasDefault = false;
      if (stream.check('operator', '=')) {
        hasDefault = true;
        // Skip until comma or close paren at depth 0
        stream.advance();
        let depth = 0;
        while (!stream.eof()) {
          const t2 = stream.peek();
          if (depth === 0 && (t2.value === ',' || t2.value === ')')) break;
          if (t2.value === '(' || t2.value === '{' || t2.value === '[') depth++;
          if (t2.value === ')' || t2.value === '}' || t2.value === ']') depth--;
          stream.advance();
        }
      }
      params.push({ name: paramName, hasDefault, rest: false });
    } else if (pTok.value === '...') {
      stream.advance();
      const restName = stream.peek();
      if (restName.type === 'identifier') {
        params.push({ name: restName.value, hasDefault: false, rest: true });
        stream.advance();
      }
    } else if (pTok.value === '{' || pTok.value === '[') {
      // Destructured param — skip and mark as unnamed destructure
      let depth = 1;
      stream.advance();
      while (!stream.eof() && depth > 0) {
        const t2 = stream.peek();
        if (t2.value === '{' || t2.value === '[') depth++;
        if (t2.value === '}' || t2.value === ']') depth--;
        stream.advance();
      }
      params.push({ name: null, destructured: true, hasDefault: false, rest: false });
    } else {
      stream.advance();
    }
    if (stream.check('punctuation', ',')) stream.advance();
  }
  if (stream.check('punctuation', ')')) stream.advance();

  // Parse body
  if (!stream.check('punctuation', '{')) {
    return {
      type: 'FunctionDeclaration', name, params, async: isAsync,
      bodyStart: fnTok.start, bodyEnd: fnTok.end,
      line: fnTok.line, column: fnTok.column,
      returns: [],
    };
  }
  const bodyOpen = stream.advance();
  const bodyStart = bodyOpen.start;
  const bodyTokens = [];
  let depth = 1;
  while (!stream.eof() && depth > 0) {
    const t2 = stream.peek();
    if (t2.value === '{') depth++;
    else if (t2.value === '}') { depth--; if (depth === 0) { stream.advance(); break; } }
    bodyTokens.push(t2);
    stream.advance();
  }
  const bodyEnd = bodyTokens.length > 0 ? bodyTokens[bodyTokens.length - 1].end : bodyStart;

  const fn = {
    type: 'FunctionDeclaration',
    name,
    params,
    async: isAsync,
    bodyStart,
    bodyEnd,
    bodyTokens,
    line: fnTok.line,
    column: fnTok.column,
    returns: extractReturns(bodyTokens),
  };
  program.functions.push(fn);
  return fn;
}

/**
 * Extract return values from a flat body token stream. We categorize each
 * return as: 'null' (return null/undefined), 'value' (returns something), or
 * 'implicit' (no return → returns undefined). Used for nullable inference.
 */
function extractReturns(bodyTokens) {
  const returns = [];
  for (let i = 0; i < bodyTokens.length; i++) {
    const t = bodyTokens[i];
    if (t.type !== 'keyword' || t.value !== 'return') continue;
    const next = bodyTokens[i + 1] || { type: 'eof', value: '' };
    if (next.value === ';' || next.type === 'eof') {
      returns.push({ kind: 'undefined', line: t.line });
    } else if (next.value === 'null' || next.value === 'undefined') {
      returns.push({ kind: 'null', line: t.line });
    } else {
      returns.push({ kind: 'value', line: t.line });
    }
  }
  // If the body never returns at all, add an implicit undefined return
  if (returns.length === 0) returns.push({ kind: 'implicit', line: -1 });
  return returns;
}

// ─── Walker: walk every function in the program + top-level ─────────────────

function walkFunctions(program, visit) {
  // The parser already collected flat `functions` for top-level `function`
  // declarations. For embedded functions (methods, expressions) we need to
  // sweep the raw token stream and detect them heuristically.
  //
  // Dedup is keyed by `bodyStart` because that's stable across extraction
  // strategies — the body open brace is the same position whether we
  // produce a FunctionDeclaration or a FunctionExpression for the same
  // source.
  const found = new Set();
  for (const fn of program.functions) {
    if (found.has(fn.bodyStart)) continue;
    visit(fn);
    found.add(fn.bodyStart);
  }

  // Scan tokens for additional function-like patterns so checks run on
  // methods and arrow functions too.
  const toks = program.tokens.filter(t => t.type !== 'comment');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'keyword' && t.value === 'function') {
      const fn = extractInlineFunction(toks, i, t);
      if (fn && !found.has(fn.bodyStart)) { visit(fn); found.add(fn.bodyStart); }
    }
    // Method shorthand: `name(params) {` inside a class body
    if (t.type === 'identifier' && toks[i + 1]?.value === '(') {
      const fn = extractMethodLike(toks, i);
      if (fn && !found.has(fn.bodyStart)) { visit(fn); found.add(fn.bodyStart); }
    }
  }
}

function extractInlineFunction(toks, i, fnTok) {
  // function name?(params){body}
  let j = i + 1;
  let name = null;
  if (toks[j]?.type === 'identifier') { name = toks[j].value; j++; }
  if (toks[j]?.value !== '(') return null;
  // Skip to matching )
  let depth = 1; j++;
  while (j < toks.length && depth > 0) {
    if (toks[j].value === '(') depth++;
    else if (toks[j].value === ')') depth--;
    j++;
  }
  if (toks[j]?.value !== '{') return null;
  const bodyOpen = toks[j];
  const bodyStart = bodyOpen.start;
  depth = 1; j++;
  const bodyTokens = [];
  while (j < toks.length && depth > 0) {
    if (toks[j].value === '{') depth++;
    else if (toks[j].value === '}') { depth--; if (depth === 0) break; }
    bodyTokens.push(toks[j]);
    j++;
  }
  return {
    type: 'FunctionExpression',
    name,
    params: [],
    async: false,
    bodyStart,
    bodyEnd: toks[j]?.end || bodyStart,
    bodyTokens,
    line: fnTok.line,
    column: fnTok.column,
    returns: extractReturns(bodyTokens),
  };
}

function extractMethodLike(toks, i) {
  // Pattern: identifier ( ... ) { body }
  // Only consider if the identifier is not a known call-site leader (i.e.
  // the previous non-comment token is `{`, `,`, `;`, or a keyword like `class`).
  const prev = toks[i - 1];
  if (prev && !['{', ',', ';'].includes(prev.value) && prev.value !== 'static' && prev.value !== 'get' && prev.value !== 'set' && prev.value !== 'async') return null;

  const nameTok = toks[i];
  let j = i + 1;
  if (toks[j]?.value !== '(') return null;
  let depth = 1; j++;
  while (j < toks.length && depth > 0) {
    if (toks[j].value === '(') depth++;
    else if (toks[j].value === ')') depth--;
    j++;
  }
  if (toks[j]?.value !== '{') return null;
  const bodyOpen = toks[j];
  const bodyStart = bodyOpen.start;
  depth = 1; j++;
  const bodyTokens = [];
  while (j < toks.length && depth > 0) {
    if (toks[j].value === '{') depth++;
    else if (toks[j].value === '}') { depth--; if (depth === 0) break; }
    bodyTokens.push(toks[j]);
    j++;
  }
  return {
    type: 'MethodLike',
    name: nameTok.value,
    params: [],
    async: false,
    bodyStart,
    bodyEnd: toks[j]?.end || bodyStart,
    bodyTokens,
    line: nameTok.line,
    column: nameTok.column,
    returns: extractReturns(bodyTokens),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

module.exports = {
  tokenize,
  parseProgram,
  walkFunctions,
};
