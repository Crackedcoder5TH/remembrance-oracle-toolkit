'use strict';
const { quiet } = require('../quiet');

/**
 * field-coupling/history.js — durable field direction + temporal snapshots; the write rides a sealed covenant gate.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */

const { contribute, peekField, recordCost } = require('./verbs');

// The direction history snapshot is a real mutation — covenant-gated.
const { createGate, requireGate } = require('../covenant-fractal');
const _writeDirection = requireGate((gate, p, data) => require('node:fs').writeFileSync(p, data));
const _sealedGate = () => createGate().seal({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2, harmPotential: 'none', alignment: 'neutral', intention: 'benevolent', domain: 'field-memory' });

// ── Field-direction readout (the substrate's flow vector) ────────────────
//
// A small history of field snapshots lets us compute the direction of
// flow: coherence delta, entropy delta, cascade delta over the recent
// window. The combined vector tells you whether the field is healing
// (coherence up, entropy down), degrading (coherence down, entropy up),
// saturating (cascade up), or relaxing (cascade down).

const _DIRECTION_HISTORY_MAX = 30;

const _directionHistory = [];   // [{ ts, coherence, entropy, cascade }]

// Durable backing so the flow trajectory survives across processes — without
// it, fieldDirection() only ever sees the current process's snapshots and
// returns 'insufficient-history' on a fresh run. The substrate's flow is read
// as ONE continuous line across the ecosystem, so it must persist.
// `path` is otherwise lazily required inside functions in this module, but
// these two constants are resolved at module-load, so it must be in scope here.
const _path = require('node:path');

const _DIRECTION_PATH = process.env.FIELD_DIRECTION_PATH
  || _path.join(__dirname, '..', '..', '.remembrance', 'field-direction.jsonl');

// Committed durable copy in the blockchain repo's data/ — survives a container
// reclaim (the .remembrance/ working file is gitignored and does not).
const _DIRECTION_SEED = process.env.FIELD_DIRECTION_SEED
  || _path.join(__dirname, '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'data', 'field-direction.seed.jsonl');

let _directionLoaded = false;

function _readDirectionLines(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8').trim();
    if (!raw) return [];
    const out = [];
    for (const ln of raw.split('\n').slice(-_DIRECTION_HISTORY_MAX)) {
      try {
        const s = JSON.parse(ln);
        if (s && typeof s.coherence === 'number') out.push(s);
      } catch (_) { quiet('core:field-coupling:history:_readDirectionLines', _); /* skip malformed line */ }
    }
    return out;
  } catch (_) { return []; }
}

function _loadDirectionHistory() {
  if (_directionLoaded) return;
  _directionLoaded = true;
  // Prefer the live working file; fall back to the committed durable seed so a
  // fresh container restores the flow line instead of starting blind.
  let lines = _readDirectionLines(_DIRECTION_PATH);
  if (lines.length === 0) lines = _readDirectionLines(_DIRECTION_SEED);
  for (const s of lines) _directionHistory.push(s);
}

function _captureDirectionSnapshot(state) {
  if (!state) return;
  _loadDirectionHistory();
  const snap = {
    ts: Date.now(),
    coherence: state.coherence,
    entropy: state.globalEntropy,
    cascade: state.cascadeFactor,
  };
  _directionHistory.push(snap);
  if (_directionHistory.length > _DIRECTION_HISTORY_MAX) _directionHistory.shift();
  // Durable append, bounded to the last MAX snapshots. Best-effort: a write
  // failure never breaks a field read.
  try {
    const dir = path.dirname(_DIRECTION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _writeDirection(_sealedGate(), _DIRECTION_PATH,
      _directionHistory.map((s) => JSON.stringify(s)).join('\n') + '\n');
  } catch (_) { quiet('core:field-coupling:history:_sealedGate', _); /* best-effort persistence */ }
}

/**
 * Compute the field's direction-of-flow over a recent window. Returns
 * the delta in (coherence, entropy, cascade) plus a human-readable
 * verdict: healing / degrading / saturating / relaxing / steady.
 *
 * @param {number} [windowN=5] how many recent snapshots to compare against current
 * @returns {object} { verdict, coherenceDelta, entropyDelta, cascadeDelta, windowN, snapshots }
 */
function fieldDirection(windowN = 5) {
  const current = peekField();
  if (!current) return null;
  _captureDirectionSnapshot(current);
  if (_directionHistory.length < 2) {
    return { verdict: 'insufficient-history', coherenceDelta: 0, entropyDelta: 0, cascadeDelta: 0, windowN: 0 };
  }
  const window = _directionHistory.slice(-Math.max(2, windowN + 1));
  const first = window[0];
  const last = window[window.length - 1];
  const coherenceDelta = last.coherence - first.coherence;
  const entropyDelta = last.entropy - first.entropy;
  const cascadeDelta = last.cascade - first.cascade;
  let verdict;
  const COH_T = 0.005, ENT_T = 0.5, CAS_T = 0.3;
  if (coherenceDelta > COH_T && entropyDelta < -ENT_T) verdict = 'healing';
  else if (coherenceDelta < -COH_T && entropyDelta > ENT_T) verdict = 'degrading';
  else if (cascadeDelta > CAS_T) verdict = 'saturating';
  else if (cascadeDelta < -CAS_T) verdict = 'relaxing';
  else if (Math.abs(coherenceDelta) <= COH_T && Math.abs(entropyDelta) <= ENT_T) verdict = 'steady';
  else if (coherenceDelta > COH_T) verdict = 'gaining-coherence';
  else if (coherenceDelta < -COH_T) verdict = 'losing-coherence';
  else verdict = 'mixed';
  return {
    verdict,
    coherenceDelta,
    entropyDelta,
    cascadeDelta,
    windowN: window.length,
    fromTs: first.ts,
    toTs: last.ts,
    snapshots: window,
  };
}

fieldDirection.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 1, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

// ── Temporal snapshot recording (auto temporal-coherency measurement) ────
//
// Walk a file's git history, compute adjacent-step + long-arc fractal
// coherency, and contribute the readings as temporal:* sources. This
// is what we did by hand for H1 (the temporal experiment); making it
// callable lets the substrate continuously self-measure its own
// temporal stability across the ecosystem.

/**
 * Walk the git history of a file and contribute adjacent + arc readings
 * to the field as temporal:<repo>:<file>:adjacent and ...:arc sources.
 *
 * @param {object} opts
 * @param {string} opts.repoDir absolute path to the git repo
 * @param {string} opts.filePath path to the file relative to repoDir
 * @param {number} [opts.maxVersions=12] cap on history depth
 * @returns {object} { recorded, adjacent, arc, versions, source }
 */
function recordTemporalSnapshot({ repoDir, filePath, maxVersions = 12 } = {}) {
  if (!repoDir || !filePath) return { recorded: false, reason: 'repoDir and filePath required' };
  let execSync, path, fs, fractalCoherencyOf;
  try {
    execSync = require('node:child_process').execSync;
    path = require('node:path');
    fs = require('node:fs');
    ({ fractalCoherencyOf } = require('../fractal-waveform.js'));
  } catch (e) {
    return { recorded: false, reason: 'deps unavailable: ' + e.message };
  }
  const full = path.join(repoDir, filePath);
  if (!fs.existsSync(full)) return { recorded: false, reason: 'file not found: ' + full };
  const sh = (cmd) => {
    try { return execSync(cmd, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (_) { return null; }
  };
  const log = sh('git log --reverse --pretty=format:"%H|%ai" -- ' + JSON.stringify(filePath));
  if (!log) return { recorded: false, reason: 'no git history for ' + filePath };
  const commits = log.trim().split('\n').filter(Boolean).map(l => {
    const [hash, date] = l.split('|'); return { hash, date };
  });
  if (commits.length < 3) return { recorded: false, reason: 'fewer than 3 commits in history' };
  const step = commits.length / Math.min(commits.length, maxVersions);
  const sampled = [];
  for (let i = 0; i < Math.min(commits.length, maxVersions); i++) sampled.push(commits[Math.floor(i * step)]);
  sampled.push(commits[commits.length - 1]);
  const versions = [];
  for (const c of sampled) {
    const content = sh('git show ' + c.hash + ':' + JSON.stringify(filePath));
    if (content && content.split('\n').length >= 10) versions.push({ ...c, content });
  }
  if (versions.length < 3) return { recorded: false, reason: 'fewer than 3 usable versions' };
  const adj = [];
  for (let i = 0; i < versions.length - 1; i++) {
    adj.push(fractalCoherencyOf(versions[i].content, versions[i + 1].content));
  }
  // NO AVERAGING. Each adjacent-version reading is returned as itself.
  //
  // PROVENANCE (2026-08-09): these readings come from the fractal ENCODER
  // fed raw git-history bytes that never passed through the Void
  // compressor — so they are not the unified quantity the rest of the
  // substrate measures, and they no longer enter the coherence channel.
  // The temporal module is dormant by owner decision; its activation path
  // is compressor-witnessed time ledgers at the harvest doorway, at which
  // point the versions' compressor readings — not encoder ratios — become
  // the lawful field input. The snapshot WORK is real and rides
  // recordCost; the encoder descriptors stay in the return for the caller.
  const arc = fractalCoherencyOf(versions[0].content, versions[versions.length - 1].content);
  const repoName = path.basename(repoDir);
  const cleanFile = filePath.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const snapSource = 'temporal:' + repoName + ':' + cleanFile + ':snapshot';
  recordCost({ units: versions.length, source: snapSource, kind: 'work' });
  return {
    recorded: true,
    adjacent: adj,
    arc,
    versions: versions.length,
    span: { from: versions[0].date, to: versions[versions.length - 1].date },
    sources: [snapSource],
  };
}

recordTemporalSnapshot.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { _readDirectionLines, _loadDirectionHistory, _captureDirectionSnapshot, fieldDirection, recordTemporalSnapshot };
