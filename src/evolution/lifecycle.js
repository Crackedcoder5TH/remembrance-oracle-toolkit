/**
 * Lifecycle Engine — Always-on automatic pattern management.
 *
 * Makes the oracle self-sustaining by wiring together:
 *   1. Auto-registration: patterns automatically register after successful operations
 *   2. Auto-promotion: candidates with tests get promoted on every feedback cycle
 *   3. Evolution triggers: self-evolve fires after threshold events (not manual)
 *   4. Healing sweeps: periodic reflection healing across the library
 *   5. Coherency maintenance: auto-retag + re-score on schedule
 *
 * Accepts an OracleContext (narrow interface) instead of raw oracle instance.
 * The lifecycle engine hooks into oracle events and drives continuous improvement.
 *
 * Usage:
 *   const ctx = createOracleContext(oracle);
 *   const lifecycle = new LifecycleEngine(ctx, options);
 *   lifecycle.start();   // Begin always-on management
 *   lifecycle.stop();    // Pause lifecycle
 *   lifecycle.status();  // Current lifecycle state
 *   lifecycle.runCycle(); // Force a full cycle now
 */

const { evolve } = require('./evolution');

// ─── Configuration ───

const LIFECYCLE_DEFAULTS = {
  // How many feedback events before triggering an evolution cycle
  feedbackEvolutionThreshold: 10,

  // How many submissions before triggering candidate promotion
  submitPromotionThreshold: 5,

  // How many registrations before triggering auto-grow sweep
  registerGrowThreshold: 3,

  // How many debug captures before triggering debug auto-grow
  debugGrowThreshold: 5,

  // Whether to auto-promote candidates with tests on each cycle
  autoPromoteOnCycle: true,

  // Whether to auto-retag patterns on each cycle
  autoRetagOnCycle: false,

  // Whether to run deep-clean on each cycle
  autoCleanOnCycle: false,

  // Whether to sync to personal store on each cycle
  autoSyncOnCycle: true,

  // Whether to run actionable insights on each cycle
  autoInsightsOnCycle: false,

  // Evolution options passed through to selfEvolve
  evolutionOptions: {},

  // Maximum patterns to heal per cycle (avoid long blocking)
  maxHealsPerCycle: 10,

  // Minimum coherency for auto-promotion
  minPromotionCoherency: 0.7,
};

// ─── Lifecycle Engine ───

class LifecycleEngine {
  /**
   * @param {object} ctx - OracleContext or RemembranceOracle instance
   * @param {object} options - Override LIFECYCLE_DEFAULTS
   */
  constructor(ctx, options = {}) {
    this._ctx = ctx;
    // Keep backward compat: store as this.oracle for any external code that accesses it
    this.oracle = ctx._oracle || ctx;
    this.config = { ...LIFECYCLE_DEFAULTS, ...options };
    this._running = false;
    this._unsubscribe = null;

    // Resolve context methods (support both OracleContext and raw oracle)
    this._on = ctx.on || ((cb) => { if (typeof ctx.on === 'function') return ctx.on(cb); return () => {}; });
    this._emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });
    this._autoPromote = ctx.autoPromote || (() => { try { return ctx.autoPromote(); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:constructor] silent failure:', e?.message || e); return { promoted: 0 }; } });
    this._retagAll = ctx.retagAll || ((opts) => { try { return ctx.retagAll(opts); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:constructor] silent failure:', e?.message || e); return { enriched: 0 }; } });
    this._deepClean = ctx.deepClean || ((opts) => { try { return ctx.deepClean(opts); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:constructor] silent failure:', e?.message || e); return { removed: 0 }; } });
    this._debugGrow = ctx.debugGrow || ((opts) => { try { return ctx.debugGrow(opts); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:constructor] silent failure:', e?.message || e); return { processed: 0, generated: 0 }; } });
    this._syncToGlobal = ctx.syncToGlobal || null;
    this._actOnInsights = ctx.actOnInsights || null;

    // Cycle throttling — prevent thrashing when events fire rapidly
    this._lastCycleTime = 0;
    this._minCycleSeparation = 30000; // 30 seconds minimum between cycles

    // Event counters — track events between cycles
    // Restore from persistent storage if available, otherwise start fresh
    this._counters = this._loadCounters();

    // Cycle history — last N cycle reports
    // Restore from persistent storage if available
    this._history = this._loadHistory();
    this._maxHistory = 20;
  }

  /**
   * Start the lifecycle engine — hooks into oracle events
   * and triggers automatic management cycles.
   */
  start() {
    if (this._running) return { started: false, reason: 'already running' };

    this._running = true;

    // Subscribe to oracle events
    this._unsubscribe = this._on((event) => {
      if (!this._running) return;

      try {
        this._handleEvent(event);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:start] silent failure:', e?.message || e);
        // Lifecycle never breaks the oracle
      }
    });

    return { started: true, config: this.config };
  }

  /**
   * Stop the lifecycle engine.
   */
  stop() {
    if (!this._running) return { stopped: false, reason: 'not running' };

    this._running = false;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    return { stopped: true, counters: { ...this._counters } };
  }

  /**
   * Get current lifecycle status.
   */
  status() {
    return {
      running: this._running,
      counters: { ...this._counters },
      config: this.config,
      lastCycle: this._history.length > 0 ? this._history[this._history.length - 1] : null,
      totalCycles: this._counters.cycles,
    };
  }

  /**
   * Force a full lifecycle cycle — runs all maintenance tasks.
   * Returns a comprehensive report.
   */
  runCycle() {
    const cycleStart = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      cycle: ++this._counters.cycles,
      triggeredBy: 'manual',
      evolution: null,
      promotion: null,
      retag: null,
      clean: null,
      sync: null,
      insights: null,
      debugGrowth: null,
      durationMs: 0,
    };

    // 1. Self-evolve: detect regressions, heal low performers, re-check coherency
    try {
      report.evolution = evolve(this._ctx, {
        ...this.config.evolutionOptions,
        maxHeals: this.config.maxHealsPerCycle,
      });
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:runCycle] recording error:', e?.message || e);
      report.evolution = { error: 'evolution cycle failed' };
    }

    // 2. Auto-promote candidates with tests
    if (this.config.autoPromoteOnCycle) {
      try {
        report.promotion = this._autoPromote();
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:runCycle] recording error:', e?.message || e);
        report.promotion = { error: 'auto-promotion failed' };
      }
    }

    // 3. Auto-retag (enrich tags across library)
    if (this.config.autoRetagOnCycle) {
      try {
        report.retag = this._retagAll({ minAdded: 1 });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:runCycle] recording error:', e?.message || e);
        report.retag = { error: 'retag failed' };
      }
    }

    // 4. Deep clean (remove duplicates, stubs)
    if (this.config.autoCleanOnCycle) {
      try {
        report.clean = this._deepClean({ dryRun: false });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:runCycle] recording error:', e?.message || e);
        report.clean = { error: 'clean failed' };
      }
    }

    // 5. Sync to personal store
    if (this.config.autoSyncOnCycle) {
      try {
        if (this._syncToGlobal) {
          report.sync = this._syncToGlobal({ minCoherency: 0.0 });
        } else {
          // Fallback for raw oracle
          const { syncToGlobal } = require('../core/persistence');
          const sqliteStore = this.oracle.store?.getSQLiteStore?.();
          if (sqliteStore) {
            syncToGlobal(sqliteStore, { minCoherency: 0.0 });
            report.sync = { synced: true };
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:init] recording error:', e?.message || e);
        report.sync = { error: 'sync failed' };
      }
    }

    // 6. Run actionable insights
    if (this.config.autoInsightsOnCycle) {
      try {
        if (this._actOnInsights) {
          report.insights = this._actOnInsights({
            maxHeals: this.config.maxHealsPerCycle,
          });
        } else {
          // Fallback for raw oracle
          const { actOnInsights } = require('../analytics/actionable-insights');
          report.insights = actOnInsights(this.oracle, {
            maxHeals: this.config.maxHealsPerCycle,
          });
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:init] recording error:', e?.message || e);
        report.insights = { error: 'insights failed' };
      }
    }

    // 7. Auto-grow debug patterns if captures have accumulated
    if (this._counters.debugCaptures > 0) {
      try {
        report.debugGrowth = this._tryDebugGrow();
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:init] recording error:', e?.message || e);
        report.debugGrowth = { error: 'debug growth failed' };
      }
    }

    report.durationMs = Date.now() - cycleStart;

    // Record in history
    this._recordCycle(report);

    // Emit lifecycle event
    this._emit({
      type: 'lifecycle_cycle',
      cycle: report.cycle,
      healed: report.evolution?.healed?.length || 0,
      promoted: report.promotion?.promoted || 0,
      durationMs: report.durationMs,
    });

    // Record lifecycle cycle in temporal memory
    try {
      const tm = this.oracle?.getTemporalMemory?.();
      if (tm) {
        tm.record('__lifecycle__', 'evolved', {
          context: `Cycle ${report.cycle}: ${report.evolution?.healed?.length || 0} healed, ${report.promotion?.promoted || 0} promoted`,
          detail: JSON.stringify({
            cycle: report.cycle,
            triggeredBy: report.triggeredBy,
            durationMs: report.durationMs,
          }),
        });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:init] temporal memory not available:', e?.message || e);
    }

    return report;
  }

  /**
   * Handle an oracle event.
   */
  _handleEvent(event) {
    switch (event.type) {
      case 'feedback':
        this._counters.feedbacks++;
        if (this._counters.feedbacks % this.config.feedbackEvolutionThreshold === 0) {
          this._triggerCycle('feedback-threshold');
        }
        break;

      case 'entry_added':
        this._counters.submissions++;
        if (this._counters.submissions % this.config.submitPromotionThreshold === 0) {
          this._tryAutoPromote();
        }
        break;

      case 'pattern_registered':
        this._counters.registrations++;
        if (this._counters.registrations % this.config.registerGrowThreshold === 0) {
          this._tryAutoPromote();
        }
        break;

      case 'auto_heal':
        this._counters.heals++;
        break;

      case 'rejection_captured':
        this._counters.rejections++;
        // Auto-heal: trigger recycling after accumulating rejections
        if (this._counters.rejections >= 3 && this._counters.rejections % 3 === 0) {
          this._tryAutoHeal();
        }
        break;

      case 'debug_capture':
        this._counters.debugCaptures++;
        if (this._counters.debugCaptures % this.config.debugGrowThreshold === 0) {
          this._tryDebugGrow();
        }
        break;

      case 'debug_feedback':
        this._counters.debugFeedbacks++;
        break;

      case 'harvest_complete':
      case 'auto_submit_complete':
        // After harvest or auto-submit, trigger promotion for any new candidates
        this._tryAutoPromote();
        break;
    }

    // Persist counters periodically (every 5 events) to avoid excessive I/O
    const totalEvents = this._counters.feedbacks + this._counters.submissions +
      this._counters.registrations + this._counters.debugCaptures;
    if (totalEvents > 0 && totalEvents % 5 === 0) {
      this._persistCounters();
    }
  }

  _triggerCycle(reason) {
    try {
      // Throttle: don't cycle more often than _minCycleSeparation
      const now = Date.now();
      if (now - this._lastCycleTime < this._minCycleSeparation) {
        return null;
      }
      // Respect maintenance lock — avoid overlapping with daemon
      if (this.oracle?._maintenanceInProgress) {
        return null;
      }
      this._lastCycleTime = now;
      const report = this.runCycle();
      report.triggeredBy = reason;
      return report;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:_triggerCycle] returning null on error:', e?.message || e);
      return null;
    }
  }

  _tryAutoPromote() {
    try {
      return this._autoPromote();
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:_tryAutoPromote] returning null on error:', e?.message || e);
      return null;
    }
  }

  _tryAutoHeal() {
    try {
      const recycler = this.oracle?.recycler;
      if (recycler && typeof recycler.recycleFailed === 'function') {
        const result = recycler.recycleFailed({ maxPatterns: this.config.maxHealsPerCycle });
        if (result.healed > 0) {
          this._counters.heals += result.healed;
        }
        return result;
      }
      return null;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:_tryAutoHeal] returning null on error:', e?.message || e);
      return null;
    }
  }

  _tryDebugGrow() {
    try {
      return this._debugGrow({ minConfidence: 0.5 });
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle:_tryDebugGrow] returning null on error:', e?.message || e);
      return null;
    }
  }

  _recordCycle(report) {
    this._history.push({
      cycle: report.cycle,
      timestamp: report.timestamp,
      triggeredBy: report.triggeredBy,
      healed: report.evolution?.healed?.length || 0,
      promoted: report.promotion?.promoted || 0,
      regressions: report.evolution?.regressions?.length || 0,
      durationMs: report.durationMs,
    });

    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // Persist both counters and history after each cycle
    this._persistCounters();
    this._persistHistory();
  }

  getHistory() {
    return [...this._history].reverse();
  }

  resetCounters() {
    this._counters = {
      feedbacks: 0,
      submissions: 0,
      registrations: 0,
      heals: 0,
      rejections: 0,
      debugCaptures: 0,
      debugFeedbacks: 0,
      cycles: this._counters.cycles,
    };
    this._persistCounters();
  }

  // ─── Persistent State (survives process restarts) ───

  /**
   * Get the store directory for lifecycle state files.
   */
  _getStoreDir() {
    try {
      const store = this.oracle?.store;
      if (store?.storeDir) return store.storeDir;
      const sqliteStore = store?.getSQLiteStore?.();
      if (sqliteStore?.storeDir) return sqliteStore.storeDir;
    } catch (_) { /* fall through */ }
    return null;
  }

  /**
   * Load persisted counters from disk. Returns default counters if none found.
   */
  _loadCounters() {
    const defaults = {
      feedbacks: 0, submissions: 0, registrations: 0,
      heals: 0, rejections: 0, debugCaptures: 0,
      debugFeedbacks: 0, cycles: 0,
    };
    try {
      const dir = this._getStoreDir();
      if (!dir) return defaults;
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(dir, 'lifecycle-counters.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return { ...defaults, ...data };
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle] failed to load counters:', e?.message);
    }
    return defaults;
  }

  /**
   * Persist counters to disk so they survive process restarts.
   */
  _persistCounters() {
    try {
      const dir = this._getStoreDir();
      if (!dir) return;
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, 'lifecycle-counters.json');
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this._counters), 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle] failed to persist counters:', e?.message);
    }
  }

  /**
   * Load persisted cycle history from disk.
   */
  _loadHistory() {
    try {
      const dir = this._getStoreDir();
      if (!dir) return [];
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(dir, 'lifecycle-history.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(data) ? data : [];
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle] failed to load history:', e?.message);
    }
    return [];
  }

  /**
   * Persist cycle history to disk.
   */
  _persistHistory() {
    try {
      const dir = this._getStoreDir();
      if (!dir) return;
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, 'lifecycle-history.json');
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this._history), 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[lifecycle] failed to persist history:', e?.message);
    }
  }
}

module.exports = {
  LifecycleEngine,
  LIFECYCLE_DEFAULTS,
};
