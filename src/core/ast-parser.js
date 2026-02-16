/**
 * Lightweight recursive-descent JavaScript parser.
 * Produces a simplified AST — no external dependencies.
 * Extracted from ast-transpiler.js for maintainability.
 */

// ─── Lightweight JS Parser ───

/**
 * Parse JavaScript source into a simplified AST.
 * Handles: functions, variables, if/else, for, while, return, expressions,
 *          async/await, destructuring, classes, arrow functions, template literals,
 *          try/catch/finally, throw.
 */
function parseJS(source) {
  const tokens = tokenize(source);
  return parseProgram(tokens);
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    // Skip whitespace (preserve newlines as tokens for structure)
    if (source[i] === '\n') {
      tokens.push({ type: 'newline', value: '\n' });
      i++;
      continue;
    }
    if (/\s/.test(source[i])) { i++; continue; }

    // Single-line comments
    if (source[i] === '/' && source[i + 1] === '/') {
      let comment = '';
      while (i < source.length && source[i] !== '\n') comment += source[i++];
      tokens.push({ type: 'comment', value: comment });
      continue;
    }

    // Multi-line comments
    if (source[i] === '/' && source[i + 1] === '*') {
      let comment = '';
      i += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
        comment += source[i++];
      }
      i += 2;
      tokens.push({ type: 'comment', value: `/*${comment}*/` });
      continue;
    }

    // Strings and template literals
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      let str = quote;
      i++;
      let hasInterpolation = false;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { str += source[i++]; str += source[i++]; continue; }
        if (quote === '`' && source[i] === '$' && i + 1 < source.length && source[i + 1] === '{') {
          hasInterpolation = true;
          str += source[i++]; // $
          str += source[i++]; // {
          let depth = 1;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (depth > 0) str += source[i];
            i++;
          }
          str += '}';
          continue;
        }
        str += source[i++];
      }
      if (i < source.length) str += source[i++];
      tokens.push({ type: (quote === '`' && hasInterpolation) ? 'template' : 'string', value: str });
      continue;
    }

    // Numbers
    if (/\d/.test(source[i]) || (source[i] === '.' && /\d/.test(source[i + 1]))) {
      let num = '';
      while (i < source.length && /[\d.eExXa-fA-F_]/.test(source[i])) num += source[i++];
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(source[i])) {
      let id = '';
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) id += source[i++];
      const keywords = ['function', 'return', 'if', 'else', 'for', 'while', 'const', 'let', 'var',
        'new', 'true', 'false', 'null', 'undefined', 'typeof', 'of', 'in', 'break', 'continue',
        'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'class', 'extends',
        'async', 'await', 'yield', 'export', 'import'];
      tokens.push({ type: keywords.includes(id) ? 'keyword' : 'identifier', value: id });
      continue;
    }

    // Multi-character operators
    const ops3 = ['===', '!==', '>>>', '**=', '<<=', '>>=', '...'];
    const ops2 = ['==', '!=', '<=', '>=', '&&', '||', '??', '++', '--', '+=', '-=', '*=', '/=',
      '%=', '**', '=>', '<<', '>>', '?.'];
    let matched = false;
    for (const op of ops3) {
      if (source.slice(i, i + 3) === op) {
        tokens.push({ type: 'operator', value: op });
        i += 3;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    for (const op of ops2) {
      if (source.slice(i, i + 2) === op) {
        tokens.push({ type: 'operator', value: op });
        i += 2;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-character tokens
    tokens.push({ type: 'punctuation', value: source[i] });
    i++;
  }

  return tokens.filter(t => t.type !== 'newline');
}

function parseProgram(tokens) {
  const ctx = { tokens, pos: 0 };
  const body = [];
  while (ctx.pos < ctx.tokens.length) {
    const node = parseStatement(ctx);
    if (node) body.push(node);
  }
  return { type: 'Program', body };
}

function peek(ctx) { return ctx.tokens[ctx.pos] || { type: 'eof', value: '' }; }
function advance(ctx) { return ctx.tokens[ctx.pos++] || { type: 'eof', value: '' }; }
function expect(ctx, value) {
  const t = advance(ctx);
  if (t.value !== value) throw new Error(`Expected '${value}' but got '${t.value}'`);
  return t;
}

function parseStatement(ctx) {
  const t = peek(ctx);

  if (t.type === 'comment') { advance(ctx); return { type: 'Comment', value: t.value }; }
  if (t.value === 'function') return parseFunctionDecl(ctx, false);
  if (t.value === 'async' && ctx.tokens[ctx.pos + 1]?.value === 'function') {
    advance(ctx); // consume 'async'
    return parseFunctionDecl(ctx, true);
  }
  if (t.value === 'return') return parseReturn(ctx);
  if (t.value === 'if') return parseIf(ctx);
  if (t.value === 'for') return parseFor(ctx);
  if (t.value === 'while') return parseWhile(ctx);
  if (t.value === 'const' || t.value === 'let' || t.value === 'var') return parseVarDecl(ctx);
  if (t.value === 'class') return parseClass(ctx);
  if (t.value === 'try') return parseTryCatch(ctx);
  if (t.value === 'throw') return parseThrow(ctx);
  if (t.value === '}') { advance(ctx); return null; }
  if (t.value === ';') { advance(ctx); return null; }

  // Expression statement
  const expr = parseExpression(ctx);
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'ExpressionStatement', expression: expr };
}

function parseFunctionDecl(ctx, isAsync) {
  expect(ctx, 'function');
  const name = advance(ctx).value;
  expect(ctx, '(');
  const params = parseParamList(ctx);
  expect(ctx, ')');
  const body = parseBlock(ctx);
  return { type: 'FunctionDeclaration', name, params, body, async: isAsync };
}

function parseParamList(ctx) {
  const params = [];
  while (peek(ctx).value !== ')' && peek(ctx).type !== 'eof') {
    const name = advance(ctx).value;
    let defaultValue = null;
    if (peek(ctx).value === '=') {
      advance(ctx);
      defaultValue = parseExpression(ctx);
    }
    params.push({ name, defaultValue });
    if (peek(ctx).value === ',') advance(ctx);
  }
  return params;
}

function parseBlock(ctx) {
  if (peek(ctx).value !== '{') return [parseStatement(ctx)].filter(Boolean);
  expect(ctx, '{');
  const stmts = [];
  while (peek(ctx).value !== '}' && peek(ctx).type !== 'eof') {
    const stmt = parseStatement(ctx);
    if (stmt) stmts.push(stmt);
  }
  if (peek(ctx).value === '}') advance(ctx);
  return stmts;
}

function parseReturn(ctx) {
  expect(ctx, 'return');
  if (peek(ctx).value === ';' || peek(ctx).value === '}') {
    if (peek(ctx).value === ';') advance(ctx);
    return { type: 'ReturnStatement', argument: null };
  }
  const arg = parseExpression(ctx);
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'ReturnStatement', argument: arg };
}

function parseIf(ctx) {
  expect(ctx, 'if');
  expect(ctx, '(');
  const test = parseExpression(ctx);
  expect(ctx, ')');
  const consequent = parseBlock(ctx);
  let alternate = null;
  if (peek(ctx).value === 'else') {
    advance(ctx);
    if (peek(ctx).value === 'if') {
      alternate = [parseIf(ctx)];
    } else {
      alternate = parseBlock(ctx);
    }
  }
  return { type: 'IfStatement', test, consequent, alternate };
}

function parseFor(ctx) {
  expect(ctx, 'for');
  expect(ctx, '(');

  // Check for for...of / for...in
  const saved = ctx.pos;
  if (peek(ctx).value === 'const' || peek(ctx).value === 'let' || peek(ctx).value === 'var') {
    const kind = advance(ctx).value;
    const name = advance(ctx).value;
    if (peek(ctx).value === 'of' || peek(ctx).value === 'in') {
      const iterType = advance(ctx).value;
      const iterable = parseExpression(ctx);
      expect(ctx, ')');
      const body = parseBlock(ctx);
      return { type: 'ForOfStatement', kind, variable: name, iterType, iterable, body };
    }
    ctx.pos = saved; // Backtrack
  }

  // C-style for loop
  const init = parseStatement(ctx);
  const test = parseExpression(ctx);
  if (peek(ctx).value === ';') advance(ctx);
  const update = parseExpression(ctx);
  expect(ctx, ')');
  const body = parseBlock(ctx);
  return { type: 'ForStatement', init, test, update, body };
}

function parseWhile(ctx) {
  expect(ctx, 'while');
  expect(ctx, '(');
  const test = parseExpression(ctx);
  expect(ctx, ')');
  const body = parseBlock(ctx);
  return { type: 'WhileStatement', test, body };
}

function parseVarDecl(ctx) {
  const kind = advance(ctx).value;

  // Object destructuring: const { a, b } = expr
  if (peek(ctx).value === '{') {
    advance(ctx); // skip {
    const properties = [];
    while (peek(ctx).value !== '}' && peek(ctx).type !== 'eof') {
      const name = advance(ctx).value;
      properties.push(name);
      if (peek(ctx).value === ',') advance(ctx);
    }
    expect(ctx, '}');
    expect(ctx, '=');
    const init = parseExpression(ctx);
    if (peek(ctx).value === ';') advance(ctx);
    return { type: 'ObjectDestructuring', kind, properties, init };
  }

  // Array destructuring: const [x, y] = expr
  if (peek(ctx).value === '[') {
    advance(ctx); // skip [
    const elements = [];
    while (peek(ctx).value !== ']' && peek(ctx).type !== 'eof') {
      const name = advance(ctx).value;
      elements.push(name);
      if (peek(ctx).value === ',') advance(ctx);
    }
    expect(ctx, ']');
    expect(ctx, '=');
    const init = parseExpression(ctx);
    if (peek(ctx).value === ';') advance(ctx);
    return { type: 'ArrayDestructuring', kind, elements, init };
  }

  // Regular variable declaration
  const name = advance(ctx).value;
  let init = null;
  if (peek(ctx).value === '=') {
    advance(ctx);
    init = parseExpression(ctx);
  }
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'VariableDeclaration', kind, name, init };
}

function parseClass(ctx) {
  expect(ctx, 'class');
  const name = advance(ctx).value;
  let superClass = null;
  if (peek(ctx).value === 'extends') {
    advance(ctx);
    superClass = advance(ctx).value;
  }
  expect(ctx, '{');
  const methods = [];
  while (peek(ctx).value !== '}' && peek(ctx).type !== 'eof') {
    if (peek(ctx).value === ';') { advance(ctx); continue; }
    let isAsync = false;
    if (peek(ctx).value === 'async') {
      isAsync = true;
      advance(ctx);
    }
    const methodName = advance(ctx).value;
    expect(ctx, '(');
    const params = parseParamList(ctx);
    expect(ctx, ')');
    const body = parseBlock(ctx);
    methods.push({ name: methodName, params, body, async: isAsync });
  }
  if (peek(ctx).value === '}') advance(ctx);
  return { type: 'ClassDeclaration', name, superClass, methods };
}

function parseTryCatch(ctx) {
  expect(ctx, 'try');
  const block = parseBlock(ctx);
  let handler = null;
  let param = null;
  if (peek(ctx).value === 'catch') {
    advance(ctx);
    if (peek(ctx).value === '(') {
      expect(ctx, '(');
      param = advance(ctx).value;
      expect(ctx, ')');
    }
    handler = parseBlock(ctx);
  }
  let finalizer = null;
  if (peek(ctx).value === 'finally') {
    advance(ctx);
    finalizer = parseBlock(ctx);
  }
  return { type: 'TryCatchStatement', block, handler, param, finalizer };
}

function parseThrow(ctx) {
  expect(ctx, 'throw');
  const argument = parseExpression(ctx);
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'ThrowStatement', argument };
}

function parseExpression(ctx) {
  return parseTernary(ctx);
}

function parseTernary(ctx) {
  let expr = parseBinary(ctx);
  if (peek(ctx).value === '?') {
    advance(ctx);
    const consequent = parseExpression(ctx);
    expect(ctx, ':');
    const alternate = parseExpression(ctx);
    expr = { type: 'ConditionalExpression', test: expr, consequent, alternate };
  }
  return expr;
}

function parseBinary(ctx) {
  let left = parseUnary(ctx);
  const binOps = ['===', '!==', '==', '!=', '<=', '>=', '<', '>', '&&', '||', '??',
    '+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^',
    '+=', '-=', '*=', '/=', '%=', '='];
  while (binOps.includes(peek(ctx).value)) {
    const op = advance(ctx).value;
    const right = parseUnary(ctx);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseUnary(ctx) {
  if (peek(ctx).value === '!' || peek(ctx).value === '-' || peek(ctx).value === '~') {
    const op = advance(ctx).value;
    const arg = parseUnary(ctx);
    return { type: 'UnaryExpression', operator: op, argument: arg };
  }
  if (peek(ctx).value === 'typeof') {
    advance(ctx);
    const arg = parseUnary(ctx);
    return { type: 'UnaryExpression', operator: 'typeof', argument: arg };
  }
  if (peek(ctx).value === 'await') {
    advance(ctx);
    const arg = parseUnary(ctx);
    return { type: 'AwaitExpression', argument: arg };
  }
  return parsePostfix(ctx);
}

function parsePostfix(ctx) {
  let expr = parsePrimary(ctx);

  while (true) {
    if (peek(ctx).value === '(') {
      advance(ctx);
      const args = [];
      while (peek(ctx).value !== ')' && peek(ctx).type !== 'eof') {
        args.push(parseExpression(ctx));
        if (peek(ctx).value === ',') advance(ctx);
      }
      expect(ctx, ')');
      expr = { type: 'CallExpression', callee: expr, arguments: args };
    } else if (peek(ctx).value === '.') {
      advance(ctx);
      const prop = advance(ctx).value;
      expr = { type: 'MemberExpression', object: expr, property: prop };
    } else if (peek(ctx).value === '[') {
      advance(ctx);
      const prop = parseExpression(ctx);
      expect(ctx, ']');
      expr = { type: 'ComputedMemberExpression', object: expr, property: prop };
    } else if (peek(ctx).value === '++' || peek(ctx).value === '--') {
      const op = advance(ctx).value;
      expr = { type: 'UpdateExpression', operator: op, argument: expr };
    } else {
      break;
    }
  }
  return expr;
}

function parsePrimary(ctx) {
  const t = peek(ctx);

  if (t.type === 'number') { advance(ctx); return { type: 'Literal', value: Number(t.value), raw: t.value }; }
  if (t.type === 'string') { advance(ctx); return { type: 'Literal', value: t.value, raw: t.value }; }
  if (t.value === 'true') { advance(ctx); return { type: 'Literal', value: true, raw: 'true' }; }
  if (t.value === 'false') { advance(ctx); return { type: 'Literal', value: false, raw: 'false' }; }
  if (t.value === 'null') { advance(ctx); return { type: 'Literal', value: null, raw: 'null' }; }
  if (t.value === 'undefined') { advance(ctx); return { type: 'Literal', value: undefined, raw: 'undefined' }; }

  // Template literal with interpolation
  if (t.type === 'template') {
    advance(ctx);
    const raw = t.value.slice(1, -1); // strip backticks
    const quasis = [];
    const expressions = [];
    let j = 0;
    let current = '';
    while (j < raw.length) {
      if (raw[j] === '$' && j + 1 < raw.length && raw[j + 1] === '{') {
        quasis.push(current);
        current = '';
        j += 2; // skip ${
        let exprStr = '';
        let depth = 1;
        while (j < raw.length && depth > 0) {
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}') { depth--; if (depth === 0) break; }
          exprStr += raw[j++];
        }
        j++; // skip closing }
        // Parse the expression string
        const exprTokens = tokenize(exprStr);
        const exprCtx = { tokens: exprTokens, pos: 0 };
        if (exprTokens.length > 0) {
          expressions.push(parseExpression(exprCtx));
        }
      } else {
        current += raw[j++];
      }
    }
    quasis.push(current);
    return { type: 'TemplateLiteral', quasis, expressions };
  }

  // Identifier — check for single-param arrow: x => expr
  if (t.type === 'identifier') {
    advance(ctx);
    if (peek(ctx).value === '=>') {
      advance(ctx); // skip =>
      const params = [{ name: t.value, defaultValue: null }];
      if (peek(ctx).value === '{') {
        const body = parseBlock(ctx);
        return { type: 'ArrowFunction', params, body, expression: false };
      } else {
        const expr = parseExpression(ctx);
        return { type: 'ArrowFunction', params, body: [{ type: 'ReturnStatement', argument: expr }], expression: true, expressionBody: expr };
      }
    }
    return { type: 'Identifier', name: t.value };
  }

  if (t.value === 'new') {
    advance(ctx);
    const callee = parsePrimary(ctx);
    if (peek(ctx).value === '(') {
      advance(ctx);
      const args = [];
      while (peek(ctx).value !== ')' && peek(ctx).type !== 'eof') {
        args.push(parseExpression(ctx));
        if (peek(ctx).value === ',') advance(ctx);
      }
      expect(ctx, ')');
      return { type: 'NewExpression', callee, arguments: args };
    }
    return { type: 'NewExpression', callee, arguments: [] };
  }

  // Array literal
  if (t.value === '[') {
    advance(ctx);
    const elements = [];
    while (peek(ctx).value !== ']' && peek(ctx).type !== 'eof') {
      if (peek(ctx).value === '...') {
        advance(ctx);
        elements.push({ type: 'SpreadElement', argument: parseExpression(ctx) });
      } else {
        elements.push(parseExpression(ctx));
      }
      if (peek(ctx).value === ',') advance(ctx);
    }
    expect(ctx, ']');
    return { type: 'ArrayExpression', elements };
  }

  // Object literal
  if (t.value === '{') {
    advance(ctx);
    const properties = [];
    while (peek(ctx).value !== '}' && peek(ctx).type !== 'eof') {
      const key = advance(ctx).value;
      if (peek(ctx).value === ':') {
        advance(ctx);
        const value = parseExpression(ctx);
        properties.push({ key, value });
      } else {
        properties.push({ key, value: { type: 'Identifier', name: key } });
      }
      if (peek(ctx).value === ',') advance(ctx);
    }
    expect(ctx, '}');
    return { type: 'ObjectExpression', properties };
  }

  // Parenthesized expression or arrow function: (params) => body
  if (t.value === '(') {
    const saved = ctx.pos;
    advance(ctx); // skip (
    const params = [];
    let couldBeArrow = true;

    while (peek(ctx).value !== ')' && peek(ctx).type !== 'eof') {
      if (peek(ctx).type === 'identifier') {
        const name = advance(ctx).value;
        let defaultValue = null;
        if (peek(ctx).value === '=') {
          advance(ctx);
          defaultValue = parseExpression(ctx);
        }
        params.push({ name, defaultValue });
        if (peek(ctx).value === ',') advance(ctx);
      } else {
        couldBeArrow = false;
        break;
      }
    }

    if (couldBeArrow && peek(ctx).value === ')') {
      advance(ctx); // skip )
      if (peek(ctx).value === '=>') {
        advance(ctx); // skip =>
        if (peek(ctx).value === '{') {
          const body = parseBlock(ctx);
          return { type: 'ArrowFunction', params, body, expression: false };
        } else {
          const expr = parseExpression(ctx);
          return { type: 'ArrowFunction', params, body: [{ type: 'ReturnStatement', argument: expr }], expression: true, expressionBody: expr };
        }
      }
    }

    // Not an arrow function — backtrack and parse as parenthesized expression
    ctx.pos = saved;
    advance(ctx); // skip (
    const expr = parseExpression(ctx);
    expect(ctx, ')');
    return expr;
  }

  // Fallback — skip unknown token
  advance(ctx);
  return { type: 'Unknown', value: t.value };
}


module.exports = { parseJS, tokenize };
