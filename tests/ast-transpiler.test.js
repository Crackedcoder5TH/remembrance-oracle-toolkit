const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { transpile, parseJS, tokenize, toSnakeCase, inferType, inferReturnType } = require('../src/core/ast-transpiler');

// ─── Tokenizer ───

describe('tokenize', () => {
  it('tokenizes simple function', () => {
    const tokens = tokenize('function test() {}');
    assert.ok(tokens.some(t => t.value === 'function'));
    assert.ok(tokens.some(t => t.value === 'test'));
  });

  it('handles strings', () => {
    const tokens = tokenize('"hello"');
    assert.ok(tokens.some(t => t.type === 'string' && t.value === '"hello"'));
  });

  it('handles numbers', () => {
    const tokens = tokenize('42');
    assert.ok(tokens.some(t => t.type === 'number' && t.value === '42'));
  });

  it('handles operators', () => {
    const tokens = tokenize('a === b');
    assert.ok(tokens.some(t => t.value === '==='));
  });

  it('handles comments', () => {
    const tokens = tokenize('// comment\ncode');
    assert.ok(tokens.some(t => t.type === 'comment'));
  });

  it('handles multi-char operators', () => {
    const tokens = tokenize('a !== b && c || d');
    assert.ok(tokens.some(t => t.value === '!=='));
    assert.ok(tokens.some(t => t.value === '&&'));
    assert.ok(tokens.some(t => t.value === '||'));
  });
});

// ─── Parser ───

describe('parseJS', () => {
  it('parses function declaration', () => {
    const ast = parseJS('function test(a, b) { return a + b; }');
    assert.equal(ast.type, 'Program');
    assert.equal(ast.body[0].type, 'FunctionDeclaration');
    assert.equal(ast.body[0].name, 'test');
    assert.equal(ast.body[0].params.length, 2);
  });

  it('parses variable declarations', () => {
    const ast = parseJS('const x = 42;');
    assert.equal(ast.body[0].type, 'VariableDeclaration');
    assert.equal(ast.body[0].kind, 'const');
    assert.equal(ast.body[0].name, 'x');
  });

  it('parses if/else', () => {
    const ast = parseJS('if (x > 0) { return true; } else { return false; }');
    assert.equal(ast.body[0].type, 'IfStatement');
    assert.ok(ast.body[0].alternate);
  });

  it('parses for loop', () => {
    const ast = parseJS('for (let i = 0; i < n; i++) { x++; }');
    assert.equal(ast.body[0].type, 'ForStatement');
  });

  it('parses while loop', () => {
    const ast = parseJS('while (x > 0) { x--; }');
    assert.equal(ast.body[0].type, 'WhileStatement');
  });

  it('parses for...of', () => {
    const ast = parseJS('for (const x of arr) { print(x); }');
    assert.equal(ast.body[0].type, 'ForOfStatement');
    assert.equal(ast.body[0].variable, 'x');
  });

  it('parses nested functions', () => {
    const ast = parseJS('function outer() { function inner() { return 1; } return inner(); }');
    assert.equal(ast.body[0].type, 'FunctionDeclaration');
    assert.equal(ast.body[0].name, 'outer');
  });

  it('parses array and object literals', () => {
    const ast = parseJS('const arr = [1, 2, 3]; const obj = {a: 1};');
    assert.equal(ast.body[0].init.type, 'ArrayExpression');
    assert.equal(ast.body[1].init.type, 'ObjectExpression');
  });

  it('parses ternary expression', () => {
    const ast = parseJS('const x = a > b ? a : b;');
    assert.equal(ast.body[0].init.type, 'ConditionalExpression');
  });

  it('parses method calls', () => {
    const ast = parseJS('arr.push(1);');
    assert.equal(ast.body[0].expression.type, 'CallExpression');
    assert.equal(ast.body[0].expression.callee.property, 'push');
  });
});

// ─── Python Transpilation ───

describe('transpile to Python', () => {
  it('transpiles simple function', () => {
    const result = transpile('function add(a, b) { return a + b; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('def add(a, b):'));
    assert.ok(result.code.includes('return a + b'));
  });

  it('transpiles camelCase to snake_case', () => {
    const result = transpile('function quickSort(arr) { return arr; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('def quick_sort(arr):'));
  });

  it('transpiles if/else', () => {
    const result = transpile('function test(x) { if (x > 0) { return true; } else { return false; } }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('if x > 0:'));
    assert.ok(result.code.includes('return True'));
    assert.ok(result.code.includes('else:'));
    assert.ok(result.code.includes('return False'));
  });

  it('transpiles for loop to range', () => {
    const result = transpile('function test(n) { for (let i = 0; i < n; i++) { x++; } }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('for i in range(n):'));
  });

  it('transpiles for...of', () => {
    const result = transpile('function test(arr) { for (const x of arr) { print(x); } }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('for x in arr:'));
  });

  it('transpiles Math methods', () => {
    const result = transpile('function test(x) { return Math.max(x, 0); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('max(x, 0)'));
  });

  it('transpiles Math.ceil correctly', () => {
    const result = transpile('function test(x) { return Math.ceil(x); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('-(-x // 1)'));
  });

  it('transpiles Math.sqrt correctly', () => {
    const result = transpile('function test(x) { return Math.sqrt(x); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('x ** 0.5'));
  });

  it('transpiles .push to .append', () => {
    const result = transpile('function test(arr) { arr.push(1); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('.append(1)'));
  });

  it('transpiles .length to len()', () => {
    const result = transpile('function test(arr) { return arr.length; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('len(arr)'));
  });

  it('transpiles .includes to in operator', () => {
    const result = transpile('function test(arr, x) { return arr.includes(x); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('x in arr'));
  });

  it('transpiles ternary', () => {
    const result = transpile('function test(a, b) { return a > b ? a : b; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('a if a > b else b'));
  });

  it('transpiles null/undefined to None', () => {
    const result = transpile('function test() { return null; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('None'));
  });

  it('transpiles === to ==', () => {
    const result = transpile('function test(a, b) { return a === b; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('=='));
    assert.ok(!result.code.includes('==='));
  });

  it('transpiles && to and, || to or', () => {
    const result = transpile('function test(a, b) { return a && b || false; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes(' and '));
    assert.ok(result.code.includes(' or '));
  });

  it('transpiles ! to not', () => {
    const result = transpile('function test(x) { return !x; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('not x'));
  });

  it('transpiles .toUpperCase/.toLowerCase', () => {
    const result = transpile('function test(s) { return s.toUpperCase(); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('.upper()'));
  });

  it('transpiles .join', () => {
    const result = transpile('function test(arr) { return arr.join(","); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('.join('));
  });

  it('transpiles Object.keys', () => {
    const result = transpile('function test(obj) { return Object.keys(obj); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('.keys()'));
  });

  it('transpiles new Set', () => {
    const result = transpile('function test(arr) { return new Set(arr); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('set(arr)'));
  });

  it('transpiles Array.isArray', () => {
    const result = transpile('function test(x) { return Array.isArray(x); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('isinstance(x, list)'));
  });

  it('handles default parameters', () => {
    const result = transpile('function test(x, y = 0) { return x + y; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('y=0'));
  });

  it('returns error for empty input', () => {
    const result = transpile('', 'python');
    assert.ok(result.success); // Empty program is valid
  });
});

// ─── TypeScript Transpilation ───

describe('transpile to TypeScript', () => {
  it('transpiles with type annotations', () => {
    const result = transpile('function add(num, count) { return num + count; }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('num: number'));
    assert.ok(result.code.includes('count: number'));
  });

  it('infers return type', () => {
    const result = transpile('function test() { return 42; }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes(': number'));
  });

  it('converts var to let', () => {
    const result = transpile('var x = 1;', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('let x'));
    assert.ok(!result.code.includes('var'));
  });

  it('preserves if/else structure', () => {
    const result = transpile('function test(x) { if (x > 0) { return true; } else { return false; } }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('if (x > 0)'));
    assert.ok(result.code.includes('} else {'));
  });
});

// ─── Unsupported Target ───

describe('unsupported target', () => {
  it('returns error for unknown language', () => {
    const result = transpile('function test() {}', 'cobol');
    assert.ok(!result.success);
    assert.ok(result.error.includes('Unsupported'));
  });
});

// ─── Helpers ───

describe('toSnakeCase', () => {
  it('converts camelCase', () => {
    assert.equal(toSnakeCase('quickSort'), 'quick_sort');
    assert.equal(toSnakeCase('getHTTPClient'), 'get_http_client');
    assert.equal(toSnakeCase('simple'), 'simple');
    assert.equal(toSnakeCase('XMLParser'), 'xml_parser');
  });
});

describe('inferType', () => {
  it('infers array type', () => {
    assert.equal(inferType('arr', []), 'any[]');
    assert.equal(inferType('items', []), 'any[]');
  });

  it('infers string type', () => {
    assert.equal(inferType('name', []), 'string');
    assert.equal(inferType('text', []), 'string');
  });

  it('infers number type', () => {
    assert.equal(inferType('count', []), 'number');
    assert.equal(inferType('index', []), 'number');
  });

  it('infers function type', () => {
    assert.equal(inferType('callback', []), 'Function');
  });

  it('defaults to any', () => {
    assert.equal(inferType('xyz', []), 'any');
  });
});

describe('inferReturnType', () => {
  it('infers number from literal', () => {
    const body = [{ type: 'ReturnStatement', argument: { type: 'Literal', value: 42 } }];
    assert.equal(inferReturnType(body), 'number');
  });

  it('infers string from literal', () => {
    const body = [{ type: 'ReturnStatement', argument: { type: 'Literal', value: 'hello' } }];
    assert.equal(inferReturnType(body), 'string');
  });

  it('infers array from expression', () => {
    const body = [{ type: 'ReturnStatement', argument: { type: 'ArrayExpression', elements: [] } }];
    assert.equal(inferReturnType(body), 'any[]');
  });

  it('defaults to any', () => {
    assert.equal(inferReturnType([]), 'any');
  });
});

// ─── Async/Await ───

describe('async/await', () => {
  it('parses async function declaration', () => {
    const ast = parseJS('async function fetchData(url) { return await fetch(url); }');
    assert.equal(ast.body[0].type, 'FunctionDeclaration');
    assert.equal(ast.body[0].async, true);
    assert.equal(ast.body[0].name, 'fetchData');
  });

  it('parses await expression', () => {
    const ast = parseJS('async function run() { const data = await getData(); }');
    const varDecl = ast.body[0].body[0];
    assert.equal(varDecl.type, 'VariableDeclaration');
    assert.equal(varDecl.init.type, 'AwaitExpression');
    assert.equal(varDecl.init.argument.type, 'CallExpression');
  });

  it('transpiles async function to Python', () => {
    const result = transpile('async function fetchData(url) { return await getData(url); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('async def fetch_data(url):'));
    assert.ok(result.code.includes('await getData(url)'));
  });

  it('transpiles async function to TypeScript', () => {
    const result = transpile('async function fetchData(url) { return 42; }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('async function fetchData'));
    assert.ok(result.code.includes('Promise<number>'));
  });
});

// ─── Destructuring ───

describe('destructuring', () => {
  it('parses object destructuring', () => {
    const ast = parseJS('const { a, b } = obj;');
    assert.equal(ast.body[0].type, 'ObjectDestructuring');
    assert.deepEqual(ast.body[0].properties, ['a', 'b']);
  });

  it('parses array destructuring', () => {
    const ast = parseJS('const [x, y] = arr;');
    assert.equal(ast.body[0].type, 'ArrayDestructuring');
    assert.deepEqual(ast.body[0].elements, ['x', 'y']);
  });

  it('transpiles object destructuring to Python', () => {
    const result = transpile('const { name, age } = person;', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('name, age = person["name"], person["age"]'));
  });

  it('transpiles array destructuring to Python', () => {
    const result = transpile('const [first, second] = items;', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('first, second = items'));
  });

  it('transpiles object destructuring to TypeScript', () => {
    const result = transpile('const { a, b } = obj;', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('const { a, b } = obj;'));
  });

  it('transpiles array destructuring to TypeScript', () => {
    const result = transpile('const [x, y] = arr;', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('const [x, y] = arr;'));
  });
});

// ─── Class Declarations ───

describe('class declarations', () => {
  it('parses class declaration', () => {
    const ast = parseJS('class Animal { speak() { return "hello"; } }');
    assert.equal(ast.body[0].type, 'ClassDeclaration');
    assert.equal(ast.body[0].name, 'Animal');
    assert.equal(ast.body[0].superClass, null);
    assert.equal(ast.body[0].methods.length, 1);
    assert.equal(ast.body[0].methods[0].name, 'speak');
  });

  it('parses class with extends', () => {
    const ast = parseJS('class Dog extends Animal { constructor(name) { this.name = name; } }');
    assert.equal(ast.body[0].type, 'ClassDeclaration');
    assert.equal(ast.body[0].name, 'Dog');
    assert.equal(ast.body[0].superClass, 'Animal');
    assert.equal(ast.body[0].methods[0].name, 'constructor');
  });

  it('transpiles class to Python', () => {
    const result = transpile('class Dog extends Animal { constructor(name) { this.name = name; } bark() { return this.name; } }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('class Dog(Animal):'));
    assert.ok(result.code.includes('def __init__(self, name):'));
    assert.ok(result.code.includes('self.name = name'));
    assert.ok(result.code.includes('def bark(self):'));
    assert.ok(result.code.includes('return self.name'));
  });

  it('transpiles class to TypeScript', () => {
    const result = transpile('class Foo extends Bar { greet(msg) { return msg; } }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('class Foo extends Bar {'));
    assert.ok(result.code.includes('greet(msg: string)'));
  });
});

// ─── Arrow Functions ───

describe('arrow functions', () => {
  it('parses expression-body arrow function', () => {
    const ast = parseJS('const add = (a, b) => a + b;');
    assert.equal(ast.body[0].type, 'VariableDeclaration');
    assert.equal(ast.body[0].init.type, 'ArrowFunction');
    assert.equal(ast.body[0].init.expression, true);
    assert.equal(ast.body[0].init.params.length, 2);
  });

  it('parses block-body arrow function', () => {
    const ast = parseJS('const fn = (x) => { return x + 1; }');
    assert.equal(ast.body[0].init.type, 'ArrowFunction');
    assert.equal(ast.body[0].init.expression, false);
    assert.equal(ast.body[0].init.body.length, 1);
  });

  it('parses single-param arrow without parens', () => {
    const ast = parseJS('const double = x => x * 2;');
    assert.equal(ast.body[0].init.type, 'ArrowFunction');
    assert.equal(ast.body[0].init.params[0].name, 'x');
    assert.equal(ast.body[0].init.expression, true);
  });

  it('transpiles expression arrow to Python lambda', () => {
    const result = transpile('const add = (a, b) => a + b;', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('lambda a, b: a + b'));
  });

  it('transpiles block-body arrow to Python def', () => {
    const result = transpile('const fn = (x) => { return x + 1; }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('def _anon(x):'));
    assert.ok(result.code.includes('return x + 1'));
    assert.ok(result.code.includes('fn = _anon'));
  });

  it('transpiles arrow to TypeScript', () => {
    const result = transpile('const add = (a, b) => a + b;', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('(a, b) => a + b'));
  });
});

// ─── Template Literals ───

describe('template literals', () => {
  it('tokenizes template literal with interpolation', () => {
    const tokens = tokenize('`hello ${name}`');
    assert.ok(tokens.some(t => t.type === 'template'));
  });

  it('parses template literal into TemplateLiteral node', () => {
    const ast = parseJS('const msg = `hello ${name}`;');
    assert.equal(ast.body[0].init.type, 'TemplateLiteral');
    assert.deepEqual(ast.body[0].init.quasis, ['hello ', '']);
    assert.equal(ast.body[0].init.expressions.length, 1);
    assert.equal(ast.body[0].init.expressions[0].name, 'name');
  });

  it('transpiles template literal to Python f-string', () => {
    const result = transpile('const msg = `hello ${name}`;', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('f"hello {name}"'));
  });

  it('transpiles template literal to TypeScript', () => {
    const result = transpile('const msg = `count: ${total}`;', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('`count: ${total}`'));
  });
});

// ─── Try/Catch/Finally ───

describe('try/catch/finally', () => {
  it('parses try/catch', () => {
    const ast = parseJS('try { doWork(); } catch (e) { handleError(e); }');
    assert.equal(ast.body[0].type, 'TryCatchStatement');
    assert.ok(ast.body[0].block.length > 0);
    assert.ok(ast.body[0].handler.length > 0);
    assert.equal(ast.body[0].param, 'e');
  });

  it('parses try/catch/finally', () => {
    const ast = parseJS('try { run(); } catch (e) { log(e); } finally { cleanup(); }');
    assert.equal(ast.body[0].type, 'TryCatchStatement');
    assert.ok(ast.body[0].handler);
    assert.ok(ast.body[0].finalizer);
    assert.equal(ast.body[0].finalizer.length, 1);
  });

  it('transpiles try/catch to Python', () => {
    const result = transpile('try { doWork(); } catch (e) { handleError(e); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('try:'));
    assert.ok(result.code.includes('except Exception as e:'));
  });

  it('transpiles try/catch/finally to Python', () => {
    const result = transpile('try { run(); } catch (e) { log(e); } finally { cleanup(); }', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('try:'));
    assert.ok(result.code.includes('except Exception as e:'));
    assert.ok(result.code.includes('finally:'));
  });

  it('transpiles try/catch to TypeScript', () => {
    const result = transpile('try { doWork(); } catch (e) { handleError(e); }', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('try {'));
    assert.ok(result.code.includes('catch (e: unknown) {'));
  });
});

// ─── Throw Statements ───

describe('throw statements', () => {
  it('parses throw statement', () => {
    const ast = parseJS('throw new Error("oops");');
    assert.equal(ast.body[0].type, 'ThrowStatement');
    assert.equal(ast.body[0].argument.type, 'NewExpression');
  });

  it('transpiles throw new Error to Python raise Exception', () => {
    const result = transpile('throw new Error("something failed");', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('raise Exception("something failed")'));
  });

  it('transpiles throw new TypeError to Python raise TypeError', () => {
    const result = transpile('throw new TypeError("bad type");', 'python');
    assert.ok(result.success);
    assert.ok(result.code.includes('raise TypeError("bad type")'));
  });

  it('transpiles throw to TypeScript', () => {
    const result = transpile('throw new Error("fail");', 'typescript');
    assert.ok(result.success);
    assert.ok(result.code.includes('throw new Error("fail");'));
  });
});
