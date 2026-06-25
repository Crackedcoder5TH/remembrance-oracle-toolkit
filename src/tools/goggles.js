#!/usr/bin/env node
'use strict';

/**
 * goggles — structural meta-awareness while you work on a section.
 *
 * Shows TWO DISTINCT signals at once, from a single field-tool read():
 *   FOCUS — the section's intrinsic COHERENCE: does it have coherent structure
 *           (syntax / completeness / consistency / AST), measured from the
 *           content itself.
 *
 *           DISCLAIMER — coherence is NOT a coding trust signal whatsoever. It
 *           measures STRUCTURE in whatever it is pointed at, never correctness.
 *           A well-formed wrong file scores high; 1+1=3 in clean syntax still
 *           reads "solid". The goggles are an OVERLAY that shows how a change
 *           morphs the shape of the codebase — they do not replace knowing
 *           whether the code is right. You fill in the content; this shows the
 *           structure. Never trust the number as a verdict on correctness.
 *   META  — PATTERN RESONANCE: how much the section is shaped like the library's
 *           patterns — its nearest patterns ACROSS the entire Void substrate
 *           (cross-file, cross-repo), a consonant/outlier verdict, the lexical
 *           neighbours, and the live field peers it entangles.
 *
 * Coherence and resonance are similar but COMPLETELY DISTINCT — intrinsic
 * structure vs library-fit — and are never collapsed into one number.
 *
 * Usage:
 *   node src/tools/goggles.js <file> [--lines A:B] [--top N]
 *   node src/tools/goggles.js app/api/leads/route.ts --lines 416:470
 */

const fs = require('node:fs');
const path = require('node:path');
const ft = require('../core/field-tool');

// Moving numbers consolidated in the Living Remembrance Engine (the core).
let GOG;
try { GOG = require('../core/living-remembrance').gogglesParams(); }
catch (_) { GOG = { structureStrong: 0.93, structureSolid: 0.80, structureLoose: 0.70, resonanceConsonant: 0.90, resonanceFamiliar: 0.82, resonanceDistinct: 0.70 }; }

const LANG_BY_EXT = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.md': 'markdown', '.json': 'json', '.sh': 'bash',
};

function parseArgs(argv) {
  const out = { file: null, lines: null, top: 7 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lines') { out.lines = argv[++i]; }
    else if (a === '--top') { out.top = parseInt(argv[++i], 10) || 7; }
    else if (!out.file) { out.file = a; }
  }
  return out;
}

function bar(x, width = 22) {
  const n = Math.max(0, Math.min(width, Math.round((x || 0) * width)));
  return '█'.repeat(n) + '·'.repeat(width - n);
}

// Intrinsic coherence (the field-tool reads it measurableOnly: syntax /
// completeness / consistency renormalised, AST applied as a penalty only) spans
// the full 0..1 range. Measured over real ecosystem files: median ~0.83, p75
// ~0.93, ~14% of clean files reach 1.0; a stray TODO lands ~0.95, a broken brace
// ~0.66. Thresholds track THAT distribution — re-derive if the coherency
// weights or the measurableOnly renormalisation change.
function structureVerdict(c) {
  if (c >= GOG.structureStrong) return 'strong structure';
  if (c >= GOG.structureSolid) return 'solid structure';
  if (c >= GOG.structureLoose) return 'loose structure';
  return 'weak / novel structure';
}

function consonanceVerdict(meanTopK, best) {
  // How well the section fits the established structure of the whole codebase.
  if (meanTopK >= GOG.resonanceConsonant) return ['CONSONANT', 'fits the established structure — well-trodden shape'];
  if (meanTopK >= GOG.resonanceFamiliar) return ['FAMILIAR', 'broadly in keeping with the codebase'];
  if (meanTopK >= GOG.resonanceDistinct) return ['DISTINCT', 'a shape the codebase uses only loosely — worth a second look'];
  return ['OUTLIER', 'structurally novel here — either genuinely new, or drifting from the codebase'];
}

function main() {
  const { file, lines, top } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('usage: goggles <file> [--lines A:B] [--top N]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); }
  catch (e) { console.error('cannot read ' + abs + ': ' + e.message); process.exit(1); }

  let section = `${file}`;
  if (lines) {
    const [a, b] = lines.split(':').map((n) => parseInt(n, 10));
    const all = content.split('\n');
    content = all.slice(Math.max(0, a - 1), b).join('\n');
    section = `${file}:${a}-${b}`;
  }

  const language = LANG_BY_EXT[path.extname(abs)] || 'text';
  const r = ft.read({ content, name: file, language }, { source: 'goggles', growSubstrate: false, topK: top });
  const vr = r.voidResonance || r.resonance || {};
  const meanTopK = vr.meanTopK ?? 0;
  const [tag, gloss] = consonanceVerdict(meanTopK, vr.bestMatch);

  const W = 64;
  console.log('\n' + '═'.repeat(W));
  console.log('  GOGGLES   ' + section);
  console.log('═'.repeat(W));

  // ── FOCUS ──
  console.log('  FOCUS  (the section you are editing)');
  console.log(`    coherence   ${bar(r.coherence)} ${(r.coherence).toFixed(3)}  ${structureVerdict(r.coherence)}`);
  console.log('    ⚠ coherence is NOT a coding trust signal whatsoever. It measures STRUCTURE');
  console.log('      in whatever it is pointed at — never correctness. A well-formed wrong');
  console.log('      answer scores high; 1+1=3 wrapped in clean syntax still reads "solid".');
  console.log('      It is an overlay to see how your change morphs the shape — you judge the content.');

  // ── META ──  (pattern resonance — distinct from the FOCUS coherence above)
  console.log('\n  META   (pattern resonance — where it sits in the whole codebase)');
  console.log(`    resonance   ${bar(meanTopK)} ${meanTopK.toFixed(3)}  ${tag} — ${gloss}`);
  // Exclude the file matching itself (the substrate contains it).
  const selfName = path.basename(file);
  const matches = (vr.topMatches || [])
    .filter((mm) => path.basename(String(mm.name || '')) !== selfName)
    .slice(0, top);
  if (matches.length) {
    console.log('    nearest across the ecosystem:');
    for (const m of matches) {
      const s = (m.d4 ?? m.similarity ?? m.score ?? 0);
      console.log(`       ${s.toFixed(3)}  ${m.name}`);
    }
  }
  const cr = r.codeResonance;
  if (cr && Array.isArray(cr.topMatches) && cr.topMatches.length) {
    console.log('    lexical neighbours (oracle pattern table):');
    for (const m of cr.topMatches.slice(0, 3)) {
      console.log(`       ${(m.similarity ?? 0).toFixed(3)}  ${m.name}`);
    }
  }
  let peers = [];
  try { peers = ft.peers() || []; } catch (_) { /* none */ }
  if (peers.length) {
    console.log(`    live field peers entangled: ${peers.length}`);
  }

  // ── RIPPLE ──
  console.log('\n  RIPPLE');
  console.log('    A change here is most likely to echo in the nearest siblings');
  console.log('    above — they share this structure. Read them before you commit.');
  console.log('═'.repeat(W) + '\n');
}

main();
