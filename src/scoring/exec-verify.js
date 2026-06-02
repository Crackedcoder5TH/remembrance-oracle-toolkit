'use strict';

/**
 * exec-verify.js — the filter that turns "looks right" into "is right".
 *
 * Every other anti-hallucination signal (fractal coherency, pattern resonance,
 * safety) checks form, familiarity, or safety. None of them run the code.
 * This one does: it executes code in a throwaway sandbox and reports whether
 * it actually works — the only signal that catches correct-looking logic
 * that's subtly wrong.
 *
 * Safety model (this runs unknown code, so it is deliberately strict):
 *   1. SCREEN FIRST. The code is checked against the ecosystem's covenant
 *      harm patterns (fork bombs, remote exec, destructive ops, backdoors).
 *      Anything flagged is NEVER executed — returns { status: 'blocked',
 *      signal: null } so it abstains rather than penalizes. FAIL-SAFE: if
 *      the harm screen can't be loaded, we do not execute.
 *   2. SANDBOX. What does run goes in a throwaway temp dir, with a hard
 *      timeout, a capped output buffer, and a minimal environment (PATH
 *      only). When this runs on a public server, run the SERVER inside an
 *      OS/container sandbox too — defense in depth, not a jail.
 *
 * Signals (folded into a consensus / verdict by the caller):
 *   pass (test ran, exit 0)         → 1.0
 *   smoke-pass (no test, ran clean) → 0.75  (weaker: only proves it executes)
 *   fail / timeout                  → 0.0
 *   blocked (covenant) / skipped    → null  (abstains — no signal, no penalty)
 *
 * Port of /home/user/REMEMBRANCE-AGENT-Swarm-/src/swarm/exec-verify.js,
 * trimmed to the single-call shape needed by the field-server (no
 * cross-verify — that belongs at the swarm layer, not the field tool).
 */

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Languages we can actually execute. TypeScript is intentionally absent:
// plain node can't run TS, and a failed parse would be a false 'fail'.
const RUNTIME = { javascript: 'js', js: 'js', python: 'py', py: 'py' };

let _harmPatterns;  // undefined = not yet loaded, null = unavailable
function _loadHarmPatterns() {
  if (_harmPatterns !== undefined) return _harmPatterns;
  _harmPatterns = null;
  try {
    const m = require('../core/covenant-harm');
    if (m && Array.isArray(m.HARM_PATTERNS)) _harmPatterns = m.HARM_PATTERNS;
  } catch (_e) { _harmPatterns = null; }
  return _harmPatterns;
}

/** Returns the matching harm reason if unsafe to run, '' if clear, or null
 * if the screen itself is unavailable (caller MUST fail-safe). */
function _harmScreen(code) {
  const pats = _loadHarmPatterns();
  if (!pats) return null;
  for (const hp of pats) {
    if (!hp || !hp.pattern) continue;
    try {
      if (hp.pattern.global) hp.pattern.lastIndex = 0;
      if (hp.pattern.test(code)) return hp.reason || 'covenant harm pattern';
    } catch (_e) { /* skip a bad pattern */ }
  }
  return '';
}

function _spawn(cmd, args, cwd, timeoutMs, env) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024,
      // Empty env by default — caller passes only what's needed. Empty env
      // means the child can't read OS-level secrets (DB_PASSWORD, API keys,
      // etc.) that happen to be in the parent's env.
      env: env || {},
    }, (err) => {
      if (!err) return resolve({ ok: true });
      if (err.code === 'ENOENT') return resolve({ missing: true });
      if (err.killed || err.signal === 'SIGTERM') return resolve({ timeout: true });
      resolve({ ok: false });
    });
  });
}

function _sep(lang) { return lang === 'py' ? '\n\n' : '\n;\n'; }

async function _runBody(lang, body, hasTest, dir, timeoutMs) {
  if (lang === 'js') {
    const file = path.join(dir, 'solution.js');
    fs.writeFileSync(file, body, 'utf8');
    // Hardened sandbox for JS execution:
    //   · process.execPath — absolute path to node, no PATH lookup needed
    //   · --permission — Node 20+ in-process sandbox (NO syscalls outside
    //     allowed FS, NO child_process, NO network, NO worker_threads)
    //   · --allow-fs-read=<dir> — read only inside the tempdir (the child
    //     can read its own solution.js but NOT /etc/passwd, the parent's
    //     code, env files, or anything else on disk)
    //   · empty env — the child can't read OS secrets the parent inherited
    // Verified live (Node v22): blocks child_process spawn, blocks
    // arbitrary FS reads, blocks network. This is real isolation, not a
    // wish — though for defence in depth still run the SERVER inside a
    // container/VM if exposed to a public network.
    const nodeBin = process.execPath;
    const permFlags = ['--permission', '--allow-fs-read=' + dir];
    const syntax = await _spawn(nodeBin, [...permFlags, '--check', file], dir, timeoutMs);
    if (syntax.missing) return { status: 'skipped', signal: null, detail: 'node not available' };
    if (syntax.timeout) return { status: 'timeout', signal: 0, detail: 'syntax check timed out' };
    if (!syntax.ok) return { status: 'fail', signal: 0, detail: 'syntax error' };
    const run = await _spawn(nodeBin, [...permFlags, file], dir, timeoutMs);
    if (run.missing) return { status: 'skipped', signal: null, detail: 'node not available' };
    if (run.timeout) return { status: 'timeout', signal: 0, detail: 'execution timed out' };
    if (!run.ok) return { status: 'fail', signal: 0, detail: hasTest ? 'test failed' : 'threw at runtime' };
    return hasTest
      ? { status: 'pass', signal: 1.0, detail: 'tests passed' }
      : { status: 'smoke-pass', signal: 0.75, detail: 'executed without error (no test)' };
  }
  // python — no equivalent in-process sandbox. We still scrub env (PATH
  // only) and run in a tempdir with a timeout, but the python child can
  // still open network sockets, spawn subprocesses, and read arbitrary
  // files. For public-facing deploys, disable Python execution via
  // EXEC_VERIFY_PYTHON=0 unless the SERVER itself runs inside an
  // OS-level sandbox (container, gVisor, Firecracker, seccomp).
  if (process.env.EXEC_VERIFY_PYTHON === '0') {
    return { status: 'skipped', signal: null, detail: 'python execution disabled by EXEC_VERIFY_PYTHON=0' };
  }
  const pyEnv = { PATH: process.env.PATH || '' };
  const file = path.join(dir, 'solution.py');
  fs.writeFileSync(file, body, 'utf8');
  const compile = await _spawn('python3', ['-m', 'py_compile', file], dir, timeoutMs, pyEnv);
  if (compile.missing) return { status: 'skipped', signal: null, detail: 'python3 not available' };
  if (compile.timeout) return { status: 'timeout', signal: 0, detail: 'compile timed out' };
  if (!compile.ok) return { status: 'fail', signal: 0, detail: 'syntax error' };
  const run = await _spawn('python3', [file], dir, timeoutMs, pyEnv);
  if (run.missing) return { status: 'skipped', signal: null, detail: 'python3 not available' };
  if (run.timeout) return { status: 'timeout', signal: 0, detail: 'execution timed out' };
  if (!run.ok) return { status: 'fail', signal: 0, detail: hasTest ? 'test failed' : 'threw at runtime' };
  return hasTest
    ? { status: 'pass', signal: 1.0, detail: 'tests passed' }
    : { status: 'smoke-pass', signal: 0.75, detail: 'executed without error (no test)' };
}

/**
 * Verify code by running it. Best-effort: returns null when the language
 * is unsupported (caller's dimension drops out).
 *
 * @param {string} code
 * @param {object} [opts]
 * @param {string} [opts.language] - 'javascript'|'js'|'python'|'py'
 * @param {string} [opts.testCode] - test that references the solution's symbols
 * @param {number} [opts.timeoutMs=5000] - hard timeout (clamped 500..30000)
 * @returns {Promise<{status:string, signal:(number|null), detail:string}|null>}
 */
async function verifyExecution(code, opts = {}) {
  // Public-deploy safety: when EXEC_VERIFY_ENABLED is explicitly '0' or
  // 'false', return 'disabled' status. The default behavior (env var
  // unset OR set to anything else) is to run — backward-compatible for
  // existing deployments, opt-out for paranoid ones.
  if (process.env.EXEC_VERIFY_ENABLED === '0' || process.env.EXEC_VERIFY_ENABLED === 'false') {
    return { status: 'disabled', signal: null, detail: 'exec_verify disabled by EXEC_VERIFY_ENABLED=0' };
  }
  if (typeof code !== 'string' || !code.trim()) return null;
  const lang = RUNTIME[(opts.language || '').toLowerCase()];
  if (!lang) return null;

  // 1) Safety screen — fail-safe.
  const harm = _harmScreen(code);
  if (harm === null) { const r = { status: 'skipped', signal: null, detail: 'harm screen unavailable — not executed' }; _contributeExec(r); return r; }
  if (harm) { const r = { status: 'blocked', signal: null, detail: 'covenant: ' + harm }; _contributeExec(r); return r; }

  // 2) Sandboxed execution.
  const timeoutMs = Math.max(500, Math.min(30000, opts.timeoutMs || 5000));
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-exec-'));
    const hasTest = typeof opts.testCode === 'string' && opts.testCode.trim().length > 0;
    const body = hasTest ? code + _sep(lang) + opts.testCode : code;
    const result = await _runBody(lang, body, hasTest, dir, timeoutMs);
    _contributeExec(result);
    return result;
  } catch (e) {
    const r = { status: 'error', signal: null, detail: String((e && e.message) || e) };
    _contributeExec(r);
    return r;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best-effort */ } }
  }
}

/** Contribute the exec_verify signal to the field. Non-numeric signals
 * (null — abstain on skipped/blocked/error) do not contribute; the field
 * sees only the runnable verdicts (pass/smoke-pass/fail/timeout). The
 * source tag distinguishes outcomes so the per-source histogram tells
 * the operator how often each one fires. */
function _contributeExec(result) {
  if (!result || typeof result.signal !== 'number' || !isFinite(result.signal)) return;
  try {
    const { contribute } = require('../core/field-coupling');
    contribute({
      cost: 1,
      coherence: Math.max(0, Math.min(1, result.signal)),
      source: 'oracle:exec-verify:' + (result.status || 'unknown'),
    });
  } catch (_) { /* best-effort */ }
}

/**
 * Best-effort detection of the symbol a peer test would call: the primary
 * function/class an agent's solution defines. Returns its name or null.
 */
function detectPrimaryFn(code, lang) {
  if (typeof code !== 'string') return null;
  const patterns = lang === 'py'
    ? [/^\s*def\s+([A-Za-z_]\w*)\s*\(/m, /^\s*class\s+([A-Za-z_]\w*)/m]
    : [
        /module\.exports\s*=\s*function\s+([A-Za-z_$][\w$]*)\s*\(/,
        /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
        /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
        /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/,
        /exports\.([A-Za-z_$][\w$]*)\s*=/,
      ];
  for (const re of patterns) {
    const m = code.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Cross-verification — runs each candidate's self-test against the OTHER
 * candidates' code. A wrong solution that passes its own (also-wrong) test
 * still fails the correct candidates' tests, so peer agreement is
 * INDEPENDENT verification, not self-report. Naming differences are bridged
 * by aliasing each peer's expected symbol to the target's primary function.
 *
 * The "6th signal" that closes the same-source-test gap: a hallucinator that
 * writes both code and a passing test can fool exec_verify alone, but cannot
 * fool the test written by an independent generator. Requires >=2 candidates
 * with code; abstains otherwise (returns an empty Map).
 *
 * @param {{agent:string, code:string, testCode?:string}[]} candidates
 * @param {object} [opts] - { language, timeoutMs }
 * @returns {Promise<Map<string, {passed:number, total:number, signal:number}>>}
 */
async function crossVerify(candidates, opts = {}) {
  const result = new Map();
  if (!Array.isArray(candidates)) return result;
  const lang = RUNTIME[(opts.language || '').toLowerCase()];
  if (!lang) return result;
  const timeoutMs = Math.max(500, Math.min(30000, opts.timeoutMs || 5000));

  const cand = candidates
    .filter((o) => o && typeof o.code === 'string' && o.code.trim())
    .map((o) => ({
      agent: o.agent || 'anon',
      code: o.code,
      fn: detectPrimaryFn(o.code, lang),
      test: (o.testCode || '').trim(),
    }));
  if (cand.length < 2) return result;

  for (const target of cand) {
    if (!target.fn) continue;
    const harm = _harmScreen(target.code);
    if (harm !== '') continue;

    const peers = cand.filter((p) => p.agent !== target.agent && p.test && p.fn);
    if (peers.length === 0) continue;

    let passed = 0, total = 0;
    for (const peer of peers) {
      const alias = peer.fn === target.fn ? '' :
        (lang === 'py' ? `${peer.fn} = ${target.fn}` : `const ${peer.fn} = ${target.fn};`);
      const body = [target.code, alias, peer.test].filter(Boolean).join(_sep(lang));
      let dir;
      try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-xtest-'));
        const r = await _runBody(lang, body, true, dir, timeoutMs);
        if (r.status === 'skipped') continue;
        total++;
        if (r.status === 'pass') passed++;
      } catch (_e) {
        // a single bad pair shouldn't sink the target
      } finally {
        if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e2) { /* best-effort */ } }
      }
    }
    if (total > 0) result.set(target.agent, { passed, total, signal: passed / total });
  }
  return result;
}

/** Test-only: reset cached harm patterns. */
function _resetCache() { _harmPatterns = undefined; }

module.exports = { verifyExecution, crossVerify, detectPrimaryFn, _resetCache };
