#!/usr/bin/env node
'use strict';

/**
 * propose-wire — proposal by resonance.
 *
 * For each wiring gap (a file that doesn't contribute to the field), reads it
 * through the goggles, finds its nearest WIRED sibling across the ecosystem, and
 * proposes the same wire — so the field doesn't just report the gap (check:seams),
 * it points at how to close it. Resonance PROPOSES; a human + a real run DISPOSE
 * (the guardrail — never a cargo-cult require).
 *
 *   node scripts/propose-wire.js [file ...] [--top N] [--contribute] [--json]
 *
 * With no files it proposes for the unwired src/*.js (no field-coupling).
 * --contribute feeds a `seams:proposal` confidence into the LRE, so the field
 * stays aware that the self-healing proposer is running.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TOOLKIT = path.resolve(__dirname, '..');
const STATE_DIR = process.env.REMEMBRANCE_STATE_DIR || process.env.ORACLE_ROOT || TOOLKIT;
if (!process.env.ENTROPY_PATH) process.env.ENTROPY_PATH = path.join(STATE_DIR, '.remembrance', 'entropy.json');

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const CONTRIBUTE = argv.includes('--contribute');
const topIdx = argv.indexOf('--top');
const TOP = topIdx >= 0 ? (Number(argv[topIdx + 1]) || 5) : 5;
const fileArgs = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--top');

// The goggles print ecosystem-relative paths with a repo prefix; map them home.
const PREFIX = {
  'oracle/': '.',
  'website/': 'digital-cathedral',
  'rmb-interface/': '../REMEMBRANCE-Interface',
  'rmb-swarm/': '../REMEMBRANCE-AGENT-Swarm-',
  'rmb-blockchain/': '../REMEMBRANCE-BLOCKCHAIN',
  'rmb-dialer/': '../Remembrance-dialer',
  'void/': '../Void-Data-Compressor',
  'reflector/': '../Reflector-oracle-',
  'rmb-reflector/': '../Reflector-oracle-',
  'moons/': '../MOONS-OF-REMEMBRANCE',
};

function resolveSibling(rel) {
  for (const pre of Object.keys(PREFIX)) {
    if (rel.startsWith(pre)) return path.join(TOOLKIT, PREFIX[pre], rel.slice(pre.length));
  }
  return null;
}

const WIRED = /field-coupling|recordBenefit\(|recordCost\(|\.contribute\(|\bcontribute\(\{/;

function isUnwired(file) {
  let src; try { src = fs.readFileSync(file, 'utf8'); } catch (_) { return false; }
  return !WIRED.test(src);
}

/** A wired sibling's field source label (best-effort), or null if not wired. */
function siblingWiring(file) {
  let src; try { src = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  if (!WIRED.test(src)) return null;
  const m =
    src.match(/source:\s*['"]([^'"]+)['"]/) ||
    src.match(/recordBenefit\([^,]+,\s*['"]([^'"]+)['"]/) ||
    src.match(/recordCost\([^,]+,\s*['"]([^'"]+)['"]/);
  return { source: m ? m[1] : null };
}

/** Run the goggles on a file and parse its "nearest across the ecosystem" block. */
function goggleNearest(absFile) {
  let out = '';
  try {
    out = execFileSync('node', [path.join(TOOLKIT, 'src/tools/goggles.js'), absFile], {
      cwd: TOOLKIT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { out = (e.stdout || '') + ''; }
  const nearest = [];
  let inBlock = false;
  for (const line of out.split('\n')) {
    if (/nearest across the ecosystem:/.test(line)) { inBlock = true; continue; }
    if (!inBlock) continue;
    const m = line.match(/^\s+([0-9.]+)\s+(\S+)\s*$/);
    if (m) { nearest.push({ resonance: Number(m[1]), path: m[2] }); continue; }
    if (/lexical neighbours|live field peers|RIPPLE|A change here|═/.test(line) || line.trim() === '') break;
  }
  return nearest;
}

function defaultGaps() {
  const out = [];
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git|\.remembrance/.test(p)) walk(p); }
      else if (e.name.endsWith('.js') && isUnwired(p)) out.push(p);
    }
  };
  walk(path.join(TOOLKIT, 'src'));
  return out.slice(0, 6);
}

const candidates = (fileArgs.length ? fileArgs.map((f) => path.resolve(f)) : defaultGaps());
const proposals = [];
for (const abs of candidates) {
  if (!fs.existsSync(abs)) continue;
  const nearest = goggleNearest(abs).slice(0, TOP);
  let proposal = null;
  for (const n of nearest) {
    const sib = resolveSibling(n.path);
    if (!sib || !fs.existsSync(sib)) continue;
    const w = siblingWiring(sib);
    if (w) { proposal = { sibling: n.path, resonance: n.resonance, source: w.source }; break; }
  }
  proposals.push({ file: path.relative(TOOLKIT, abs), nearestCount: nearest.length, proposal });
}

const made = proposals.filter((p) => p.proposal);
const confidence = made.length ? made.reduce((s, p) => s + p.proposal.resonance, 0) / made.length : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ proposals, made: made.length, total: proposals.length, confidence }, null, 2));
} else {
  for (const p of proposals) {
    console.log(`\ngap: ${p.file}  (unwired)`);
    if (p.proposal) {
      const verb = path.basename(p.file).replace(/\.[a-z]+$/i, '');
      const ns = p.proposal.source ? p.proposal.source.split(':')[0] : 'src';
      console.log(`  ↳ nearest wired sibling: ${p.proposal.sibling}  (resonance ${p.proposal.resonance.toFixed(3)})`);
      console.log(`     it contributes to the field as source ${p.proposal.source ? `"${p.proposal.source}"` : '(label not auto-detected)'}`);
      console.log(`  → propose: add contribute({ cost, coherence, source: '${ns}:${verb}' }) after its main work, mirroring the sibling.`);
    } else {
      console.log(`  ↳ no wired sibling in the nearest ${TOP} — likely a NEW seam: wire it, then declare it in seams.json.`);
    }
  }
  console.log(`\n${made.length}/${proposals.length} gaps have a resonance proposal · confidence ${confidence.toFixed(3)}`);
}

if (CONTRIBUTE) {
  // Awareness: the self-healing proposer is itself a seam (seams:proposal). Its
  // contribution carries how confidently the field can propose its own fixes.
  try { require('../src/core/field-coupling').contribute({ cost: 1, coherence: confidence, source: 'seams:proposal' }); } catch (_) { /* engine optional */ }
  if (!JSON_OUT) console.log(`— contributed proposal confidence ${confidence.toFixed(3)} to the field (source seams:proposal)`);
}
