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

function _spawn(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH || '' },
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
    const syntax = await _spawn('node', ['--check', file], dir, timeoutMs);
    if (syntax.missing) return { status: 'skipped', signal: null, detail: 'node not available' };
    if (syntax.timeout) return { status: 'timeout', signal: 0, detail: 'syntax check timed out' };
    if (!syntax.ok) return { status: 'fail', signal: 0, detail: 'syntax error' };
    const run = await _spawn('node', [file], dir, timeoutMs);
    if (run.missing) return { status: 'skipped', signal: null, detail: 'node not available' };
    if (run.timeout) return { status: 'timeout', signal: 0, detail: 'execution timed out' };
    if (!run.ok) return { status: 'fail', signal: 0, detail: hasTest ? 'test failed' : 'threw at runtime' };
    return hasTest
      ? { status: 'pass', signal: 1.0, detail: 'tests passed' }
      : { status: 'smoke-pass', signal: 0.75, detail: 'executed without error (no test)' };
  }
  // python
  const file = path.join(dir, 'solution.py');
  fs.writeFileSync(file, body, 'utf8');
  const compile = await _spawn('python3', ['-m', 'py_compile', file], dir, timeoutMs);
  if (compile.missing) return { status: 'skipped', signal: null, detail: 'python3 not available' };
  if (compile.timeout) return { status: 'timeout', signal: 0, detail: 'compile timed out' };
  if (!compile.ok) return { status: 'fail', signal: 0, detail: 'syntax error' };
  const run = await _spawn('python3', [file], dir, timeoutMs);
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
  if (typeof code !== 'string' || !code.trim()) return null;
  const lang = RUNTIME[(opts.language || '').toLowerCase()];
  if (!lang) return null;

  // 1) Safety screen — fail-safe.
  const harm = _harmScreen(code);
  if (harm === null) return { status: 'skipped', signal: null, detail: 'harm screen unavailable — not executed' };
  if (harm) return { status: 'blocked', signal: null, detail: 'covenant: ' + harm };

  // 2) Sandboxed execution.
  const timeoutMs = Math.max(500, Math.min(30000, opts.timeoutMs || 5000));
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-exec-'));
    const hasTest = typeof opts.testCode === 'string' && opts.testCode.trim().length > 0;
    const body = hasTest ? code + _sep(lang) + opts.testCode : code;
    return await _runBody(lang, body, hasTest, dir, timeoutMs);
  } catch (e) {
    return { status: 'error', signal: null, detail: String((e && e.message) || e) };
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best-effort */ } }
  }
}

/** Test-only: reset cached harm patterns. */
function _resetCache() { _harmPatterns = undefined; }

module.exports = { verifyExecution, _resetCache };
