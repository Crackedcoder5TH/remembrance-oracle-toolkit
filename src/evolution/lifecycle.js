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
    this._autoPromote = ctx.autoPromote || (() => { try { return ctx.autoPromote(); } catch { return { promoted: 0 }; } });
    this._retagAll = ctx.retagAll || ((opts) => { try { return ctx.retagAll(opts); } catch { return { enriched: 0 }; } });
    this._deepClean = ctx.deepClean || ((opts) => { try { return ctx.deepClean(opts); } catch { return { removed: 0 }; } });
    this._debugGrow = ctx.debugGrow || ((opts) => { try { return ctx.debugGrow(opts); } catch { return { processed: 0, generated: 0 }; } });
    this._syncToGlobal = ctx.syncToGlobal || null;
    this._actOnInsights = ctx.actOnInsights || null;

    // Event counters — track events between cycles
    this._counters = {
      feedbacks: 0,
      submissions: 0,
      registrations: 0,
      heals: 0,
      rejections: 0,
      debugCaptures: 0,
      debugFeedbacks: 0,
      cycles: 0,
    };

    // Cycle history — last N cycle reports
    this._history = [];
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
      } catch {
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
    } catch {
      report.evolution = { error: 'evolution cycle failed' };
    }

    // 2. Auto-promote candidates with tests
    if (this.config.autoPromoteOnCycle) {
      try {
        report.promotion = this._autoPromote();
      } catch {
        report.promotion = { error: 'auto-promotion failed' };
      }
    }

    // 3. Auto-retag (enrich tags across library)
    if (this.config.autoRetagOnCycle) {
      try {
        report.retag = this._retagAll({ minAdded: 1 });
      } catch {
        report.retag = { error: 'retag failed' };
      }
    }

    // 4. Deep clean (remove duplicates, stubs)
    if (this.config.autoCleanOnCycle) {
      try {
        report.clean = this._deepClean({ dryRun: false });
      } catch {
        report.clean = { error: 'clean failed' };
      }
    }

    // 5. Sync to personal store
    if (this.config.autoSyncOnCycle) {
      try {
        if (this._syncToGlobal) {
          report.sync = this._syncToGlobal({ minCoherency: 0.6 });
        } else {
          // Fallback for raw oracle
          const { syncToGlobal } = require('../core/persistence');
          const sqliteStore = this.oracle.store?.getSQLiteStore?.();
          if (sqliteStore) {
            syncToGlobal(sqliteStore, { minCoherency: 0.6 });
            report.sync = { synced: true };
          }
        }
      } catch {
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
      } catch {
        report.insights = { error: 'insights failed' };
      }
    }

    // 7. Auto-grow debug patterns if captures have accumulated
    if (this._counters.debugCaptures > 0) {
      try {
        report.debugGrowth = this._tryDebugGrow();
      } catch {
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
  }

  _triggerCycle(reason) {
    try {
      const report = this.runCycle();
      report.triggeredBy = reason;
      return report;
    } catch {
      return null;
    }
  }

  _tryAutoPromote() {
    try {
      return this._autoPromote();
    } catch {
      return null;
    }
  }

  _tryDebugGrow() {
    try {
      return this._debugGrow({ minConfidence: 0.5 });
    } catch {
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
  }
}

module.exports = {
  LifecycleEngine,
  LIFECYCLE_DEFAULTS,
};
