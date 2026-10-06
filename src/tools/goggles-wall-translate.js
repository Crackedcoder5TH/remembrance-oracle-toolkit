/**
 * goggles-wall-translate — the wall's translation layer (leaks #2 and #3,
 * operator orders 2026-10-06, split out of goggles-bash-hook.js under the
 * size ratchet: the hook judges and denies, this module serves).
 *
 * THE WALL AS TRANSLATOR (leak #2: 162 of the 726 logged denials were hand
 * searches — grep 102, rg 30, find 30 — while the verb existed the whole
 * time: an affordance failure, not a missing door). For the simple shapes,
 * the refusal CARRIES THE ANSWER: the pattern is lifted from the refused
 * command and served through --do find itself, so the reading is taken and
 * ledgered by the same door that refused the path. An unparseable shape
 * falls through to the plain refusal. The deny stands either way — the
 * wall teaches, it never opens.
 *
 * THE TARGET, NOT THE CHAIR (leak #3: ~100 of the 726 were hand compute —
 * python3 63, npm 32, node on a file — and a measured share aimed at the
 * SCRATCH AREA while only the shell's cwd sat in a repo). An interpreter
 * whose script lives under /tmp or /var/tmp, in a command that names no
 * ecosystem path, is scratch work: outside the ecosystem the shell is
 * yours, judged by where the work is, not where the chair sits. The
 * hook's scratch-script weld still reads every such body and refuses one
 * that reaches into the substrate — the allowance moves the judgment, it
 * opens nothing. For a GIT-TRACKED repo script the refusal names the
 * exact door (--do exec <relpath>) — named, never auto-taken: --do find
 * is a pure reading, --do exec runs code. npm/npx/pytest test runs are
 * served --do test.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { quiet } = require('../core/quiet');

const INTERP = new Set(['python3', 'python', 'node', 'nodejs']);
const SEARCH = new Set(['grep', 'egrep', 'fgrep', 'rg']);
// leak #4 (operator order 2026-10-06, the file-management family: ~45 of the
// 726 logged denials — rm 32, mkdir 7, cp 3): the same target-not-chair
// judgment. Deleting, making or copying under /tmp is scratch housekeeping
// wherever the shell sits; EVERY path argument must live there, so a copy
// out of a repo (cp src/x /tmp/y) still refuses.
const FILEMGMT = new Set(['rm', 'rmdir', 'mkdir', 'cp', 'mv', 'touch']);

// The scratch-target allowance: true means the segment is scratch work.
function scratchTarget(base, words, afterPipe, within, roots, cmd) {
  if (afterPipe || roots.some((r) => cmd.includes(r))) return false;
  const SCRATCH = /^\/(?:var\/)?tmp\//;
  if (INTERP.has(base)) {
    const sTok = words.slice(1).find((w) => w && !/^-/.test(w));
    if (!sTok || !SCRATCH.test(sTok) || within(sTok)) return false;
    try { return fs.existsSync(sTok); } catch (_) { return false; }
  }
  if (FILEMGMT.has(base)) {
    const args = words.slice(1).filter((w) => w && !/^-/.test(w));
    return args.length > 0 && args.every((a) => SCRATCH.test(a) && !within(a));
  }
  return false;
}

// The served translation for a refusal, or '' when no shape matches.
function serve(base, words, seg, cmd, cwd, afterPipe, roots) {
  if (SEARCH.has(base) && !afterPipe) {
    try {
      const m = new RegExp('(?:^|[;&|]\\s*)' + base + '\\s+([^;&|]{1,200})').exec(cmd);
      if (m) {
        const toks = []; const tokRe = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g; let t;
        while ((t = tokRe.exec(m[1])) !== null) toks.push(t[1] !== undefined ? t[1] : (t[2] !== undefined ? t[2] : t[3]));
        const args = toks.filter((w) => w && !/^-/.test(w));
        const pattern = args[0];
        const fpaths = args.slice(1).filter((p) => { try { return fs.existsSync(path.resolve(cwd, p)); } catch (_) { return false; } });
        if (pattern && pattern.length <= 200) {
          const runner = path.join(path.resolve(__dirname, '..', '..'), '.claude', 'skills', 'goggles', 'run.mjs');
          const r = require('node:child_process').spawnSync('node', [runner, '--do', 'find', pattern, ...fpaths.slice(0, 3)],
            { cwd: cwd || undefined, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
          const lines = String(r.stdout || '').split('\n').filter((l) => l.trim()).slice(0, 24);
          if (lines.length) return '\n  the door answers anyway — the same search, taken through --do find (recorded):\n        ' + lines.join('\n        ').slice(0, 2400) + '\n';
        }
      }
    } catch (e) { quiet('tools:goggles-wall-translate:find', e); }
  }
  if ((base === 'python3' || base === 'python') && !afterPipe) {
    try {
      const sTok = words.slice(1).find((w) => w && !/^-/.test(w));
      if (sTok && /\.py$/.test(sTok)) {
        const abs = path.resolve(cwd, sTok);
        const root = roots.find((r) => abs === r || abs.startsWith(r + path.sep));
        if (root) {
          const rel = path.relative(root, abs);
          const g = require('node:child_process').spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', rel], { encoding: 'utf8', timeout: 5000 });
          if (g.status === 0) return '\n  that script is git-tracked — its door, exactly (recorded):\n        node .claude/skills/goggles/run.mjs --do exec ' + rel + '\n';
        }
      }
    } catch (e) { quiet('tools:goggles-wall-translate:exec', e); }
  }
  if ((base === 'npm' || base === 'npx' || base === 'pytest')
      && (base === 'pytest' || /\btest\b/.test(seg))) {
    return '\n  the repo\'s own tests run through the door (recorded):\n        node .claude/skills/goggles/run.mjs --do test [args]\n';
  }
  // the curl family (32 of the 726): the door existed the whole time —
  // --do browse reads the web through the substrate, witnessed; the
  // instrument's own port belongs to --do read / --do service status.
  if (base === 'curl' || base === 'wget') {
    return '\n  the web is read through the substrate (recorded, witnessed):\n        node .claude/skills/goggles/run.mjs --do browse <url>\n  (the instrument\'s own port: --do read <file> · --do service status)\n';
  }
  return '';
}

module.exports = { scratchTarget, serve };
