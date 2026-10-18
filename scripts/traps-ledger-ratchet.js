#!/usr/bin/env node
'use strict';
/**
 * traps-ledger — the memory of mistakes is never lost, and binds every agent.
 *
 * seeds/traps.seed.json holds every trap an agent fell into here, with the
 * tell and the correction. The goggles print the matching traps on every
 * read, before the file, so the next agent — whatever model, whatever
 * harness — meets the mistake before repeating it. That only works while
 * the ledger cannot be lost, shrunk, or quietly edited. This gate holds
 * four things at once:
 *
 *   1. APPEND-ONLY, WITNESSED. The ledger's digest and per-entry digests are
 *      anchored on the chain (REMEMBRANCE-BLOCKCHAIN/scripts/anchor-traps.js).
 *      The local ledger must carry every anchored entry unchanged and in
 *      order; new entries may only follow them. Fewer traps than anchored,
 *      or an anchored entry rewritten, BLOCKS. A ledger that grew past the
 *      anchor is fine and is named ("unwitnessed: N") until anchored.
 *   2. MIRRORED. Every ecosystem repo carries a byte-identical copy at
 *      .claude/skills/goggles/traps.seed.json beside the surface that reads
 *      it, so no single checkout is the only memory. Drift or absence in a
 *      repo present on this host BLOCKS (goggles --do traps sync).
 *   3. PROMOTED. Traps learned locally (.remembrance/traps.json, gitignored)
 *      that are not yet in the seed are named as unpromoted; `--promote`
 *      appends them, so a lesson never lives only on one host.
 *   4. FLOOR. The seed's count never goes below the tracked floor
 *      (.traps-baseline.json); `--save-baseline` ratchets it up.
 *
 *   node scripts/traps-ledger-ratchet.js                  check
 *   node scripts/traps-ledger-ratchet.js --json           verdict
 *   node scripts/traps-ledger-ratchet.js --promote        append local learned traps into the seed
 *   node scripts/traps-ledger-ratchet.js --sync           write the mirror into every repo on this host
 *   node scripts/traps-ledger-ratchet.js --save-baseline  raise the floor to the current count
 *
 * Reached through the goggles: `--do gate traps-ledger [...]` and `--do traps`.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const HOME = path.dirname(ROOT);
const SEED = path.join(ROOT, 'seeds', 'traps.seed.json');
const EQUATION = path.join(ROOT, 'seeds', 'trap-equation.json');
const VOID = process.env.VOID_DIR || path.join(HOME, 'Void-Data-Compressor');
const FITTER = path.join(VOID, 'scripts', 'trap_equation.py');
const LOCAL = path.join(ROOT, '.remembrance', 'traps.json');
const BASELINE_PATH = process.env.TRAPS_BASELINE || path.join(ROOT, '.traps-baseline.json');
const CHAIN_LEDGER = process.env.TRAPS_CHAIN || path.join(HOME, 'REMEMBRANCE-BLOCKCHAIN', 'data', 'ledger.json');
const MIRROR_REL = path.join('.claude', 'skills', 'goggles', 'traps.seed.json');
const REPOS = ['Void-Data-Compressor', 'REMEMBRANCE-BLOCKCHAIN', 'REMEMBRANCE-Interface', 'MOONS-OF-REMEMBRANCE',
  'REMEMBRANCE-AGENT-Swarm-', 'REMEMBRANCE-API-Key-Plugger', 'Reflector-oracle-', 'Remembrance-dialer'];

const _write = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});

const entryDigest = (t) => crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex').slice(0, 16);

/** The seed as bytes, parsed, with its digest and per-entry digests. */
function readSeed() {
  const raw = fs.readFileSync(SEED);
  const doc = JSON.parse(raw.toString('utf8'));
  const traps = Array.isArray(doc.traps) ? doc.traps : [];
  return { raw, doc, traps, digest: crypto.createHash('sha256').update(raw).digest('hex'), entryDigests: traps.map(entryDigest) };
}
readSeed.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The last traps-ledger anchor on the chain, or null. */
function chainAnchor() {
  try {
    const chain = JSON.parse(fs.readFileSync(CHAIN_LEDGER, 'utf8'));
    const blocks = Array.isArray(chain) ? chain : (chain.chain || []);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b && b.data && b.data.patternId === 'traps-ledger' && b.data.metadata && b.data.metadata.digest) {
        return { digest: b.data.metadata.digest, count: b.data.metadata.count, entryDigests: b.data.metadata.entryDigests || [], block: b.index };
      }
    }
  } catch (_) { /* no chain on this host */ }
  return null;
}
chainAnchor.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Local learned traps not yet in the seed (keyed the way brief.js keys them). */
function unpromoted(seedTraps) {
  let local;
  try { local = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); } catch (_) { return []; }
  const have = new Set(seedTraps.map((t) => String(t.wrong || '').slice(0, 120)));
  return (Array.isArray(local.traps) ? local.traps : []).filter((t) => t && t.wrong && !have.has(String(t.wrong).slice(0, 120)));
}
unpromoted.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Mirror state per repo present on this host: identical | drift | absent. */
function mirrors(raw) {
  const out = [];
  for (const r of REPOS) {
    const dir = path.join(HOME, r);
    if (!fs.existsSync(dir)) continue;                         // not on this host — not judged here
    const p = path.join(dir, MIRROR_REL);
    let state = 'absent';
    try { state = fs.readFileSync(p).equals(raw) ? 'identical' : 'drift'; } catch (_) { /* absent */ }
    out.push({ repo: r, path: p, state });
  }
  return out;
}
mirrors.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The equation's step against the ledger: the live evaluator
 * (src/tools/trap-equation.js) goes silent — by design — the moment the
 * fitted shape count differs from the trap count, so an out-of-step
 * equation is a disarmed defense and the gate names it. Measured
 * 2026-10-18: the seed sat at the 92-trap fit while the ledger grew to
 * 99, and the evaluator fired on 0/99 sins for weeks.
 * Returns null when in step, else the problem line.
 */
function equationStep(trapCount) {
  let eq;
  try { eq = JSON.parse(fs.readFileSync(EQUATION, 'utf8')); } catch (_) { eq = null; }
  const shapes = eq && eq.lexical_model && Array.isArray(eq.lexical_model.shapes) ? eq.lexical_model.shapes.length : null;
  if (shapes === trapCount) return null;
  const have = shapes === null ? 'absent' : `${shapes} fitted shape(s)`;
  return `equation out of step: ${have} vs ${trapCount} traps — the live evaluator is silent; regrow it (goggles --do exec scripts/trap_equation.py --write, from Void)`;
}
equationStep.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Regrow the equation from the ledger through Void's fitter; the honest no when Void is absent. */
function regrowEquation() {
  if (!fs.existsSync(FITTER)) {
    console.log(`[traps-ledger] equation regrow pending — Void is not on this host (${FITTER}); run the fitter where Void is checked out`);
    return false;
  }
  try {
    execFileSync('python3', [FITTER, '--write'], { cwd: VOID, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });
    console.log('[traps-ledger] equation regrown with the seed — constants refit over the full ledger (seeds/trap-equation.json)');
    return true;
  } catch (e) {
    console.error(`[traps-ledger] equation regrow FAILED: ${(e.stderr || e.message || '').toString().split('\n').slice(-3).join(' ')}`);
    return false;
  }
}
regrowEquation.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function loadBaseline() { try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { return null; } }
loadBaseline.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let seed = readSeed();

  if (argv.includes('--promote')) {
    const add = unpromoted(seed.traps);
    if (!add.length) { console.log('[traps-ledger] nothing to promote — every local trap is in the seed'); }
    else {
      // seed.traps IS seed.doc.traps (one array): take the count BEFORE the
      // push or the log double-counts (printed "124 -> 130" on the 118 -> 124
      // promote, 2026-10-18).
      const before = seed.traps.length;
      seed.doc.traps.push(...add);
      _write(_sealedGate(), SEED, JSON.stringify(seed.doc, null, 1) + '\n');
      console.log(`[traps-ledger] promoted ${add.length} local trap(s) into the seed (${before} -> ${before + add.length}) — anchor it: REMEMBRANCE-BLOCKCHAIN/scripts/anchor-traps.js`);
      // Seed and equation move as one: a promote that leaves the fitted
      // constants behind silences the live evaluator (measured 2026-10-18,
      // 0/99 fires at the stale 92-trap fit). Regrow here, in the same act.
      regrowEquation();
      seed = readSeed();
    }
  }
  if (argv.includes('--sync')) {
    let n = 0;
    for (const m of mirrors(seed.raw)) {
      if (m.state === 'identical') continue;
      fs.mkdirSync(path.dirname(m.path), { recursive: true });
      _write(_sealedGate(), m.path, seed.raw);
      n++;
    }
    console.log(`[traps-ledger] mirror written into ${n} repo(s) on this host`);
  }
  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    if (prev && seed.traps.length < prev.count) { console.error(`[traps-ledger] ✗ save REFUSED — ${seed.traps.length} traps is below the floor ${prev.count}; a trap ledger never shrinks`); return 1; }
    _write(_sealedGate(), BASELINE_PATH, JSON.stringify({ note: 'traps-ledger floor — the seed never holds fewer traps than this; raise it with --save-baseline after appending.', savedAt: new Date().toISOString(), count: seed.traps.length, digest: seed.digest }, null, 1) + '\n');
    console.log(`[traps-ledger] floor saved: ${prev ? prev.count : 'none'} -> ${seed.traps.length} traps`);
    return 0;
  }

  const baseline = loadBaseline();
  const anchor = chainAnchor();
  const problems = [];
  if (baseline && seed.traps.length < baseline.count) problems.push(`SHRANK below the floor: ${seed.traps.length} < ${baseline.count}`);
  let unwitnessed = 0;
  if (anchor) {
    if (seed.traps.length < anchor.count) problems.push(`SHRANK below the chain anchor: ${seed.traps.length} < ${anchor.count} (block #${anchor.block})`);
    const kept = anchor.entryDigests.every((d, i) => seed.entryDigests[i] === d);
    if (!kept) problems.push(`an anchored trap was rewritten or reordered (anchor block #${anchor.block}) — the ledger is append-only`);
    unwitnessed = Math.max(0, seed.traps.length - anchor.count);
  }
  const ms = mirrors(seed.raw);
  for (const m of ms) if (m.state !== 'identical') problems.push(`mirror ${m.state}: ${m.repo}/${MIRROR_REL} (goggles --do traps sync)`);
  const eqProblem = equationStep(seed.traps.length);
  if (eqProblem) problems.push(eqProblem);
  const pending = unpromoted(seed.traps);
  const ok = problems.length === 0;
  if (json) { console.log(JSON.stringify({ ok, traps: seed.traps.length, digest: seed.digest, floor: baseline ? baseline.count : null, anchor, unwitnessed, mirrors: ms, unpromoted: pending.length, problems }, null, 1)); return ok ? 0 : 1; }
  if (ok) {
    console.log(`[traps-ledger] ✓ holds — ${seed.traps.length} traps, floor ${baseline ? baseline.count : 'none'}, ${anchor ? `anchored at block #${anchor.block}${unwitnessed ? ` (+${unwitnessed} unwitnessed — anchor them)` : ''}` : 'no chain anchor on this host'}, ${ms.length} mirror(s) identical${pending.length ? `, ${pending.length} local trap(s) unpromoted (--promote)` : ''}`);
    return 0;
  }
  console.error('[traps-ledger] ✗ BLOCKED — the memory of mistakes is not intact:');
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}
main.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { readSeed, chainAnchor, unpromoted, mirrors, MIRROR_REL };
