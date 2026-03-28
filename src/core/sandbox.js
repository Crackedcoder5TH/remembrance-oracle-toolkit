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

const { execSync, execFileSync } = require('child_process');
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
    // Verify the directory is under os.tmpdir() to prevent symlink-escape attacks
    const realDir = fs.realpathSync(dir);
    const tmpRoot = fs.realpathSync(os.tmpdir());
    if (!realDir.startsWith(tmpRoot + path.sep) && realDir !== tmpRoot) {
      if (process.env.ORACLE_DEBUG) console.warn(`[sandbox:cleanupSandboxDir] refusing to delete outside tmpdir: ${realDir}`);
      return;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[sandbox:cleanupSandboxDir] silent failure:', e?.message || e);
    // Best effort cleanup
  }
}

/**
 * Execute JavaScript code in a sandboxed subprocess.
 *
 * Trust mode: When options.trustMode is true, the sandbox allows access to
 * node_modules and node: built-in modules (except dangerous ones like
 * child_process, net, etc.). This enables candidate promotion to work for
 * patterns that import project dependencies or Node built-ins like node:sqlite.
 */
function sandboxJS(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, maxMemory = DEFAULT_MAX_MEMORY, trustMode = false } = options;
  const sandboxDir = createSandboxDir();

  try {
    // In trust mode, symlink node_modules into sandbox so requires resolve
    if (trustMode) {
      const projectRoot = _findProjectRoot();
      if (projectRoot) {
        const nmSource = path.join(projectRoot, 'node_modules');
        const nmTarget = path.join(sandboxDir, 'node_modules');
        if (fs.existsSync(nmSource)) {
          try { fs.symlinkSync(nmSource, nmTarget, 'junction'); } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[sandbox:trustMode] symlink failed:', e?.message);
          }
        }
      }
    }

    // Write a preload script that intercepts Module._load
    const preloadPath = path.join(sandboxDir, '_preload.js');
    // In trust mode, only block truly dangerous modules (process spawning, networking)
    // but allow node: built-ins like node:sqlite, node:fs, node:path, etc.
    const blockedModules = trustMode
      ? "new Set(['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2'])"
      : "new Set(['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2'])";
    const preload = `
const Module = require('module');
const _origLoad = Module._load;
const blocked = ${blockedModules};
Module._load = function(request, parent, isMain) {
  const bare = request.startsWith('node:') ? request.slice(5) : request;
  if (blocked.has(bare)) throw new Error('Module "' + request + '" is blocked in sandbox');
  return _origLoad(request, parent, isMain);
};
if (process.binding) { const _origBinding = process.binding; process.binding = function(name) { throw new Error('process.binding("' + name + '") is blocked in sandbox'); }; }
if (process.dlopen) { process.dlopen = function() { throw new Error('process.dlopen is blocked in sandbox'); }; }
`;
    // Write with restrictive permissions (owner-only) then make read-only
    // to close TOCTOU race between write and exec
    const fd = fs.openSync(preloadPath, 'w', 0o600);
    fs.writeSync(fd, preload);
    fs.closeSync(fd);
    fs.chmodSync(preloadPath, 0o400);

    // Write code to a separate module file so test can require() it
    // without const/let redeclaration errors from concatenation
    const codePath = path.join(sandboxDir, 'code.js');
    const fdCode = fs.openSync(codePath, 'w', 0o600);
    fs.writeSync(fdCode, "'use strict';\n" + code + "\n");
    fs.closeSync(fdCode);
    fs.chmodSync(codePath, 0o400);

    // Write test file — rewrite require paths to point at sandbox code.js
    const filePath = path.join(sandboxDir, 'test.js');
    let testContent;
    const hasRequire = /require\s*\(\s*['"][^'"]+['"]\s*\)/.test(testCode);
    if (hasRequire) {
      // Redirect any require('...') that isn't a node module to ./code.js
      testContent = "'use strict';\n" + testCode.replace(
        /require\s*\(\s*['"](?:\.\.?\/[^'"]+)['"]\s*\)/g,
        "require('./code.js')"
      ) + "\n";
    } else {
      // No require — inline code then test (original behavior for standalone snippets)
      testContent = "'use strict';\n" + code + ";\n" + testCode + "\n";
    }
    const fdTest = fs.openSync(filePath, 'w', 0o600);
    fs.writeSync(fdTest, testContent);
    fs.closeSync(fdTest);
    fs.chmodSync(filePath, 0o400);

    const safeMem = Math.max(1, Math.min(parseInt(maxMemory, 10) || DEFAULT_MAX_MEMORY, 8192));
    const memFlag = `--max-old-space-size=${safeMem}`;

    // In trust mode, set NODE_PATH to project's node_modules for module resolution
    const projectRoot = _findProjectRoot();
    const nodePath = trustMode && projectRoot
      ? path.join(projectRoot, 'node_modules')
      : '';

    const result = execFileSync('node', [memFlag, '--require', preloadPath, filePath],
      {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: sandboxDir,
        env: {
          PATH: process.env.PATH,
          NODE_PATH: nodePath,
          HOME: trustMode ? (process.env.HOME || sandboxDir) : sandboxDir,
        },
      }
    );

    return {
      passed: true,
      output: result || 'All assertions passed',
      sandboxed: true,
      trustMode,
    };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
      trustMode,
    };
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Execute Python code in a sandboxed subprocess.
 */
function sandboxPython(code, testCode, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, trustMode = false } = options;
  const sandboxDir = createSandboxDir();

  try {
    // Write code+test to file via concatenation (not template literal interpolation)
    const filePath = path.join(sandboxDir, 'test.py');
    // In trust mode, allow safe standard library modules (os.path, sys, etc.)
    // but still block process execution and network modules
    const blockedSet = trustMode
      ? "{'subprocess', 'shutil', 'socket', 'http', 'urllib', 'requests', 'paramiko', 'ctypes', '_ctypes', 'signal', 'multiprocessing', 'pty', 'fcntl', 'resource', 'code', 'codeop', 'compileall', 'runpy'}"
      : "{'subprocess', 'shutil', 'socket', 'http', 'urllib', 'requests', 'paramiko', 'os', 'importlib', 'ctypes', '_ctypes', 'signal', 'multiprocessing', 'pty', 'fcntl', 'resource', 'sys', 'code', 'codeop', 'compileall', 'runpy'}";
    const prelude = "import sys\nimport builtins\n\n" +
      "# Block dangerous modules — handles both module and dict forms of __builtins__\n" +
      "_original_import = __import__\n" +
      "blocked = " + blockedSet + "\n\n" +
      "def _safe_import(name, *args, **kwargs):\n" +
      "    if name.split('.')[0] in blocked:\n" +
      '        raise ImportError(f\'Module "{name}" is blocked in sandbox\')\n' +
      "    return _original_import(name, *args, **kwargs)\n\n" +
      "builtins.__import__ = _safe_import\n" +
      "# Also patch __builtins__ if it's a module (not a dict)\n" +
      "if hasattr(__builtins__, '__import__'):\n" +
      "    __builtins__.__import__ = _safe_import\n\n";
    // Write code to separate module, import in test to avoid name collisions
    const codePyPath = path.join(sandboxDir, 'code.py');
    const fdPyCode = fs.openSync(codePyPath, 'w', 0o600);
    fs.writeSync(fdPyCode, code + "\n");
    fs.closeSync(fdPyCode);
    fs.chmodSync(codePyPath, 0o400);

    const hasImport = /(?:from\s+\S+\s+import|import\s+\S+)/.test(testCode);
    let pyTestContent;
    if (hasImport) {
      // Rewrite relative imports to use the sandbox code module
      pyTestContent = prelude + testCode.replace(
        /from\s+\S+\s+import\s+/g,
        'from code import '
      ) + "\n";
    } else {
      // No imports — inline code then test (standalone snippets)
      pyTestContent = prelude + code + "\n" + testCode + "\n";
    }
    const fdPy = fs.openSync(filePath, 'w', 0o600);
    fs.writeSync(fdPy, pyTestContent);
    fs.closeSync(fdPy);
    fs.chmodSync(filePath, 0o400);

    const result = execFileSync('python3', [filePath],
      {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: sandboxDir,
        env: {
          PATH: process.env.PATH,
          HOME: trustMode ? (process.env.HOME || sandboxDir) : sandboxDir,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      }
    );

    return {
      passed: true,
      output: result || 'All assertions passed',
      sandboxed: true,
      trustMode,
    };
  } catch (err) {
    const isTimeout = err.killed || err.signal === 'SIGTERM';
    return {
      passed: false,
      output: isTimeout ? 'Execution timed out' : (err.stderr || err.stdout || err.message),
      sandboxed: true,
      timedOut: isTimeout,
      trustMode,
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[sandbox:isTsxAvailable] silent failure:', e?.message || e);
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
  const { timeout = DEFAULT_TIMEOUT, maxMemory = DEFAULT_MAX_MEMORY, trustMode = false } = options;
  const sandboxDir = createSandboxDir();

  // Pre-process: normalize literal escape sequences in code
  const normalizedCode = normalizeEscapes(code);
  const normalizedTest = normalizeEscapes(testCode);

  try {
    const preloadPath = path.join(sandboxDir, '_preload.js');
    // In trust mode, symlink node_modules for TS module resolution
    if (trustMode) {
      const projectRoot = _findProjectRoot();
      if (projectRoot) {
        const nmSource = path.join(projectRoot, 'node_modules');
        const nmTarget = path.join(sandboxDir, 'node_modules');
        if (fs.existsSync(nmSource)) {
          try { fs.symlinkSync(nmSource, nmTarget, 'junction'); } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[sandbox:trustMode:ts] symlink failed:', e?.message);
          }
        }
      }
    }

    const preload = `
const Module = require('module');
const _origLoad = Module._load;
const blocked = new Set(['child_process', 'cluster', 'dgram', 'dns', 'net', 'tls', 'http', 'https', 'http2']);
Module._load = function(request, parent, isMain) {
  const bare = request.startsWith('node:') ? request.slice(5) : request;
  if (blocked.has(bare)) throw new Error('Module "' + request + '" is blocked in sandbox');
  return _origLoad(request, parent, isMain);
};
if (process.binding) { const _origBinding = process.binding; process.binding = function(name) { throw new Error('process.binding("' + name + '") is blocked in sandbox'); }; }
if (process.dlopen) { process.dlopen = function() { throw new Error('process.dlopen is blocked in sandbox'); }; }
`;
    // Write with restrictive permissions then make read-only (TOCTOU mitigation)
    const fdPre = fs.openSync(preloadPath, 'w', 0o600);
    fs.writeSync(fdPre, preload);
    fs.closeSync(fdPre);
    fs.chmodSync(preloadPath, 0o400);

    // Write code to separate file for TypeScript, rewrite require paths in test
    const tsCodePath = path.join(sandboxDir, 'code.ts');
    const fdTsCode = fs.openSync(tsCodePath, 'w', 0o600);
    fs.writeSync(fdTsCode, normalizedCode + "\n");
    fs.closeSync(fdTsCode);
    fs.chmodSync(tsCodePath, 0o400);

    const tsHasRequire = /require\s*\(\s*['"][^'"]+['"]\s*\)|import\s+/.test(normalizedTest);
    let wrapper;
    if (tsHasRequire) {
      wrapper = "'use strict';\n" + normalizedTest.replace(
        /require\s*\(\s*['"](?:\.\.?\/[^'"]+)['"]\s*\)/g,
        "require('./code')"
      ) + "\n";
    } else {
      wrapper = "'use strict';\n// Run user code\n" + normalizedCode + "\n;\n// Run tests\n" + normalizedTest + "\n";
    }

    const memFlag = `--max-old-space-size=${maxMemory}`;
    const projectRoot = _findProjectRoot();
    const tsNodePath = trustMode && projectRoot ? path.join(projectRoot, 'node_modules') : '';
    const sandboxEnv = { PATH: process.env.PATH, NODE_PATH: tsNodePath, HOME: trustMode ? (process.env.HOME || sandboxDir) : sandboxDir, NODE_NO_WARNINGS: '1' };
    const execOpts = { timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: sandboxDir, env: sandboxEnv };

    // Strategy 1: Native --experimental-strip-types (.ts file)
    const tsPath = path.join(sandboxDir, 'test.ts');
    const fdTs = fs.openSync(tsPath, 'w', 0o600);
    fs.writeSync(fdTs, wrapper);
    fs.closeSync(fdTs);
    fs.chmodSync(tsPath, 0o400);

    try {
      const result = execSync(
        `node ${memFlag} --experimental-strip-types --require "${preloadPath}" "${tsPath}"`,
        execOpts
      );
      return { passed: true, output: result || 'All assertions passed', sandboxed: true };
    } catch (tsErr) {
      if (process.env.ORACLE_DEBUG) console.warn('[sandbox:function] silent failure:', tsErr?.message || tsErr);
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
        if (process.env.ORACLE_DEBUG) console.warn('[sandbox:init] silent failure:', tsxErr?.message || tsxErr);
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
    // Write stripped code to separate file, rewrite test requires
    const strippedCode = stripTypeAnnotations(normalizedCode);
    const strippedTest = stripTypeAnnotations(normalizedTest);
    const jsCodePath = path.join(sandboxDir, 'code.js');
    const fdJsCode = fs.openSync(jsCodePath, 'w', 0o600);
    fs.writeSync(fdJsCode, "'use strict';\n" + strippedCode + "\n");
    fs.closeSync(fdJsCode);
    fs.chmodSync(jsCodePath, 0o400);

    let strippedWrapper;
    if (tsHasRequire) {
      strippedWrapper = "'use strict';\n" + strippedTest.replace(
        /require\s*\(\s*['"](?:\.\.?\/[^'"]+)['"]\s*\)/g,
        "require('./code')"
      ) + "\n";
    } else {
      strippedWrapper = "'use strict';\n// Run user code (types manually stripped)\n" + strippedCode + "\n;\n// Run tests\n" + strippedTest + "\n";
    }
    const jsPath = path.join(sandboxDir, 'test.js');
    const fdJs = fs.openSync(jsPath, 'w', 0o600);
    fs.writeSync(fdJs, strippedWrapper);
    fs.closeSync(fdJs);
    fs.chmodSync(jsPath, 0o400);

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
      env: { PATH: process.env.PATH, HOME: sandboxDir, GOPATH: path.join(sandboxDir, 'gopath'), GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), 'go-build') },
    });

    const codePath = path.join(sandboxDir, 'code.go');
    const fdGo = fs.openSync(codePath, 'w', 0o600);
    fs.writeSync(fdGo, code);
    fs.closeSync(fdGo);
    fs.chmodSync(codePath, 0o400);

    const testPath = path.join(sandboxDir, 'code_test.go');
    const fdGoTest = fs.openSync(testPath, 'w', 0o600);
    fs.writeSync(fdGoTest, testCode);
    fs.closeSync(fdGoTest);
    fs.chmodSync(testPath, 0o400);

    const result = execSync('go test -v -count=1 ./...', {
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sandboxDir,
      env: {
        PATH: process.env.PATH,
        HOME: sandboxDir,
        GOPATH: path.join(sandboxDir, 'gopath'),
        GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), 'go-build'),
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

    const libRs = code + "\n\n#[cfg(test)]\nmod tests {\n" + testCode + "\n}\n";
    const rsPath = path.join(srcDir, 'lib.rs');
    const fdRs = fs.openSync(rsPath, 'w', 0o600);
    fs.writeSync(fdRs, libRs);
    fs.closeSync(fdRs);
    fs.chmodSync(rsPath, 0o400);

    const result = execFileSync('cargo', ['test'], {
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
 * Find the project root by walking up from cwd looking for package.json.
 * Cached after first lookup.
 */
let _projectRoot = undefined;
function _findProjectRoot() {
  if (_projectRoot !== undefined) return _projectRoot;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      _projectRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  _projectRoot = null;
  return null;
}

/**
 * Non-executable content types that should bypass sandbox execution.
 */
const NON_CODE_LANGUAGES = new Set([
  'yaml', 'yml', 'toml', 'ini', 'env', 'json', 'jsonc',
  'markdown', 'md', 'txt', 'text',
  'dockerfile', 'docker',
  'sql', 'graphql', 'gql',
  'regex', 'regexp',
  'csv', 'tsv', 'xml', 'svg',
  'html', 'css', 'scss', 'sass', 'less',
  'ejs', 'handlebars', 'hbs', 'mustache', 'pug', 'jade',
  'config', 'template', 'documentation', 'schema', 'snippet',
]);

/**
 * Universal sandboxed executor.
 */
function sandboxExecute(code, testCode, language, options = {}) {
  const lang = (language || 'javascript').toLowerCase();

  // Non-code content types bypass sandbox execution entirely
  if (NON_CODE_LANGUAGES.has(lang)) {
    return { passed: null, output: `Content type "${lang}" does not require test execution`, sandboxed: false, contentType: lang };
  }

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
