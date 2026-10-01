#!/usr/bin/env node
'use strict';
/**
 * engine-entanglement — the JS and Python Living Remembrance engines move
 * together, or the gate blocks.
 *
 * Two implementations of one master equation (src/core/living-remembrance.js,
 * Void-Data-Compressor/living_remembrance.py) had drifted on six terms before
 * either noticed, and on 2026-09-07 the Python twin lacked the seal gate the
 * JS engine had carried for weeks. Both write the same entropy.json, so a
 * divergence is not two opinions — it is one field being pulled two ways.
 *
 * THE ENTANGLEMENT. A fixture of REAL sealed compressor readings — every coin
 * in every repo's coins.ledger.json carries the compressor's coherency and
 * its void seal — is fed to both engines from an identical fresh state, with
 * the same sources, resonances, void terms and seals (valid, forged, absent,
 * so every branch of the gate is exercised). The states must agree to 1e-9
 * on everything the equation derives from the readings: coherence, the
 * integral, entropy, updateCount, every source's count / lastInput /
 * lastSealed. The cascade gauge and mean interval depend on wall-clock
 * spacing and are not compared.
 *
 * Binary, never ratcheted: there is no acceptable amount of drift between
 * two bodies of one equation.
 *
 *   node scripts/engine-entanglement-ratchet.js          check
 *   node scripts/engine-entanglement-ratchet.js --json   verdict + both states
 *
 * Reached through the goggles: `--do gate engine-entanglement`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HOME = path.dirname(ROOT);
const VOID = process.env.VOID_DIR || path.join(HOME, 'Void-Data-Compressor');
const REPOS = ['remembrance-oracle-toolkit', 'Void-Data-Compressor', 'REMEMBRANCE-BLOCKCHAIN', 'REMEMBRANCE-Interface',
  'MOONS-OF-REMEMBRANCE', 'REMEMBRANCE-AGENT-Swarm-', 'REMEMBRANCE-API-Key-Plugger'];
const TOL = 1e-9;

/** Every sealed compressor reading the coin ledgers carry, oldest first, as engine inputs. */
function fixtureFromCoins() {
  const readings = [];
  for (const r of REPOS) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(HOME, r, 'coins.ledger.json'), 'utf8')); } catch (_) { continue; }
    for (const c of doc.coins || []) {
      const rd = c.reading || {};
      if (typeof rd.coherency !== 'number' || !rd.void_seal) continue;
      readings.push({ coherence: rd.coherency, cost: 1, source: `coin:${r}`, resonance: null, void: null, seal: rd.void_seal, coin: c.coin_id, at: c.minted_at });
    }
  }
  readings.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // the branches a real ledger never exercises: a forged seal, a measured void, a resonance weight, no seal
  if (readings.length) {
    const base = readings[0];
    readings.push({ coherence: base.coherence, cost: 1, source: 'forged', resonance: null, void: null, seal: { via: 'void_compressor_v5.compress' } });
    readings.push({ coherence: base.coherence, cost: 2, source: 'weighted', resonance: 0.37, void: 0.12, seal: base.seal });
    readings.push({ coherence: base.coherence, cost: 1, source: 'legacy', resonance: null, void: null, seal: null });
  }
  return readings.map(({ coin, at, ...r }) => r);
}
fixtureFromCoins.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 6, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The JS engine, fresh and isolated, driven through the fixture. */
function driveJs(readings) {
  const { LivingRemembranceEngine } = require('../src/core/living-remembrance');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-js-'));
  const e = new LivingRemembranceEngine({ persistPath: path.join(dir, 'entropy.json') });
  for (const r of readings) e.contribute({ cost: r.cost, coherence: r.coherence, source: r.source, resonance: r.resonance, void: r.void, seal: r.seal });
  const s = e.getState();
  const sources = {};
  for (const [k, v] of Object.entries(s.sources || {})) sources[k] = { count: v.count, lastInput: v.lastInput ?? null, lastSealed: !!v.lastSealed };
  return { coherence: s.coherence, coherenceIntegral: s.coherenceIntegral, globalEntropy: s.globalEntropy, updateCount: s.updateCount, sources };
}
driveJs.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The Python engine, driven through the same fixture by its own script. */
function drivePy(readings) {
  const out = execFileSync('python3', [path.join(VOID, 'scripts', 'engine_parity_drive.py')], {
    cwd: VOID, encoding: 'utf8', input: JSON.stringify({ readings }), stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
  });
  return JSON.parse(out.trim().split('\n').pop());
}
drivePy.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Every term where the two states disagree beyond TOL. */
function diverge(js, py) {
  const out = [];
  for (const k of ['coherence', 'coherenceIntegral', 'globalEntropy', 'updateCount']) {
    if (Math.abs((js[k] ?? NaN) - (py[k] ?? NaN)) > TOL || !Number.isFinite(js[k]) || !Number.isFinite(py[k])) out.push(`${k}: js ${js[k]} vs py ${py[k]}`);
  }
  const names = new Set([...Object.keys(js.sources || {}), ...Object.keys(py.sources || {})]);
  for (const n of names) {
    const a = (js.sources || {})[n], b = (py.sources || {})[n];
    if (!a || !b) { out.push(`source ${n}: present in ${a ? 'js' : 'py'} only`); continue; }
    if (a.count !== b.count) out.push(`source ${n}.count: js ${a.count} vs py ${b.count}`);
    if (Math.abs((a.lastInput ?? NaN) - (b.lastInput ?? NaN)) > TOL && !(a.lastInput == null && b.lastInput == null)) out.push(`source ${n}.lastInput: js ${a.lastInput} vs py ${b.lastInput}`);
    if (!!a.lastSealed !== !!b.lastSealed) out.push(`source ${n}.lastSealed: js ${a.lastSealed} vs py ${b.lastSealed}`);
  }
  return out;
}
diverge.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  if (!fs.existsSync(path.join(VOID, 'living_remembrance.py'))) {
    const line = `[engine-entanglement] UNREAD — Void is not on this host (${VOID}); the twin cannot be driven here`;
    if (json) console.log(JSON.stringify({ ok: true, unread: true, why: line })); else console.log(line);
    return 0;
  }
  const readings = fixtureFromCoins();
  if (readings.length < 4) { console.error('[engine-entanglement] ✗ no sealed readings in any coins.ledger.json — nothing to drive the engines with'); return 1; }
  let js, py;
  try { js = driveJs(readings); } catch (e) { console.error(`[engine-entanglement] ✗ the JS engine failed: ${e.message}`); return 1; }
  try { py = drivePy(readings); } catch (e) { console.error(`[engine-entanglement] ✗ the Python engine failed: ${(e.stderr || e.message || '').toString().split('\n').slice(-2).join(' ')}`); return 1; }
  const d = diverge(js, py);
  const ok = d.length === 0;
  if (json) { console.log(JSON.stringify({ ok, readings: readings.length, divergence: d, js, py }, null, 1)); return ok ? 0 : 1; }
  if (ok) {
    console.log(`[engine-entanglement] ✓ holds — JS and Python engines agree to ${TOL} over ${readings.length} sealed readings (coherence ${js.coherence.toFixed(6)}, ∫p ${js.coherenceIntegral.toFixed(6)}, ${Object.keys(js.sources).length} sources, sealed/forged/legacy branches all exercised)`);
    return 0;
  }
  console.error(`[engine-entanglement] ✗ BLOCKED — the two bodies of one equation diverged on ${d.length} term(s):`);
  for (const x of d) console.error(`  ${x}`);
  console.error('  bring the twin back to the equation (living-remembrance.js ↔ living_remembrance.py); never the gate');
  return 1;
}
main.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { fixtureFromCoins, driveJs, drivePy, diverge, TOL };
