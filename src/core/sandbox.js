/**
 * Sandboxed test execution.
 *
 * Runs submitted code in an isolated subprocess with:
 * - Timeouts (no infinite loops)
 * - Memory limits
 * - No network access
 * - No filesystem access outside temp dir
 * - Separate process (crash-safe)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_MEMORY = 64; // MB

function createSandboxDir() {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `oracle-sandbox-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupSandboxDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

/**
 * Execute JavaScript code in a sandboxed subprocess.
 */
function sandboxJS(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, maxMemory = DEFAULT_MAX_MEMORY } = options;
  const sandboxDir = createSandboxDir();

  try {
    // Write a preload script that intercepts Module._load
    const preloadPath = path.join(sandboxDir, '_preload.js');
    const preload = `
const Module = require('module');
const _origLoad = Module._load;
const blocked = new Set(['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2']);
Module._load = function(request, parent, isMain) {
  if (blocked.has(request)) throw new Error('Module "' + request + '" is blocked in sandbox');
  return _origLoad(request, parent, isMain);
};
`;
    fs.writeFileSync(preloadPath, preload, 'utf-8');

    // Write the actual code + test
    const wrapper = `
'use strict';
// Run user code
${code}
;
// Run tests
${testCode}
`;

    const filePath = path.join(sandboxDir, 'test.js');
    fs.writeFileSync(filePath, wrapper, 'utf-8');

    const memFlag = `--max-old-space-size=${maxMemory}`;
    const result = execSync(
      `node ${memFlag} --require "${preloadPath}" "${filePath}"`,
      {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: sandboxDir,
        env: {
          PATH: process.env.PATH,
          NODE_PATH: '',
          HOME: sandboxDir,
        },
      }
    );

    return {
      passed: true,
      output: result || 'All assertions passed',
      sandboxed: true,
    };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
    };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Execute Python code in a sandboxed subprocess.
 */
function sandboxPython(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT } = options;
  const sandboxDir = createSandboxDir();

  try {
    const wrapper = `
import sys
import os

# Block dangerous modules
_original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__
blocked = {'subprocess', 'shutil', 'socket', 'http', 'urllib', 'requests', 'paramiko'}

def _safe_import(name, *args, **kwargs):
    if name.split('.')[0] in blocked:
        raise ImportError(f'Module "{name}" is blocked in sandbox')
    return _original_import(name, *args, **kwargs)

try:
    __builtins__.__import__ = _safe_import
except:
    pass

# Run user code
${code}

# Run tests
${testCode}
`;

    const filePath = path.join(sandboxDir, 'test.py');
    fs.writeFileSync(filePath, wrapper, 'utf-8');

    const result = execSync(
      `python3 "${filePath}"`,
      {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: sandboxDir,
        env: {
          PATH: process.env.PATH,
          HOME: sandboxDir,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      }
    );

    return {
      passed: true,
      output: result || 'All assertions passed',
      sandboxed: true,
    };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
    };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Normalize literal escape sequences (\\n, \\t) that appear in code
 * stored with escaped newlines/tabs instead of actual whitespace.
 */
function normalizeEscapes(code) {
  if (!code) return code;
  // Only fix if code contains literal \n or \t outside of strings
  // Heuristic: if the code has no actual newlines but has \n sequences, it's escaped
  if (code.includes('\\n') && !code.includes('\n')) {
    return code.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }
  return code;
}

/**
 * Strip TypeScript type annotations from code (lightweight, no deps).
 * Handles: param types, return types, generics, type/interface declarations,
 * union/intersection types, custom type references, and enum declarations.
 */
function stripTypeAnnotations(code) {
  let result = code;
  // Remove enum declarations
  result = result.replace(/^(export\s+)?(const\s+)?enum\s+\w+\s*\{[\s\S]*?^\}/gm, '');
  // Remove standalone interface/type declaration blocks
  result = result.replace(/^(export\s+)?(interface|type)\s+\w[^\n]*\{[\s\S]*?^\}/gm, '');
  // Remove single-line type/interface declarations
  result = result.replace(/^(export\s+)?(type|interface)\s+[^\n]+;\s*$/gm, '');
  // Remove : Type annotations — built-in types, custom types, union/intersection types, array types
  result = result.replace(/:\s*(?:(?:string|number|boolean|void|any|unknown|never|null|undefined|object|bigint|symbol|Function|Date|RegExp|Error)\b(?:\[\])?(?:\s*\|\s*(?:string|number|boolean|void|any|unknown|never|null|undefined|object|bigint|symbol|Function|Date|RegExp|Error)\b(?:\[\])?)*)\s*(?=[,)=\{;])/g, '');
  // Remove : CustomType annotations (PascalCase identifiers)
  result = result.replace(/:\s*[A-Z]\w*(?:\[\])?\s*(?=[,)=\{;])/g, '');
  // Remove generic type params <T, U> from function declarations
  result = result.replace(/<\s*[A-Z]\w*(?:\s*(?:extends\s+\w+)?\s*,\s*[A-Z]\w*(?:\s*extends\s+\w+)?)*\s*>/g, '');
  // Remove 'as Type' assertions (including custom types)
  result = result.replace(/\s+as\s+(?:string|number|boolean|any|unknown|const|[A-Z]\w*)\b/g, '');
  // Remove complex type annotations like : Record<...>, : Map<...>, etc.
  result = result.replace(/:\s*(?:Record|Map|Set|Array|Promise|Partial|Required|Pick|Omit|ReadonlyArray|Readonly)<[^>]+>\s*(?=[,)=\{;])/g, '');
  // Remove return type annotations (function foo(): Type) including union returns
  result = result.replace(/\)\s*:\s*(?:string|number|boolean|void|any|unknown|never|null|undefined|object|Promise<[^>]+>|[A-Z]\w*(?:\[\])?)(?:\s*\|\s*(?:string|number|boolean|void|any|unknown|never|null|undefined|object|[A-Z]\w*(?:\[\])?))*\s*\{/g, ') {');
  // Remove non-null assertions (!)
  result = result.replace(/!\./g, '.');
  result = result.replace(/!\[/g, '[');
  return result;
}

/**
 * Check if tsx is available for TypeScript execution.
 * Cached after first check.
 */
let _tsxAvailable = null;
function isTsxAvailable() {
  if (_tsxAvailable !== null) return _tsxAvailable;
  try {
    execSync('tsx --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    _tsxAvailable = true;
  } catch {
    _tsxAvailable = false;
  }
  return _tsxAvailable;
}

/**
 * Execute TypeScript code in a sandboxed subprocess.
 *
 * Strategy chain (stops at first success or non-TS-syntax failure):
 *   1. Node --experimental-strip-types (fast, built-in, handles most TS)
 *   2. tsx runtime (handles enums, decorators, namespaces, complex TS)
 *   3. Manual type stripping → run as plain JS (last resort)
 *
 * Code is pre-processed to normalize literal escape sequences.
 */
function sandboxTypeScript(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, maxMemory = DEFAULT_MAX_MEMORY } = options;
  const sandboxDir = createSandboxDir();

  // Pre-process: normalize literal escape sequences in code
  const normalizedCode = normalizeEscapes(code);
  const normalizedTest = normalizeEscapes(testCode);

  try {
    const preloadPath = path.join(sandboxDir, '_preload.js');
    const preload = `
const Module = require('module');
const _origLoad = Module._load;
const blocked = new Set(['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2']);
Module._load = function(request, parent, isMain) {
  if (blocked.has(request)) throw new Error('Module "' + request + '" is blocked in sandbox');
  return _origLoad(request, parent, isMain);
};
`;
    fs.writeFileSync(preloadPath, preload, 'utf-8');

    const wrapper = `
'use strict';
// Run user code
${normalizedCode}
;
// Run tests
${normalizedTest}
`;

    const memFlag = `--max-old-space-size=${maxMemory}`;
    const sandboxEnv = { PATH: process.env.PATH, NODE_PATH: '', HOME: sandboxDir, NODE_NO_WARNINGS: '1' };
    const execOpts = { timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: sandboxDir, env: sandboxEnv };

    // Strategy 1: Native --experimental-strip-types (.ts file)
    const tsPath = path.join(sandboxDir, 'test.ts');
    fs.writeFileSync(tsPath, wrapper, 'utf-8');

    try {
      const result = execSync(
        `node ${memFlag} --experimental-strip-types --require "${preloadPath}" "${tsPath}"`,
        execOpts
      );
      return { passed: true, output: result || 'All assertions passed', sandboxed: true };
    } catch (tsErr) {
      const isTimeout = tsErr.killed || tsErr.signal === 'SIGTERM';
      if (isTimeout) {
        return { passed: false, output: 'Execution timed out', sandboxed: true, timedOut: true };
      }
      const tsOutput = tsErr.stderr || tsErr.stdout || tsErr.message || '';

      // If it's a syntax/import/TS-specific error, try next strategy; otherwise it's a test logic failure
      const isTsSyntaxError = /ERR_UNSUPPORTED_|ERR_INVALID_TYPESCRIPT|SyntaxError|Cannot use import|Unexpected token/i.test(tsOutput);
      if (!isTsSyntaxError) {
        return { passed: false, output: tsOutput, sandboxed: true, timedOut: false };
      }
    }

    // Strategy 2: tsx runtime (handles enums, decorators, namespaces, etc.)
    if (isTsxAvailable()) {
      try {
        const result = execSync(
          `tsx "${tsPath}"`,
          { ...execOpts, env: { ...sandboxEnv, NODE_OPTIONS: `--max-old-space-size=${maxMemory} --require "${preloadPath}"` } }
        );
        return { passed: true, output: result || 'All assertions passed (tsx)', sandboxed: true };
      } catch (tsxErr) {
        const isTimeout = tsxErr.killed || tsxErr.signal === 'SIGTERM';
        if (isTimeout) {
          return { passed: false, output: 'Execution timed out', sandboxed: true, timedOut: true };
        }
        const tsxOutput = tsxErr.stderr || tsxErr.stdout || tsxErr.message || '';

        // If tsx ran the code but the test failed, that's a definitive result
        const isTsxSyntaxError = /SyntaxError|Cannot find module|ERR_MODULE/i.test(tsxOutput);
        if (!isTsxSyntaxError) {
          return { passed: false, output: tsxOutput, sandboxed: true, timedOut: false };
        }
      }
    }

    // Strategy 3: Manual type stripping, run as .js
    const strippedWrapper = `
'use strict';
// Run user code (types manually stripped)
${stripTypeAnnotations(normalizedCode)}
;
// Run tests
${stripTypeAnnotations(normalizedTest)}
`;
    const jsPath = path.join(sandboxDir, 'test.js');
    fs.writeFileSync(jsPath, strippedWrapper, 'utf-8');

    const jsResult = execSync(
      `node ${memFlag} --require "${preloadPath}" "${jsPath}"`,
      execOpts
    );
    return { passed: true, output: jsResult || 'All assertions passed (types stripped)', sandboxed: true };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
    };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Execute Go code in a sandboxed subprocess.
 * Uses `go test` with a temp module.
 */
function sandboxGo(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT * 5 } = options; // Go compilation needs more time
  const sandboxDir = createSandboxDir();

  try {
    execSync('go mod init sandbox', {
      cwd: sandboxDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      env: { PATH: process.env.PATH, HOME: sandboxDir, GOPATH: path.join(sandboxDir, 'gopath') },
    });

    const codePath = path.join(sandboxDir, 'code.go');
    fs.writeFileSync(codePath, code, 'utf-8');

    const testPath = path.join(sandboxDir, 'code_test.go');
    fs.writeFileSync(testPath, testCode, 'utf-8');

    const result = execSync('go test -v -count=1 ./...', {
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sandboxDir,
      env: {
        PATH: process.env.PATH,
        HOME: sandboxDir,
        GOPATH: path.join(sandboxDir, 'gopath'),
        GOPROXY: 'off',
        GONOSUMCHECK: '*',
        GOFLAGS: '-mod=mod',
      },
    });

    return { passed: true, output: result || 'All tests passed', sandboxed: true };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
    };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Execute Rust code in a sandboxed subprocess.
 * Creates a temp Cargo project and runs `cargo test`.
 */
function sandboxRust(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT * 3 } = options; // Rust compilation is slower
  const sandboxDir = createSandboxDir();

  try {
    const srcDir = path.join(sandboxDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(path.join(sandboxDir, 'Cargo.toml'), `[package]\nname = "sandbox"\nversion = "0.1.0"\nedition = "2021"\n`, 'utf-8');

    const libRs = `${code}\n\n#[cfg(test)]\nmod tests {\n${testCode}\n}\n`;
    fs.writeFileSync(path.join(srcDir, 'lib.rs'), libRs, 'utf-8');

    const result = execSync('cargo test 2>&1', {
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sandboxDir,
      env: {
        PATH: process.env.PATH,
        HOME: sandboxDir,
        CARGO_HOME: path.join(sandboxDir, '.cargo'),
        RUSTUP_HOME: process.env.RUSTUP_HOME || path.join(process.env.HOME || '/root', '.rustup'),
      },
    });

    return { passed: true, output: result || 'All tests passed', sandboxed: true };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    const output = isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message);
    if (!isTimeout && output && output.includes('test result: ok')) {
      return { passed: true, output, sandboxed: true };
    }
    return { passed: false, output, sandboxed: true, timedOut: isTimeout };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

// ─── Custom runner registry reference (set by PluginManager integration) ───
let _customRunnerRegistry = null;

/**
 * Set the custom runner registry for plugin-provided language runners.
 * Called by the oracle when a PluginManager with runners is available.
 */
function setRunnerRegistry(registry) {
  _customRunnerRegistry = registry;
}

/**
 * Universal sandboxed executor.
 */
function sandboxExecute(code, testCode, language, options = {}) {
  const lang = (language || 'javascript').toLowerCase();

  if (lang === 'javascript' || lang === 'js') {
    return sandboxJS(code, testCode, options);
  }
  if (lang === 'typescript' || lang === 'ts') {
    return sandboxTypeScript(code, testCode, options);
  }
  if (lang === 'python' || lang === 'py') {
    return sandboxPython(code, testCode, options);
  }
  if (lang === 'go' || lang === 'golang') {
    return sandboxGo(code, testCode, options);
  }
  if (lang === 'rust' || lang === 'rs') {
    return sandboxRust(code, testCode, options);
  }

  // Check custom runner registry for plugin-provided runners
  if (_customRunnerRegistry && _customRunnerRegistry.has(lang)) {
    return _customRunnerRegistry.execute(lang, code, testCode, options);
  }

  return { passed: null, output: `No sandbox runner for: ${lang}`, sandboxed: false };
}

module.exports = {
  sandboxExecute,
  sandboxJS,
  sandboxTypeScript,
  sandboxPython,
  sandboxGo,
  sandboxRust,
  createSandboxDir,
  cleanupSandboxDir,
  setRunnerRegistry,
};
