/**
 * AST-Based Transpiler — structural code transformation via parse trees.
 *
 * Instead of fragile regex replacements, this module:
 *   1. Parses JavaScript source into a simplified AST (see ast-parser.js)
 *   2. Transforms the AST nodes for the target language
 *   3. Generates idiomatic output code
 *
 * Parser extracted to ast-parser.js for maintainability.
 * Supports: JS → Python, JS → TypeScript, JS → Go, JS → Rust
 */

const { parseJS, tokenize } = require('./ast-parser');

// ─── Code Generators ───

function toPython(ast, indent = 0) {
  const pad = '    '.repeat(indent);
  if (!ast) return '';

  switch (ast.type) {
    case 'Program':
      return ast.body.map(n => toPython(n, indent)).filter(Boolean).join('\n');

    case 'FunctionDeclaration': {
      const asyncPrefix = ast.async ? 'async ' : '';
      const name = toSnakeCase(ast.name);
      const params = ast.params.map(p =>
        p.defaultValue ? `${p.name}=${toPyExpr(p.defaultValue)}` : p.name
      ).join(', ');
      const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}${asyncPrefix}def ${name}(${params}):\n${body || pad + '    pass'}`;
    }

    case 'VariableDeclaration': {
      // Handle block-body arrow functions as def + assignment
      if (ast.init && ast.init.type === 'ArrowFunction' && !ast.init.expression) {
        const arrowParams = ast.init.params.map(p =>
          p.defaultValue ? `${p.name}=${toPyExpr(p.defaultValue)}` : p.name
        ).join(', ');
        const body = ast.init.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
        return `${pad}def _anon(${arrowParams}):\n${body || pad + '    pass'}\n${pad}${ast.name} = _anon`;
      }
      const init = ast.init ? toPyExpr(ast.init) : 'None';
      return `${pad}${ast.name} = ${init}`;
    }

    case 'ObjectDestructuring': {
      const names = ast.properties.join(', ');
      const obj = toPyExpr(ast.init);
      const values = ast.properties.map(p => `${obj}[${JSON.stringify(p)}]`).join(', ');
      return `${pad}${names} = ${values}`;
    }

    case 'ArrayDestructuring': {
      const names = ast.elements.join(', ');
      return `${pad}${names} = ${toPyExpr(ast.init)}`;
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

    case 'ClassDeclaration': {
      const superPart = ast.superClass ? `(${ast.superClass})` : '';
      let result = `${pad}class ${ast.name}${superPart}:\n`;
      if (ast.methods.length === 0) {
        result += `${pad}    pass`;
      } else {
        result += ast.methods.map(m => {
          const isInit = m.name === 'constructor';
          const methodName = isInit ? '__init__' : toSnakeCase(m.name);
          const asyncPrefix = m.async ? 'async ' : '';
          const methodParams = ['self', ...m.params.map(p =>
            p.defaultValue ? `${p.name}=${toPyExpr(p.defaultValue)}` : p.name
          )].join(', ');
          const body = m.body.map(n => toPython(n, indent + 2)).filter(Boolean).join('\n');
          return `${pad}    ${asyncPrefix}def ${methodName}(${methodParams}):\n${body || pad + '        pass'}`;
        }).join('\n\n');
      }
      return result;
    }

    case 'TryCatchStatement': {
      let result = `${pad}try:\n`;
      result += ast.block.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      if (ast.handler) {
        const param = ast.param ? ` as ${ast.param}` : '';
        result += `\n${pad}except Exception${param}:\n`;
        result += ast.handler.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      }
      if (ast.finalizer) {
        result += `\n${pad}finally:\n`;
        result += ast.finalizer.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
      }
      return result;
    }

    case 'ThrowStatement': {
      const arg = ast.argument;
      if (arg && arg.type === 'NewExpression') {
        const name = arg.callee.name || toPyExpr(arg.callee);
        const pyName = name === 'Error' ? 'Exception' : name;
        const args = arg.arguments.map(a => toPyExpr(a)).join(', ');
        return `${pad}raise ${pyName}(${args})`;
      }
      return `${pad}raise ${toPyExpr(ast.argument)}`;
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
      if (node.name === 'this') return 'self';
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
      if (name === 'Error') return `Exception(${args})`;
      return `${name}(${args})`;
    }

    case 'SpreadElement':
      return `*${toPyExpr(node.argument)}`;

    case 'AwaitExpression':
      return `await ${toPyExpr(node.argument)}`;

    case 'ArrowFunction': {
      const params = node.params.map(p => p.name).join(', ');
      if (node.expression && node.expressionBody) {
        return params ? `lambda ${params}: ${toPyExpr(node.expressionBody)}` : `lambda: ${toPyExpr(node.expressionBody)}`;
      }
      // Block body with single return → lambda
      if (node.body.length === 1 && node.body[0].type === 'ReturnStatement' && node.body[0].argument) {
        return params ? `lambda ${params}: ${toPyExpr(node.body[0].argument)}` : `lambda: ${toPyExpr(node.body[0].argument)}`;
      }
      return params ? `lambda ${params}: None` : `lambda: None`;
    }

    case 'TemplateLiteral': {
      let result = 'f"';
      for (let i = 0; i < node.quasis.length; i++) {
        result += node.quasis[i];
        if (i < node.expressions.length) {
          result += `{${toPyExpr(node.expressions[i])}}`;
        }
      }
      result += '"';
      return result;
    }

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
      const asyncPrefix = ast.async ? 'async ' : '';
      const params = ast.params.map(p => {
        const type = inferType(p.name, ast.body);
        return p.defaultValue
          ? `${p.name}: ${type} = ${toTsExpr(p.defaultValue)}`
          : `${p.name}: ${type}`;
      }).join(', ');
      const retType = inferReturnType(ast.body);
      const wrappedRetType = ast.async ? `Promise<${retType}>` : retType;
      const body = ast.body.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}${asyncPrefix}function ${ast.name}(${params}): ${wrappedRetType} {\n${body}\n${pad}}`;
    }

    case 'VariableDeclaration': {
      const kind = ast.kind === 'var' ? 'let' : ast.kind;
      const init = ast.init ? toTsExpr(ast.init) : 'undefined';
      return `${pad}${kind} ${ast.name} = ${init};`;
    }

    case 'ObjectDestructuring': {
      const kind = ast.kind === 'var' ? 'let' : ast.kind;
      return `${pad}${kind} { ${ast.properties.join(', ')} } = ${toTsExpr(ast.init)};`;
    }

    case 'ArrayDestructuring': {
      const kind = ast.kind === 'var' ? 'let' : ast.kind;
      return `${pad}${kind} [${ast.elements.join(', ')}] = ${toTsExpr(ast.init)};`;
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

    case 'ClassDeclaration': {
      const extPart = ast.superClass ? ` extends ${ast.superClass}` : '';
      let result = `${pad}class ${ast.name}${extPart} {\n`;
      const methodStrs = ast.methods.map(m => {
        const asyncPrefix = m.async ? 'async ' : '';
        const params = m.params.map(p => {
          const type = inferType(p.name, m.body);
          return p.defaultValue ? `${p.name}: ${type} = ${toTsExpr(p.defaultValue)}` : `${p.name}: ${type}`;
        }).join(', ');
        const body = m.body.map(n => toTypeScript(n, indent + 2)).filter(Boolean).join('\n');
        return `${pad}  ${asyncPrefix}${m.name}(${params}) {\n${body}\n${pad}  }`;
      });
      result += methodStrs.join('\n\n');
      result += `\n${pad}}`;
      return result;
    }

    case 'TryCatchStatement': {
      let result = `${pad}try {\n`;
      result += ast.block.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}}`;
      if (ast.handler) {
        const param = ast.param ? ` (${ast.param}: unknown)` : '';
        result += ` catch${param} {\n`;
        result += ast.handler.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
        result += `\n${pad}}`;
      }
      if (ast.finalizer) {
        result += ` finally {\n`;
        result += ast.finalizer.map(n => toTypeScript(n, indent + 1)).filter(Boolean).join('\n');
        result += `\n${pad}}`;
      }
      return result;
    }

    case 'ThrowStatement':
      return `${pad}throw ${toTsExpr(ast.argument)};`;

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
    case 'SpreadElement': return `...${toTsExpr(node.argument)}`;
    case 'AwaitExpression': return `await ${toTsExpr(node.argument)}`;
    case 'ArrowFunction': {
      const params = node.params.map(p => p.name).join(', ');
      if (node.expression && node.expressionBody) {
        return `(${params}) => ${toTsExpr(node.expressionBody)}`;
      }
      const body = node.body.map(n => toTypeScript(n, 1)).filter(Boolean).join('\n');
      return `(${params}) => {\n${body}\n}`;
    }
    case 'TemplateLiteral': {
      let result = '`';
      for (let i = 0; i < node.quasis.length; i++) {
        result += node.quasis[i];
        if (i < node.expressions.length) {
          result += `\${${toTsExpr(node.expressions[i])}}`;
        }
      }
      result += '`';
      return result;
    }
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

// ─── Go Code Generator ───

function toGo(ast, indent = 0) {
  const pad = '\t'.repeat(indent);
  if (!ast) return '';

  switch (ast.type) {
    case 'Program': {
      const fns = ast.body.map(n => toGo(n, indent)).filter(Boolean).join('\n\n');
      return `package main\n\n${fns}`;
    }

    case 'FunctionDeclaration': {
      const params = ast.params.map(p => `${p.name} ${inferGoType(p.name, ast.body)}`).join(', ');
      const retType = inferGoReturnType(ast.body);
      const retStr = retType ? ' ' + retType : '';
      const body = ast.body.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}func ${ast.name}(${params})${retStr} {\n${body}\n${pad}}`;
    }

    case 'VariableDeclaration': {
      const init = ast.init ? toGoExpr(ast.init) : goZeroValue(ast.name);
      if (ast.kind === 'const') return `${pad}const ${ast.name} = ${init}`;
      return `${pad}${ast.name} := ${init}`;
    }

    case 'ReturnStatement':
      return `${pad}return ${ast.argument ? toGoExpr(ast.argument) : ''}`;

    case 'IfStatement': {
      let result = `${pad}if ${toGoExpr(ast.test)} {\n`;
      result += ast.consequent.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}}`;
      if (ast.alternate) {
        if (ast.alternate.length === 1 && ast.alternate[0].type === 'IfStatement') {
          result += ' else ' + toGo(ast.alternate[0], indent).trimStart();
        } else {
          result += ` else {\n`;
          result += ast.alternate.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
          result += `\n${pad}}`;
        }
      }
      return result;
    }

    case 'ForStatement': {
      const init = ast.init ? toGoForInit(ast.init) : '';
      const test = ast.test ? toGoExpr(ast.test) : '';
      const update = ast.update ? toGoExpr(ast.update) : '';
      const body = ast.body.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}for ${init}; ${test}; ${update} {\n${body}\n${pad}}`;
    }

    case 'ForOfStatement': {
      const body = ast.body.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}for _, ${ast.variable} := range ${toGoExpr(ast.iterable)} {\n${body}\n${pad}}`;
    }

    case 'WhileStatement': {
      const body = ast.body.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}for ${toGoExpr(ast.test)} {\n${body}\n${pad}}`;
    }

    case 'TryCatchStatement': {
      // Go has no try/catch — use func + recover pattern
      let result = `${pad}func() {\n`;
      result += `${pad}\tdefer func() {\n`;
      if (ast.handler) {
        result += `${pad}\t\tif r := recover(); r != nil {\n`;
        if (ast.param) result += `${pad}\t\t\t${ast.param} := r\n`;
        result += ast.handler.map(n => toGo(n, indent + 3)).filter(Boolean).join('\n');
        result += `\n${pad}\t\t}\n`;
      } else {
        result += `${pad}\t\trecover()\n`;
      }
      result += `${pad}\t}()\n`;
      result += ast.block.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}}()`;
      return result;
    }

    case 'ThrowStatement':
      return `${pad}panic(${toGoExpr(ast.argument)})`;

    case 'ClassDeclaration': {
      // Go uses structs + methods
      let result = `${pad}type ${ast.name} struct {}\n`;
      for (const m of ast.methods) {
        const methodName = m.name === 'constructor' ? 'New' + ast.name : m.name.charAt(0).toUpperCase() + m.name.slice(1);
        const isInit = m.name === 'constructor';
        const receiver = isInit ? '' : `(s *${ast.name}) `;
        const params = (isInit ? m.params : m.params).map(p => `${p.name} ${inferGoType(p.name, m.body)}`).join(', ');
        const retType = isInit ? `*${ast.name}` : inferGoReturnType(m.body);
        const retStr = retType ? ' ' + retType : '';
        const body = m.body.map(n => toGo(n, indent + 1)).filter(Boolean).join('\n');
        result += `\n${pad}func ${receiver}${methodName}(${params})${retStr} {\n${body}\n${pad}}`;
      }
      return result;
    }

    case 'ExpressionStatement':
      return `${pad}${toGoExpr(ast.expression)}`;

    case 'Comment':
      return `${pad}// ${ast.value.replace(/^\/\/\s*/, '').replace(/^\/\*\s*|\s*\*\/$/g, '')}`;

    default:
      return `${pad}${toGoExpr(ast)}`;
  }
}

function toGoExpr(node) {
  if (!node) return '""';

  switch (node.type) {
    case 'Literal':
      if (node.value === true) return 'true';
      if (node.value === false) return 'false';
      if (node.value === null || node.value === undefined) return 'nil';
      return node.raw || String(node.value);

    case 'Identifier':
      if (node.name === 'this') return 's';
      if (node.name === 'undefined' || node.name === 'null') return 'nil';
      return node.name;

    case 'BinaryExpression': {
      let op = node.operator;
      if (op === '===' || op === '==') op = '==';
      if (op === '!==' || op === '!=') op = '!=';
      if (op === '&&') op = '&&';
      if (op === '||') op = '||';
      return `${toGoExpr(node.left)} ${op} ${toGoExpr(node.right)}`;
    }

    case 'UnaryExpression':
      if (node.operator === '!') return `!${toGoExpr(node.argument)}`;
      return `${node.operator}${toGoExpr(node.argument)}`;

    case 'ConditionalExpression':
      // Go has no ternary — use helper comment
      return `/* ternary */ func() interface{} { if ${toGoExpr(node.test)} { return ${toGoExpr(node.consequent)} }; return ${toGoExpr(node.alternate)} }()`;

    case 'CallExpression':
      return translateGoCall(node);

    case 'MemberExpression':
      return translateGoMember(node);

    case 'ComputedMemberExpression':
      return `${toGoExpr(node.object)}[${toGoExpr(node.property)}]`;

    case 'UpdateExpression':
      if (node.operator === '++') return `${toGoExpr(node.argument)}++`;
      if (node.operator === '--') return `${toGoExpr(node.argument)}--`;
      return toGoExpr(node.argument);

    case 'ArrayExpression':
      return `[]interface{}{${node.elements.map(e => toGoExpr(e)).join(', ')}}`;

    case 'ObjectExpression':
      return `map[string]interface{}{${node.properties.map(p => `"${p.key}": ${toGoExpr(p.value)}`).join(', ')}}`;

    case 'NewExpression':
      return `&${toGoExpr(node.callee)}{${node.arguments.map(a => toGoExpr(a)).join(', ')}}`;

    case 'SpreadElement':
      return `${toGoExpr(node.argument)}...`;

    case 'AwaitExpression':
      return `<-${toGoExpr(node.argument)}`;

    case 'ArrowFunction': {
      const params = node.params.map(p => `${p.name} interface{}`).join(', ');
      if (node.expression && node.expressionBody) {
        return `func(${params}) interface{} { return ${toGoExpr(node.expressionBody)} }`;
      }
      const body = node.body.map(n => toGo(n, 1)).filter(Boolean).join('\n');
      return `func(${params}) interface{} {\n${body}\n}`;
    }

    case 'TemplateLiteral': {
      const parts = [];
      const args = [];
      for (let i = 0; i < node.quasis.length; i++) {
        parts.push(node.quasis[i].replace(/%/g, '%%'));
        if (i < node.expressions.length) {
          parts.push('%v');
          args.push(toGoExpr(node.expressions[i]));
        }
      }
      return `fmt.Sprintf("${parts.join('')}", ${args.join(', ')})`;
    }

    case 'AssignmentExpression':
      return `${toGoExpr(node.left)} ${node.operator} ${toGoExpr(node.right)}`;

    default:
      return node.value || node.name || '';
  }
}

function translateGoCall(node) {
  const callee = node.callee;
  const args = node.arguments.map(a => toGoExpr(a)).join(', ');

  if (callee.type === 'MemberExpression') {
    const obj = toGoExpr(callee.object);
    const method = callee.property;

    // console.log → fmt.Println
    if (callee.object?.name === 'console' && method === 'log') return `fmt.Println(${args})`;

    // Math methods
    if (callee.object?.name === 'Math') {
      if (method === 'max') return `max(${args})`;
      if (method === 'min') return `min(${args})`;
      if (method === 'floor') return `math.Floor(${args})`;
      if (method === 'ceil') return `math.Ceil(${args})`;
      if (method === 'abs') return `math.Abs(${args})`;
      if (method === 'round') return `math.Round(${args})`;
      if (method === 'sqrt') return `math.Sqrt(${args})`;
      if (method === 'pow') return `math.Pow(${args})`;
      if (method === 'random') return `rand.Float64()`;
      if (method === 'log') return `math.Log(${args})`;
    }

    // String methods
    if (method === 'includes') return `strings.Contains(${obj}, ${args})`;
    if (method === 'startsWith') return `strings.HasPrefix(${obj}, ${args})`;
    if (method === 'endsWith') return `strings.HasSuffix(${obj}, ${args})`;
    if (method === 'toUpperCase') return `strings.ToUpper(${obj})`;
    if (method === 'toLowerCase') return `strings.ToLower(${obj})`;
    if (method === 'trim') return `strings.TrimSpace(${obj})`;
    if (method === 'split') return `strings.Split(${obj}, ${args})`;
    if (method === 'replace') return `strings.Replace(${obj}, ${args}, -1)`;
    if (method === 'join') return `strings.Join(${obj}, ${args})`;
    if (method === 'indexOf') return `strings.Index(${obj}, ${args})`;
    if (method === 'toString') return `fmt.Sprint(${obj})`;

    // Array methods
    if (method === 'push') return `${obj} = append(${obj}, ${args})`;
    if (method === 'pop') return `${obj} = ${obj}[:len(${obj})-1]`;
    if (method === 'length') return `len(${obj})`;

    return `${obj}.${method}(${args})`;
  }

  return `${toGoExpr(callee)}(${args})`;
}

function translateGoMember(node) {
  const obj = toGoExpr(node.object);
  const prop = node.property;
  if (prop === 'length') return `len(${obj})`;
  if (prop === 'log' && obj === 'console') return 'fmt.Println';
  return `${obj}.${prop}`;
}

function toGoForInit(node) {
  if (node.type === 'VariableDeclaration') {
    return `${node.name} := ${toGoExpr(node.init)}`;
  }
  return toGoExpr(node);
}

function inferGoType(paramName, body) {
  const name = paramName.toLowerCase();
  if (/^(str|string|text|name|desc|label|msg|key|s)$|string|text/.test(name)) return 'string';
  if (/^(bool|flag)$|^(is|has|should|can)/.test(paramName)) return 'bool';
  if (/^(num|count|index|size|len|max|min|limit|start|end|n|i|j|k)$/.test(name)) return 'int';
  if (/^(arr|array|list|items|elements)$/.test(name)) return '[]interface{}';
  if (/^(fn|func|callback|handler)$/.test(name)) return 'func()';
  return 'interface{}';
}

function inferGoReturnType(body) {
  for (const node of body) {
    if (node.type === 'ReturnStatement' && node.argument) {
      const arg = node.argument;
      if (arg.type === 'Literal') {
        if (typeof arg.value === 'number') return arg.value % 1 === 0 ? 'int' : 'float64';
        if (typeof arg.value === 'string') return 'string';
        if (typeof arg.value === 'boolean') return 'bool';
      }
      if (arg.type === 'ArrayExpression') return '[]interface{}';
      if (arg.type === 'ObjectExpression') return 'map[string]interface{}';
      if (arg.type === 'BinaryExpression') {
        if (['+', '-', '*', '/', '%'].includes(arg.operator)) return 'int';
        if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(arg.operator)) return 'bool';
      }
    }
  }
  return '';
}

function goZeroValue(name) {
  const lower = name.toLowerCase();
  if (/^(str|string|text|name)$/i.test(lower)) return '""';
  if (/^(num|count|index|n|i|j)$/i.test(lower)) return '0';
  if (/^(is|has|flag|bool)$/i.test(lower)) return 'false';
  return 'nil';
}

// ─── Rust Code Generator ───

function toRust(ast, indent = 0) {
  const pad = '    '.repeat(indent);
  if (!ast) return '';

  switch (ast.type) {
    case 'Program':
      return ast.body.map(n => toRust(n, indent)).filter(Boolean).join('\n\n');

    case 'FunctionDeclaration': {
      const params = ast.params.map(p => `${toSnakeCase(p.name)}: ${inferRustType(p.name, ast.body)}`).join(', ');
      const retType = inferRustReturnType(ast.body);
      const retStr = retType && retType !== '()' ? ` -> ${retType}` : '';
      const asyncPrefix = ast.async ? 'async ' : '';
      const body = ast.body.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}${asyncPrefix}fn ${toSnakeCase(ast.name)}(${params})${retStr} {\n${body}\n${pad}}`;
    }

    case 'VariableDeclaration': {
      const init = ast.init ? toRustExpr(ast.init) : rustDefault(ast.name);
      const mutStr = ast.kind === 'const' ? '' : 'mut ';
      return `${pad}let ${mutStr}${toSnakeCase(ast.name)} = ${init};`;
    }

    case 'ReturnStatement':
      return ast.argument ? `${pad}return ${toRustExpr(ast.argument)};` : `${pad}return;`;

    case 'IfStatement': {
      let result = `${pad}if ${toRustExpr(ast.test)} {\n`;
      result += ast.consequent.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}}`;
      if (ast.alternate) {
        if (ast.alternate.length === 1 && ast.alternate[0].type === 'IfStatement') {
          result += ' else ' + toRust(ast.alternate[0], indent).trimStart();
        } else {
          result += ` else {\n`;
          result += ast.alternate.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
          result += `\n${pad}}`;
        }
      }
      return result;
    }

    case 'ForStatement': {
      // Rust uses loop or for..in with ranges
      const rangeInfo = detectRangePattern(ast);
      if (rangeInfo) {
        const body = ast.body.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
        return `${pad}for ${rangeInfo.var} in ${rangeInfo.args.replace(/,\s*/g, '..')} {\n${body}\n${pad}}`;
      }
      const init = ast.init ? toRust(ast.init, indent) : '';
      const body = ast.body.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      const update = ast.update ? toRust({ type: 'ExpressionStatement', expression: ast.update }, indent + 1) : '';
      return `${init}\n${pad}while ${toRustExpr(ast.test)} {\n${body}${update ? '\n' + update : ''}\n${pad}}`;
    }

    case 'ForOfStatement': {
      const body = ast.body.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}for ${toSnakeCase(ast.variable)} in ${toRustExpr(ast.iterable)}.iter() {\n${body}\n${pad}}`;
    }

    case 'WhileStatement': {
      const body = ast.body.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      return `${pad}while ${toRustExpr(ast.test)} {\n${body}\n${pad}}`;
    }

    case 'ClassDeclaration': {
      let result = `${pad}struct ${ast.name} {}\n\n`;
      result += `${pad}impl ${ast.name} {\n`;
      for (const m of ast.methods) {
        const isInit = m.name === 'constructor';
        const methodName = isInit ? 'new' : toSnakeCase(m.name);
        const selfParam = isInit ? '' : '&self, ';
        const params = m.params.map(p => `${toSnakeCase(p.name)}: ${inferRustType(p.name, m.body)}`).join(', ');
        const retType = isInit ? 'Self' : inferRustReturnType(m.body);
        const retStr = retType && retType !== '()' ? ` -> ${retType}` : '';
        const body = m.body.map(n => toRust(n, indent + 2)).filter(Boolean).join('\n');
        result += `${pad}    fn ${methodName}(${selfParam}${params})${retStr} {\n${body}\n${pad}    }\n`;
      }
      result += `${pad}}`;
      return result;
    }

    case 'TryCatchStatement': {
      // Rust uses Result<T, E> — approximate with closure returning Result
      let result = `${pad}// Error handling (Rust uses Result<T, E>)\n`;
      result += `${pad}let result = (|| -> Result<(), Box<dyn std::error::Error>> {\n`;
      result += ast.block.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
      result += `\n${pad}    Ok(())\n${pad}})();\n`;
      if (ast.handler) {
        const param = ast.param || 'e';
        result += `${pad}if let Err(${param}) = result {\n`;
        result += ast.handler.map(n => toRust(n, indent + 1)).filter(Boolean).join('\n');
        result += `\n${pad}}`;
      }
      return result;
    }

    case 'ThrowStatement': {
      const arg = ast.argument;
      if (arg && arg.type === 'NewExpression') {
        const args = arg.arguments.map(a => toRustExpr(a)).join(', ');
        return `${pad}return Err(format!(${args}).into());`;
      }
      return `${pad}panic!(${toRustExpr(ast.argument)});`;
    }

    case 'ExpressionStatement':
      return `${pad}${toRustExpr(ast.expression)};`;

    case 'Comment':
      return `${pad}// ${ast.value.replace(/^\/\/\s*/, '').replace(/^\/\*\s*|\s*\*\/$/g, '')}`;

    default:
      return `${pad}${toRustExpr(ast)}`;
  }
}

function toRustExpr(node) {
  if (!node) return 'None';

  switch (node.type) {
    case 'Literal':
      if (node.value === true) return 'true';
      if (node.value === false) return 'false';
      if (node.value === null || node.value === undefined) return 'None';
      if (typeof node.value === 'string') return node.raw || `"${node.value}"`;
      return node.raw || String(node.value);

    case 'Identifier':
      if (node.name === 'this') return 'self';
      if (node.name === 'null' || node.name === 'undefined') return 'None';
      return toSnakeCase(node.name);

    case 'BinaryExpression': {
      let op = node.operator;
      if (op === '===' || op === '==') op = '==';
      if (op === '!==' || op === '!=') op = '!=';
      return `${toRustExpr(node.left)} ${op} ${toRustExpr(node.right)}`;
    }

    case 'UnaryExpression':
      if (node.operator === '!') return `!${toRustExpr(node.argument)}`;
      return `${node.operator}${toRustExpr(node.argument)}`;

    case 'ConditionalExpression':
      return `if ${toRustExpr(node.test)} { ${toRustExpr(node.consequent)} } else { ${toRustExpr(node.alternate)} }`;

    case 'CallExpression':
      return translateRustCall(node);

    case 'MemberExpression': {
      const obj = toRustExpr(node.object);
      if (node.property === 'length') return `${obj}.len()`;
      return `${obj}.${toSnakeCase(node.property)}`;
    }

    case 'ComputedMemberExpression':
      return `${toRustExpr(node.object)}[${toRustExpr(node.property)}]`;

    case 'UpdateExpression':
      if (node.operator === '++') return `${toRustExpr(node.argument)} += 1`;
      if (node.operator === '--') return `${toRustExpr(node.argument)} -= 1`;
      return toRustExpr(node.argument);

    case 'ArrayExpression':
      return `vec![${node.elements.map(e => toRustExpr(e)).join(', ')}]`;

    case 'ObjectExpression': {
      const entries = node.properties.map(p => `("${p.key}".to_string(), ${toRustExpr(p.value)})`);
      return `HashMap::from([${entries.join(', ')}])`;
    }

    case 'NewExpression':
      return `${toRustExpr(node.callee)}::new(${node.arguments.map(a => toRustExpr(a)).join(', ')})`;

    case 'SpreadElement':
      return toRustExpr(node.argument);

    case 'AwaitExpression':
      return `${toRustExpr(node.argument)}.await`;

    case 'ArrowFunction': {
      const params = node.params.map(p => toSnakeCase(p.name)).join(', ');
      if (node.expression && node.expressionBody) {
        return `|${params}| ${toRustExpr(node.expressionBody)}`;
      }
      const body = node.body.map(n => toRust(n, 1)).filter(Boolean).join('\n');
      return `|${params}| {\n${body}\n}`;
    }

    case 'TemplateLiteral': {
      const parts = [];
      const args = [];
      for (let i = 0; i < node.quasis.length; i++) {
        parts.push(node.quasis[i]);
        if (i < node.expressions.length) {
          parts.push('{}');
          args.push(toRustExpr(node.expressions[i]));
        }
      }
      return `format!("${parts.join('')}", ${args.join(', ')})`;
    }

    case 'AssignmentExpression':
      return `${toRustExpr(node.left)} ${node.operator} ${toRustExpr(node.right)}`;

    default:
      return node.value || node.name || '';
  }
}

function translateRustCall(node) {
  const callee = node.callee;
  const args = node.arguments.map(a => toRustExpr(a)).join(', ');

  if (callee.type === 'MemberExpression') {
    const obj = toRustExpr(callee.object);
    const method = callee.property;

    if (callee.object?.name === 'console' && method === 'log') return `println!("{}", ${args})`;

    if (callee.object?.name === 'Math') {
      if (method === 'max') return `${node.arguments.map(a => toRustExpr(a)).join('.max(')}${')'.repeat(node.arguments.length - 1)}`;
      if (method === 'min') return `${node.arguments.map(a => toRustExpr(a)).join('.min(')}${')'.repeat(node.arguments.length - 1)}`;
      if (method === 'floor') return `(${args} as f64).floor()`;
      if (method === 'ceil') return `(${args} as f64).ceil()`;
      if (method === 'abs') return `(${args}).abs()`;
      if (method === 'sqrt') return `(${args} as f64).sqrt()`;
      if (method === 'pow') return `${node.arguments[0] ? toRustExpr(node.arguments[0]) : '0'}.pow(${node.arguments[1] ? toRustExpr(node.arguments[1]) : '0'})`;
    }

    // String methods
    if (method === 'includes' || method === 'contains') return `${obj}.contains(${args})`;
    if (method === 'startsWith') return `${obj}.starts_with(${args})`;
    if (method === 'endsWith') return `${obj}.ends_with(${args})`;
    if (method === 'toUpperCase') return `${obj}.to_uppercase()`;
    if (method === 'toLowerCase') return `${obj}.to_lowercase()`;
    if (method === 'trim') return `${obj}.trim()`;
    if (method === 'split') return `${obj}.split(${args}).collect::<Vec<&str>>()`;
    if (method === 'replace') return `${obj}.replace(${args})`;
    if (method === 'toString') return `${obj}.to_string()`;

    // Array methods
    if (method === 'push') return `${obj}.push(${args})`;
    if (method === 'pop') return `${obj}.pop()`;
    if (method === 'join') return `${obj}.join(${args})`;
    if (method === 'reverse') return `${obj}.reverse()`;
    if (method === 'sort') return `${obj}.sort()`;
    if (method === 'map') return `${obj}.iter().map(${args}).collect::<Vec<_>>()`;
    if (method === 'filter') return `${obj}.iter().filter(${args}).collect::<Vec<_>>()`;
    if (method === 'forEach') return `for item in ${obj}.iter() { (${args})(item); }`;

    return `${obj}.${toSnakeCase(method)}(${args})`;
  }

  return `${toRustExpr(callee)}(${args})`;
}

function inferRustType(paramName, body) {
  const name = paramName.toLowerCase();
  if (/^(str|string|text|name|desc|label|msg|key|s)$|string|text/.test(name)) return '&str';
  if (/^(bool|flag)$|^(is|has|should|can)/.test(paramName)) return 'bool';
  if (/^(num|count|index|size|len|max|min|limit|start|end|n|i|j|k)$/.test(name)) return 'i32';
  if (/^(arr|array|list|items|elements)$/.test(name)) return 'Vec<i32>';
  if (/^(fn|func|callback|handler)$/.test(name)) return 'impl Fn()';
  return 'i32';
}

function inferRustReturnType(body) {
  for (const node of body) {
    if (node.type === 'ReturnStatement' && node.argument) {
      const arg = node.argument;
      if (arg.type === 'Literal') {
        if (typeof arg.value === 'number') return arg.value % 1 === 0 ? 'i32' : 'f64';
        if (typeof arg.value === 'string') return 'String';
        if (typeof arg.value === 'boolean') return 'bool';
      }
      if (arg.type === 'ArrayExpression') return 'Vec<i32>';
      if (arg.type === 'BinaryExpression') {
        if (['+', '-', '*', '/', '%'].includes(arg.operator)) return 'i32';
        if (['==', '!=', '<', '>', '<=', '>='].includes(arg.operator)) return 'bool';
      }
    }
  }
  return '()';
}

function rustDefault(name) {
  const lower = name.toLowerCase();
  if (/str|string|text|name/i.test(lower)) return 'String::new()';
  if (/num|count|index|n|i|j/i.test(lower)) return '0';
  if (/is|has|flag|bool/i.test(lower)) return 'false';
  return '0';
}

// ─── Import Detection ───

function detectPythonImports(code) {
  const imports = [];
  if (/\bmath\./.test(code)) imports.push('import math');
  if (/\brandom\./.test(code)) imports.push('import random');
  if (/\bre\./.test(code)) imports.push('import re');
  if (/\bjson\./.test(code)) imports.push('import json');
  if (/\bos\./.test(code)) imports.push('import os');
  if (/\bsys\./.test(code)) imports.push('import sys');
  if (/\bdatetime/.test(code)) imports.push('from datetime import datetime');
  return imports;
}

function detectGoImports(output) {
  const imports = [];
  if (/\bfmt\./.test(output)) imports.push('"fmt"');
  if (/\bmath\./.test(output)) imports.push('"math"');
  if (/\bstrings\./.test(output)) imports.push('"strings"');
  if (/\brand\./.test(output)) imports.push('"math/rand"');
  if (/\bstrconv\./.test(output)) imports.push('"strconv"');
  if (/\bsort\./.test(output)) imports.push('"sort"');
  if (imports.length > 0) {
    const importBlock = `import (\n${imports.map(i => `\t${i}`).join('\n')}\n)`;
    // Insert after package declaration
    output = output.replace('package main\n', `package main\n\n${importBlock}\n`);
  }
  return imports;
}

// ─── Test Code Generation for Go and Rust ───

/**
 * Extract function names and their call signatures from JS test code.
 * Looks for patterns like: funcName(args), assert funcName(args) === value
 */
function extractTestCalls(testCode) {
  const calls = [];
  // Match: funcName(args) === value / !== value
  const assertRe = /(\w+)\(([^)]*)\)\s*(?:===|!==|==|!=)\s*([^\s;,)]+)/g;
  let m;
  while ((m = assertRe.exec(testCode)) !== null) {
    calls.push({ func: m[1], args: m[2].trim(), expected: m[3].trim(), op: testCode.slice(m.index).includes('!==') || testCode.slice(m.index).includes('!=') ? '!=' : '==' });
  }
  // Match: if (funcName(args) !== value) throw
  const throwRe = /if\s*\(\s*(\w+)\(([^)]*)\)\s*(!==|!= |===|==)\s*([^)]+)\)\s*throw/g;
  while ((m = throwRe.exec(testCode)) !== null) {
    calls.push({ func: m[1], args: m[2].trim(), expected: m[4].trim(), op: m[3].includes('!') ? '!=' : '==' });
  }
  return calls;
}

/**
 * Generate Go test code from JavaScript test patterns.
 * @param {string} goCode - Transpiled Go code
 * @param {string} jsTestCode - Original JS test code
 * @param {string} funcName - Main function name
 * @returns {string|null} Go test code
 */
function generateGoTest(goCode, jsTestCode, funcName) {
  if (!jsTestCode || !funcName) return null;

  const calls = extractTestCalls(jsTestCode);
  if (calls.length === 0) {
    // Fallback: generate a basic compilation test
    return `package main\n\nimport "testing"\n\nfunc TestCompiles(t *testing.T) {\n\t// Compilation test — verifies code is valid Go\n\tt.Log("Code compiles successfully")\n}\n`;
  }

  const testFuncs = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const goArgs = convertArgsToGo(c.args);
    const goExpected = convertValueToGo(c.expected);
    const testName = `Test${capitalize(c.func)}${i > 0 ? i + 1 : ''}`;

    if (c.op === '==') {
      testFuncs.push(`func ${testName}(t *testing.T) {\n\tresult := ${c.func}(${goArgs})\n\tif result != ${goExpected} {\n\t\tt.Errorf("expected ${goExpected}, got %v", result)\n\t}\n}`);
    } else {
      testFuncs.push(`func ${testName}(t *testing.T) {\n\tresult := ${c.func}(${goArgs})\n\tif result == ${goExpected} {\n\t\tt.Errorf("expected not ${goExpected}, got %v", result)\n\t}\n}`);
    }
  }

  return `package main\n\nimport "testing"\n\n${testFuncs.join('\n\n')}\n`;
}

/**
 * Generate Rust test code from JavaScript test patterns.
 * @param {string} rustCode - Transpiled Rust code
 * @param {string} jsTestCode - Original JS test code
 * @param {string} funcName - Main function name
 * @returns {string|null} Rust test code
 */
function generateRustTest(rustCode, jsTestCode, funcName) {
  if (!jsTestCode || !funcName) return null;

  const calls = extractTestCalls(jsTestCode);
  const snakeName = toSnakeCase(funcName);

  if (calls.length === 0) {
    return `    use super::*;\n\n    #[test]\n    fn test_compiles() {\n        // Compilation test\n        assert!(true);\n    }\n`;
  }

  const testFuncs = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const rustFunc = toSnakeCase(c.func);
    const rustArgs = convertArgsToRust(c.args);
    const rustExpected = convertValueToRust(c.expected);
    const testName = `test_${rustFunc}${i > 0 ? '_' + (i + 1) : ''}`;

    if (c.op === '==') {
      testFuncs.push(`    #[test]\n    fn ${testName}() {\n        assert_eq!(${rustFunc}(${rustArgs}), ${rustExpected});\n    }`);
    } else {
      testFuncs.push(`    #[test]\n    fn ${testName}() {\n        assert_ne!(${rustFunc}(${rustArgs}), ${rustExpected});\n    }`);
    }
  }

  return `    use super::*;\n\n${testFuncs.join('\n\n')}\n`;
}

function convertArgsToGo(args) {
  if (!args) return '';
  return args.split(',').map(a => {
    const v = a.trim();
    if (v === 'true' || v === 'false') return v;
    if (/^-?\d+$/.test(v)) return v;
    if (/^-?\d+\.\d+$/.test(v)) return v;
    if (/^["']/.test(v)) return v.replace(/'/g, '"');
    return v;
  }).join(', ');
}

function convertValueToGo(val) {
  if (val === 'true' || val === 'false') return val;
  if (/^-?\d+$/.test(val)) return val;
  if (/^-?\d+\.\d+$/.test(val)) return val;
  if (/^["']/.test(val)) return val.replace(/'/g, '"');
  return val;
}

function convertArgsToRust(args) {
  if (!args) return '';
  return args.split(',').map(a => {
    const v = a.trim();
    if (v === 'true' || v === 'false') return v;
    if (/^-?\d+$/.test(v)) return v;
    if (/^-?\d+\.\d+$/.test(v)) return v;
    if (/^["'](.*)["']$/.test(v)) return `String::from(${v.replace(/'/g, '"')})`;
    return v;
  }).join(', ');
}

function convertValueToRust(val) {
  if (val === 'true' || val === 'false') return val;
  if (/^-?\d+$/.test(val)) return val;
  if (/^-?\d+\.\d+$/.test(val)) return val;
  if (/^["'](.*)["']$/.test(val)) return `String::from(${val.replace(/'/g, '"')})`;
  return val;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Verify transpiled code compiles by running the sandbox.
 * @param {string} code - Transpiled code
 * @param {string} testCode - Generated test code
 * @param {string} language - 'go' or 'rust'
 * @returns {{ compiled: boolean, output: string }}
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
