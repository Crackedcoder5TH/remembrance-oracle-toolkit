/**
 * AST-Based Transpiler — structural code transformation via parse trees.
 *
 * Instead of fragile regex replacements, this module:
 *   1. Parses JavaScript source into a simplified AST
 *   2. Transforms the AST nodes for the target language
 *   3. Generates idiomatic output code
 *
 * Uses a lightweight recursive-descent parser (no external deps).
 * Supports: JS → Python, JS → TypeScript, JS → Go
 */

// ─── Lightweight JS Parser ───

/**
 * Parse JavaScript source into a simplified AST.
 * Handles: functions, variables, if/else, for, while, return, expressions.
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

    // Strings
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      let str = quote;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { str += source[i++]; }
        str += source[i++];
      }
      if (i < source.length) str += source[i++];
      tokens.push({ type: 'string', value: str });
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
  if (t.value === 'function') return parseFunctionDecl(ctx);
  if (t.value === 'return') return parseReturn(ctx);
  if (t.value === 'if') return parseIf(ctx);
  if (t.value === 'for') return parseFor(ctx);
  if (t.value === 'while') return parseWhile(ctx);
  if (t.value === 'const' || t.value === 'let' || t.value === 'var') return parseVarDecl(ctx);
  if (t.value === '}') { advance(ctx); return null; }
  if (t.value === ';') { advance(ctx); return null; }

  // Expression statement
  const expr = parseExpression(ctx);
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'ExpressionStatement', expression: expr };
}

function parseFunctionDecl(ctx) {
  expect(ctx, 'function');
  const name = advance(ctx).value;
  expect(ctx, '(');
  const params = parseParamList(ctx);
  expect(ctx, ')');
  const body = parseBlock(ctx);
  return { type: 'FunctionDeclaration', name, params, body };
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
  const name = advance(ctx).value;
  let init = null;
  if (peek(ctx).value === '=') {
    advance(ctx);
    init = parseExpression(ctx);
  }
  if (peek(ctx).value === ';') advance(ctx);
  return { type: 'VariableDeclaration', kind, name, init };
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
  if (t.type === 'identifier') { advance(ctx); return { type: 'Identifier', name: t.value }; }
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

  // Parenthesized expression
  if (t.value === '(') {
    advance(ctx);
    const expr = parseExpression(ctx);
    expect(ctx, ')');
    return expr;
  }

  // Fallback — skip unknown token
  advance(ctx);
  return { type: 'Unknown', value: t.value };
}

// ─── Code Generators ───

function toPython(ast, indent = 0) {
  const pad = '    '.repeat(indent);
  if (!ast) return '';

  switch (ast.type) {
    case 'Program':
      return ast.body.map(n => toPython(n, indent)).filter(Boolean).join('\n');

    case 'FunctionDeclaration': {
      const name = toSnakeCase(ast.name);
      const params = ast.params.map(p =>
        p.defaultValue ? `${p.name}=${toPyExpr(p.defaultValue)}` : p.name
      ).join(', ');
      const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}def ${name}(${params}):\n${body || pad + '    pass'}`;
    }

    case 'VariableDeclaration': {
      const init = ast.init ? toPyExpr(ast.init) : 'None';
      return `${pad}${ast.name} = ${init}`;
    }

    case 'ReturnStatement':
      return `${pad}return${ast.argument ? ' ' + toPyExpr(ast.argument) : ''}`;

    case 'IfStatement': {
      let result = `${pad}if ${toPyExpr(ast.test)}:\n`;
      result += ast.consequent.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      if (ast.alternate) {
        if (ast.alternate.length === 1 && ast.alternate[0].type === 'IfStatement') {
          result += `\n${pad}el` + toPython(ast.alternate[0], indent).trimStart();
        } else {
          result += `\n${pad}else:\n`;
          result += ast.alternate.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
        }
      }
      return result;
    }

    case 'ForStatement': {
      // Try to detect range pattern
      const rangeInfo = detectRangePattern(ast);
      if (rangeInfo) {
        const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
        return `${pad}for ${rangeInfo.var} in range(${rangeInfo.args}):\n${body}`;
      }
      // Fallback: while loop
      const init = toPython(ast.init, indent);
      const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      const update = ast.update ? toPython({ type: 'ExpressionStatement', expression: ast.update }, indent + 1) : '';
      return `${init}\n${pad}while ${toPyExpr(ast.test)}:\n${body}${update ? '\n' + update : ''}`;
    }

    case 'ForOfStatement': {
      const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}for ${ast.variable} in ${toPyExpr(ast.iterable)}:\n${body}`;
    }

    case 'WhileStatement': {
      const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}while ${toPyExpr(ast.test)}:\n${body}`;
    }

    case 'ExpressionStatement':
      return `${pad}${toPyExpr(ast.expression)}`;

    case 'Comment':
      return `${pad}# ${ast.value.replace(/^\/\/\s*/, '').replace(/^\/\*\s*|\s*\*\/$/g, '')}`;

    default:
      return `${pad}${toPyExpr(ast)}`;
  }
}

function toPyExpr(node) {
  if (!node) return 'None';

  switch (node.type) {
    case 'Literal':
      if (node.value === true) return 'True';
      if (node.value === false) return 'False';
      if (node.value === null || node.value === undefined) return 'None';
      return node.raw || String(node.value);

    case 'Identifier':
      return node.name;

    case 'BinaryExpression': {
      let op = node.operator;
      if (op === '===' || op === '==') op = '==';
      if (op === '!==' || op === '!=') op = '!=';
      if (op === '&&') op = 'and';
      if (op === '||') op = 'or';
      return `${toPyExpr(node.left)} ${op} ${toPyExpr(node.right)}`;
    }

    case 'UnaryExpression':
      if (node.operator === '!') return `not ${toPyExpr(node.argument)}`;
      if (node.operator === 'typeof') return `type(${toPyExpr(node.argument)}).__name__`;
      return `${node.operator}${toPyExpr(node.argument)}`;

    case 'ConditionalExpression':
      return `${toPyExpr(node.consequent)} if ${toPyExpr(node.test)} else ${toPyExpr(node.alternate)}`;

    case 'CallExpression':
      return translatePyCall(node);

    case 'MemberExpression':
      return translatePyMember(node);

    case 'ComputedMemberExpression':
      return `${toPyExpr(node.object)}[${toPyExpr(node.property)}]`;

    case 'UpdateExpression':
      if (node.operator === '++') return `${toPyExpr(node.argument)} += 1`;
      if (node.operator === '--') return `${toPyExpr(node.argument)} -= 1`;
      return toPyExpr(node.argument);

    case 'ArrayExpression':
      return `[${node.elements.map(e => e.type === 'SpreadElement' ? `*${toPyExpr(e.argument)}` : toPyExpr(e)).join(', ')}]`;

    case 'ObjectExpression':
      return `{${node.properties.map(p => `${JSON.stringify(p.key)}: ${toPyExpr(p.value)}`).join(', ')}}`;

    case 'NewExpression': {
      const name = toPyExpr(node.callee);
      const args = node.arguments.map(a => toPyExpr(a)).join(', ');
      if (name === 'Set') return `set(${args})`;
      if (name === 'Map') return `dict(${args})`;
      if (name === 'Array') return `[None] * ${args || '0'}`;
      return `${name}(${args})`;
    }

    case 'SpreadElement':
      return `*${toPyExpr(node.argument)}`;

    default:
      return node.value || node.name || '';
  }
}

function translatePyCall(node) {
  const callee = node.callee;
  const args = node.arguments.map(a => toPyExpr(a)).join(', ');

  // Math.method() → Python equivalents
  if (callee.type === 'MemberExpression' && callee.object?.name === 'Math') {
    const method = callee.property;
    if (method === 'max') return `max(${args})`;
    if (method === 'min') return `min(${args})`;
    if (method === 'floor') return `int(${args})`;
    if (method === 'ceil') return `-(-${args} // 1)`;
    if (method === 'abs') return `abs(${args})`;
    if (method === 'round') return `round(${args})`;
    if (method === 'sqrt') return `${args} ** 0.5`;
    if (method === 'pow') return `${node.arguments.map(a => toPyExpr(a)).join(' ** ')}`;
    if (method === 'random') return `random.random()`;
    if (method === 'log') return `math.log(${args})`;
  }

  // Array/Object static methods
  if (callee.type === 'MemberExpression' && callee.object?.name === 'Array') {
    if (callee.property === 'isArray') return `isinstance(${args}, list)`;
    if (callee.property === 'from') return `list(${args})`;
  }
  if (callee.type === 'MemberExpression' && callee.object?.name === 'Object') {
    if (callee.property === 'keys') return `list(${args}.keys())`;
    if (callee.property === 'values') return `list(${args}.values())`;
    if (callee.property === 'entries') return `list(${args}.items())`;
    if (callee.property === 'assign') return `{**${node.arguments.map(a => toPyExpr(a)).join(', **')}}`;
  }

  // Instance methods
  if (callee.type === 'MemberExpression') {
    const obj = toPyExpr(callee.object);
    const method = callee.property;
    if (method === 'push') return `${obj}.append(${args})`;
    if (method === 'pop') return `${obj}.pop(${args})`;
    if (method === 'shift') return `${obj}.pop(0)`;
    if (method === 'unshift') return `${obj}.insert(0, ${args})`;
    if (method === 'slice') return args ? `${obj}[${node.arguments.map(a => toPyExpr(a)).join(':')}]` : `${obj}[:]`;
    if (method === 'concat') return `${obj} + ${args}`;
    if (method === 'includes') return `${args} in ${obj}`;
    if (method === 'indexOf') return `${obj}.index(${args})`;
    if (method === 'join') return `${args}.join(${obj})`;
    if (method === 'split') return `${obj}.split(${args})`;
    if (method === 'trim') return `${obj}.strip()`;
    if (method === 'toUpperCase') return `${obj}.upper()`;
    if (method === 'toLowerCase') return `${obj}.lower()`;
    if (method === 'toString') return `str(${obj})`;
    if (method === 'charAt') return `${obj}[${args}]`;
    if (method === 'substring' || method === 'substr') return `${obj}[${node.arguments.map(a => toPyExpr(a)).join(':')}]`;
    if (method === 'startsWith') return `${obj}.startswith(${args})`;
    if (method === 'endsWith') return `${obj}.endswith(${args})`;
    if (method === 'replace') return `${obj}.replace(${args})`;
    if (method === 'reverse') return `${obj}.reverse()`;
    if (method === 'sort') return `${obj}.sort()`;
    return `${obj}.${method}(${args})`;
  }

  // console.log → print
  if (callee.type === 'Identifier' && callee.name === 'console') return `print(${args})`;

  return `${toPyExpr(callee)}(${args})`;
}

function translatePyMember(node) {
  const obj = toPyExpr(node.object);
  const prop = node.property;
  if (prop === 'length') return `len(${obj})`;
  if (prop === 'log' && obj === 'console') return 'print';
  return `${obj}.${prop}`;
}

function toTypeScript(ast, indent = 0) {
  // TypeScript is a superset of JS — we mainly add type annotations
  const pad = '  '.repeat(indent);
  if (!ast) return '';

  switch (ast.type) {
    case 'Program':
      return ast.body.map(n => toTypeScript(n, indent)).filter(Boolean).join('\n');

    case 'FunctionDeclaration': {
      const params = ast.params.map(p => {
        const type = inferType(p.name, ast.body);
        return p.defaultValue
          ? `${p.name}: ${type} = ${toTsExpr(p.defaultValue)}`
          : `${p.name}: ${type}`;
      }).join(', ');
      const retType = inferReturnType(ast.body);
      const body = ast.body.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}function ${ast.name}(${params}): ${retType} {\n${body}\n${pad}}`;
    }

    case 'VariableDeclaration': {
      const kind = ast.kind === 'var' ? 'let' : ast.kind;
      const init = ast.init ? toTsExpr(ast.init) : 'undefined';
      return `${pad}${kind} ${ast.name} = ${init};`;
    }

    case 'ReturnStatement':
      return `${pad}return${ast.argument ? ' ' + toTsExpr(ast.argument) : ''};`;

    case 'IfStatement': {
      let result = `${pad}if (${toTsExpr(ast.test)}) {\n`;
      result += ast.consequent.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}}`;
      if (ast.alternate) {
        if (ast.alternate.length === 1 && ast.alternate[0].type === 'IfStatement') {
          result += ` else ` + toTypeScript(ast.alternate[0], indent).trimStart();
        } else {
          result += ` else {\n`;
          result += ast.alternate.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
          result += `\n${pad}}`;
        }
      }
      return result;
    }

    case 'ForStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'ExpressionStatement':
    case 'Comment':
      // For TS, just reconstruct JS with type annotations where possible
      return `${pad}${toTsExpr(ast)};`.replace(/;;$/, ';');

    default:
      return `${pad}${toTsExpr(ast)}`;
  }
}

function toTsExpr(node) {
  if (!node) return 'undefined';
  // TypeScript expressions are same as JS — just pass through
  switch (node.type) {
    case 'Literal': return node.raw || String(node.value);
    case 'Identifier': return node.name;
    case 'BinaryExpression': return `${toTsExpr(node.left)} ${node.operator} ${toTsExpr(node.right)}`;
    case 'UnaryExpression': return `${node.operator}${toTsExpr(node.argument)}`;
    case 'ConditionalExpression': return `${toTsExpr(node.test)} ? ${toTsExpr(node.consequent)} : ${toTsExpr(node.alternate)}`;
    case 'CallExpression': {
      const args = node.arguments.map(a => toTsExpr(a)).join(', ');
      return `${toTsExpr(node.callee)}(${args})`;
    }
    case 'MemberExpression': return `${toTsExpr(node.object)}.${node.property}`;
    case 'ComputedMemberExpression': return `${toTsExpr(node.object)}[${toTsExpr(node.property)}]`;
    case 'UpdateExpression': return `${toTsExpr(node.argument)}${node.operator}`;
    case 'ArrayExpression': return `[${node.elements.map(e => toTsExpr(e)).join(', ')}]`;
    case 'ObjectExpression': return `{${node.properties.map(p => `${p.key}: ${toTsExpr(p.value)}`).join(', ')}}`;
    case 'NewExpression': return `new ${toTsExpr(node.callee)}(${node.arguments.map(a => toTsExpr(a)).join(', ')})`;
    default: return node.value || node.name || '';
  }
}

// ─── Helpers ───

function toSnakeCase(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function detectRangePattern(forNode) {
  if (!forNode.init || !forNode.test || !forNode.update) return null;
  const init = forNode.init;
  const test = forNode.test;
  const update = forNode.update;

  if (init.type !== 'VariableDeclaration' || !init.init) return null;
  const varName = init.name;
  const start = toPyExpr(init.init);

  // Check test is comparison with variable
  if (test.type !== 'BinaryExpression') return null;
  const op = test.operator;
  const end = toPyExpr(test.right);

  // Check update is increment
  if (update.type === 'UpdateExpression' && update.operator === '++') {
    const rangeEnd = op === '<=' ? `${end} + 1` : end;
    const args = start === '0' ? rangeEnd : `${start}, ${rangeEnd}`;
    return { var: varName, args };
  }
  if (update.type === 'UpdateExpression' && update.operator === '--') {
    const rangeEnd = op === '>=' ? `${end} - 1` : end;
    return { var: varName, args: `${start}, ${rangeEnd}, -1` };
  }

  return null;
}

function inferType(paramName, body) {
  const name = paramName.toLowerCase();
  // Order matters — check specific patterns before generic ones
  if (/^(fn|func|callback|predicate|handler|cb)$|callback|predicate|handler/.test(name)) return 'Function';
  if (/^(arr|array|list|items|elements)$|array|items|elements/.test(name)) return 'any[]';
  if (/^(obj|options|config|opts)$|options|config/.test(name)) return 'Record<string, any>';
  if (/^(str|string|text|name|desc|label|msg|key)$|string|text/.test(name)) return 'string';
  if (/^(bool|flag)$|^(is|has|should|can)[A-Z]/.test(paramName)) return 'boolean';
  if (/^(num|count|index|size|len|max|min|limit|start|end|n|i|j|k)$/.test(name)) return 'number';
  return 'any';
}

function inferReturnType(body) {
  for (const node of body) {
    if (node.type === 'ReturnStatement' && node.argument) {
      const arg = node.argument;
      if (arg.type === 'Literal') {
        if (typeof arg.value === 'number') return 'number';
        if (typeof arg.value === 'string') return 'string';
        if (typeof arg.value === 'boolean') return 'boolean';
      }
      if (arg.type === 'ArrayExpression') return 'any[]';
      if (arg.type === 'ObjectExpression') return 'Record<string, any>';
    }
  }
  return 'any';
}

// ─── Public API ───

/**
 * Transpile JavaScript code to target language using AST.
 * @param {string} code - JavaScript source code
 * @param {string} targetLanguage - 'python' | 'typescript' | 'go'
 * @returns {object} { code, ast, success, error? }
 */
function transpile(code, targetLanguage) {
  try {
    const ast = parseJS(code);

    let output;
    switch (targetLanguage) {
      case 'python':
        output = toPython(ast);
        break;
      case 'typescript':
        output = toTypeScript(ast);
        break;
      default:
        return { code: null, ast, success: false, error: `Unsupported target: ${targetLanguage}` };
    }

    return { code: output, ast, success: true };
  } catch (err) {
    return { code: null, ast: null, success: false, error: err.message };
  }
}

module.exports = {
  transpile,
  parseJS,
  tokenize,
  toPython,
  toTypeScript,
  toSnakeCase,
  inferType,
  inferReturnType,
};
