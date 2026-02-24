/**
 * Python Code Generator — JS AST → Python output.
 */

const { toSnakeCase, detectRangePattern } = require('./shared');

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
      const rangeInfo = detectRangePattern(ast, toPyExpr);
      if (rangeInfo) {
        const body = ast.body.map(n => toPython(n, indent + 1)).filter(Boolean).join('\n');
        return `${pad}for ${rangeInfo.var} in range(${rangeInfo.args}):\n${body}`;
      }
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

module.exports = {
  toPython,
  toPyExpr,
  translatePyCall,
  translatePyMember,
  detectPythonImports,
};
