/**
 * TypeScript Code Generator — JS AST → TypeScript output.
 */

function toTypeScript(ast, indent = 0) {
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
      return `${pad}${toTsExpr(ast)};`.replace(/;;$/, ';');

    default:
      return `${pad}${toTsExpr(ast)}`;
  }
}

function toTsExpr(node) {
  if (!node) return 'undefined';

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

function inferType(paramName, body) {
  const name = paramName.toLowerCase();
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

module.exports = {
  toTypeScript,
  toTsExpr,
  inferType,
  inferReturnType,
};
