/**
 * The Oracle API — the main interface for AIs and humans.
 *
 * This is how any AI (or developer) interacts with the remembrance system:
 *
 * 1. oracle.submit(code, metadata)  — Submit code for validation & storage
 * 2. oracle.query(query)            — Pull the most relevant, highest-coherency code
 * 3. oracle.feedback(id, succeeded) — Report whether pulled code worked
 * 4. oracle.inspect(id)             — View full details of a stored entry
 * 5. oracle.stats()                 — Get store summary
 *
 * Implementation is split across focused mixin modules:
 *   oracle-core.js       — submit, query, feedback, resolve, register, search
 *   oracle-patterns.js   — candidates, versioning, security, voting, import/export
 *   oracle-federation.js — sync, share, remotes, repos, debug oracle
 *   oracle-llm.js        — Claude bridge, context, self-management, lifecycle
 */

const { VerifiedHistoryStore } = require('../store/history');
const { PatternLibrary } = require('../patterns/library');
const { PatternRecycler } = require('../evolution/recycler');
const { initAuditLog } = require('../core/audit-logger');

// Quantum field — unifies all pattern types under quantum mechanics
let QuantumField;
try {
  ({ QuantumField } = require('../quantum/quantum-field'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[oracle] QuantumField not available:', e?.message || e);
  QuantumField = null;
}

// Mixin modules — each exports an object of methods for the prototype
const coreMethods = require('./oracle-core');
const patternMethods = require('./oracle-patterns');
const federationMethods = require('./oracle-federation');
const llmMethods = require('./oracle-llm');
const eternalMethods = require('./oracle-eternal');

class RemembranceOracle {
  constructor(options = {}) {
    this.store = options.store || new VerifiedHistoryStore(options.baseDir);
    const storeDir = this.store.storeDir || require('path').join(options.baseDir || process.cwd(), '.remembrance');
    this.patterns = options.patterns || new PatternLibrary(storeDir);
    this.threshold = options.threshold ?? 0.6;
    this._listeners = [];
    this.autoGrow = options.autoGrow !== false;  // Auto-generate candidates on proven code
    this.autoSync = options.autoSync || false;    // Auto-sync to personal store on proven code
    this.recycler = new PatternRecycler(this, {
      maxHealAttempts: options.maxHealAttempts ?? 3,
      maxRefineLoops: options.maxRefineLoops ?? 5,
      generateVariants: options.generateVariants !== false,
      variantLanguages: options.variantLanguages || ['python', 'typescript'],
      verbose: options.verbose || false,
    });

    // Wire healing success rate into pattern library's reliability scoring
    this._healingStats = new Map();
    this.patterns.setHealingRateProvider((id) => this.getHealingSuccessRate(id));

    // Maintenance coordination lock — prevents daemon and lifecycle from overlapping
    this._maintenanceInProgress = false;
    this._maintenanceSource = null;

    // Debug Oracle — exponential debugging intelligence
    this._debugOracle = null; // Lazy-initialized on first debug call

    // ─── Quantum Field ───
    // Unifies all pattern types (patterns, entries, candidates, debug_patterns)
    // under a single quantum mechanical model with amplitude, decoherence,
    // entanglement, tunneling, and interference.
    this._quantumField = null;
    if (QuantumField && options.quantum !== false) {
      try {
        const sqliteStore = this.store.getSQLiteStore ? this.store.getSQLiteStore() : null;
        if (sqliteStore) {
          this._quantumField = new QuantumField(sqliteStore, {
            verbose: options.verbose || false,
            onCascade: (event) => this._handleCascadeSpawn(event),
          });
          if (process.env.ORACLE_DEBUG) console.log('[oracle] Quantum field initialized');
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] Quantum field init failed:', e?.message || e);
      }
    }

    // Claude Bridge — native LLM engine (lazy-initialized)
    this._claude = options.claude || null;
    this._claudeOptions = {
      timeout: options.claudeTimeout ?? 60000,
      model: options.claudeModel || null,
      verbose: options.verbose || false,
    };

    // Initialise audit logging
    try {
      initAuditLog(require('path').dirname(storeDir));
    } catch (_) {
      // Audit init failures are non-fatal
    }

    // Wire the cross-subsystem event reactions so every emit flows to
    // the right stores (audit calibration, pattern reliability, debug
    // amplitude, unified history). Idempotent — the reactions module
    // guards against double-wiring.
    if (options.reactions !== false) {
      try {
        const { wireReactions } = require('../core/reactions');
        const { wireHistory } = require('../core/history');
        wireReactions(this, { storageRoot: require('path').dirname(storeDir) });
        wireHistory(require('path').dirname(storeDir));
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] reactions init failed:', e.message);
      }
    }

    // Wire every emitted event into the LRE field. The bridge is the
    // compass: each event type lands as `event:<type>` in the source
    // histogram, so non-coders can see what's firing in real time.
    // Best-effort — bridge failures never block the emit path.
    if (options.fieldBridge !== false) {
      try {
        const { wireEventFieldBridge } = require('../core/event-field-bridge');
        wireEventFieldBridge(this);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] field bridge init failed:', e.message);
      }
    }

    // Auto-seed on first run if library is empty
    const wasEmpty = this.patterns.getAll().length === 0;
    if (options.autoSeed !== false && wasEmpty) {
      // First try to import from patterns.json (accumulated proven patterns from git)
      try {
        const patternsJsonPath = require('path').join(require('path').dirname(storeDir), 'patterns.json');
        if (require('fs').existsSync(patternsJsonPath)) {
          const data = require('fs').readFileSync(patternsJsonPath, 'utf-8');
          const result = this.import(data, { author: 'auto-import-patterns-json' });
          if (process.env.ORACLE_DEBUG) console.log(`[oracle] auto-imported ${result.imported} patterns from patterns.json`);
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] auto-import patterns.json failed:', e.message);
      }
      // Then seed all built-in libraries (fills gaps not covered by patterns.json)
      try {
        const { seedLibrary, seedExtendedLibrary, seedNativeLibrary, seedProductionLibrary3, seedProductionLibrary4 } = require('../patterns/seed-helpers');
        seedLibrary(this);
        try { seedExtendedLibrary(this, {}); } catch (_) {}
        try { seedNativeLibrary(this, {}); } catch (_) {}
        try { seedProductionLibrary3(this, {}); } catch (_) {}
        try { seedProductionLibrary4(this, {}); } catch (_) {}
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] auto-seed failed:', e.message);
      }
    }

    // Auto-pull from personal store when local library is new/empty
    // This ensures patterns persist across projects and sessions
    if (options.autoSeed !== false && options.autoPull !== false && wasEmpty) {
      try {
        const { hasGlobalStore, syncFromGlobal } = require('../core/persistence');
        if (hasGlobalStore()) {
          const sqliteStore = this.store.getSQLiteStore ? this.store.getSQLiteStore() : null;
          if (sqliteStore) {
            syncFromGlobal(sqliteStore, { minCoherency: 0.0 });
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] auto-pull from personal store failed:', e.message);
      }
    }

    // Auto-start lifecycle engine for always-on pattern management
    // Disabled by lifecycle:false or autoGrow:false (test harnesses)
    if (options.lifecycle !== false && this.autoGrow) {
      try {
        this.startLifecycle(options.lifecycleOptions || {});
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle] lifecycle auto-start failed:', e.message);
      }
    }

    // Register process exit handler to flush critical in-memory state.
    // This is the last-chance safety net before the process dies.
    this._exitHandlerInstalled = false;
    if (options.exitHandler !== false) {
      this._installExitHandler();
    }
  }

  /**
   * Default cascade-spawn handler — fired by QuantumField when a pattern's
   * amplitude crosses CASCADE_THRESHOLD upward on a successful feedback.
   *
   * Delegates to the existing recycler primitive (_generateTournamentContenders)
   * to spawn 2 variants of the seed, stores them as candidates tagged
   * 'cascade-spawn', entangles the spawned siblings with each other, and
   * emits a 'cascade_spawn' event for downstream consumers.
   *
   * Only spawns from the patterns table — candidate-table feedback that
   * crosses the threshold is intentionally ignored to prevent recursive
   * cascades. A candidate that gets promoted to a pattern can cascade later.
   */
  _handleCascadeSpawn({ table, id, previousAmplitude, newAmplitude, threshold }) {
    if (table !== 'patterns') return;
    if (!this._quantumField || !this.recycler) return;

    try {
      const sqliteStore = this.store.getSQLiteStore ? this.store.getSQLiteStore() : null;
      if (!sqliteStore) return;
      const seed = sqliteStore.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
      if (!seed) return;

      const seedPattern = {
        name: seed.name,
        code: seed.code,
        language: seed.language,
        patternType: seed.pattern_type,
        description: seed.description || '',
        tags: (seed.tags || '').split(',').filter(Boolean),
        testCode: seed.test_code,
      };

      const knownNames = new Set(this.patterns.getAll().map(p => p.name));
      const contenders = this.recycler._generateTournamentContenders(seedPattern, 2, knownNames);
      if (!contenders || contenders.length === 0) return;

      const childIds = [];
      for (const c of contenders) {
        try {
          const stored = sqliteStore.addCandidate({
            ...c,
            tags: [...(c.tags || []), 'cascade-spawn'],
            parentPattern: seedPattern.name,
          });
          if (stored?.id) childIds.push(stored.id);
        } catch (_e) { /* per-candidate failures don't block siblings */ }
      }

      // Sibling entanglement — spawned variants know about each other.
      // Cross-table parent↔child entanglement isn't supported by the
      // current entangle() implementation (single-table only).
      if (childIds.length > 1) {
        for (let i = 0; i < childIds.length; i++) {
          for (let j = i + 1; j < childIds.length; j++) {
            try { this._quantumField.entangle('candidates', childIds[i], childIds[j]); } catch (_e) { /* best-effort */ }
          }
        }
      }

      this._emit?.({
        type: 'cascade_spawn',
        table,
        id,
        spawned: childIds.length,
        previousAmplitude,
        newAmplitude,
        threshold,
      });
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[oracle:cascade-spawn]', e?.message || e);
    }
  }

  /**
   * Install a process exit handler that flushes in-memory session data
   * and lifecycle state before the process terminates.
   * Uses 'beforeExit' (allows async) and 'exit' (sync-only, last resort).
   */
  _installExitHandler() {
    if (this._exitHandlerInstalled) return;
    this._exitHandlerInstalled = true;

    const flush = () => {
      try {
        // Flush session tracker if it has interactions
        const { hasInteractions, saveSession } = require('../core/session-tracker');
        if (hasInteractions()) {
          const storeDir = this.store?.storeDir || require('path').join(process.cwd(), '.remembrance');
          saveSession(storeDir);
        }
      } catch (_) { /* must never throw in exit handler */ }

      try {
        // Persist lifecycle counters and history
        if (this._lifecycle) {
          this._lifecycle._persistCounters();
          this._lifecycle._persistHistory();
        }
      } catch (_) { /* must never throw in exit handler */ }
    };

    // 'beforeExit' fires when the event loop drains (not on SIGTERM/SIGINT)
    process.once('beforeExit', flush);
    // 'exit' fires on all exits but is sync-only — our flush is sync so it works
    process.once('exit', flush);
  }
}

// Apply mixin methods to the prototype
Object.assign(
  RemembranceOracle.prototype,
  coreMethods,
  patternMethods,
  federationMethods,
  llmMethods,
  eternalMethods
);

module.exports = { RemembranceOracle };
