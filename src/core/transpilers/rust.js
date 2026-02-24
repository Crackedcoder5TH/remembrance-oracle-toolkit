/**
 * Rust Code Generator — JS AST → Rust output.
 */

const { toSnakeCase, detectRangePattern } = require('./shared');

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
      const rangeInfo = detectRangePattern(ast, toRustExpr);
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

    if (method === 'includes' || method === 'contains') return `${obj}.contains(${args})`;
    if (method === 'startsWith') return `${obj}.starts_with(${args})`;
    if (method === 'endsWith') return `${obj}.ends_with(${args})`;
    if (method === 'toUpperCase') return `${obj}.to_uppercase()`;
    if (method === 'toLowerCase') return `${obj}.to_lowercase()`;
    if (method === 'trim') return `${obj}.trim()`;
    if (method === 'split') return `${obj}.split(${args}).collect::<Vec<&str>>()`;
    if (method === 'replace') return `${obj}.replace(${args})`;
    if (method === 'toString') return `${obj}.to_string()`;

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

module.exports = {
  toRust,
  toRustExpr,
  translateRustCall,
  inferRustType,
  inferRustReturnType,
  rustDefault,
};
