#!/usr/bin/env node
// session-context-load.mjs — the GOGGLES-FIRST context loader.
//
// Emitted at SessionStart (after ecosystem-orient.sh). Compresses the important
// parts of previous sessions into a tight digest so an agent enters with the
// substrate's memory already loaded — not a raw dump, a compression:
//   - what was recently BUILT (git history)
//   - reusable SOLUTIONS distilled from past sessions (.session-patterns / .debug-patterns)
//   - PRINCIPLES the substrate evolved, and NOISE it learned to ignore
//   - live SUBSTRATE state (patterns, effective dimensionality, encoder depth, map freshness)
// Best-effort: every read is guarded; it never fails a session start.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = (() => { try { return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim(); } catch { return process.cwd(); } })();
const R = (p) => path.join(ROOT, p);
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(R(p), 'utf8')); } catch { return null; } };
const firstComment = (file) => { try { const l = fs.readFileSync(file, 'utf8').split('\n').find(x => /\S/.test(x.replace(/^[\/#*\s-]+/, ''))); return (l || '').replace(/^[\/#*\s-]+/, '').trim().slice(0, 90); } catch { return ''; } };
const out = [];
const say = (s = '') => out.push(s);

// 0) STANDING DIRECTIVES — the rigor gate, loaded first, held every session.
try { const sd = fs.readFileSync(R('STANDING-DIRECTIVES.md'), 'utf8');
  const gate = sd.split('\n').filter(l => /^\d+\.\s\*\*/.test(l.trim())).map(l => '  ' + l.trim().replace(/\*\*/g, ''));
  if (gate.length) { say('=== STANDING DIRECTIVES — the rigor gate (run the control BEFORE you report) ==='); gate.forEach(say); say(''); }
} catch {}

say('=== SUBSTRATE MEMORY — PRIOR-SESSION CONTEXT (compressed) ===');

// 1) what was recently BUILT
try {
  const log = execSync('git log --oneline -12', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  say('\nRecently built (last 12 commits):');
  for (const l of log) say('  · ' + l.slice(0, 96));
} catch {}

// 2) reusable SOLUTIONS distilled from past sessions
for (const [dir, label] of [['.session-patterns', 'reusable session patterns'], ['.debug-patterns', 'distilled debug fixes']]) {
  try {
    const files = fs.readdirSync(R(dir)).filter(f => /\.(js|ts|py|cjs|mjs)$/.test(f)).sort();
    if (files.length) { say(`\n${label} (${files.length}) — already-solved, reuse before re-deriving:`); for (const f of files) say(`  · ${f.replace(/\.\w+$/, '')}: ${firstComment(path.join(R(dir), f))}`); }
  } catch {}
}

// 3) PRINCIPLES evolved + NOISE learned
const princ = readJSON('.remembrance/evolved-principles.json');
if (princ && Array.isArray(princ.principles) && princ.principles.length) {
  say(`\nEvolved principles (${princ.principles.length}) — top:`);
  for (const p of princ.principles.slice(0, 6)) say('  · ' + (typeof p === 'string' ? p : (p.text || p.principle || p.name || JSON.stringify(p))).slice(0, 100));
}
const learn = readJSON('.remembrance/goggles-learning.json');
if (learn && learn.falsePositives) { const n = Object.keys(learn.falsePositives).length; if (n) say(`\nLearned noise: ${n} false-positive fingerprints the field already suppresses (don't re-flag them).`); }

// 4) live SUBSTRATE state
const map = readJSON('.remembrance/goggles-map.json');
const dens = readJSON('.remembrance/substrate-density.json');
let depth = null; try { depth = (await import(R('src/core/encoder-stack.js'))).default?.currentDepth?.(); } catch {}
try { if (depth == null) { const es = await import('node:module').then(m => m.createRequire(R('package.json'))('./src/core/encoder-stack')); depth = es.currentDepth?.(); } } catch {}
say('\nLive substrate state:');
if (map) say(`  · ${map.substrateSize ?? '?'} patterns · ${map.filesAudited ?? '?'} files mapped · map built ${map.timestamp ? Math.round((Date.now() - Date.parse(map.timestamp)) / 3.6e6) + 'h ago' : '?'}`);
if (dens) say(`  · substrate density: effectiveDim ${dens.effectiveDim ?? '?'} / dim ${dens.dim ?? '?'} · factor ${dens.factor ?? '?'} (the retro fuel)`);
if (depth) say(`  · encoder stack: ${depth} active layers (compose = ${depth * 29}-D)`);
say(`  · goggles-first: run \`node .claude/skills/goggles/run.mjs <file>\` — it carries this map, so reading a file ≈ reading its whole-codebase placement.`);

// 5) CONNECTIONS — the full weight is not loaded, it is ADDRESSED. One query away:
say('\nConnections (full context — address it, do not load it):');
say('  · LIBRARY: node scripts/substrate-connect.mjs "<query>"  — whitened resonance over all ' + (map?.substrateSize ?? '47k') + ' patterns');
say('  · CAPACITY DIAL: whitening lifts effDim ~6→~68, retrieval 62%→87% (capacity ∝ effective dimensionality)');
say('  · GOGGLES: node .claude/skills/goggles/run.mjs <file>  — a file read carries its whole-codebase placement');
say('  · FIELD/HISTOGRAMS: .remembrance/ (goggles-learning, evolved-principles, ledger, entropy) — queryable memory');
say('  · GITHUB: MCP tools (mcp__github__*) over the crackedcoder5th repos — issues, PRs, CI, code search');

say('\n=== end prior-session context ===');
process.stdout.write(out.join('\n') + '\n');
