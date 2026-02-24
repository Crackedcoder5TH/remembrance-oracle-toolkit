// Test: schema-validate — inline assertions, no require

// Primitive types
if (!isValid('hello', 'string')) throw new Error('string check failed');
if (!isValid(42, 'number')) throw new Error('number check failed');
if (!isValid(true, 'boolean')) throw new Error('boolean check failed');
if (isValid(42, 'string')) throw new Error('42 is not a string');

// String constraints
if (!isValid('abc', { type: 'string', min: 1, max: 5 })) throw new Error('string range failed');
if (isValid('', { type: 'string', min: 1 })) throw new Error('empty string should fail min:1');
if (isValid('toolong', { type: 'string', max: 3 })) throw new Error('long string should fail max:3');

// Number constraints
if (!isValid(5, { type: 'number', min: 0, max: 10 })) throw new Error('number range failed');
if (isValid(-1, { type: 'number', min: 0 })) throw new Error('negative should fail min:0');
if (isValid(3.5, { type: 'number', integer: true })) throw new Error('float should fail integer check');

// Array validation
if (!isValid([1, 2, 3], { type: 'array' })) throw new Error('array check failed');
if (isValid('not-array', { type: 'array' })) throw new Error('string as array should fail');
if (!isValid(['a', 'b'], { type: 'array', items: 'string' })) throw new Error('string array failed');
if (isValid(['a', 1], { type: 'array', items: 'string' })) throw new Error('mixed array should fail');

// Nested objects
const schema = {
  type: 'object',
  shape: {
    name: 'string',
    age: { type: 'number', min: 0 },
  },
};
if (!isValid({ name: 'Alice', age: 30 }, schema)) throw new Error('valid object failed');
if (isValid({ name: 'Bob', age: -5 }, schema)) throw new Error('negative age should fail');

// Optional fields
if (!isValid({ name: 'test' }, { type: 'object', shape: { name: 'string', nick: { type: 'string', optional: true } } })) {
  throw new Error('optional field should pass when missing');
}

// Custom validator
const isEven = (v) => v % 2 === 0 ? true : 'Must be even';
if (!isValid(4, isEven)) throw new Error('4 should be even');
if (isValid(3, isEven)) throw new Error('3 should not be even');

// Detailed errors
const errors = validate({ name: 42 }, { type: 'object', shape: { name: 'string' } });
if (errors.length === 0) throw new Error('Should have errors');

// Assert throws on invalid
let threw = false;
try { assert(42, 'string', 'test'); } catch(e) { threw = true; }
if (!threw) throw new Error('assert should throw on invalid');
