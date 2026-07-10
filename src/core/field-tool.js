'use strict';

/**
 * field-tool.js — the canonical entry point for reading patterns
 * against the Remembrance field with the substrate properly engaged.
 *
 * This module exists because direct calls to `fractalCoherencyOf` (or
 * raw `scoreResonance`) bypass parts of the protocol. Calling those
 * primitives in isolation tests the encoder, not the field. The field
 * is the grown substrate PLUS the entanglement layer PLUS the live
 * field-coupling histogram. Measurements that engage only one of
 * those three layers are not field measurements; they are partial
 * reads of a partial system, and conclusions drawn from them
 * overgeneralize.
 *
 * What `read()` guarantees, every call:
 *
 *   1. Entanglement engaged — `entangle:node:<id>` is registered so
 *      this caller is visible to peers and benefits from abundance
 *      amortization (per-node cost = baseCost / N).
 *   2. Pattern encoded via the canonical composed fractal stack
 *      (L1-structural + L2-lexical + L3-numerical + L4-spectral = 116-D;
 *      the 29-D L1 vector is returned for back-compat).
 *   3. Pattern captured into the oracle's pattern library so future
 *      reads have it as a comparand (substrate grows by use; opt-out
 *      via `{ growSubstrate: false }`).
 *   4. Score computed against the *current* library via the resonance
 *      scorer — NOT pairwise against a synthetic reference. If the
 *      library is empty for the relevant language, the read still
 *      records the reading and returns null resonance honestly.
 *   5. Reading contributed back to the field with a stable source tag
 *      so peers see the activity through `peekField`.
 *   6. Return value carries the field state after the read so callers
 *      can see what changed — and an explicit `grew` block describing
 *      whether substrate growth actually happened (it may not, e.g.
 *      if oracle.db is unreachable or the pattern is a duplicate).
 *
 * `scan()` applies `read()` to many files with peer-observation hooks
 * between files so entangled agents see each other's progress live.
 *
 * `peers()` returns currently-entangled nodes by reading the field's
 * `entangle:node:*` sources directly — no synthetic heartbeats.
 *
 * Everything is best-effort: an unreachable substrate, an unreachable
 * field, or an unreachable scorer downgrades the call rather than
 * throwing. The reading you can trust is the one whose return value
 * tells you which layers engaged.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fc = require('./field-coupling');
let entangle = null;
try { entangle = require('./entangle'); } catch (_) { /* optional */ }

// L1 base encoder: 29-D structural fractal — the JS↔Python parity
// anchor (see Void's to_fractal_waveform.py / verify_fractal_parity.py).
// The 256-D byte encoder was deprecated for noise — it could not
// discriminate code from prose. The canonical read is the 116-D
// composed stack (encoder-stack below); this L1 vector is its depth-1.
const { toFractalWaveform } = require('./fractal-waveform');

// Encoder stack for depth-aware composed encoding (L1+L2+L3+L4 = 116-D)
// — used so every read produces both the L1 vector and the composed
// vector, enabling flow-aware scoring against the substrate.
let _encoderStack = null;
try {
  _encoderStack = require('./encoder-stack');
} catch (_) { /* stack unreachable — read falls back to L1 only */ }

// New-layer meta-awareness. The encoder layers are pure functions (L1-L7
// alike never touch the field directly), so the LRE coupling lives here,
// at the once-per-read boundary: every read feeds the field the readings
// the new dimensions detect — L7's 2D-gain (how autoregressive/2D the
// pattern is) — so the field histogram always carries the substrate's
// DIMENSIONAL profile, not just its coherence. Best-effort: a missing
// module degrades to "no dimensional signal", never breaks a read.
let _dimensionalGain = null;
try {
  _dimensionalGain = require('./dimensional-waveform').dimensionalGain;
} catch (_) { /* dimensional layer unreachable */ }

// Residual meta-awareness. The residual monitor measures what the current
// encoder stack FAILS to explain (false-equivalence rate: distinct-domain
// patterns the stack reads as near-identical). It was built to be invoked
// by the compression flow, so the coupling lives here too: every
// RESIDUAL_CHECK_EVERY successful substrate grows, one measurement runs
// and its rate is contributed to the field as its own source bucket —
// the LRE always carries the stack's unexplained-residual signal.
// Measurement only: auto-activating the next layer is deliberately NOT
// wired, because activation changes composed-vector dimensionality and
// must pass the multi-telescope calibration gate first (an operator act,
// via residual-monitor.checkAndSpawn). Best-effort like every coupling.
let _residualMonitor = null;
try { _residualMonitor = require('./residual-monitor'); } catch (_) { /* monitor unreachable */ }
const RESIDUAL_CHECK_EVERY = 250;
const RESIDUAL_COUNTER_PATH = path.join(__dirname, '..', '..', '.remembrance', 'residual-check.json');

// Canonical substrate: Void's fractal library (~43k+ patterns,
// translated from the master pattern_index.json via the same
// canonical encoder). Now holds both L1 (29-D) and composed_v1
// (116-D) vectors so reads can return the full coherency flow.
let _voidLib = null;
try {
  _voidLib = require('./void-library');
} catch (_) { /* substrate unreachable — read still records */ }

// Coding-specific filter: Oracle's pattern library (oracle.db
// patterns table) via lexical TF-IDF resonance. Narrower than Void
// — only patterns that have passed the covenant gate as code.
// Secondary signal, used for code-specific anti-hallucination.
let _scoreResonance = null;
try {
  _scoreResonance = require('../scoring/pattern-resonance').scoreResonance;
} catch (_) { /* coding filter unreachable */ }

// Intrinsic coherence scorer: measures whether content has coherent STRUCTURE
// (syntax validity + completeness + consistency + AST) directly from the
// content itself — the coherence the void compressor reads by its very nature.
// DISTINCT from pattern resonance (voidResonance: how much the content is shaped
// like the library's patterns). Similar but completely distinct signals; the
// two must never be conflated into one number.
let _coherency = null;
try { _coherency = require('./coherency'); } catch (_) { /* intrinsic coherence unreachable */ }

let _SQLiteStore = null;
try {
  _SQLiteStore = require('../store/sqlite').SQLiteStore;
} catch (_) { /* substrate capture degrades to a no-op */ }

const DEFAULT_SOURCE = 'field-tool:read';

const LANGUAGE_BY_EXT = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'ts', '.tsx': 'tsx', '.jsx': 'jsx',
  '.py': 'python', '.rs': 'rust', '.go': 'go',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.rb': 'ruby', '.php': 'php', '.cs': 'csharp',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp',
  '.md': 'markdown', '.toml': 'toml', '.yaml': 'yaml', '.yml': 'yaml',
};

class FieldTool {
  constructor(opts = {}) {
    this.opts = {
      autoEntangle: opts.autoEntangle !== false,
      growSubstrate: opts.growSubstrate !== false,
      useVoidSubstrate: opts.useVoidSubstrate !== false,  // primary: Void's composed (116-D) library
      useCodingFilter: opts.useCodingFilter !== false,    // secondary: Oracle's coding subset
      agentSource: opts.agentSource || DEFAULT_SOURCE,
      language: opts.language || null,        // null = infer per-call
      topK: Number.isFinite(opts.topK) ? opts.topK : 5,
      substrateRoot: opts.substrateRoot || null, // null = oracle's own root
    };
    this._engaged = false;
    this._store = null;
  }

  /**
   * Read a single pattern through the protocol.
   *
   * @param {string|object} input
   *   string: treated as source code; language inferred from opts/default
   *   object: { content, name?, language?, id? }
   * @param {object} [opts]
   *   { source?, growSubstrate?, language?, topK?, name?, id? }
   * @returns {{
   *   waveform: number[],
   *   voidResonance: { meanTopK, bestMatch, topMatches } | null, // PATTERN RESONANCE: library-fit
   *   coherence: number,  // INTRINSIC structural coherence — a separate, distinct signal

   *   grew: { ok, reason, id, library_size_after } | { ok: false, reason },
   *   fieldStateAfter: object | null,
   *   layers: { entangled, scored, grew, contributed }
   * }}
   */
  read(input, opts = {}) {
    const merged = { ...this.opts, ...opts };
    const { content, name, language, id } = this._normalizeInput(input, merged);

    const layers = {
      entangled: false,
      voidScored: false,      // primary substrate: Void's composed (116-D) library
      codingFiltered: false,  // secondary: Oracle's coding-specific filter
      grew: false,            // input captured into Oracle's table
      contributed: false,     // field histogram updated
    };

    // 1. Engage entanglement
    if (merged.autoEntangle) {
      layers.entangled = this._ensureEngaged();
    }

    // 2. Encode at BOTH the L1 canonical fractal (29-D) AND the
    //    composed depth-4 layer (116-D = L1+L2+L3+L4). Reading the
    //    coherency flow across all four depths is the default; a
    //    single-depth verdict can mislead because each layer captures
    //    structure at a different scale and the shape of the flow IS
    //    the signal.
    const waveform = Array.from(toFractalWaveform(content));
    let composed = null;
    if (_encoderStack) {
      try {
        composed = Array.from(_encoderStack.composedAtDepth(content, 4));
      } catch (_) { /* fall back to L1-only resonance */ }
    }

    // 3. Primary substrate read: FLOW-AWARE score across all four
    //    depths. Returns per-match {d1, d2, d3, d4, shape} so the
    //    caller reads each cousinship as a depth-flow, not a verdict.
    //    Falls back to L1-only score when the encoder stack or
    //    composed substrate vectors are unavailable.
    let voidResonance = null;
    if (merged.useVoidSubstrate && _voidLib) {
      try {
        if (composed && _voidLib.scoreWithFlow) {
          const flowResult = _voidLib.scoreWithFlow(waveform, composed, { k: merged.topK });
          if (flowResult) {
            // Backward-compat fields populated alongside the flow data
            // so existing consumers (.score, .meanTopK, .bestMatch) work.
            voidResonance = {
              ...flowResult,
              score: flowResult.meanTopK,
              bestMatch: flowResult.bestMatch ? flowResult.bestMatch.d4 : 0,
              flowAware: true,
            };
            layers.voidScored = true;
          }
        }
        if (!voidResonance) {
          voidResonance = _voidLib.score(waveform, { k: merged.topK });
          if (voidResonance) voidResonance.flowAware = false;
          layers.voidScored = voidResonance != null;
        }
      } catch (_) { /* keep null */ }
    }

    // 4. Secondary filter: lexical TF-IDF resonance against Oracle's
    //    pattern library (oracle.db patterns table). Code-specific
    //    anti-hallucination signal — distinct from but complementary
    //    to the Void substrate read.
    let codeResonance = null;
    if (merged.useCodingFilter && _scoreResonance) {
      try {
        codeResonance = _scoreResonance(content, {
          k: merged.topK,
          language: language || undefined,
        });
        layers.codingFiltered = codeResonance != null;
      } catch (_) { /* keep null */ }
    }

    // 5. Grow the substrate (Oracle's coding-specific filter; Void's
    //    library grows via re-running the migration script after Void
    //    compresses new patterns)
    let grew = { ok: false, reason: 'disabled' };
    if (merged.growSubstrate) {
      grew = this._growSubstrate({ content, name, language, id });
      layers.grew = grew.ok === true;
    }

    // 5b. Residual meta-awareness: after every RESIDUAL_CHECK_EVERY
    // successful grows, measure the stack's false-equivalence residual
    // and feed the rate to the field. Growth invokes the check — the
    // entanglement the monitor was built for (its own docstring:
    // "every compression pass computes residual against the current
    // depth"). See the coupling note at _residualMonitor above for why
    // this measures but never auto-spawns a layer. Reading the rate:
    // without a sourceLookup the monitor compares L1 vectors only (the
    // substrate stores L1 for every pattern; composed depths need
    // source text), so on a host where most sources are unlocatable
    // the rate reads high — it is measuring how much L1 ALONE leaves
    // unresolved, the residual the composed layers exist to explain.
    if (grew.ok === true && _residualMonitor) {
      try {
        const st = fs.existsSync(RESIDUAL_COUNTER_PATH)
          ? JSON.parse(fs.readFileSync(RESIDUAL_COUNTER_PATH, 'utf8')) : { grows: 0 };
        st.grows = (st.grows | 0) + 1;
        if (st.grows >= RESIDUAL_CHECK_EVERY) {
          const m = _residualMonitor.measureResidual({ probeCount: 60 });
          st.grows = 0;
          st.lastMeasurement = {
            depth: m.depth, residualRate: +m.residualRate.toFixed(4),
            triggers: m.triggers, probes: m.probesExamined,
          };
          // A completed residual measurement is a COHERENT event (the
          // instrument worked); the RATE is the meta-signal and lives in
          // the source bucket, never in the coherence scalar (same rule
          // as the dimensional coupling in 7b below).
          const bucket = m.triggers ? 'triggered' : m.residualRate >= 0.02 ? 'elevated' : 'low';
          fc.contribute({ cost: 1.0, coherence: 0.9, source: 'oracle:encoder:residual:' + bucket });
          layers.residual = st.lastMeasurement;
        }
        fs.mkdirSync(path.dirname(RESIDUAL_COUNTER_PATH), { recursive: true });
        fs.writeFileSync(RESIDUAL_COUNTER_PATH, JSON.stringify(st));
      } catch (_) { /* residual coupling optional — never break a read */ }
    }

    // 6. Coherence = the INTRINSIC structural-coherence score: does this have
    //    coherent STRUCTURE (syntax validity + completeness + consistency +
    //    AST), measured directly from the content. This is the coherence the
    //    void compressor reads by its very nature. It is NOT pattern resonance:
    //    voidResonance.meanTopK (how much the content is shaped like the
    //    library's patterns) is a separate, distinct signal returned alongside.
    //    The two must never be conflated. Falls back to 0, honestly reported.
    //    measurableOnly: a field read has no test/history metadata, so score
    //    only the content-derivable dimensions and use the full 0..1 range.
    let coherence = 0;
    if (_coherency && typeof _coherency.computeCoherencyScore === 'function') {
      try {
        const c = _coherency.computeCoherencyScore(content, { language, measurableOnly: true });
        if (c && Number.isFinite(c.total)) coherence = c.total;
      } catch (_) { /* keep 0 */ }
    }

    // 7. Contribute the reading to the field
    try {
      fc.contribute({
        cost: 1.0,
        coherence,
        source: merged.source || merged.agentSource,
      });
      layers.contributed = true;
    } catch (_) { /* field unreachable */ }

    // 7b. Dimensional meta-awareness: feed the field the new layers'
    // reading so the LRE is always aware of the dimensional structure
    // flowing through it. L7's 2D-gain becomes its own field source, so
    // the histogram records how much of what the substrate sees is
    // autoregressive/2D — the meta-signal the new layers add.
    if (_dimensionalGain) {
      try {
        const gain = _dimensionalGain(content);
        if (gain > 0) {
          // Detecting 2D structure is a COHERENT event — the encoder
          // successfully characterized the pattern's dimensionality — so
          // it contributes at healthy coherence. The GAIN magnitude is the
          // meta-signal, recorded in the SOURCE bucket (strong/moderate/
          // weak), NOT in the coherence scalar: contributing gain-as-
          // coherence would drag the field's alignment down for merely
          // finding structure (it once cratered the field 0.96 → 0.22).
          const bucket = gain >= 0.3 ? 'strong' : gain >= 0.1 ? 'moderate' : 'weak';
          fc.contribute({ cost: 1.0, coherence: 0.9, source: 'oracle:encoder:dimensional-2d:' + bucket });
          layers.dimensionalGain = +gain.toFixed(4);
        }
      } catch (_) { /* dimensional coupling optional */ }
    }

    return {
      waveform,         // 29-D L1 fractal (back-compat; scoring runs the 116-D composed flow)
      composed,         // 116-D composed vector (null when the encoder stack is unreachable)
      voidResonance,    // Void's composed (116-D) flow-aware library read
      codeResonance,    // Oracle's coding-specific filter
      coherence,
      grew,
      fieldStateAfter: this._safePeek(),
      layers,
    };
  }

  /**
   * Apply `read()` to a directory, file list, or single file.
   * Between reads, peers are peeked so entangled agents see progress.
   */
  scan(target, opts = {}) {
    const files = this._resolveTargets(target, opts);
    const results = [];
    for (const filePath of files) {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (_) { continue; }
      const result = this.read(
        {
          content,
          name: filePath,
          language: this._inferLanguage(filePath),
        },
        opts,
      );
      results.push({ file: filePath, ...result });
    }
    return {
      results,
      summary: this._summarize(results),
      peers: this.peers(),
      fieldStateAfter: this._safePeek(),
    };
  }

  /**
   * Currently-entangled peer nodes via the real protocol.
   * Returns [] if the field is unreachable.
   */
  peers() {
    const state = this._safePeek();
    const sources = (state && state.sources) || {};
    return Object.keys(sources)
      .filter(s => s.startsWith('entangle:node:'))
      .map(s => ({
        nodeId: s.replace('entangle:node:', ''),
        count: sources[s].count,
        lastCoherence: sources[s].lastCoherence,
      }));
  }

  // ── internals ───────────────────────────────────────────────────

  _normalizeInput(input, merged) {
    if (typeof input === 'string') {
      return {
        content: input,
        name: merged.name || null,
        language: merged.language || 'unknown',
        id: merged.id || this._hashId(input),
      };
    }
    if (input && typeof input === 'object') {
      const content = input.content || input.code || '';
      return {
        content,
        name: input.name || merged.name || null,
        language: input.language || merged.language || 'unknown',
        id: input.id || merged.id || this._hashId(content),
      };
    }
    return { content: '', name: null, language: 'unknown', id: this._hashId('') };
  }

  _hashId(content) {
    return crypto.createHash('sha256').update(String(content || '')).digest('hex').slice(0, 16);
  }

  _ensureEngaged() {
    if (this._engaged) return true;
    if (!entangle || typeof entangle.engage !== 'function') return false;
    try {
      entangle.engage();
      this._engaged = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  _safePeek() {
    try { return fc.peekField(); } catch (_) { return null; }
  }

  _resolveTargets(target, opts) {
    if (Array.isArray(target)) return target;
    if (typeof target === 'string') {
      let stat;
      try { stat = fs.statSync(target); } catch (_) { return []; }
      if (stat.isDirectory()) return this._walk(target, opts);
      return [target];
    }
    return [];
  }

  _walk(dir, opts = {}) {
    const skipDirs = new Set(opts.skipDirs || ['node_modules', '.git', '.next', 'target', 'dist', 'build']);
    const exts = opts.extensions || Object.keys(LANGUAGE_BY_EXT);
    const out = [];
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of entries) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          if (skipDirs.has(e.name)) continue;
          stack.push(full);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (exts.includes(ext)) out.push(full);
        }
      }
    }
    return out;
  }

  _inferLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return LANGUAGE_BY_EXT[ext] || 'unknown';
  }

  _growSubstrate({ content, name, language, id }) {
    if (!_SQLiteStore) return { ok: false, reason: 'sqlite-store-unreachable' };
    if (!content || content.length < 24) return { ok: false, reason: 'content-too-small' };
    try {
      const root = this.opts.substrateRoot || path.resolve(__dirname, '..', '..');
      const store = this._store || (this._store = new _SQLiteStore(root));
      const now = new Date().toISOString();
      // The patterns table has a UNIQUE(name, language) constraint, so
      // the supplied name alone isn't safe to use directly — distinct
      // patterns may share a filename. Suffix the content id so the
      // (name, language) pair is unique-by-construction, while the
      // human-readable name is preserved at the front for browsing.
      const patternName = name ? `${name}#${id.slice(0, 8)}` : id;
      // Idempotent INSERT OR IGNORE so duplicate ids are no-ops
      const stmt = store.db.prepare(`
        INSERT OR IGNORE INTO patterns (
          id, name, code, language, pattern_type, complexity,
          description, tags, coherency_total, coherency_json,
          variants, usage_count, success_count, evolution_history,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        id, patternName, content, language || 'unknown',
        'field-tool-captured', 'composite',
        'Captured via field-tool.read', JSON.stringify(['field-tool', 'auto-captured']),
        0, '{}', '[]', 0, 0, '[]', 1, now, now,
      );
      const inserted = result.changes > 0;
      // Library size after this op (cheap count — bounded by index)
      const sizeRow = store.db.prepare('SELECT COUNT(*) AS n FROM patterns').get();
      return {
        ok: true,
        reason: inserted ? 'inserted' : 'duplicate',
        id,
        library_size_after: sizeRow ? sizeRow.n : null,
      };
    } catch (err) {
      return { ok: false, reason: `error:${err.message || 'unknown'}` };
    }
  }

  _summarize(results) {
    if (!results.length) {
      return { n: 0, meanCoherence: 0, grewCount: 0, scoredCount: 0 };
    }
    const n = results.length;
    const meanCoherence = results.reduce((s, r) => s + (r.coherence || 0), 0) / n;
    const grewCount = results.filter(r => r.layers && r.layers.grew).length;
    const scoredCount = results.filter(r => r.layers && r.layers.scored).length;
    return { n, meanCoherence, grewCount, scoredCount };
  }
}

const _defaultTool = new FieldTool();

module.exports = {
  FieldTool,
  /** Read a single pattern through the canonical protocol. */
  read: (input, opts) => _defaultTool.read(input, opts),
  /** Scan a directory or file list through the canonical protocol. */
  scan: (target, opts) => _defaultTool.scan(target, opts),
  /** Currently-entangled peers in the live field. */
  peers: () => _defaultTool.peers(),
};
