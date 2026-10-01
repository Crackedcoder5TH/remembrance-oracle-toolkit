'use strict';

/**
 * calibration — the wall measures whoever is holding the shell.
 *
 * Measured 2026-09-28 over one 27-day session (transcript-counted, per
 * model era): wall denials per 100 commands ran 12.6 / 10.2 / 18.2 / 4.3
 * across four model eras — within BOTH model families the newer, more
 * capable generation collided with the operator's stated rules at roughly
 * double its predecessor's rate, and the dominant failure was acting
 * before measuring (BRIEF REQUIRED, EDIT WITHOUT A READING). The wall
 * already refuses each attempt; nothing bound an ERA to a quantitative
 * obedience standard. This module is that binding.
 *
 * THE SHAPE IS THE ENGINE'S OWN. The denial rate over a rolling window is
 * an entropy source ξ_cal; it enters every consequence only in normalized
 * form s = min(1, ξ_cal / line) — the same S_norm convention the Living
 * Remembrance engines follow (living-remembrance.js: every ξ-driven force
 * is bounded through its normalized form; raw ξ once floored coherence in
 * one hot step). The one consequence is MORE MANDATORY MEASUREMENT: the
 * goggled-first reading window contracts smoothly from two hours toward
 * fifteen minutes as s rises (goggles-pre-hook.js reads windowMs()).
 * Recovery is mechanical — clean commands dilute the window; there is no
 * reset ceremony and no way to argue with it.
 *
 * The stream ledger is host-local (.remembrance/, like the denial log it
 * extends). The LINE is tracked in seeds/calibration.baseline.json and
 * only ratchets DOWN (scripts/calibration-ratchet.js, under ratchet-law).
 * Nothing here contributes to the field: watching the operator is not a
 * reading of an artifact, and refusing to loosen is not an event.
 */

const fs = require('node:fs');
const path = require('node:path');
const { quiet } = require('../core/quiet');

const ROOT = path.resolve(__dirname, '..', '..');
const LEDGER = () => process.env.CALIBRATION_LEDGER_PATH
  || path.join(ROOT, '.remembrance', 'goggles-calibration.jsonl');
const BASELINE = () => process.env.CALIBRATION_BASELINE_PATH
  || path.join(ROOT, 'seeds', 'calibration.baseline.json');

// Defaults hold only until seeds/calibration.baseline.json exists; the seed
// is the governed value. linePer100 = 2x the best measured era (4.26/100,
// claude-fable-5, session 60fa4f8b, 32 denials over 752 commands).
const DEFAULTS = { linePer100: 8.6, window: 200, minAttempts: 50 };

// The reading window the pre-hook enforces: calm = two hours (the standing
// goggled-first window), fully hot = fifteen minutes. The contraction is
// linear in s and floored — a bounded force, never a cliff.
const READ_WINDOW_CALM_MS = 2 * 60 * 60 * 1000;
const READ_WINDOW_FLOOR_MS = 15 * 60 * 1000;

// Stream hygiene: the ledger is a stats stream (not a versioned ledger — it
// has no digest and no replay), so rotation keeps the tail and drops the
// rest. Concurrent hook processes append single lines; O_APPEND keeps them
// whole, and a lost rotation race costs history, never correctness.
const ROTATE_AT = 5000;
const ROTATE_KEEP = 1000;

/** The governed thresholds: the tracked seed, else the defaults. */
function baseline() {
  try {
    const doc = JSON.parse(fs.readFileSync(BASELINE(), 'utf8'));
    return {
      linePer100: Number(doc.linePer100) > 0 ? Number(doc.linePer100) : DEFAULTS.linePer100,
      window: Number(doc.window) > 0 ? Math.floor(Number(doc.window)) : DEFAULTS.window,
      minAttempts: Number(doc.minAttempts) > 0 ? Math.floor(Number(doc.minAttempts)) : DEFAULTS.minAttempts,
    };
  } catch (e) { quiet('tools:calibration:baseline', e); return { ...DEFAULTS }; }
}
baseline.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 1, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The serving model, read from the tail of the session transcript the hook
 * input names. Best-effort: the last `"model":"claude-…"` in the final
 * 64 KiB. Null when the transcript is absent (tests, foreign harnesses).
 */
function lastModel(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
    const size = fs.statSync(transcriptPath).size;
    const span = Math.min(size, 64 * 1024);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(span);
    try { fs.readSync(fd, buf, 0, span, size - span); } finally { fs.closeSync(fd); }
    const text = buf.toString('utf8');
    const re = /"model":"(claude-[a-z0-9.-]+)"/g;
    let hit = null, m;
    while ((m = re.exec(text)) !== null) hit = m[1];
    return hit;
  } catch (e) { quiet('tools:calibration:last-model', e); return null; }
}
lastModel.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 0, group: 6, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * One observed command through the wall: denied or clean. Appends a single
 * JSON line; rotates the stream when it grows past ROTATE_AT. Never throws,
 * never blocks the hook.
 */
function record(outcome) {
  try {
    const file = LEDGER();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry = { t: Date.now(), d: outcome && outcome.denied ? 1 : 0 };
    if (entry.d && outcome.rule) entry.rule = String(outcome.rule).split('\n')[0].slice(0, 160);
    if (entry.d && outcome.transcriptPath) {
      const model = lastModel(outcome.transcriptPath);
      if (model) entry.model = model;
    }
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      if (lines.length > ROTATE_AT) {
        fs.writeFileSync(file, lines.slice(-ROTATE_KEEP).join('\n') + '\n');
      }
    } catch (e) { quiet('tools:calibration:rotate', e); }
  } catch (e) { quiet('tools:calibration:record', e); }
}
record.atomicProperties = { charge: -1, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 0, group: 6, period: 3, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The last `n` observed commands, oldest first. */
function entries(n) {
  try {
    const lines = fs.readFileSync(LEDGER(), 'utf8').split('\n').filter(Boolean);
    const tail = lines.slice(-Math.max(1, Math.floor(n)));
    const out = [];
    for (const line of tail) {
      try { out.push(JSON.parse(line)); } catch (e) { quiet('tools:calibration:entry-parse', e); }
    }
    return out;
  } catch (e) { quiet('tools:calibration:entries', e); return []; }
}
entries.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 9, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The calibration reading over the rolling window.
 *
 *   ξ_cal = denials / attempts            the entropy source
 *   s     = min(1, ξ_cal / line)          S_norm — ξ enters ONLY normalized
 *   hot   = judged ∧ ξ_cal ≥ line         judged only past minAttempts
 *
 * Below minAttempts the reading reports itself unjudged and s stays 0: a
 * gate that fires on three commands is noise wearing a verdict.
 */
function reading() {
  const b = baseline();
  const window = entries(b.window);
  const attempts = window.length;
  let denials = 0;
  const byModel = {};
  for (const e of window) {
    if (e.d === 1) {
      denials += 1;
      const who = e.model || 'unknown';
      byModel[who] = (byModel[who] || 0) + 1;
    }
  }
  const ratePer100 = attempts > 0 ? (denials / attempts) * 100 : 0;
  const judged = attempts >= b.minAttempts;
  const s = judged ? Math.min(1, ratePer100 / b.linePer100) : 0;
  const hot = judged && ratePer100 >= b.linePer100;
  return {
    attempts, denials, ratePer100, judged, s, hot,
    linePer100: b.linePer100, window: b.window, minAttempts: b.minAttempts,
    denialsByModel: byModel,
  };
}
reading.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The goggled-first window in force right now: contracts linearly with s
 * from the calm two hours to the fifteen-minute floor. The pre-hook calls
 * this in place of its constant; with an empty or cold ledger it returns
 * exactly the calm window, so behavior beneath the layer is unchanged.
 */
function windowMs(r) {
  const read = r || reading();
  const span = READ_WINDOW_CALM_MS - READ_WINDOW_FLOOR_MS;
  return Math.max(READ_WINDOW_FLOOR_MS, Math.round(READ_WINDOW_CALM_MS - span * read.s));
}
windowMs.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 1, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = {
  baseline, lastModel, record, entries, reading, windowMs,
  READ_WINDOW_CALM_MS, READ_WINDOW_FLOOR_MS, DEFAULTS,
};
