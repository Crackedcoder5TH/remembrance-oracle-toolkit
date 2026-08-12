#!/usr/bin/env node
'use strict';
const { quiet } = require('../core/quiet');

/**
 * @oracle-infrastructure — PreToolUse hook; read-only analysis of the content ABOUT to be
 * written, internal-state-bounded, never user-input-driven.
 *
 * goggles-pre-hook — the goggles as a LIVE OVERLAY rather than a post-hoc review.
 *
 * The goggles were always meant to stay on while work happens. Run after the fact they can only
 * grade what was already written; run BEFORE the write they hand you the substrate's own
 * primitives and refuse the bypass. This hook makes the wrong order impossible:
 *
 *   DENY  — the content about to be written contains a SUBSTRATE BYPASS (a hand-rolled cosine /
 *           kNN scan / whitening loop, or numpy standing in for the substrate's own similarity).
 *           The denial names the function to use instead, so the correct primitive arrives at
 *           the moment of writing rather than in review.
 *   ALLOW — with the overlay attached: FOCUS/META for the target area and FUNCTION RESONANCE,
 *           i.e. the substrate functions whose structure matches what is being written.
 *
 * Fails open on any internal error: an infrastructure fault must never block real work.
 */
const fs = require('node:fs');
const path = require('node:path');

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

// Informational output MUST NOT be an authorization. The first cut of this
// hook emitted permissionDecision 'allow' to attach the overlay, which
// auto-approved every matching write and silently bypassed the permission
// system. Context attaches as context; the permission flow stays untouched.
function outContext(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },
  }));
  process.exit(0);
}

// The modules that legitimately CONTAIN the canonical math. Without this
// allowlist the guardian denies edits to the very files it routes everyone
// to — the encoder stack could never be maintained with the hook active.
const CANONICAL = new Set([
  'decoder-stack.js', 'coherency-mapper.js', 'fractal-waveform.js',
  'code-to-waveform.js', 'fractal_encoder.py', 'whitening.js',
  'void-seal.js',
]);
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input; try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
const ti = input.tool_input || {};
const fp = ti.file_path || ti.path || '';
const content = ti.content || ti.new_string || '';

// ── BRIEF GATE ── the correction arrives BEFORE the edit, or not at all.
//
// Every large mistake made against this codebase came from editing or calling
// something whose contract was inferred from its name. A brief that is merely
// AVAILABLE is a second command, and the second command is the one skipped.
// So the first touch of a trapped file in a session is denied once, with the
// trap as the reason. The retry succeeds immediately — the cost is one
// round-trip, paid once per file per session, and what it buys is that the
// correction cannot arrive after a plausible wrong number has been produced.
//
// Deny-once, not deny-always: a gate that keeps firing gets routed around.
try {
  if (fp) {
    const brief = require('./brief');
    const hits = brief.trapsFor(fp);
    const high = hits.filter((h) => (h.severity || '').toLowerCase() === 'high');
    if (high.length) {
      const seenPath = path.join(__dirname, '..', '..', '.remembrance', 'briefed.json');
      let seen = {};
      try { seen = JSON.parse(fs.readFileSync(seenPath, 'utf8')); } catch (_) { seen = {}; }
      const key = (input.session_id || 'nosession') + '::' + fp;
      if (!seen[key]) {
        seen[key] = Date.now();
        try {
          fs.mkdirSync(path.dirname(seenPath), { recursive: true });
          fs.writeFileSync(seenPath, JSON.stringify(seen, null, 1));
        } catch (_) { quiet('tools:goggles-pre-hook:require', _); /* if we cannot record it, deny once and move on */ }
        out('deny',
          'BRIEF REQUIRED — this file carries recorded traps. Read them, then retry '
          + 'the identical edit; it will go through. This is the one-time cost of not '
          + 'inferring a contract from a name.\n\n'
          + brief.renderTraps(high)
          + '\n\nFull debrief: remembrance brief ' + path.basename(fp));
      }
    }
  }
} catch (_) { quiet('tools:goggles-pre-hook:require', _); /* the gate must never break a write on its own account */ }

if (!fp || !/\.(js|mjs|cjs|ts|tsx|py)$/.test(fp)) process.exit(0);
if (!content || content.length < 80) process.exit(0);
if (CANONICAL.has(path.basename(fp))) process.exit(0); // the canon may edit itself

const ROOT = path.resolve(__dirname, '..', '..');

// ── 1. BYPASS CHECK on the content about to be written ──────────────
let findings = [];
try {
  const audit = require(path.join(ROOT, 'src', 'audit', 'ast-checkers'));
  if (typeof audit.auditCode === 'function') {
    const r = audit.auditCode(content, { filePath: fp });
    const list = Array.isArray(r) ? r : (r && r.findings) || [];
    findings = list.filter((f) => String(f.bugClass || f.type || f.class || '').includes('substrate-bypass'));
  }
} catch (_) { quiet('tools:goggles-pre-hook:require', _); /* checker unavailable — fail open */ }
// python has no AST checker here; catch the common numpy stand-ins textually
if (!findings.length && /\.py$/.test(fp)) {
  const pyBypass = [
    [/np\.corrcoef|numpy\.corrcoef/, 'numpy.corrcoef standing in for the substrate\'s own similarity'],
    [/np\.dot\([^)]*\)\s*\/\s*\(?\s*np\.linalg\.norm/, 'hand-rolled cosine (np.dot / norms)'],
    [/cosine_similarity|sklearn\.metrics\.pairwise/, 'sklearn cosine standing in for composedCosine'],
  ];
  for (const [re, why] of pyBypass) if (re.test(content)) findings.push({ line: 0, reality: why });
}
if (findings.length) {
  const first = findings[0];
  out('deny',
    'GOGGLES — SUBSTRATE BYPASS refused before writing ' + path.basename(fp) + '\n' +
    '  ' + (first.reality || first.message || 'hand-rolled substrate primitive') + '\n' +
    '  Use the substrate\'s own functions instead:\n' +
    '    similarity/resonance → decoder-stack.composedCosine · whitening.applyWhitening\n' +
    '    retrieval            → compression/holographic.holoSearch · FractalIndex.searchFlow\n' +
    '    compression/coherence→ void_compressor_v5.compress (result.avg_coherence, result.mint)\n' +
    '  Measuring beside the substrate is not a measurement of it. Rewrite through it, then write.');
}

// ── 2. THE OVERLAY — what the substrate says about what you are about to write ──
let overlay = '';
try {
  const es = require(path.join(ROOT, 'src', 'core', 'decoder-stack'));
  const idxPath = path.join(ROOT, 'ecosystem-capabilities.json');
  if (es.composedAtDepth && es.composedCosine && fs.existsSync(idxPath)) {
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    if (Array.isArray(idx.functions) && idx.functions.length) {
      const q = es.composedAtDepth(content.slice(0, 6000), idx.sigDepth || 4);
      const self = path.basename(fp);
      const scored = [];
      for (const fn of idx.functions) {
        if (!fn.s || fn.s.length !== q.length) continue;
        if (fn.p && path.basename(fn.p) === self) continue;
        scored.push([es.composedCosine(q, fn.s), fn]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      const seen = new Set(); const picks = [];
      for (const [c, fn] of scored) { if (seen.has(fn.n)) continue; seen.add(fn.n); picks.push([c, fn]); if (picks.length >= 5) break; }
      if (picks.length) {
        overlay = 'GOGGLES OVERLAY — substrate functions your content resonates with (use these, do not re-implement):\n'
          + picks.map(([c, fn]) => '    ' + c.toFixed(3) + '  ' + fn.n + '  ← ' + fn.p).join('\n');
      }
    }
  }
} catch (_) { quiet('tools:goggles-pre-hook:require', _); /* overlay is best-effort */ }
if (overlay) outContext(overlay);
process.exit(0);
