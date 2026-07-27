#!/usr/bin/env node
'use strict';

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
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input; try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
const ti = input.tool_input || {};
const fp = ti.file_path || ti.path || '';
const content = ti.content || ti.new_string || '';
if (!fp || !/\.(js|mjs|cjs|ts|tsx|py)$/.test(fp)) process.exit(0);
if (!content || content.length < 80) process.exit(0);

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
} catch (_) { /* checker unavailable — fail open */ }
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
    '    similarity/resonance → encoder-stack.composedCosine · whitening.applyWhitening\n' +
    '    retrieval            → compression/holographic.holoSearch · FractalIndex.searchFlow\n' +
    '    compression/coherence→ void_compressor_v5.compress (result.avg_coherence, result.mint)\n' +
    '  Measuring beside the substrate is not a measurement of it. Rewrite through it, then write.');
}

// ── 2. THE OVERLAY — what the substrate says about what you are about to write ──
let overlay = '';
try {
  const es = require(path.join(ROOT, 'src', 'core', 'encoder-stack'));
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
} catch (_) { /* overlay is best-effort */ }
if (overlay) out('allow', overlay);
process.exit(0);
