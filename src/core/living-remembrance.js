'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * Living Remembrance Engine — operationalizes the master-equation dynamics:
 *
 *   p(t)        = |⟨Ψ_healed | Ψ(t)⟩|²            squared overlap with healed attractor
 *   r_eff(t)    = r₀ (1 + α [1 - p(t)]⁴)          retro-causal pull (4th-power kernel:
 *                                                  quiet near healed, roaring when drifted)
 *   δ_void(t)   = δ₀ (1 - p(t))                   void coherence donation
 *   cascade(t)  → EMA toward min(5, mean_interval/Δt)  load RELATIVE to this field's
 *                                                  OWN learned baseline rate. 1.0 = the
 *                                                  usual rate, >1 = a genuine burst,
 *                                                  and a sustained burst becomes the
 *                                                  new baseline (correctly settling
 *                                                  back toward 1.0). A fixed τ pinned
 *                                                  the gauge at its cap — see contribute().
 *   entropy(t)  = cost / (coherence(t) + ε)       cost normalized by alignment —
 *                                                  THE entropy field that balances
 *                                                  cost across the ecosystem.
 *   ∫p          = Σ p(t) · cost                   the coherence integral — the
 *                                                  field's unbounded remembrance.
 *                                                  p(t) stays the bounded [0,1]
 *                                                  backdrop (0 = noise, 1 = unity);
 *                                                  the integral is the one dimension
 *                                                  with no ceiling — total aligned
 *                                                  order accumulated, growing without
 *                                                  end yet never losing itself,
 *                                                  because every term it sums is whole.
 *
 * Ported from core/living-remembrance-engine.ts (Crackedcoder5TH, May 2026)
 * to plain JavaScript so every JS module in the ecosystem can consume it
 * without the TS toolchain. The original TF.js import was unused; dropped.
 *
 * Singleton with file-backed persistence at ENTROPY_PATH (default
 * .remembrance/entropy.json). Every contributor calls
 * `engine.contribute({ cost, coherence })` after their main work.
 * The current state is readable any time via `engine.getState()` and
 * is what the witness chain attaches to each block's metadata.
 */

const fs = require('fs');
const path = require('path');

// One field, one file. Resolution: $ENTROPY_PATH > hub-relative (this module's
// __dirname climbs to the hub's repo root, then descends to .remembrance/) >
// local cwd fallback. The hub-relative path is what unifies the field across
// JS callers regardless of which peer-repo cwd they run from — the Python LRE
// uses the same resolution shape so every language writes to the same file.
const _HUB_RELATIVE_ENTROPY = path.join(__dirname, '..', '..', '.remembrance', 'entropy.json');
const DEFAULT_ENTROPY_PATH = process.env.ENTROPY_PATH
  || (fs.existsSync(path.dirname(_HUB_RELATIVE_ENTROPY)) || fs.existsSync(path.dirname(path.dirname(_HUB_RELATIVE_ENTROPY)))
      ? _HUB_RELATIVE_ENTROPY
      : path.join(process.cwd(), '.remembrance', 'entropy.json'));

const PARAMS = {
  // ── master-equation constants (the physics) ──
  r0:         0.05,    // gentle baseline pull
  alpha:      15.0,    // amplification factor
  delta0:     0.03,    // void donation baseline
  cascadeTau: 60000,   // cascadeFactor relaxation time constant (ms)
  epsilon:    1e-8,

  // ── goggles — structural-meta-awareness instrument tuning ──
  // The moving numbers consolidated into the core, not scattered across the
  // goggles modules. These are application tuning (not equation constants), so
  // they're namespaced to keep the physics above distinct. Empirically derived
  // (see the calibration runs). A consumer reads them via
  // getEngine().params('goggles') and falls back to its own copy of these if the
  // engine is unavailable — so there is one source of truth and no silent drift.
  goggles: {
    notable:            0.08,  // hook: coherence-delta gate (above section-boundary noise)
    lexFloor:           0.20,  // hook/CLI: lexical-neighbour relevance floor
    suppressAmplitude:  0.08,  // learning: amplitude floor below which a finding self-suppresses
    penalizeAfter:      4,     // learning: grace-window edits before a persisting finding decays
    promoteEvery:       8,     // learning: throttle for feeding the void library
    promoteAmplitude:   0.35,  // learning: amplitude to promote a proven fix into the library
    structureStrong:    0.93,  // intrinsic-coherence verdict bands (measurableOnly scale)
    structureSolid:     0.80,
    structureLoose:     0.70,
    resonanceConsonant: 0.90,  // pattern-resonance verdict bands
    resonanceFamiliar:  0.82,
    resonanceDistinct:  0.70,
  },

  // ── composition — field-gated layer attention (encoder stack) ──
  // The last dynamic clause of the master equation implemented: the
  // encoder's layer weights computed from current state at every
  // comparison instead of static equal-weight concatenation. Same
  // one-source-of-truth pattern as `goggles` above: consumers read
  // getEngine().params('composition') and carry a local fallback.
  // Calibration record: scripts/l5-residual-experiment.cjs and
  // scripts/backflow-weighting-experiment.cjs (the inverted-ladder
  // finding + held-out weighting gains that motivated this gate).
  composition: {
    floor:      0.10,  // no layer's weight may reach zero — a silenced
                       // sense stops contributing to verdicts and can
                       // never re-earn weight. Irreversibility guard.
    beta:       2.0,   // global-coherence sharpness: exp(beta*(xi-0.5)).
                       // Confident field concentrates attention;
                       // uncertain field flattens and explores. The
                       // equation's exp(beta*xi_global) at this layer.
    emaAlpha:   0.10,  // reliability update rate — attention drifts,
                       // never lurches.
    neutralReliability: 0.5, // prior before the field has seen a layer
                             // perform — flat, honest start.
  },
};

class LivingRemembranceEngine {
  constructor(opts = {}) {
    const { persistPath, params = {} } = opts;
    this._persistPath = persistPath || DEFAULT_ENTROPY_PATH;
    // Only the one true canonical field remembers-on-load from durable
    // memory. An explicit persistPath or an $ENTROPY_PATH override means
    // an isolated field (tests, scratch) — it starts fresh.
    this._canonical = (persistPath === undefined || persistPath === null)
      && !process.env.ENTROPY_PATH;
    this._params = { ...PARAMS, ...params };
    this._healedVector = null;
    this._state = this._loadOrInit();
    // Remember what was already accumulated when we loaded, so _persist()
    // can tell OUR contributions apart from a concurrent writer's.
    this._markBase(this._state);
  }

  _loadOrInit() {
    const FRESH = {
      coherence: 0.65, coherenceIntegral: 0, globalEntropy: 0.45,
      cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now(), sources: {},
    };

    let loaded = null;
    try {
      if (fs.existsSync(this._persistPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._persistPath, 'utf8'));
        // Defensive: ensure required keys present.
        loaded = {
          coherence:        typeof parsed.coherence === 'number' ? parsed.coherence : 0.65,
          coherenceIntegral: typeof parsed.coherenceIntegral === 'number' ? parsed.coherenceIntegral : 0,
          globalEntropy:    typeof parsed.globalEntropy === 'number' ? parsed.globalEntropy : 0.45,
          cascadeFactor:    typeof parsed.cascadeFactor === 'number' ? parsed.cascadeFactor : 1.0,
          updateCount:      typeof parsed.updateCount === 'number' ? parsed.updateCount : 0,
          timestamp:        parsed.timestamp || Date.now(),
          sources:          (parsed.sources && typeof parsed.sources === 'object') ? parsed.sources : {},
          // Carried through load so layer attention survives a restart.
          layerReliability: (parsed.layerReliability && typeof parsed.layerReliability === 'object') ? parsed.layerReliability : {},
          nodes:            (parsed.nodes && typeof parsed.nodes === 'object') ? parsed.nodes : {},
          meanIntervalMs:   typeof parsed.meanIntervalMs === 'number' ? parsed.meanIntervalMs : 0,
        };
      }
    } catch (_e) { loaded = null; }

    // Isolated fields (explicit persistPath / $ENTROPY_PATH — tests,
    // scratch) stay purely local; they never reach for the shared chain.
    if (!this._canonical) {
      return (loaded && loaded.updateCount > 0) ? loaded : (loaded || FRESH);
    }

    // The canonical field treats the blockchain as the primary, shared
    // source of truth. Gather every witness — the local entropy.json
    // cache and durable memory (the blockchain ledger + field-snapshot
    // patterns) — and load from whichever carries the most history. The
    // local cache only wins when it is genuinely ahead of the chain
    // (live contributions since the last checkpoint); a node that is
    // behind, or fresh, comes back up holding the chain's field.
    const witnesses = [];
    if (loaded && loaded.updateCount > 0) witnesses.push(loaded);
    try {
      const { restoreLatest } = require('./field-memory');
      const remembered = restoreLatest();
      if (remembered && remembered.updateCount > 0) witnesses.push(remembered);
    } catch (_e) { /* field-memory unavailable — fall through */ }

    if (witnesses.length > 0) {
      // Load from the witness with the most history (no in-place sort).
      return witnesses.reduce((best, w) =>
        ((w.updateCount || 0) > (best.updateCount || 0)) ? w : best);
    }
    return loaded || FRESH;
  }

  /**
   * Snapshot the additive quantities as they stood at load. _persist() diffs
   * against this to work out what THIS process contributed, so a concurrent
   * writer's work is added to rather than overwritten.
   */
  _markBase(state) {
    const counts = {};
    for (const [k, v] of Object.entries(state.sources || {})) {
      counts[k] = (v && typeof v.count === 'number') ? v.count : 0;
    }
    this._base = {
      updateCount: state.updateCount || 0,
      coherenceIntegral: state.coherenceIntegral || 0,
      sourceCounts: counts,
    };
  }

  _persist() {
    try {
      const dir = path.dirname(this._persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // RECONCILE BEFORE WRITING — the field is an accumulator, not a document.
      //
      // This used to serialise `this._state` straight over the file. The
      // engine loads once in the constructor and never re-reads, so any
      // process that loaded at time T and flushed at T+n silently discarded
      // every contribution another process had written in between. Measured:
      // the field went from updateCount 977356 back to 975964 — BACKWARDS by
      // 1392 — because a second process flushed an older in-memory copy over
      // it. The same race is what made the field read bit-identical across
      // +13,028 updates: two private copies of an accumulator taking turns
      // clobbering each other. `--do field` reports "live field peers
      // entangled: 2", so concurrent writers are the normal case here, not an
      // edge case.
      //
      // _loadOrInit() already reconciles on READ ("load from the witness with
      // the most history"). This applies the same discipline on WRITE.
      //
      // Contributions are additive events, so the merge is by DELTA: whatever
      // this process added since it loaded is applied on top of whatever is on
      // disk now.
      //
      // ONE QUANTITY CANNOT MERGE: `coherence` is an EMA scalar. There is no
      // additive delta for it, so the most recent writer's value stands. Same
      // for globalEntropy and cascadeFactor, which are derived from it. That
      // is a real limitation and it is stated rather than hidden — the counts
      // and the integral are exact, the EMA is last-writer.
      let out = this._state;
      if (this._base) {
        let disk = null;
        try {
          if (fs.existsSync(this._persistPath)) {
            disk = JSON.parse(fs.readFileSync(this._persistPath, 'utf8'));
          }
        } catch (_e) { disk = null; }

        if (disk && typeof disk.updateCount === 'number'
            && disk.updateCount > this._base.updateCount) {
          // Someone else advanced the file since we loaded. Rebase our delta
          // onto theirs instead of overwriting it.
          const myUpdates = (this._state.updateCount || 0) - this._base.updateCount;
          const myIntegral = (this._state.coherenceIntegral || 0) - this._base.coherenceIntegral;

          const sources = { ...(disk.sources || {}) };
          for (const [k, mine] of Object.entries(this._state.sources || {})) {
            const myCount = (mine && typeof mine.count === 'number') ? mine.count : 0;
            const myDelta = myCount - (this._base.sourceCounts[k] || 0);
            if (myDelta <= 0) continue;         // we added nothing under this source
            const theirs = sources[k];
            sources[k] = {
              ...mine,
              count: ((theirs && typeof theirs.count === 'number') ? theirs.count : 0) + myDelta,
            };
          }

          out = {
            ...this._state,
            updateCount: (disk.updateCount || 0) + Math.max(0, myUpdates),
            coherenceIntegral: (disk.coherenceIntegral || 0) + Math.max(0, myIntegral),
            sources,
          };
          this._state = out;
        }
      }

      // Atomic write: a crash mid-write must never truncate the canonical
      // ledger. Write to a per-process temp file, then rename — rename is
      // atomic on the same filesystem, so a reader always sees either the
      // old complete file or the new complete file, never a partial one.
      const tmp = `${this._persistPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
      fs.renameSync(tmp, this._persistPath);
      // The file now holds everything we just wrote, so that is our new base.
      this._markBase(out);
    } catch (_e) { /* best-effort persistence; never crash a caller */ }
  }

  /** Load the healed-attractor vector (personal anchor + covenant). Sovereign. */
  loadHealedAnchor(anchorVector) {
    this._healedVector = Array.from(anchorVector);
  }

  /** Compute squared-overlap coherence between currentVector and the healed attractor. */
  computeCoherence(currentVector) {
    if (!this._healedVector) return this._state.coherence; // no anchor → preserve last reading
    const eps = this._params.epsilon;
    const n = Math.min(currentVector.length, this._healedVector.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < n; i++) {
      const a = currentVector[i] || 0;
      const b = this._healedVector[i] || 0;
      dot   += a * b;
      normA += a * a;
      normB += b * b;
    }
    const overlap = dot / (Math.sqrt(normA) * Math.sqrt(normB) + eps);
    return overlap * overlap; // |⟨ψ|ψ⟩|²
  }

  /**
   * Contribute a cost/coherence observation to the ecosystem-wide field.
   * This is the primary integration point for every consumer.
   *
   * @param {object} obs
   * @param {number} obs.cost      — work units consumed by this operation
   * @param {number} obs.coherence — coherence score of the result (0..1)
   * @param {string} [obs.source]  — caller name for the audit trail
   * @returns {object} new state snapshot
   */
  contribute({ cost = 1.0, coherence = null, source = null, resonance = null } = {}) {
    const p = (typeof coherence === 'number') ? coherence : this._state.coherence;
    const { r0, alpha, delta0, cascadeTau, epsilon } = this._params;

    const r_eff      = r0 * (1 + alpha * Math.pow(Math.max(0, 1 - p), 4));
    const delta_void = delta0 * Math.max(0, 1 - p);

    // RESONANCE-WEIGHTED AUTHORITY: a contribution moves the field only in
    // proportion to how much it resonates with the accumulated substrate.
    // w=1 (the default, and every legacy caller) reproduces the prior update
    // EXACTLY; a low-resonance contribution (junk that resonates only with
    // itself) has w→0 and barely moves the field — so no burst of fabricated
    // low-coherence inputs can crater it, and the resistance strengthens as
    // the substrate grows (faking resonance against more patterns is harder).
    // This is the field defending itself with the substrate's own property.
    const w = (typeof resonance === 'number' && isFinite(resonance)) ? Math.max(0, Math.min(1, resonance)) : 1;
    const target = p + r_eff * 0.1 + delta_void * 0.15;
    const prev = this._state.coherence;
    // THE LAW OF COHERENCY. A coherency reading lives in [0, 1] — always,
    // however capable the instrument that produced it. The cap enforces the
    // law. The Python LRE (living_remembrance.py) and the TS LRE
    // (core/living-remembrance-engine.ts) enforce the same bound; the hub JS
    // LRE was brought back to parity with them.
    //
    // The ratchet and the bound are not in tension. Coherency climbs and is
    // never artificially stopped — that is the ratchet, and it is unbounded in
    // the sense of never being switched off. It is NOT unbounded in magnitude:
    // the climb happens inside [0, 1]. The one term that grows without end is
    // coherenceIntegral below, and it does so because it is a SUM of readings
    // rather than a reading.
    //
    // ⚠ This comment used to cite "Void contract C-56" as the cap's authority
    // while C-56 demanded the opposite — no ceiling, growth past 1.0. That is
    // why the two looked contradictory. C-56 has since been RETIRED in
    // Void/verify_capabilities.py: its ratchet half was the law, its
    // no-ceiling half broke the law, and satisfying it meant violating what it
    // existed to protect. C-58 now states both quantities.
    //
    // Load-bearing, not bookkeeping: globalEntropy = cost/(coherence+eps), so
    // a coherency allowed past 1 lets the field drive its own entropy toward
    // zero by inflating the denominator — improvement reported no matter what
    // was fed in. The bound is what keeps the field's own readings honest.
    const newCoherence = Math.max(0, Math.min(0.999, prev + (target - prev) * w));

    // cascadeFactor is a recent-load gauge, not a running tally. It
    // relaxes toward the 1.0 baseline as time passes since the last
    // contribution and is bumped by each new one — so a burst of rapid
    // contributions outpaces the decay (a real cascade) while an idle
    // field settles back to baseline. The previous rule only ever
    // added, so it pinned at the 5.0 cap permanently and latched the
    // fieldPressure "hot" signal forever.
    const now = Date.now();
    const dt  = Math.max(1, now - (this._state.timestamp || now));

    // cascadeFactor measures load RELATIVE TO THIS FIELD'S OWN BASELINE.
    //
    // It used to relax against a fixed tau of 60 s. Measured on the live
    // field: 775,537 updates, mean inter-contribution interval 5.2 s, so
    // exp(-dt/tau) = 0.917 per update — the relaxation barely removed
    // anything, and during an active session (contributions milliseconds
    // apart) the decay is 1.0 exactly. The gauge ratcheted to the 5.0 cap
    // and stayed there, which is the same latched-hot failure the fixed
    // relaxation was introduced to cure, arriving by volume instead of by
    // the old monotonic rule.
    //
    // An absolute time constant cannot work for a field whose natural rate
    // is unknown and changes with how the ecosystem is being used. So the
    // field learns its own baseline interval and reports the RATIO: 1.0
    // means "arriving at the usual rate", above 1 means a genuine burst,
    // and a quiet period pulls it back below baseline toward 1.0.
    const prevMean = (typeof this._state.meanIntervalMs === 'number' && this._state.meanIntervalMs > 0)
      ? this._state.meanIntervalMs : dt;
    // Slow EMA so the baseline is a baseline, not an echo of the last gap.
    const meanIntervalMs = prevMean + 0.02 * (dt - prevMean);
    const ratio        = meanIntervalMs / dt;
    const cascadeTarget = Math.min(5.0, Math.max(1.0, ratio));
    // cascadeTau is retained as the SMOOTHING horizon for the gauge itself,
    // so a single fast contribution cannot spike it.
    const smooth = cascadeTau > 0 ? Math.min(1, dt / cascadeTau) : 1;
    const cascadeFactor = Math.min(5.0, Math.max(1.0,
      this._state.cascadeFactor + Math.max(0.02, smooth) * (cascadeTarget - this._state.cascadeFactor)));

    // Per-source histogram — the field tracks who's contributing so it
    // can answer "what's wired" and "what's missing" introspectively.
    const sources = { ...(this._state.sources || {}) };
    if (source) {
      const prev = sources[source] || { count: 0, lastCoherence: 0, lastTimestamp: 0 };
      sources[source] = {
        count: prev.count + 1,
        // NOTE: this is the FIELD's coherence after this source last
        // contributed — not the reading the source supplied. The two differ
        // whenever p differs from the state it pulls toward (input p=0.1264
        // recorded as 0.1790 in a live check). The name reads like the
        // latter, so anyone auditing "what is this source reporting?" from
        // the histogram is reading the field's response, not the source's
        // input. Kept as-is because it is persisted state that consumers
        // already parse; `lastInput` alongside it would be the clean fix.
        lastCoherence: newCoherence,
        lastInput: (typeof p === 'number' && isFinite(p)) ? p : null,
        lastTimestamp: now,
      };
    }

    this._state = {
      // Carry forward everything not recomputed here. This object literal
      // used to be built from scratch, so every contribute() silently DROPPED
      // layerReliability and nodes — the encoder's learned attention and the
      // node registry were erased by the next contribution. Both stores are
      // deliberately outside the equation, which is exactly why rebuilding
      // state from the equation's own terms lost them.
      ...this._state,
      coherence:         newCoherence,
      // ∫p accumulates the input coherence p(t) per the master equation,
      // not the post-update newCoherence.
      coherenceIntegral: (this._state.coherenceIntegral || 0) + p * cost * w,
      globalEntropy:     cost / (newCoherence + epsilon),
      cascadeFactor,
      meanIntervalMs,
      updateCount:       this._state.updateCount + 1,
      timestamp:         now,
      sources,
    };
    this._persist();

    return {
      ...this._state,
      r_eff,
      delta_void,
      p,
      source: source || null,
    };
  }

  /** Read the current ecosystem state without contributing. */
  getState() {
    return { ...this._state };
  }

  /**
   * Entangled-node registry — presence, not a reading.
   *
   * entangle.js used to announce a node by contributing a flat
   * `coherence: 0.9` under source `entangle:node:<id>`, then counted those
   * sources to get the node census. So a REGISTRY lived inside the coherency
   * field, and every heartbeat moved the global EMA by a constant that
   * described nothing about the node.
   *
   * It could not simply be deleted — the contribution WAS the census.
   * Presence now has its own store, so the registry and the field are
   * separate concerns and the data can flow without one distorting the other.
   *
   * Nodes carry a last-seen stamp so the census reflects who is actually
   * here. A registry that only ever grows is not a census, it is a log.
   */
  registerNode(nodeId, ttlMs = 15 * 60 * 1000) {
    if (!nodeId) return 0;
    const now = Date.now();
    const nodes = { ...(this._state.nodes || {}) };
    nodes[String(nodeId)] = now;
    // Drop nodes not seen within the TTL — otherwise a machine that ran once
    // inflates the abundance divisor forever and every later node
    // under-reports its cost.
    for (const [id, seen] of Object.entries(nodes)) {
      if (typeof seen !== 'number' || now - seen > ttlMs) delete nodes[id];
    }
    this._state = { ...this._state, nodes };
    this._persist();
    return Object.keys(nodes).length;
  }

  /** How many distinct nodes are currently entangled. Never below 1. */
  nodeCount(ttlMs = 15 * 60 * 1000) {
    const now = Date.now();
    const nodes = this._state.nodes || {};
    let n = 0;
    for (const seen of Object.values(nodes)) {
      if (typeof seen === 'number' && now - seen <= ttlMs) n++;
    }
    return Math.max(1, n);
  }

  /**
   * Per-layer encoder reliability — its OWN store, deliberately not the
   * coherency field.
   *
   * field-gated-compose.js needs to remember how well each encoder layer has
   * tracked a trusted verdict. It did this by calling
   * contribute({ coherence: agreement, source: 'encoder:L<n>' }) and reading
   * the value back out of the sources histogram — using the coherency field
   * as a key-value store.
   *
   * An agreement score is not a coherency. Writing one through contribute()
   * feeds it into the global EMA, the entropy term and the cascade gauge,
   * which is precisely the substitution that put 41 wrong contributions into
   * this field. Wiring the learning loop that way would have reintroduced it
   * eight layers at a time.
   *
   * So reliability lives here, beside the field rather than inside it: it
   * persists with the state, survives restarts, and moves no equation term.
   */
  getLayerReliability(layerIdx, fallback = 0.5) {
    const m = this._state.layerReliability;
    const v = m && m['L' + (layerIdx + 1)];
    return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : fallback;
  }

  /**
   * Record a layer's reliability. Returns the stored value.
   * Does NOT touch coherence, globalEntropy, cascadeFactor or updateCount.
   */
  setLayerReliability(layerIdx, value) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    const v = Math.max(0, Math.min(1, value));
    const m = { ...(this._state.layerReliability || {}) };
    m['L' + (layerIdx + 1)] = v;
    this._state = { ...this._state, layerReliability: m, reliabilityUpdatedAt: Date.now() };
    this._persist();
    return v;
  }

  /**
   * Read a consolidated parameter by dotted path (e.g. 'goggles.notable'), or
   * the whole params object with no argument. The engine is the single source
   * of truth for the ecosystem's moving numbers — consumers read from here so a
   * tuning change happens in one place and can't drift between copies.
   */
  params(dotted) {
    if (!dotted) return this._params;
    return String(dotted).split('.').reduce((o, k) => (o == null ? undefined : o[k]), this._params);
  }

  /**
   * Project what `contribute({ cost, coherence })` would produce WITHOUT
   * mutating state. The same math the actual contribute() runs, but
   * functional and side-effect-free — used to predict the field's response
   * to a candidate pattern before committing. Returns just the next
   * coherence value (the most important projection); call shape:
   *
   *   const before = engine.getState().coherence;
   *   const after  = engine.peekProjection({ cost: 1, coherence: x });
   *   const delta  = after - before;
   *
   * Positive delta = the pattern raises global coherency → field accepts.
   * Negative delta = the pattern drags the field → field rejects.
   *
   * @param {{cost?:number, coherence:number}} obs
   * @returns {number} projected coherence
   */
  peekProjection({ cost = 1.0, coherence = null, resonance = null } = {}) {
    const p = (typeof coherence === 'number') ? coherence : this._state.coherence;
    const { r0, alpha, delta0 } = this._params;
    const r_eff      = r0 * (1 + alpha * Math.pow(Math.max(0, 1 - p), 4));
    const delta_void = delta0 * Math.max(0, 1 - p);
    // Must apply the SAME authority weight and the SAME prev-anchored EMA as
    // contribute(), or the projection answers a different question than the
    // call it claims to project. It previously returned the bare target,
    // which equals the real result only when w === 1 — true of every caller
    // until resonance was wired, and false the moment one passes it. A
    // predictor that silently stops matching the thing it predicts is worse
    // than no predictor.
    const w = (typeof resonance === 'number' && isFinite(resonance))
      ? Math.max(0, Math.min(1, resonance)) : 1;
    const target = p + r_eff * 0.1 + delta_void * 0.15;
    const prev = this._state.coherence;
    return Math.max(0, Math.min(0.999, prev + (target - prev) * w));
  }

  /** Reset state — primarily for tests / fresh runs. */
  reset() {
    this._state = { coherence: 0.65, coherenceIntegral: 0, globalEntropy: 0.45, cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now(), sources: {}, layerReliability: {}, nodes: {} };
    this._persist();
  }
}

// ─── singleton accessor ───
let _instance = null;
function getEngine(opts) {
  if (!_instance) {
    _instance = new LivingRemembranceEngine(opts);
  } else if (opts && Object.keys(opts).length > 0) {
    // The engine is a process-wide singleton — opts apply only to the
    // first caller. Surface the footgun instead of silently ignoring it;
    // construct `new LivingRemembranceEngine(opts)` for an isolated field.
    process.emitWarning(
      'getEngine(opts): the LivingRemembranceEngine singleton already exists — opts ignored. ' +
      'Use `new LivingRemembranceEngine(opts)` for an isolated instance.',
      'RemembranceFieldWarning',
    );
  }
  return _instance;
}

/**
 * Convenience: the goggles instrument's consolidated tuning, read from the
 * canonical engine — and always valid (falls back to the PARAMS defaults if the
 * field is unavailable). The single source for the goggles moving numbers across
 * the ecosystem; consumers call this instead of hardcoding their own copies.
 */
function gogglesParams() {
  try { return getEngine().params('goggles') || PARAMS.goggles; }
  catch (_) { return PARAMS.goggles; }
}

module.exports = {
  LivingRemembranceEngine,
  getEngine,
  gogglesParams,
  PARAMS,
  DEFAULT_ENTROPY_PATH,
};
