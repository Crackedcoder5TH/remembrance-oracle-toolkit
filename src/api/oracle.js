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

    // Auto-seed on first run if library is empty
    const wasEmpty = this.patterns.getAll().length === 0;
    if (options.autoSeed !== false && wasEmpty) {
      try {
        const { seedLibrary } = require('../patterns/seed-helpers');
        seedLibrary(this);
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
