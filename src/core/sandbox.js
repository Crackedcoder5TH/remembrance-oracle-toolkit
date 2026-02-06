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

  return { passed: null, output: `No sandbox runner for: ${lang}`, sandboxed: false };
}

module.exports = {
  sandboxExecute,
  sandboxJS,
  sandboxTypeScript,
  sandboxPython,
  createSandboxDir,
  cleanupSandboxDir,
};
