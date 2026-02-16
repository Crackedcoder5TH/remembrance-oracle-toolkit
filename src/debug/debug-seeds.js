/**
 * Debug Pattern Seeds — Pre-built error→fix pairs for all 10 categories.
 *
 * Seeds the debug oracle with common, well-known fixes across:
 *   syntax, type, reference, logic, runtime, build, network, permission, async, data
 *
 * Each seed has:
 *   - errorMessage: representative error text
 *   - fixCode: proven fix code
 *   - fixDescription: human explanation
 *   - language: source language (variants auto-generate for others)
 *   - category: explicit category (overrides auto-classification if needed)
 *   - tags: searchable tags
 */

const DEBUG_SEEDS = [

  // ─── SYNTAX (5 seeds) ───

  {
    errorMessage: 'SyntaxError: Unexpected token }',
    fixCode: `// Fix: mismatched braces — count opening vs closing braces
// Use editor bracket matching or a linter to find the extra/missing brace
function fixBraces(code) {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (depth < 0) return { line: code.slice(0, i).split('\\n').length, issue: 'extra closing brace' };
  }
  if (depth > 0) return { issue: 'missing closing brace', unclosed: depth };
  return { issue: null };
}`,
    fixDescription: 'Mismatched braces: count { vs } depth to find the extra or missing brace',
    language: 'javascript',
    tags: ['syntax', 'braces', 'parsing'],
  },

  {
    errorMessage: 'SyntaxError: Unexpected token, expected ","',
    fixCode: `// Fix: missing comma in object/array literal or function params
// Common in multi-line objects where a comma is forgotten after a property
const obj = {
  a: 1,  // <-- comma required
  b: 2,  // <-- comma required (trailing comma is safe in modern JS)
  c: 3,
};`,
    fixDescription: 'Missing comma in object literal, array, or parameter list — add trailing commas to prevent this',
    language: 'javascript',
    tags: ['syntax', 'comma', 'object-literal'],
  },

  {
    errorMessage: "SyntaxError: Cannot use import statement outside a module",
    fixCode: `// Fix option 1: Add "type": "module" to package.json
// { "type": "module" }

// Fix option 2: Use .mjs extension for ES module files

// Fix option 3: Use require() instead of import
const fs = require('fs');  // CommonJS
// instead of: import fs from 'fs';  // ESM`,
    fixDescription: 'Using import in CommonJS context — either set "type": "module" in package.json, use .mjs extension, or switch to require()',
    language: 'javascript',
    tags: ['syntax', 'esm', 'commonjs', 'import', 'module'],
  },

  {
    errorMessage: "SyntaxError: Unexpected reserved word 'await'",
    fixCode: `// Fix: await used outside an async function
// Wrong:
// function getData() { const data = await fetch(url); }

// Correct:
async function getData() {
  const data = await fetch(url);
  return data;
}

// Or use top-level await in ESM modules (Node 14.8+, "type": "module")`,
    fixDescription: 'await used outside async function — wrap in async function or use top-level await in ESM',
    language: 'javascript',
    tags: ['syntax', 'await', 'async'],
  },

  {
    errorMessage: "IndentationError: unexpected indent",
    fixCode: `# Fix: Python indentation must be consistent
# Wrong: mixing tabs and spaces, or wrong indent level
# Use 4 spaces per indent level consistently

def my_function():
    if True:
        print("correct indent")  # 4 spaces per level
        for i in range(10):
            print(i)  # 4 more spaces
    return True

# Run: python -tt script.py  to detect tab/space mixing`,
    fixDescription: 'Python indentation error — use consistent 4-space indentation, never mix tabs and spaces',
    language: 'python',
    tags: ['syntax', 'indentation', 'whitespace'],
  },

  // ─── TYPE (5 seeds) ───

  {
    errorMessage: "TypeError: Cannot read properties of undefined (reading 'map')",
    fixCode: `// Fix: guard against undefined before calling array methods
// Option 1: Optional chaining + nullish coalescing
const results = (data?.items ?? []).map(item => item.name);

// Option 2: Default parameter
function process(items = []) {
  return items.map(item => item.name);
}

// Option 3: Explicit check
if (Array.isArray(data?.items)) {
  data.items.map(item => item.name);
}`,
    fixDescription: 'Array method called on undefined — use optional chaining (?.), default values, or Array.isArray() guard',
    language: 'javascript',
    tags: ['type', 'undefined', 'optional-chaining', 'array'],
  },

  {
    errorMessage: "TypeError: Assignment to constant variable",
    fixCode: `// Fix: variable declared with const cannot be reassigned
// Wrong:
// const count = 0;
// count = count + 1;  // TypeError!

// Fix option 1: Use let for mutable variables
let count = 0;
count = count + 1;

// Fix option 2: For objects/arrays, const allows mutation of contents
const arr = [1, 2, 3];
arr.push(4);  // OK — modifying contents, not reassigning reference`,
    fixDescription: 'Reassigning a const variable — use let for values that change, or mutate object/array contents instead',
    language: 'javascript',
    tags: ['type', 'const', 'let', 'assignment'],
  },

  {
    errorMessage: "TypeError: X is not a function",
    fixCode: `// Fix: calling a non-function value — common causes:
// 1. Variable shadowing a function
// const parseInt = 42;  parseInt("10") → error

// 2. Wrong import/export
// Fix: check the export name matches
const { myFunc } = require('./module');  // Ensure myFunc is exported

// 3. Object method vs property
// obj.method()  → is method a function?
if (typeof obj.method === 'function') {
  obj.method();
}

// 4. Circular dependency — module not yet loaded
// Fix: lazy-require inside function body
function doWork() {
  const { helper } = require('./other');
  return helper();
}`,
    fixDescription: 'Calling non-function value — check for shadowed variables, wrong imports, or circular dependencies',
    language: 'javascript',
    tags: ['type', 'not-a-function', 'import', 'circular'],
  },

  {
    errorMessage: "TypeError: Cannot destructure property 'x' of undefined",
    fixCode: `// Fix: destructuring from undefined/null source
// Wrong:
// const { x } = undefined;

// Fix option 1: Default to empty object
const { x } = config || {};

// Fix option 2: Default parameter in function
function init({ host, port } = {}) {
  // host and port are undefined but no TypeError
}

// Fix option 3: Optional chaining before destructure
const result = data?.response;
if (result) {
  const { x, y } = result;
}`,
    fixDescription: 'Destructuring from undefined — provide default empty object with || {} or default parameters',
    language: 'javascript',
    tags: ['type', 'destructuring', 'undefined', 'default'],
  },

  {
    errorMessage: "TypeError: 'NoneType' object is not subscriptable",
    fixCode: `# Fix: indexing into None — function returned None instead of expected value
# Wrong:
# result = some_function()
# value = result["key"]  # TypeError if result is None

# Fix option 1: Guard with if
result = some_function()
if result is not None:
    value = result["key"]

# Fix option 2: Use .get() for dicts with default
value = (result or {}).get("key", default_value)

# Fix option 3: Walrus operator (Python 3.8+)
if (result := some_function()) is not None:
    value = result["key"]`,
    fixDescription: 'Subscripting None — check function return value before indexing, use .get() with default',
    language: 'python',
    tags: ['type', 'none', 'subscript', 'null-check'],
  },

  // ─── REFERENCE (5 seeds) ───

  {
    errorMessage: "ReferenceError: x is not defined",
    fixCode: `// Fix: variable used before declaration or out of scope
// Common causes:
// 1. Typo in variable name
// 2. Variable declared in different scope (block, function, module)
// 3. Missing import/require

// Fix option 1: Check scope — let/const are block-scoped
if (true) {
  let x = 10;
}
// x is NOT accessible here — declare outside the block

// Fix option 2: Ensure import exists
const { x } = require('./module');

// Fix option 3: Check for typos with typeof guard
if (typeof myVar !== 'undefined') {
  console.log(myVar);
}`,
    fixDescription: 'Variable not defined — check for typos, scope boundaries (block-scoped let/const), or missing imports',
    language: 'javascript',
    tags: ['reference', 'undefined', 'scope', 'import'],
  },

  {
    errorMessage: "ReferenceError: Cannot access 'x' before initialization",
    fixCode: `// Fix: temporal dead zone — let/const used before declaration line
// Wrong:
// console.log(x);  // ReferenceError — TDZ
// let x = 10;

// Fix: move usage below declaration
let x = 10;
console.log(x);  // OK

// Note: var is hoisted (no TDZ) but initialized to undefined
// var y;  // hoisted
// console.log(y);  // undefined, not an error
// y = 10;

// Common in switch statements:
// case 'a': let val = 1; break;
// case 'b': console.log(val); break;  // TDZ!
// Fix: wrap cases in blocks
// case 'a': { let val = 1; break; }`,
    fixDescription: 'Temporal dead zone — let/const accessed before its declaration line. Move declaration above usage.',
    language: 'javascript',
    tags: ['reference', 'tdz', 'hoisting', 'let', 'const'],
  },

  {
    errorMessage: "NameError: name 'x' is not defined",
    fixCode: `# Fix: Python NameError — variable/function used before definition or misspelled

# Common cause 1: Typo
# print(reuslt)  →  print(result)

# Common cause 2: Forgot import
import os
path = os.path.join("/tmp", "file.txt")

# Common cause 3: Variable in different scope
def outer():
    x = 10
    def inner():
        # x is accessible here via closure (read-only)
        # To modify: use nonlocal x
        nonlocal x
        x = 20
    inner()

# Common cause 4: Conditional definition
# if condition:
#     result = compute()
# print(result)  # NameError if condition was False
# Fix: define default before conditional
result = None
if condition:
    result = compute()`,
    fixDescription: 'Python NameError — check spelling, imports, scope, and ensure variable is defined on all code paths',
    language: 'python',
    tags: ['reference', 'name-error', 'scope', 'import'],
  },

  {
    errorMessage: "ReferenceError: require is not defined in ES module scope",
    fixCode: `// Fix: require() not available in ESM — use import or createRequire
// Option 1: Use import
import fs from 'fs';
import { readFile } from 'fs/promises';

// Option 2: createRequire for CommonJS modules in ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Option 3: For __dirname / __filename in ESM
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);`,
    fixDescription: 'require() in ESM scope — use import syntax, createRequire(), or switch to CommonJS',
    language: 'javascript',
    tags: ['reference', 'esm', 'require', 'commonjs', 'module'],
  },

  {
    errorMessage: "undefined: cannot refer to unexported name pkg.internalFunc",
    fixCode: `// Fix: Go unexported identifier — functions/types starting with lowercase are private
// Wrong:
// import "mypackage"
// mypackage.internalFunc()  // unexported!

// Fix: capitalize the first letter to export
// In mypackage/pkg.go:
package mypackage

// Exported (public)
func PublicFunc() string {
    return internalHelper()
}

// unexported (private to package)
func internalHelper() string {
    return "internal"
}`,
    fixDescription: 'Go unexported name — capitalize first letter to export, or access via an exported wrapper function',
    language: 'go',
    tags: ['reference', 'unexported', 'visibility', 'package'],
  },

  // ─── LOGIC (4 seeds) ───

  {
    errorMessage: "AssertionError: expected true to equal false — off-by-one in loop boundary",
    fixCode: `// Fix: off-by-one errors in loops
// Common patterns:
// 1. Array index: use < length, not <= length
for (let i = 0; i < arr.length; i++) {  // NOT i <= arr.length
  console.log(arr[i]);
}

// 2. Fence-post: n items need n-1 separators
function join(items, sep) {
  let result = items[0] || '';
  for (let i = 1; i < items.length; i++) {
    result += sep + items[i];
  }
  return result;
}

// 3. Inclusive vs exclusive ranges
// slice(0, 3) gives indices 0,1,2 (exclusive end)
// for i in range(3) gives 0,1,2 (exclusive end)`,
    fixDescription: 'Off-by-one error — check < vs <=, exclusive vs inclusive bounds, fence-post counting',
    language: 'javascript',
    tags: ['logic', 'off-by-one', 'loop', 'boundary'],
  },

  {
    errorMessage: "AssertionError: expected [1, 2, 3] to deeply equal [1, 2, 3] — object equality check fails",
    fixCode: `// Fix: comparing objects/arrays by reference instead of value
// Wrong:
// assert.equal([1, 2, 3], [1, 2, 3]);  // FAILS — different references

// Fix option 1: Use deep equality
const assert = require('assert');
assert.deepStrictEqual([1, 2, 3], [1, 2, 3]);  // Passes

// Fix option 2: JSON comparison (loses undefined, functions, Dates)
JSON.stringify(a) === JSON.stringify(b);

// Fix option 3: Element-wise comparison for arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}`,
    fixDescription: 'Object/array equality fails — use deepStrictEqual, JSON.stringify, or element-wise comparison',
    language: 'javascript',
    tags: ['logic', 'equality', 'deep-equal', 'assert'],
  },

  {
    errorMessage: "AssertionError: expected 0.1 + 0.2 to equal 0.3 — floating point precision",
    fixCode: `// Fix: IEEE 754 floating point — 0.1 + 0.2 !== 0.3
// 0.1 + 0.2 === 0.30000000000000004

// Fix option 1: Compare with epsilon tolerance
function approxEqual(a, b, epsilon = 1e-10) {
  return Math.abs(a - b) < epsilon;
}

// Fix option 2: Round to fixed decimal places
const result = Math.round((0.1 + 0.2) * 100) / 100;  // 0.3

// Fix option 3: Use integers (cents instead of dollars)
const priceInCents = 10 + 20;  // 30 cents
const priceInDollars = priceInCents / 100;  // 0.3`,
    fixDescription: 'Floating point precision — use epsilon comparison, round to fixed decimals, or work with integers',
    language: 'javascript',
    tags: ['logic', 'float', 'precision', 'ieee754'],
  },

  {
    errorMessage: "AssertionError: race condition — test intermittently fails with wrong value",
    fixCode: `// Fix: shared mutable state causing race conditions
// Wrong: multiple async operations modifying same variable
let counter = 0;
// await Promise.all(items.map(async () => { counter++; }));
// counter may be wrong!

// Fix option 1: Use atomic accumulation
const results = await Promise.all(items.map(async (item) => {
  return processItem(item);  // Return value instead of mutating shared state
}));
const counter = results.length;

// Fix option 2: Sequential processing when order matters
for (const item of items) {
  await processItem(item);
  counter++;
}

// Fix option 3: Use a mutex/semaphore for shared resources
const { Mutex } = require('async-mutex');
const mutex = new Mutex();
await mutex.runExclusive(async () => {
  counter++;
});`,
    fixDescription: 'Race condition from shared mutable state — return values instead of mutating, process sequentially, or use mutex',
    language: 'javascript',
    tags: ['logic', 'race-condition', 'async', 'concurrency'],
  },

  // ─── RUNTIME (4 seeds) ───

  {
    errorMessage: "RangeError: Maximum call stack size exceeded",
    fixCode: `// Fix: infinite recursion — missing or wrong base case
// Wrong:
// function factorial(n) { return n * factorial(n - 1); }
// Missing base case: never stops!

// Fix option 1: Add proper base case
function factorial(n) {
  if (n <= 1) return 1;  // Base case stops recursion
  return n * factorial(n - 1);
}

// Fix option 2: Convert to iterative
function factorialIter(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// Fix option 3: Add recursion depth guard
function safeFn(data, depth = 0) {
  if (depth > 1000) throw new Error('Max recursion depth');
  return safeFn(data.child, depth + 1);
}`,
    fixDescription: 'Stack overflow from infinite recursion — add base case, convert to iteration, or add depth guard',
    language: 'javascript',
    tags: ['runtime', 'stack-overflow', 'recursion', 'base-case'],
  },

  {
    errorMessage: "Error: ENOMEM — JavaScript heap out of memory",
    fixCode: `// Fix: memory exhaustion — processing too much data at once
// Launch with more memory:
// node --max-old-space-size=4096 script.js

// Fix option 1: Stream processing instead of loading all into memory
const fs = require('fs');
const readline = require('readline');

async function processLargeFile(path) {
  const rl = readline.createInterface({
    input: fs.createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    processLine(line);  // Process one line at a time
  }
}

// Fix option 2: Batch processing
async function processBatches(items, batchSize = 1000) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processBatch(batch);
    // Let GC run between batches
    if (global.gc) global.gc();
  }
}`,
    fixDescription: 'Heap out of memory — use streaming, batch processing, or increase --max-old-space-size',
    language: 'javascript',
    tags: ['runtime', 'memory', 'oom', 'streaming', 'batch'],
  },

  {
    errorMessage: "Error: SQLITE_BUSY: database is locked",
    fixCode: `// Fix: SQLite concurrent access — enable WAL mode and set busy timeout
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data.db');

// Enable WAL mode: allows concurrent readers with one writer
db.exec('PRAGMA journal_mode = WAL');

// Set busy timeout: wait up to 5 seconds for lock to release
db.exec('PRAGMA busy_timeout = 5000');

// For multiple writers: serialize writes
function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (err) {
      if (err.message.includes('SQLITE_BUSY') && i < maxRetries - 1) {
        // Wait before retry
        const delay = Math.pow(2, i) * 100;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
        continue;
      }
      throw err;
    }
  }
}`,
    fixDescription: 'SQLite database locked — enable WAL mode, set busy_timeout, serialize writes with retry',
    language: 'javascript',
    tags: ['runtime', 'sqlite', 'locking', 'wal', 'concurrency'],
  },

  {
    errorMessage: "panic: runtime error: index out of range [5] with length 3",
    fixCode: `// Fix: Go slice/array out of bounds — check length before indexing
package main

import "fmt"

func safeGet(slice []string, index int) (string, bool) {
    if index < 0 || index >= len(slice) {
        return "", false
    }
    return slice[index], true
}

func main() {
    items := []string{"a", "b", "c"}

    // Wrong: items[5] → panic
    // Fix: bounds check
    if val, ok := safeGet(items, 5); ok {
        fmt.Println(val)
    } else {
        fmt.Println("index out of range")
    }

    // For slicing: cap the end index
    end := 5
    if end > len(items) {
        end = len(items)
    }
    subset := items[0:end]
    fmt.Println(subset)
}`,
    fixDescription: 'Go index out of range — check len() before indexing, cap slice bounds, use safe accessor',
    language: 'go',
    tags: ['runtime', 'bounds', 'index', 'slice', 'panic'],
  },

  // ─── BUILD (5 seeds) ───

  {
    errorMessage: "Error: Cannot find module './config'",
    fixCode: `// Fix: module not found — common causes and fixes
// 1. Wrong relative path
// require('./config') looks for ./config.js, ./config/index.js
// Check: does the file exist at that relative path from THIS file?

const path = require('path');
const fs = require('fs');

function resolveModule(name) {
  const extensions = ['.js', '.json', '.node', '/index.js'];
  for (const ext of extensions) {
    const fullPath = path.resolve(name + ext);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

// 2. Missing dependency: npm install <package>
// 3. Typo in module name
// 4. Case sensitivity: require('./Config') fails on Linux if file is config.js`,
    fixDescription: 'Module not found — check file path, file extensions, case sensitivity, or install missing dependency',
    language: 'javascript',
    tags: ['build', 'module', 'require', 'import', 'path'],
  },

  {
    errorMessage: "ModuleNotFoundError: No module named 'requests'",
    fixCode: `# Fix: Python module not installed
# Install with pip:
# pip install requests
# or: python -m pip install requests

# If using virtual env:
# python -m venv venv
# source venv/bin/activate
# pip install requests

# If wrong Python version:
# python3 -m pip install requests
# pip3 install requests

# Verify installation:
import importlib
spec = importlib.util.find_spec("requests")
if spec is None:
    print("requests is not installed")
    # pip install requests
else:
    import requests
    print(f"requests {requests.__version__} found at {spec.origin}")`,
    fixDescription: 'Python module not found — pip install the package, check virtual environment, verify Python version',
    language: 'python',
    tags: ['build', 'module', 'pip', 'import', 'virtualenv'],
  },

  {
    errorMessage: "error[E0308]: mismatched types — expected `&str`, found `String`",
    fixCode: `// Fix: Rust type mismatch between String and &str
fn greet(name: &str) {
    println!("Hello, {}", name);
}

fn main() {
    let owned = String::from("world");

    // Wrong: greet(owned);  // expected &str, found String
    // Fix option 1: Borrow with &
    greet(&owned);

    // Fix option 2: Use .as_str()
    greet(owned.as_str());

    // Fix option 3: Accept both with generic
    // fn greet<S: AsRef<str>>(name: S) { ... }

    // Reverse: &str to String
    let borrowed: &str = "hello";
    let owned2: String = borrowed.to_string();
    // or: String::from(borrowed)
    // or: borrowed.to_owned()
}`,
    fixDescription: 'Rust String vs &str mismatch — use & to borrow, .as_str(), or accept generic AsRef<str>',
    language: 'rust',
    tags: ['build', 'types', 'string', 'borrow', 'ownership'],
  },

  {
    errorMessage: "error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'",
    fixCode: `// Fix: TypeScript type mismatch — parse or convert the value
// Wrong:
// function add(a: number, b: number): number { return a + b; }
// add("5", 3);  // TS2345

// Fix option 1: Parse the string
const result = add(parseInt(input, 10), 3);
const result2 = add(Number(input), 3);

// Fix option 2: Fix the function to accept both
function add(a: number | string, b: number): number {
  return Number(a) + b;
}

// Fix option 3: Use a type guard
function isNumeric(val: unknown): val is number {
  return typeof val === 'number' && !isNaN(val);
}

// Fix option 4: Fix at the source — ensure callers pass correct types
function processInput(raw: string): number {
  const parsed = Number(raw);
  if (isNaN(parsed)) throw new Error(\`Invalid number: \${raw}\`);
  return parsed;
}`,
    fixDescription: 'TypeScript type mismatch — parse/convert values, widen parameter types, or add type guards',
    language: 'typescript',
    tags: ['build', 'typescript', 'types', 'assignability'],
  },

  {
    errorMessage: "go: cannot find module providing package github.com/pkg/errors",
    fixCode: `// Fix: Go module not found — initialize module and add dependency
// Step 1: Initialize go module (if not done)
// go mod init myproject

// Step 2: Add the dependency
// go get github.com/pkg/errors

// Step 3: Tidy up
// go mod tidy

// Alternative: use standard library errors (Go 1.13+)
package main

import (
    "errors"
    "fmt"
)

func main() {
    // Wrapping errors (replaces pkg/errors)
    err := fmt.Errorf("connection failed: %w", errors.New("timeout"))

    // Unwrapping
    var target *TimeoutError
    if errors.As(err, &target) {
        fmt.Println("was timeout")
    }
    if errors.Is(err, ErrNotFound) {
        fmt.Println("not found")
    }
}`,
    fixDescription: 'Go module not found — run go get, go mod tidy, or use stdlib errors package for wrapping',
    language: 'go',
    tags: ['build', 'go-modules', 'dependency', 'errors'],
  },

  // ─── NETWORK (4 seeds) ───

  {
    errorMessage: "Error: connect ECONNREFUSED 127.0.0.1:3000",
    fixCode: `// Fix: connection refused — target server is not running or wrong port
// 1. Check if server is running
// lsof -i :3000  (macOS/Linux)
// netstat -tlnp | grep 3000  (Linux)

// 2. Start the server first, then connect
const http = require('http');

function waitForServer(url, maxRetries = 10, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      http.get(url, (res) => {
        resolve(true);
      }).on('error', () => {
        if (++attempts >= maxRetries) {
          reject(new Error('Server not available after ' + maxRetries + ' attempts'));
        } else {
          setTimeout(check, delay);
        }
      });
    };
    check();
  });
}

// 3. Check firewall/network settings
// 4. Verify correct host:port in config`,
    fixDescription: 'Connection refused — verify server is running, correct port, check firewall, add retry logic',
    language: 'javascript',
    tags: ['network', 'connection', 'econnrefused', 'retry'],
  },

  {
    errorMessage: "Error: ETIMEDOUT — request timed out after 30000ms",
    fixCode: `// Fix: request timeout — set appropriate timeouts and add retry with backoff
const https = require('https');

function fetchWithTimeout(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchWithTimeout(url, 10000 * (i + 1));
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = Math.pow(2, i) * 1000;  // Exponential backoff
      await new Promise(r => setTimeout(r, delay));
    }
  }
}`,
    fixDescription: 'Request timeout — set explicit timeout, implement exponential backoff retry, increase timeout for slow endpoints',
    language: 'javascript',
    tags: ['network', 'timeout', 'retry', 'backoff'],
  },

  {
    errorMessage: "Error: self-signed certificate in certificate chain",
    fixCode: `// Fix: HTTPS certificate validation failing
// Option 1: Add CA certificate (RECOMMENDED for production)
const https = require('https');
const fs = require('fs');
const ca = fs.readFileSync('/path/to/ca-cert.pem');
const agent = new https.Agent({ ca });

// Option 2: For development/testing only
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';  // INSECURE!

// Option 3: Fetch API with custom agent
const response = await fetch('https://internal-server.local/api', {
  agent,
  headers: { 'Content-Type': 'application/json' },
});

// Option 4: Add cert to system trust store
// macOS: security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem
// Linux: cp cert.pem /usr/local/share/ca-certificates/ && update-ca-certificates`,
    fixDescription: 'Self-signed certificate — add CA to trust store or agent options, never disable validation in production',
    language: 'javascript',
    tags: ['network', 'tls', 'ssl', 'certificate', 'https'],
  },

  {
    errorMessage: "ConnectionResetError: [Errno 104] Connection reset by peer",
    fixCode: `# Fix: connection reset — remote closed connection unexpectedly
import time
import socket

def resilient_request(url, max_retries=3, backoff=1.0):
    """HTTP request with retry on connection reset."""
    import urllib.request
    import urllib.error

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode()
        except (ConnectionResetError, socket.error) as e:
            if attempt == max_retries - 1:
                raise
            wait = backoff * (2 ** attempt)
            time.sleep(wait)

# Common causes:
# 1. Server overloaded — add rate limiting on client side
# 2. Proxy/firewall closing idle connections — send keep-alive
# 3. Server crash — implement circuit breaker pattern`,
    fixDescription: 'Connection reset by peer — add retry with exponential backoff, check server health, implement circuit breaker',
    language: 'python',
    tags: ['network', 'connection-reset', 'retry', 'resilience'],
  },

  // ─── PERMISSION (4 seeds) ───

  {
    errorMessage: "Error: EACCES: permission denied, open '/etc/config'",
    fixCode: `// Fix: file permission denied — check permissions and use correct paths
const fs = require('fs');
const os = require('os');
const path = require('path');

// Fix option 1: Use user-writable directory
const configDir = path.join(os.homedir(), '.myapp');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}
const configPath = path.join(configDir, 'config.json');

// Fix option 2: Check permissions before access
try {
  fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
} catch {
  console.error('No read/write permission for', filePath);
  // Fallback to user directory
}

// Fix option 3: Fix filesystem permissions
// chmod 644 /path/to/file    (read/write owner, read others)
// chown $USER /path/to/file  (change ownership)`,
    fixDescription: 'Permission denied — use user-writable paths (homedir), check fs.access, fix chmod/chown',
    language: 'javascript',
    tags: ['permission', 'eacces', 'filesystem', 'chmod'],
  },

  {
    errorMessage: "PermissionError: [Errno 13] Permission denied: '/var/log/app.log'",
    fixCode: `# Fix: Python permission denied — use appropriate directories
import os
import tempfile
from pathlib import Path

# Fix option 1: Use user's home directory
log_dir = Path.home() / ".myapp" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_path = log_dir / "app.log"

# Fix option 2: Use temp directory
log_path = Path(tempfile.gettempdir()) / "myapp.log"

# Fix option 3: Check before writing
def safe_write(path, content):
    p = Path(path)
    if p.exists() and not os.access(p, os.W_OK):
        raise PermissionError(f"Cannot write to {path} — check permissions")
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

# Fix option 4: Run with appropriate permissions
# sudo chown -R $USER:$USER /var/log/app/
# Or configure logging to use writable directory`,
    fixDescription: 'Python permission denied — use home directory or temp dir, check os.access(), fix file ownership',
    language: 'python',
    tags: ['permission', 'errno13', 'filesystem', 'logging'],
  },

  {
    errorMessage: "Error: EPERM: operation not permitted, unlink '/usr/local/bin/tool'",
    fixCode: `// Fix: EPERM — operation requires elevated privileges
const fs = require('fs');
const path = require('path');
const os = require('os');

// Fix option 1: Use local bin instead of system bin
const localBin = path.join(os.homedir(), '.local', 'bin');
if (!fs.existsSync(localBin)) {
  fs.mkdirSync(localBin, { recursive: true });
}
// Add to PATH: export PATH="$HOME/.local/bin:$PATH"

// Fix option 2: Use npx or project-local installs
// npx tool-name        instead of global install
// npm install --save-dev tool-name  then use via npm scripts

// Fix option 3: Use nvm/volta to manage Node without sudo
// curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
// nvm install 22

// Fix option 4: On Windows — run terminal as Administrator
// On macOS/Linux: use sudo only when truly needed
// sudo npm install -g tool-name  (last resort)`,
    fixDescription: 'EPERM operation not permitted — use local directories, npx, nvm, or project-local installs instead of system paths',
    language: 'javascript',
    tags: ['permission', 'eperm', 'sudo', 'global-install'],
  },

  {
    errorMessage: "Error: EACCES: permission denied, listen on port 80",
    fixCode: `// Fix: binding to privileged port (<1024) requires root
const http = require('http');

// Fix option 1: Use a non-privileged port (RECOMMENDED)
const PORT = process.env.PORT || 3000;
const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

// Fix option 2: Use reverse proxy (nginx/caddy) on port 80 → localhost:3000
// nginx.conf:
// server {
//   listen 80;
//   location / { proxy_pass http://localhost:3000; }
// }

// Fix option 3: Grant capability (Linux) — no root needed after this
// sudo setcap cap_net_bind_service=+ep $(which node)

// Fix option 4: Use iptables to redirect
// sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000`,
    fixDescription: 'Cannot bind privileged port — use port >1024, reverse proxy, or setcap for capability',
    language: 'javascript',
    tags: ['permission', 'port', 'privileged', 'nginx', 'proxy'],
  },

  // ─── ASYNC (4 seeds) ───

  {
    errorMessage: "UnhandledPromiseRejection: Error: callback called with error",
    fixCode: `// Fix: unhandled promise rejection — always catch async errors
// Wrong:
// fetchData().then(process);  // no .catch()!

// Fix option 1: .catch() on every promise chain
fetchData()
  .then(process)
  .catch(err => console.error('Failed:', err.message));

// Fix option 2: try/catch with async/await
async function main() {
  try {
    const data = await fetchData();
    await process(data);
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

// Fix option 3: Global handler (safety net, not a fix)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Fix option 4: Promise.allSettled for parallel operations
const results = await Promise.allSettled(promises);
const failures = results.filter(r => r.status === 'rejected');`,
    fixDescription: 'Unhandled promise rejection — add .catch(), use try/catch with await, or Promise.allSettled',
    language: 'javascript',
    tags: ['async', 'promise', 'unhandled-rejection', 'error-handling'],
  },

  {
    errorMessage: "Error: async callback was not invoked within the 5000 ms timeout",
    fixCode: `// Fix: test timeout — async operation never completes
// Common in test frameworks (Mocha, Jest, node:test)

// Cause 1: Forgotten await
// Wrong:  it('test', () => { asyncOperation(); });
// Fix:    it('test', async () => { await asyncOperation(); });

// Cause 2: Callback not called
// Fix for callback-style:
const { describe, it } = require('node:test');
it('works', (t, done) => {
  fetchData((err, data) => {
    if (err) return done(err);
    assert.ok(data);
    done();  // MUST call done()
  });
});

// Cause 3: Increase timeout for slow operations
it('slow test', { timeout: 30000 }, async () => {
  await slowOperation();
});

// Cause 4: Resource not cleaned up — server/db still listening
// Fix: close resources in afterEach/after hooks`,
    fixDescription: 'Test async timeout — add missing await, call done() callback, increase timeout, or close resources',
    language: 'javascript',
    tags: ['async', 'timeout', 'test', 'callback', 'await'],
  },

  {
    errorMessage: "RuntimeError: This event loop is already running (asyncio)",
    fixCode: `# Fix: nested asyncio.run() or running loop already active
import asyncio

# Wrong: calling asyncio.run() when a loop is already running
# asyncio.run(coro())  # RuntimeError in Jupyter/existing loop

# Fix option 1: Use await directly if already in async context
async def main():
    result = await some_coroutine()  # Don't use asyncio.run() here

# Fix option 2: For Jupyter notebooks
import nest_asyncio
nest_asyncio.apply()
asyncio.run(main())

# Fix option 3: Get existing loop
try:
    loop = asyncio.get_running_loop()
    # Already in async context — schedule the coroutine
    task = loop.create_task(some_coroutine())
except RuntimeError:
    # No running loop — safe to use asyncio.run()
    asyncio.run(some_coroutine())

# Fix option 4: Use loop.run_until_complete for sync→async bridge
loop = asyncio.new_event_loop()
try:
    result = loop.run_until_complete(some_coroutine())
finally:
    loop.close()`,
    fixDescription: 'Nested event loop — use await directly, nest_asyncio for Jupyter, or create new loop',
    language: 'python',
    tags: ['async', 'asyncio', 'event-loop', 'jupyter'],
  },

  {
    errorMessage: "fatal error: all goroutines are asleep - deadlock!",
    fixCode: `// Fix: Go deadlock — all goroutines blocked, usually on channels
package main

import "fmt"

// Wrong: unbuffered channel with no reader
// ch := make(chan int)
// ch <- 42  // blocks forever — deadlock!

// Fix option 1: Use goroutine for sender or receiver
func main() {
    ch := make(chan int)
    go func() {
        ch <- 42  // Send in goroutine
    }()
    val := <-ch  // Receive in main
    fmt.Println(val)
}

// Fix option 2: Use buffered channel
// ch := make(chan int, 1)
// ch <- 42  // Doesn't block — buffer has capacity

// Fix option 3: Use select with default for non-blocking
// select {
// case val := <-ch:
//     fmt.Println(val)
// default:
//     fmt.Println("no value ready")
// }

// Fix option 4: Close channels when done sending
// close(ch)  // Receivers get zero value + ok=false`,
    fixDescription: 'Go deadlock — ensure goroutine pairs for send/receive, use buffered channels, or select with default',
    language: 'go',
    tags: ['async', 'deadlock', 'goroutine', 'channel'],
  },

  // ─── DATA (5 seeds) ───

  {
    errorMessage: "SyntaxError: Unexpected token < in JSON at position 0",
    fixCode: `// Fix: JSON.parse received HTML instead of JSON (often a 404/500 page)
// Common when API returns error page instead of JSON response

// Fix option 1: Check response content-type and status
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ': ' + res.statusText);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error('Expected JSON but got: ' + text.slice(0, 100));
  }
  return res.json();
}

// Fix option 2: Safe JSON parse
function safeJSON(str) {
  try {
    return { data: JSON.parse(str), error: null };
  } catch (err) {
    return { data: null, error: err.message + ' — input: ' + str.slice(0, 50) };
  }
}`,
    fixDescription: 'JSON parse got HTML — check HTTP status and content-type before parsing, add safe JSON wrapper',
    language: 'javascript',
    tags: ['data', 'json', 'parse', 'html', 'api'],
  },

  {
    errorMessage: "Error: SQLITE_CONSTRAINT: NOT NULL constraint failed: patterns.name",
    fixCode: `// Fix: SQL constraint violation — required field is null/missing
// Always validate data before inserting into database

function insertPattern(db, pattern) {
  // Validate required fields
  const required = ['name', 'code', 'language'];
  for (const field of required) {
    if (!pattern[field]) {
      throw new Error('Missing required field: ' + field);
    }
  }

  // Provide defaults for optional fields
  const data = {
    name: pattern.name,
    code: pattern.code,
    language: pattern.language || 'unknown',
    description: pattern.description || '',
    tags: JSON.stringify(pattern.tags || []),
    coherency_total: pattern.coherencyTotal ?? 0,
  };

  db.prepare(
    'INSERT INTO patterns (name, code, language, description, tags, coherency_total) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.name, data.code, data.language, data.description, data.tags, data.coherency_total);
}`,
    fixDescription: 'SQL NOT NULL constraint — validate required fields before insert, provide defaults for optional fields',
    language: 'javascript',
    tags: ['data', 'sqlite', 'constraint', 'validation', 'null'],
  },

  {
    errorMessage: "UnicodeDecodeError: 'utf-8' codec can't decode byte 0xff",
    fixCode: `# Fix: file has non-UTF-8 encoding — detect and handle encoding
import codecs

# Fix option 1: Try common encodings
def read_file_flexible(path):
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
    for enc in encodings:
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    # Fallback: read as binary
    with open(path, 'rb') as f:
        return f.read().decode('utf-8', errors='replace')

# Fix option 2: Use chardet to auto-detect
# pip install chardet
# import chardet
# raw = open(path, 'rb').read()
# detected = chardet.detect(raw)
# text = raw.decode(detected['encoding'])

# Fix option 3: Read as binary when encoding unknown
with open(path, 'rb') as f:
    content = f.read()
    # Process bytes directly or decode with error handling
    text = content.decode('utf-8', errors='ignore')`,
    fixDescription: 'Unicode decode error — try multiple encodings, use chardet for detection, or read as binary with error handling',
    language: 'python',
    tags: ['data', 'unicode', 'encoding', 'utf8', 'file'],
  },

  {
    errorMessage: "TypeError: Converting circular structure to JSON",
    fixCode: `// Fix: JSON.stringify on object with circular references
// Common with DOM nodes, Express req/res, or parent↔child refs

// Fix option 1: Custom replacer that handles cycles
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }, indent);
}

// Fix option 2: Extract only the data you need
const safeData = {
  id: obj.id,
  name: obj.name,
  // Don't include circular .parent or .children refs
};
JSON.stringify(safeData);

// Fix option 3: Use structuredClone to deep-clone (breaks cycles)
// const cloned = structuredClone(obj);  // throws on functions/symbols`,
    fixDescription: 'Circular JSON — use WeakSet-based replacer, extract needed fields, or structuredClone',
    language: 'javascript',
    tags: ['data', 'json', 'circular', 'stringify', 'serialization'],
  },

  {
    errorMessage: "yaml.scanner.ScannerError: mapping values are not allowed here",
    fixCode: `# Fix: YAML parsing error — incorrect indentation or special characters
import yaml

# Common YAML gotchas:
# 1. Strings with colons need quoting
# Wrong:  message: Error: something failed
# Right:  message: "Error: something failed"

# 2. Indentation must use spaces (never tabs)
# 3. Lists need consistent indentation

# Safe YAML loading
def load_yaml_safe(path):
    with open(path, 'r') as f:
        try:
            return yaml.safe_load(f)  # safe_load prevents code execution
        except yaml.YAMLError as e:
            if hasattr(e, 'problem_mark'):
                mark = e.problem_mark
                print(f"YAML error at line {mark.line + 1}, column {mark.column + 1}")
                print(f"  {e.problem}")
            raise

# Validate YAML before use
def validate_yaml(text):
    try:
        yaml.safe_load(text)
        return True, None
    except yaml.YAMLError as e:
        return False, str(e)`,
    fixDescription: 'YAML parse error — quote strings with special chars, use spaces not tabs, use safe_load',
    language: 'python',
    tags: ['data', 'yaml', 'parse', 'indentation', 'config'],
  },
];

/**
 * Seed the debug oracle with pre-built patterns.
 * Skips patterns that already exist (by fingerprint).
 *
 * @param {DebugOracle} debugOracle — initialized DebugOracle instance
 * @param {object} options — { verbose, categories, languages }
 * @returns {{ seeded, skipped, variants, byCategory, byLanguage }}
 */
function seedDebugPatterns(debugOracle, options = {}) {
  const { verbose = false, categories, languages } = options;

  const report = {
    seeded: 0,
    skipped: 0,
    duplicates: 0,
    variants: 0,
    byCategory: {},
    byLanguage: {},
  };

  for (const seed of DEBUG_SEEDS) {
    // Filter by category if specified
    if (categories && categories.length > 0) {
      const seedCat = seed.category || _inferCategory(seed.errorMessage);
      if (!categories.includes(seedCat)) {
        report.skipped++;
        continue;
      }
    }

    // Filter by language if specified
    if (languages && languages.length > 0 && !languages.includes(seed.language)) {
      report.skipped++;
      continue;
    }

    try {
      const result = debugOracle.capture({
        errorMessage: seed.errorMessage,
        fixCode: seed.fixCode,
        fixDescription: seed.fixDescription,
        language: seed.language,
        tags: seed.tags || [],
      });

      if (result.captured) {
        report.seeded++;
        const cat = result.pattern?.errorCategory || 'unknown';
        report.byCategory[cat] = (report.byCategory[cat] || 0) + 1;
        report.byLanguage[seed.language] = (report.byLanguage[seed.language] || 0) + 1;
        report.variants += (result.variants || []).length;

        if (verbose) {
          console.log(`  [SEED] ${seed.errorMessage.slice(0, 60)}... (${seed.language}) +${(result.variants || []).length} variants`);
        }
      } else if (result.duplicate) {
        report.duplicates++;
      } else {
        report.skipped++;
      }
    } catch (err) {
      if (verbose) console.log(`  [SKIP] ${seed.errorMessage.slice(0, 50)}...: ${err.message}`);
      report.skipped++;
    }
  }

  return report;
}

function _inferCategory(errorMessage) {
  const { classifyError } = require('./debug-oracle');
  return classifyError(errorMessage);
}

module.exports = {
  DEBUG_SEEDS,
  seedDebugPatterns,
};
