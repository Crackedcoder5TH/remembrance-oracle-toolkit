/**
 * Go Code Generator — JS AST → Go output.
 */

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
      let result = `${pad}type ${ast.name} struct {}\n`;
      for (const m of ast.methods) {
        const methodName = m.name === 'constructor' ? 'New' + ast.name : m.name.charAt(0).toUpperCase() + m.name.slice(1);
        const isInit = m.name === 'constructor';
        const receiver = isInit ? '' : `(s *${ast.name}) `;
        const params = m.params.map(p => `${p.name} ${inferGoType(p.name, m.body)}`).join(', ');
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

    if (callee.object?.name === 'console' && method === 'log') return `fmt.Println(${args})`;

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
    output = output.replace('package main\n', `package main\n\n${importBlock}\n`);
  }
  return imports;
}

module.exports = {
  toGo,
  toGoExpr,
  translateGoCall,
  translateGoMember,
  toGoForInit,
  inferGoType,
  inferGoReturnType,
  goZeroValue,
  detectGoImports,
};
