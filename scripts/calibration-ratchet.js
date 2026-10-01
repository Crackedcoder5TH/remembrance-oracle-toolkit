#!/usr/bin/env node
'use strict';

/**
 * calibration-ratchet — the wall's own obedience reading as a gate.
 *
 * The wall refuses each off-surface attempt; this gate binds the RATE of
 * those refusals to a governed line. The reading comes entirely from
 * src/tools/calibration.js (the rolling window the hooks feed); the line
 * lives in seeds/calibration.baseline.json and, like every floor, only
 * ratchets DOWN (scripts/lib/ratchet-law.js). The gate is a reading, not
 * a new wall: enforcement is the pre-hook's contracting goggled-first
 * window, and it acts continuously whether or not anyone runs this gate.
 *
 *   node scripts/calibration-ratchet.js               check (exit 1 when HOT)
 *   node scripts/calibration-ratchet.js --json        machine-readable reading
 *   node scripts/calibration-ratchet.js --save-baseline
 *       tighten the line to 2x the current window rate, floored at 2.0
 *       per 100 so the gate keeps a judgeable band; a save that would
 *       RAISE the line is growth, refused under ratchet-law unless the
 *       owner accepts the debt by name.
 *
 * Census only — nothing here feeds the field. This gate scores commands
 * against the wall's own rules: it measures obedience to the operator's
 * stated surface, which is internal consistency with the wall by design,
 * and claims nothing beyond that.
 */

const fs = require('node:fs');
const path = require('node:path');
const { reading, windowMs, READ_WINDOW_CALM_MS } = require('../src/tools/calibration');
const { refuseIfLoosening } = require('./lib/ratchet-law');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = () => process.env.CALIBRATION_BASELINE_PATH
  || path.join(ROOT, 'seeds', 'calibration.baseline.json');
const SAVE_FLOOR_PER100 = 2.0;

// The one write — a tightened line — goes through the covenant gate.
const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});

function verdictLine(r) {
  const win = windowMs(r);
  const winSay = win === READ_WINDOW_CALM_MS ? 'reading window calm (2h)'
    : `reading window contracted to ${Math.round(win / 60000)}m`;
  if (!r.judged) {
    return `[calibration] ✓ unjudged — ${r.attempts} command(s) in window (min ${r.minAttempts}); line ${r.linePer100}/100 · ${winSay}`;
  }
  const rate = r.ratePer100.toFixed(2);
  if (!r.hot) {
    return `[calibration] ✓ holds — ${rate} denials/100 over ${r.attempts} command(s), line ${r.linePer100}/100 (s=${r.s.toFixed(3)}) · ${winSay}`;
  }
  const who = Object.entries(r.denialsByModel).map(([m, n]) => `${m}:${n}`).join(' ') || 'unknown';
  return `[calibration] ✗ HOT — ${rate} denials/100 over ${r.attempts} command(s) is at/over the line ${r.linePer100}/100 (s=${r.s.toFixed(3)}) · ${winSay} · denials by model: ${who}`;
}

function saveBaseline(r, argv) {
  let doc = {};
  try { doc = JSON.parse(fs.readFileSync(BASELINE(), 'utf8')); } catch (e) { doc = {}; }
  const stored = Number(doc.linePer100) > 0 ? Number(doc.linePer100) : r.linePer100;
  if (!r.judged) {
    console.error(`[calibration] ✗ save REFUSED — only ${r.attempts} command(s) in window (min ${r.minAttempts}); a line set on noise is a guess wearing a floor.`);
    return 1;
  }
  const proposed = Math.max(SAVE_FLOOR_PER100, Math.round(2 * r.ratePer100 * 100) / 100);
  if (proposed > stored) {
    const debt = [`line would rise ${stored} → ${proposed} per 100 (window rate ${r.ratePer100.toFixed(2)}) — the operator of this era owes the difference`];
    if (refuseIfLoosening('calibration-ratchet', debt, argv)) return 1;
  }
  doc.linePer100 = proposed;
  doc.savedAt = new Date().toISOString();
  doc.savedFrom = { attempts: r.attempts, denials: r.denials, ratePer100: Math.round(r.ratePer100 * 100) / 100 };
  _writeBaseline(_sealedGate(), BASELINE(), JSON.stringify(doc, null, 1) + '\n');
  console.log(`[calibration] line ${stored} → ${proposed} per 100 (2x window rate ${r.ratePer100.toFixed(2)}, floor ${SAVE_FLOOR_PER100}) — saved`);
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const r = reading();
  if (argv.includes('--save-baseline')) return saveBaseline(r, argv);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: !r.hot, ...r, windowMsInForce: windowMs(r) }, null, 1));
    return r.hot ? 1 : 0;
  }
  console.log(verdictLine(r));
  return r.hot ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { verdictLine, saveBaseline, SAVE_FLOOR_PER100 };
