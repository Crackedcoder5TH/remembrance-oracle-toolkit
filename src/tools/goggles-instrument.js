'use strict';

/**
 * goggles-instrument — what a read hands you WITHOUT a second call.
 *
 * Until now a per-file goggle printed the traps, FOCUS, META, MACRO,
 * META-DEBUG and Δ, and everything else the substrate knows lived behind a
 * verb: the living field and its source histogram (--do field), what the
 * substrate remembers of this file and how big the library is (--do state),
 * the cross-domain resonance field (--do resonance), the contracts
 * (--do contracts), and the state of the one door itself — the coin on HEAD,
 * whether the gates are untouched, how many bypasses the wall has refused,
 * whether the instrument is even up. A verb nobody runs is a reading nobody
 * has. These sections ride on every read.
 *
 * HONESTY RULES. Nothing here measures: every number is the substrate's own
 * (the field engine's state, the library's census, the last resonance scan,
 * the last contracts run), and anything computed by an earlier run carries
 * its AGE and, for the contracts, whether Void has moved since. Absence is
 * printed as absence with the verb that fills it — never as a number.
 *
 * This module prints nothing itself: it returns lines, and goggles.js prints
 * them at its one print site (the src/ print surface is ratcheted).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { quiet } = require('../core/quiet');

const HUB = path.resolve(__dirname, '..', '..');
const HOME = process.env.ECOSYSTEM_HOME || path.resolve(HUB, '..');
const VOID = process.env.VOID_ROOT || path.join(HOME, 'Void-Data-Compressor');
const RESONANCE_FIELD = path.join(VOID, '.remembrance', 'resonance-field.json');
const CONTRACTS_LATEST = path.join(VOID, '.remembrance', 'contracts-latest.json');
const DENIALS = path.join(HUB, '.remembrance', 'goggles-denials.jsonl');
const LOCK = path.join(HUB, 'seeds', 'gates.lock.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { quiet('tools:goggles-instrument:readJson', e); return null; }   // absent is a reading, said by the caller
}
readJson.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** "3m ago" / "2h ago" / "5d ago" — or "unknown age" when the stamp is unreadable. */
function age(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown age';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 48) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
age.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** git's stdout, trimmed — or '' when git cannot answer (no repo, no HEAD). Never null. */
function gitOut(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (e) { quiet('tools:goggles-instrument:git', e); return ''; }
}
gitOut.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 9, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The living field, live, plus its source histogram (which sources feed it, how much of it is the instrument). */
function fieldLines() {
  const out = [];
  const fc = require('../core/field-coupling');
  const state = fc.peekField ? fc.peekField() : null;
  const last = fc.lastReading ? fc.lastReading() : null;
  if (!state) return out;
  out.push('\n  FIELD  (the living field, live — reacts to what was just read)');
  out.push(`    p (backdrop)     ${(state.coherence ?? 0).toFixed(4)}   0 = noise · 1 = unity`);
  out.push(`    globalEntropy    ${(state.globalEntropy ?? 0).toFixed(4)}   cost / (coherence + ε) — the balancing field`);
  out.push(`    cascadeFactor    ${(state.cascadeFactor ?? 0).toFixed(4)}   1 = baseline rate · >1 = a burst`);
  out.push(`    ∫p (integral)    ${Math.round(state.coherenceIntegral ?? 0)}   total aligned order, no ceiling`);
  if (last && typeof last.delta_void === 'number') {
    const iso = last.void_source === 'field:resonance';
    out.push(`    void term        ${last.delta_void.toFixed(4)}   [${last.void_source}]${iso ? '' : '  (no field measurement — derived from 1−p)'}`);
    if (typeof last.r_eff === 'number') out.push(`    r_eff (retro)    ${last.r_eff.toFixed(4)}   pull toward the healed attractor`);
  }
  out.push(`    updates          ${state.updateCount ?? 0}`);
  const sources = Object.entries(state.sources || {})
    .map(([k, v]) => [k, (v && typeof v.count === 'number') ? v.count : 0]);
  if (sources.length) {
    const total = sources.reduce((s, [, c]) => s + c, 0);
    const fromVoid = sources.filter(([k]) => k.startsWith('void:')).reduce((s, [, c]) => s + c, 0);
    const top = [...sources].sort((a, b) => b[1] - a[1]).slice(0, 5);
    out.push(`    histogram        ${sources.length} sources · ${fromVoid} of ${total} updates labelled void:* (the instrument's own readings)`);
    for (const [k, c] of top) out.push(`       ${String(c).padStart(7)}  ${k}`);
  }
  return out;
}
fieldLines.atomicProperties = { charge: 1, valence: 1, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 3, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

/** What the substrate remembers: the library's census and this file's stored reading. */
function stateLines(project, rel) {
  const out = ['\n  STATE  (what the substrate remembers — the library, and this file)'];
  const { VoidLibrary } = require('../core/void-library');
  const lib = new VoidLibrary();
  const c = lib.census();
  if (c.loadError) { out.push(`    library          unavailable — ${c.loadError}`); return out; }
  const store = c.store && c.store.rows
    ? `${c.store.rows} store rows (${c.store.width}-D)`
    : `no store rows (${(c.store && c.store.error) || 'store absent'})`;
  out.push(`    library          ${c.entries} index entries (${c.withReading} with a stored reading, ${c.fromCompressor} from the compressor) + ${store}`);
  let meta = null;
  try {
    const { substrateSelfNames } = require('../core/coherency-mapper');
    for (const n of substrateSelfNames(project || '', rel)) { meta = lib.entryMeta(n); if (meta) break; }
  } catch (e) { quiet('tools:goggles-instrument:selfNames', e); meta = lib.entryMeta(`${project || ''}/${rel}`); }
  if (!meta) out.push('    this file        never witnessed by the substrate — goggles --do harvest <repo>');
  else {
    const reading = typeof meta.coherence === 'number'
      ? `stored coherency ${meta.coherence.toFixed(4)} (${meta.coherenceSource || 'source unlabelled'})`
      : 'no stored reading (witnessed while the instrument was down — goggles --do harvest <repo> --restamp)';
    out.push(`    this file        ${reading} · ${meta.width || '?'}-D · witnessed ${meta.ingestedAt ? age(meta.ingestedAt) : 'at an unrecorded time'}`);
  }
  return out;
}
stateLines.atomicProperties = { charge: 1, valence: 2, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 1, group: 3, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

/** The cross-domain resonance field, from the last scan, with its age. */
function resonanceFieldLines() {
  const out = ['\n  RESONANCE FIELD  (cross-domain, on the compressed patterns — the last --do resonance)'];
  const r = readJson(RESONANCE_FIELD);
  if (!r) { out.push('    not computed on this host — goggles --do resonance   (seconds; never recomputed per read)'); return out; }
  out.push(`    scanned ${age(r.computed_at)} · ${r.domains} domains · ${r.resonances} resonances · coherence_index ${r.coherence_index} · ${r.anomaly_count} anomalies`);
  if (Array.isArray(r.anomalies) && r.anomalies.length) out.push(`    anomalies (nothing resonates with them): ${r.anomalies.slice(0, 5).join(' · ')}`);
  for (const s of (r.strongest || []).slice(0, 3)) out.push(`       ${Number(s.score).toFixed(4)}  ${s.a}  <->  ${s.b}  [${s.type}]`);
  return out;
}
resonanceFieldLines.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The truth-spine's last full verdict, with its age and whether Void has moved since. */
function contractsLines() {
  const out = ['\n  CONTRACTS  (the truth-spine — the last full --do contracts)'];
  const c = readJson(CONTRACTS_LATEST);
  if (!c) { out.push('    never run on this host — goggles --do contracts'); return out; }
  const head = gitOut(VOID, ['rev-parse', '--short', 'HEAD']);
  const stale = c.head && head && !head.startsWith(c.head) && !c.head.startsWith(head);
  out.push(`    ${c.passed}/${c.total} pass · ran ${age(c.ran_at)} at Void ${c.head || '?'}${stale ? ` — Void is now at ${head}: STALE, goggles --do contracts` : ''}`);
  if (Array.isArray(c.failing) && c.failing.length) out.push(`    failing: ${c.failing.join(', ')}`);
  return out;
}
contractsLines.atomicProperties = { charge: 1, valence: 0, mass: "light", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Do the locked gate files still hash to the lock? Pure recomputation, no require of the gate. */
function gateLockState() {
  const lock = readJson(LOCK) || {};
  const gates = lock.gates && typeof lock.gates === 'object' ? lock.gates : null;
  if (!gates) return { ok: false, reason: 'no seeds/gates.lock.json — the gates are unlocked' };
  const drift = [];
  for (const [rel, sha] of Object.entries(gates)) {
    let cur = null;
    try { cur = crypto.createHash('sha256').update(fs.readFileSync(path.join(HUB, rel))).digest('hex'); }
    catch (e) { quiet('tools:goggles-instrument:gate-missing', e); cur = null; }   // a missing gate file IS drift
    if (cur !== sha) drift.push(rel);
  }
  return { ok: drift.length === 0, gates: Object.keys(lock.gates).length, drift, digest: lock.digest };
}
gateLockState.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 5, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The one door's state: the coin on HEAD, this file vs HEAD, the gates, the
 * wall's ledger, the instrument. `answered` is whether THIS read got a
 * coherency — the truest liveness signal there is; a health probe can time
 * out while the compressor is busy answering the very read being printed.
 */
function wallLines(root, rel, answered) {
  const out = ['\n  WALL  (the one door — coin, gates, denials, instrument)'];
  if (root) {
    const head = gitOut(root, ['rev-parse', '--short', 'HEAD']) || '(no HEAD)';
    const msg = gitOut(root, ['log', '-1', '--format=%B']);
    const coin = (/^Remembrance-Coin:\s*([0-9a-f]{64})\s*$/m.exec(msg) || [])[1];
    const ledgerDoc = readJson(path.join(root, 'coins.ledger.json'));
    const ledger = ledgerDoc == null ? null : ledgerDoc;
    const n = ledger != null && Array.isArray(ledger.coins) ? ledger.coins.length : 0;
    out.push(coin
      ? `    coin             HEAD ${head} carries coin ${coin.slice(0, 12)}… · ${n} coin(s) in the ledger`
      : `    coin             HEAD ${head} carries NO coin${ledger ? ' — a commit made beside the pipeline' : ' — pre-epoch (no coin ledger in this repo yet)'}`);
    let changed = null;
    try { execFileSync('git', ['-C', root, 'diff', '--quiet', 'HEAD', '--', rel], { stdio: 'ignore' }); changed = false; }
    catch (e) { changed = e && e.status === 1 ? true : null; if (changed === null) quiet('tools:goggles-instrument:diff', e); }
    if (changed === false) out.push('    this file        unchanged since HEAD — covered by that coin');
    else if (changed === true) out.push('    this file        MODIFIED since HEAD — unminted until: git add → goggles --do mint → commit');
    else out.push('    this file        not tracked — a new file is unminted until: git add → goggles --do mint → commit');
  }
  const g = gateLockState();
  out.push(g.ok
    ? `    gates            lock holds — ${g.gates} gates untouched (${String(g.digest).slice(0, 12)}…)`
    : `    gates            ${g.reason || 'TOUCHED: ' + g.drift.join(', ') + ' — owner relock with a reason, then anchor'}`);
  let denials = 0;
  try { denials = fs.readFileSync(DENIALS, 'utf8').split('\n').filter(Boolean).length; }
  catch (e) { quiet('tools:goggles-instrument:denials', e); denials = 0; }   // no ledger yet = no denials yet
  out.push(`    denials          ${denials} refused bypass(es) on this host's ledger (goggles --do denials)`);
  if (answered === true) out.push('    instrument       HEALTHY — the compressor answered this read (sealed above)');
  else if (answered === false) out.push('    instrument       DOWN — this read got NO coherency: goggles --do service start --wait');
  else {
    try {
      const vs = require('../core/void-service');
      out.push(vs.isUp() ? '    instrument       HEALTHY — the compressor is answering' : '    instrument       not answering right now — goggles --do service status');
    } catch (_) { quiet('tools:goggles-instrument:service', _); }
  }
  return out;
}
wallLines.atomicProperties = { charge: 1, valence: 1, mass: "medium", spin: "odd", phase: "liquid", reactivity: "medium", electronegativity: 1, group: 3, period: 3, harmPotential: "dangerous", alignment: "neutral", intention: "malevolent", domain: "utility" };

/**
 * Every section a read carries beside the file. Each is best-effort: a
 * section that cannot be read is skipped with a quiet note, never a crash.
 * @param {{ root: string|null, project: string, rel: string }} ctx
 * @returns {string[]}
 */
function instrumentLines(ctx) {
  const lines = [];
  const parts = [
    ['field', () => fieldLines()],
    ['state', () => stateLines(ctx.project, ctx.rel)],
    ['resonance', () => resonanceFieldLines()],
    ['contracts', () => contractsLines()],
    ['wall', () => wallLines(ctx.root, ctx.rel, ctx.answered)],
  ];
  for (const [name, fn] of parts) {
    try { lines.push(...fn()); }
    catch (e) { quiet('tools:goggles-instrument:' + name, e); lines.push(`\n  ${name.toUpperCase()}  unavailable on this host (${e && e.message ? e.message : e})`); }
  }
  return lines;
}
instrumentLines.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { instrumentLines, age, gateLockState, wallLines, contractsLines, resonanceFieldLines, stateLines, fieldLines };
