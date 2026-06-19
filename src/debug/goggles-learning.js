'use strict';

/**
 * goggles-learning — the loop that lets the meta-debug self-optimise.
 *
 * The goggles surface audit findings; this feeds them through the quantum
 * debug-oracle so the field LEARNS which findings are worth surfacing, instead
 * of a human hand-patching every false-positive class (as we did for regex.exec).
 *
 *   • Each distinct finding is captured into the debug-oracle. capture() scores
 *     the fix's coherency and contributes to the field — so the debug pattern
 *     RESONATES in the same substrate as everything else, it isn't an island.
 *   • A finding that gets FIXED (gone on the next edit) → reportOutcome(resolved)
 *     → amplitude up. A finding that is surfaced and PERSISTS (shown, not acted
 *     on) → reportOutcome(false) → amplitude decays. successRate = resolved/applied
 *     is the native learning signal.
 *   • The goggles surface a finding only while its learned amplitude stays above
 *     a floor. A repeatedly-dismissed class (a false positive) decays below it
 *     and self-suppresses — no code change required.
 *   • Proven fixes (high amplitude, applied enough) promote into the shared void
 *     pattern library via the debug-bridge, so the fix knowledge FEEDS the same
 *     library the rest of the substrate is grown from.
 *
 * Best-effort: any failure degrades to "surface everything, learn nothing" and
 * never breaks the goggles.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.env.GOGGLES_LEARNING_ROOT || path.join(__dirname, '..', '..');
const STATE_PATH = path.join(ROOT, '.remembrance', 'goggles-learning.json');

// Verified on the debug-oracle: fresh capture ≈ 0.20, decays to ≈0.01 after a
// handful of dismissals. 0.08 surfaces fresh/real findings and suppresses a
// class that's been shown and ignored a few times.
// Moving numbers are consolidated in the Living Remembrance Engine (the core).
let GOG;
try { GOG = require('../core/living-remembrance').gogglesParams(); }
catch (_) { GOG = { suppressAmplitude: 0.08, penalizeAfter: 4, promoteEvery: 8, promoteAmplitude: 0.35 }; }
const SUPPRESS_AMPLITUDE = GOG.suppressAmplitude; // floor below which a finding self-suppresses
const PENALIZE_AFTER = GOG.penalizeAfter;         // grace-window edits before a persisting finding decays
const PROMOTE_EVERY = GOG.promoteEvery;           // throttle: feed the void library every N resolutions

let _debug; // DebugOracle | null | undefined (undefined = not yet tried)
function debugOracle() {
  if (_debug !== undefined) return _debug;
  _debug = null;
  try {
    const { SQLiteStore } = require('../store/sqlite');
    const { DebugOracle } = require('./debug-oracle');
    _debug = new DebugOracle(new SQLiteStore(ROOT));
  } catch (_) { _debug = null; }
  return _debug;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) { return {}; }
}
function saveState(s) {
  try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(s)); } catch (_) { /* best-effort */ }
}

// A finding's identity across edits: bug class + rule + a whitespace-normalised
// signature of the offending construct, so the same defect at a shifted line
// still matches and the same false-positive class is recognised everywhere.
function fingerprint(f) {
  const sig = String(f.code || f.reality || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${f.bugClass}/${f.ruleId || 'rule'}:${sig}`;
}
function errorMessageFor(f) {
  return `${f.bugClass}/${f.ruleId || 'rule'}: ${f.reality || f.assumption || ''}`.slice(0, 220);
}

// Read a pattern's learned amplitude WITHOUT observing it (search() would boost
// it). Falls back to confidence, then to the fresh default.
function amplitudeById(debug, id) {
  try {
    const row = debug.store.db.prepare('SELECT amplitude, confidence FROM debug_patterns WHERE id = ?').get(id);
    if (!row) return null;
    const a = row.amplitude ?? row.confidence;
    return Number.isFinite(a) ? a : null;
  } catch (_) { return null; }
}

/**
 * Run one turn of the learning loop for a single edited file.
 *
 * @param {{ filePath:string, findings:Array, content:string, language:string }} input
 * @returns {{ surface:Array, suppressed:number, resolved:number }}
 */
function processFindings({ filePath, findings, language }) {
  const state = loadState();
  state.patterns = state.patterns || {};             // fingerprint -> { id }
  state.files = state.files || {};                   // filePath -> { present: [{ fp, seen }] last turn }
  state.falsePositives = state.falsePositives || {}; // fingerprint -> { at, hits, auto, reason } — remembered mistakes
  state.resolutions = state.resolutions || 0;

  const prior = (state.files[filePath] || {}).present || []; // [{ fp, seen }] present last turn

  // Fast path: nothing flagged now and nothing was flagged here last turn — no
  // learning work and no need to open the debug store (keeps clean edits cheap).
  if (findings.length === 0 && prior.length === 0) return { surface: [], suppressed: 0, resolved: 0 };

  const debug = debugOracle();
  if (!debug) return { surface: findings, suppressed: 0, resolved: 0 }; // no field → surface all
  const priorSeen = new Map(prior.map((p) => [p.fp, p.seen || 1]));
  const current = findings.map((f) => ({ f, fp: fingerprint(f) }));
  const currentFps = new Set(current.map((c) => c.fp));

  // 1. LEARN — a finding present last turn and gone now is a FIX that worked.
  //    If it had been flagged a false positive, the fix proves it was real → forget
  //    the FP (self-correcting, so a wrong flag can't bury a real bug forever).
  let resolved = 0;
  for (const p of prior) {
    if (!currentFps.has(p.fp)) {
      const id = state.patterns[p.fp] && state.patterns[p.fp].id;
      if (id) { try { debug.reportOutcome(id, true); resolved += 1; state.resolutions += 1; } catch (_) { /* ignore */ } }
      if (state.falsePositives[p.fp]) {
        delete state.falsePositives[p.fp];
        // It was real after all — restore standing (the flag, manual or auto,
        // had floored the amplitude) so it can surface again next time.
        if (id) { try { for (let i = 0; i < 6; i++) debug.reportOutcome(id, true); } catch (_) { /* ignore */ } }
      }
    }
  }

  // 2. GATE — remembered false positives are suppressed outright; otherwise
  //    capture, penalise persistence past the grace window, and surface only
  //    findings whose learned amplitude is still above the floor.
  const surface = [];
  const present = [];
  let suppressed = 0;
  const AUTO_FP_AFTER = PENALIZE_AFTER * 2; // shown this often and never fixed → remember it as a false positive
  for (const { f, fp } of current) {
    const seen = (priorSeen.get(fp) || 0) + 1;
    // A remembered mistake — never surface it again, no grace window.
    if (state.falsePositives[fp]) {
      state.falsePositives[fp].hits = (state.falsePositives[fp].hits || 0) + 1;
      suppressed += 1;
      present.push({ fp, seen });
      continue;
    }
    let rec = state.patterns[fp];
    if (!rec) {
      let id = null;
      try {
        const cap = debug.capture({
          errorMessage: errorMessageFor(f),
          fixCode: f.suggestion || '',
          fixDescription: f.suggestion || f.reality || '',
          language: language || 'javascript',
          tags: ['goggles', f.bugClass],
        });
        id = cap && cap.pattern && cap.pattern.id;
      } catch (_) { /* capture optional */ }
      rec = state.patterns[fp] = { id };
    }
    // Past the grace window and still unfixed → a dismissed/false-positive class.
    if (seen >= PENALIZE_AFTER && rec.id) { try { debug.reportOutcome(rec.id, false); } catch (_) { /* ignore */ } }
    // Persisted well past the grace window, never fixed → flag it a false
    // positive: record it in the field histogram and stop surfacing it for good.
    if (seen >= AUTO_FP_AFTER) _recordFalsePositive(state, fp, f, { auto: true });

    const amp = rec.id ? amplitudeById(debug, rec.id) : null;
    if (amp != null && amp < SUPPRESS_AMPLITUDE) suppressed += 1;
    else surface.push(f);
    present.push({ fp, seen });
  }

  state.files[filePath] = { present, at: Date.now() };

  // 3. FEED the void library — promote proven fixes (throttled).
  if (state.resolutions >= PROMOTE_EVERY && state.resolutions % PROMOTE_EVERY === 0) {
    try { promoteToLibrary(debug); } catch (_) { /* promotion optional */ }
  }

  saveState(state);
  return { surface, suppressed, resolved };
}

// Promote high-amplitude, proven debug fixes into the shared void pattern
// library (the same `patterns` table the substrate is grown from), via the
// existing debug-bridge. A thin oracle shim backs registerPattern with a direct
// insert (mirrors field-tool._growSubstrate) so we don't load the full oracle.
function promoteToLibrary(debug) {
  const { promoteDebugToPatterns } = require('../unified/debug-bridge');
  const shim = {
    _getDebugOracle: () => debug,
    patterns: { getAll: () => [] }, // skip jaccard dedup; INSERT OR IGNORE guards exact dups
    registerPattern: (p) => registerPattern(debug.store, p),
  };
  // A goggles fix proven by repeated resolution (amplitude well above fresh, and
  // applied a few times) is worth feeding the library — looser than the bridge's
  // default 0.75, which is tuned for runtime debug fixes.
  return promoteDebugToPatterns(shim, { promoteAmplitude: GOG.promoteAmplitude, promoteMinApplied: 3 });
}

function registerPattern(store, { name, code, language, description, tags }) {
  const id = crypto.createHash('sha256').update(String(code || name || '')).digest('hex').slice(0, 16);
  const now = new Date().toISOString();
  store.db.prepare(`
    INSERT OR IGNORE INTO patterns (
      id, name, code, language, pattern_type, complexity, description, tags,
      coherency_total, coherency_json, variants, usage_count, success_count,
      evolution_history, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, code || '', language || 'javascript', 'debug-promoted', 'composite',
    description || '', JSON.stringify(tags || []), 0, '{}', '[]', 0, 0, '[]', 1, now, now,
  );
}

// ─── False-positive memory ──────────────────────────────────────────────────
// A recognised mistake is remembered HARD: recorded in the learning ledger (so
// the goggles never surface it again, no grace window) AND in the field's source
// histogram (so the field itself remembers — the memory persists in entropy.json
// and is visible via peekField). Distinct from amplitude decay, which is soft and
// recoverable; this is "it learned its lesson and won't repeat it."

function _recordFalsePositive(state, fp, finding, opts = {}) {
  state.falsePositives = state.falsePositives || {};
  const prior = state.falsePositives[fp];
  if (prior && !opts.force) return;
  state.falsePositives[fp] = { at: Date.now(), hits: prior ? prior.hits : 0, auto: !!opts.auto, reason: opts.reason || null };
  try {
    const fc = require('../core/field-coupling');
    if (fc && typeof fc.contribute === 'function') {
      // An FP is incoherent signal — contribute it at low coherence under a source
      // the histogram keeps, so "what mistakes has it learned" is queryable.
      fc.contribute({ cost: 1, coherence: 0.05, source: 'goggles:false-positive:' + ((finding && finding.bugClass) || 'unknown') });
    }
  } catch (_) { /* histogram contribution optional */ }
}

/**
 * Flag a finding (or its fingerprint string) as a false positive — explicitly,
 * from whoever recognised the mistake. Records it in the ledger + the field
 * histogram and drives its learned amplitude to the floor, so every signal agrees
 * and it never surfaces again. Self-corrects: if the finding is later fixed, the
 * loop forgets the flag (it was real after all).
 */
function flagFalsePositive(findingOrFp, opts = {}) {
  const fp = typeof findingOrFp === 'string' ? findingOrFp : fingerprint(findingOrFp);
  const finding = (findingOrFp && typeof findingOrFp === 'object') ? findingOrFp : { bugClass: String(fp).split('/')[0] };
  const state = loadState();
  state.patterns = state.patterns || {};
  _recordFalsePositive(state, fp, finding, { reason: opts.reason || 'manual', force: true });
  const debug = debugOracle();
  const id = state.patterns[fp] && state.patterns[fp].id;
  if (debug && id) { try { for (let i = 0; i < 10; i++) debug.reportOutcome(id, false); } catch (_) { /* ignore */ } }
  saveState(state);
  return { fp, flagged: true };
}

/** Flag every learned finding whose fingerprint contains `substr` as a false
 *  positive — usable when you remember the gist of the noise, not the exact fp. */
function flagFalsePositivesMatching(substr, opts = {}) {
  const state = loadState();
  state.patterns = state.patterns || {};
  let n = 0;
  for (const fp of Object.keys(state.patterns)) {
    if (fp.includes(substr)) {
      _recordFalsePositive(state, fp, { bugClass: String(fp).split('/')[0] }, { reason: opts.reason || 'manual-match', force: true });
      n += 1;
    }
  }
  saveState(state);
  return n;
}

module.exports = { processFindings, fingerprint, flagFalsePositive, flagFalsePositivesMatching };
