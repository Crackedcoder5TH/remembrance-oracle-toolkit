#!/usr/bin/env node
'use strict';

/**
 * field-self-debug.js — turn the field tool on itself.
 *
 * Calls each newly-wired tool (pattern_resonance, safety_check, coherency)
 * against every file that IS the field tool (encoder, client, server,
 * supporting modules). Reports what the tool says about its own code,
 * with anomalies highlighted.
 *
 * No HTTP needed — the same dispatch the server uses lives in modules
 * we can require directly. The honest test of an instrument is whether
 * its readings on itself make sense.
 */

const fs = require('fs');
const path = require('path');
const { toFractalWaveform, fractalCoherency, inspectFractalWaveform } =
  require('../src/core/fractal-waveform');
const { scoreResonance, libraryStatus } =
  require('../src/scoring/pattern-resonance');
const { covenantCheck } = require('../src/core/covenant');
const { securityScan } = require('../src/reflector/scoring-analysis-security');

const ROOT = path.join(__dirname, '..');

// The "self" of the field tool — everything that produces / compares /
// contributes / serves fractal vectors.
const SELF = [
  // Field-tool package (the standalone NPM client)
  'packages/field-tool/src/fractal-waveform.js',
  'packages/field-tool/src/waveform.js',
  'packages/field-tool/src/field.js',
  'packages/field-tool/src/index.js',
  'packages/field-tool/src/void.js',
  'packages/field-tool/src/prompt.js',
  'packages/field-tool/bin/cli.js',
  // Oracle-side mirror + supporting modules
  'src/core/fractal-waveform.js',
  'src/core/code-to-waveform.js',
  'src/core/field-coupling.js',
  'src/core/living-remembrance.js',
  'src/scoring/pattern-resonance.js',
  // Server that exposes the tools
  'scripts/field-server.js',
];

function safetyCombined(code) {
  const cov = covenantCheck(code);
  const sec = securityScan(code, 'javascript');
  const highCrit = (sec.findings || []).filter(
    (f) => f.severity === 'high' || f.severity === 'critical');
  return {
    sealed: cov.sealed && highCrit.length === 0,
    covenantViolations: cov.violations.length,
    securityFindings: sec.findings.length,
    highCritFindings: highCrit,
    riskLevel: sec.riskLevel,
  };
}

console.log('field-self-debug — the field tool reading itself\n');
console.log('Library status: ' + JSON.stringify(libraryStatus()));
console.log('');

// ── PER-FILE READINGS ───────────────────────────────────────────────────

console.log('─── per-file readings ' + '─'.repeat(60));
console.log('file'.padEnd(50) + 'lines  struc  reson  safe  riskLvl');
console.log('─'.repeat(85));

const readings = [];
for (const rel of SELF) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.log(rel.padEnd(50) + '  (missing)'); continue; }
  const code = fs.readFileSync(abs, 'utf8');
  const lines = code.split('\n').length;

  const ins = inspectFractalWaveform(code);
  const reson = scoreResonance(code, { language: 'javascript' });
  const safe = safetyCombined(code);

  const r = {
    file: rel,
    lines,
    structurality: ins.structurality,
    resonance: reson ? reson.score : null,
    bestMatch: reson ? reson.bestMatch : null,
    bestMatchName: reson && reson.topMatches[0] ? reson.topMatches[0].name : null,
    sealed: safe.sealed,
    riskLevel: safe.riskLevel,
    highCritFindings: safe.highCritFindings,
    securityFindings: safe.securityFindings,
  };
  readings.push(r);

  const safeMark = safe.sealed ? '✓' : '✗';
  console.log(
    rel.padEnd(50) +
    String(lines).padStart(5) + '  ' +
    r.structurality.toFixed(3) + '  ' +
    (r.resonance != null ? r.resonance.toFixed(3) : ' n/a ') + '  ' +
    safeMark.padStart(4) + '  ' +
    r.riskLevel
  );
}

// ── ANOMALY HIGHLIGHTS ──────────────────────────────────────────────────

console.log('\n─── anomalies the tool flags about itself ' + '─'.repeat(40));

const unsealed = readings.filter(r => !r.sealed);
if (unsealed.length) {
  console.log('\n  UNSEALED FILES (high/critical security findings):');
  for (const r of unsealed) {
    console.log('    ' + r.file);
    for (const f of r.highCritFindings) {
      console.log('      [' + f.severity + '] ' + f.message);
    }
  }
} else {
  console.log('  ✓ every self file is sealed (no high/critical security findings)');
}

const lowReson = readings.filter(r => r.resonance != null && r.resonance < 0.3);
if (lowReson.length) {
  console.log('\n  LOW RESONANCE (<0.3 — file does not strongly resemble the proven library):');
  for (const r of lowReson) {
    console.log('    ' + r.file.padEnd(48) + ' score=' + r.resonance.toFixed(3) +
                '  closest: ' + (r.bestMatchName || '(none)') + '@' + (r.bestMatch != null ? r.bestMatch.toFixed(3) : 'n/a'));
  }
} else {
  console.log('  ✓ every self file scored ≥0.3 resonance against the library');
}

const lowStruct = readings.filter(r => r.structurality < 0.7);
if (lowStruct.length) {
  console.log('\n  LOW STRUCTURALITY (<0.7 — encoder thinks this is closer to prose than code):');
  for (const r of lowStruct) {
    console.log('    ' + r.file.padEnd(48) + ' structurality=' + r.structurality.toFixed(3));
  }
} else {
  console.log('  ✓ every self file scores >0.7 structurality (clearly code, not prose)');
}

// ── CROSS-FILE COHERENCY: the two reference impls must be in lockstep ───

console.log('\n─── cross-file coherency (do the two reference impls agree?) ' + '─'.repeat(20));

function fc(a, b) {
  const wfA = toFractalWaveform(fs.readFileSync(path.join(ROOT, a), 'utf8'));
  const wfB = toFractalWaveform(fs.readFileSync(path.join(ROOT, b), 'utf8'));
  return fractalCoherency(wfA, wfB);
}

const pairs = [
  ['packages/field-tool/src/fractal-waveform.js', 'src/core/fractal-waveform.js',
   'the two reference implementations of the SAME spec — must be ≈1.0'],
  ['packages/field-tool/src/waveform.js', 'src/core/code-to-waveform.js',
   'the two top-level dispatchers — should be high (similar role)'],
  ['packages/field-tool/src/field.js', 'scripts/field-server.js',
   'client vs server — moderate (related concept, different role)'],
];
for (const [a, b, note] of pairs) {
  const c = fc(a, b);
  console.log('  ' + a.split('/').pop() + ' vs ' + b.split('/').pop() + ' = ' + c.toFixed(4));
  console.log('    ' + note);
}

// ── SUMMARY ─────────────────────────────────────────────────────────────

const meanReson = readings.filter(r=>r.resonance!=null).reduce((s,r)=>s+r.resonance,0)
                / readings.filter(r=>r.resonance!=null).length;
const meanStruct = readings.reduce((s,r)=>s+r.structurality,0) / readings.length;
console.log('\n─── summary ' + '─'.repeat(72));
console.log('  files inspected:     ' + readings.length);
console.log('  mean structurality:  ' + meanStruct.toFixed(3) + '  (1.0 = clearly code)');
console.log('  mean resonance:      ' + meanReson.toFixed(3) + '  (vs proven library)');
console.log('  sealed:              ' + readings.filter(r=>r.sealed).length + ' / ' + readings.length);
