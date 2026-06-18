#!/usr/bin/env node
'use strict';

/**
 * goggles — structural meta-awareness while you work on a section.
 *
 * Shows BOTH at once, from a single field-tool read():
 *   FOCUS — the section you're editing: its structural coherence (note:
 *           coherence measures STRUCTURE, not correctness — a well-formed
 *           bad file still scores high).
 *   META  — where that section sits in the whole codebase: its nearest
 *           patterns ACROSS the entire Void substrate (cross-file, cross-repo),
 *           a consonant/outlier verdict, the lexical neighbours, and the live
 *           field peers it entangles.
 *
 * Usage:
 *   node src/tools/goggles.js <file> [--lines A:B] [--top N]
 *   node src/tools/goggles.js app/api/leads/route.ts --lines 416:470
 */

const fs = require('node:fs');
const path = require('node:path');
const ft = require('../core/field-tool');

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

function structureVerdict(c) {
  if (c >= 0.92) return 'strong structure';
  if (c >= 0.85) return 'solid structure';
  if (c >= 0.75) return 'loose structure';
  return 'weak / novel structure';
}

function consonanceVerdict(meanTopK, best) {
  // How well the section fits the established structure of the whole codebase.
  if (meanTopK >= 0.90) return ['CONSONANT', 'fits the established structure — well-trodden shape'];
  if (meanTopK >= 0.82) return ['FAMILIAR', 'broadly in keeping with the codebase'];
  if (meanTopK >= 0.70) return ['DISTINCT', 'a shape the codebase uses only loosely — worth a second look'];
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
  console.log('    (coherence = STRUCTURE, not correctness)');

  // ── META ──
  console.log('\n  META   (where it sits in the whole codebase)');
  console.log(`    consonance  ${bar(meanTopK)} ${meanTopK.toFixed(3)}  ${tag} — ${gloss}`);
  const matches = (vr.topMatches || []).slice(0, top);
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
