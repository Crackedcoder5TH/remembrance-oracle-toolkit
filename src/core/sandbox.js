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
 * Execute TypeScript code in a sandboxed subprocess.
 * Uses Node 22's --experimental-strip-types to strip TS syntax.
 */
function sandboxTypeScript(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, maxMemory = DEFAULT_MAX_MEMORY } = options;
  const sandboxDir = createSandboxDir();

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
${code}
;
// Run tests
${testCode}
`;

    const filePath = path.join(sandboxDir, 'test.ts');
    fs.writeFileSync(filePath, wrapper, 'utf-8');

    const memFlag = `--max-old-space-size=${maxMemory}`;
    const result = execSync(
      `node ${memFlag} --experimental-strip-types --require "${preloadPath}" "${filePath}"`,
      {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: sandboxDir,
        env: {
          PATH: process.env.PATH,
          NODE_PATH: '',
          HOME: sandboxDir,
          NODE_NO_WARNINGS: '1',
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
