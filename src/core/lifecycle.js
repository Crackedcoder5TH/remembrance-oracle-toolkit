/**
 * Lifecycle Engine — Always-on automatic pattern management.
 *
 * Makes the oracle self-sustaining by wiring together:
 *   1. Auto-registration: patterns automatically register after successful operations
 *   2. Auto-promotion: candidates with tests get promoted on every feedback cycle
 *   3. Evolution triggers: self-evolve fires after threshold events (not manual)
 *   4. Healing sweeps: periodic SERF healing across the library
 *   5. Coherency maintenance: auto-retag + re-score on schedule
 *
 * The lifecycle engine hooks into oracle events and drives continuous improvement
 * without any manual intervention.
 *
 * Usage:
 *   const lifecycle = new LifecycleEngine(oracle, options);
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

  // Whether to auto-promote candidates with tests on each cycle
  autoPromoteOnCycle: true,

  // Whether to auto-retag patterns on each cycle
  autoRetagOnCycle: false,

  // Whether to run deep-clean on each cycle
  autoCleanOnCycle: false,

  // Whether to sync to personal store on each cycle
  autoSyncOnCycle: false,

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
   * @param {object} oracle - RemembranceOracle instance
   * @param {object} options - Override LIFECYCLE_DEFAULTS
   */
  constructor(oracle, options = {}) {
    this.oracle = oracle;
    this.config = { ...LIFECYCLE_DEFAULTS, ...options };
    this._running = false;
    this._unsubscribe = null;

    // Event counters — track events between cycles
    this._counters = {
      feedbacks: 0,
      submissions: 0,
      registrations: 0,
      heals: 0,
      rejections: 0,
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
    this._unsubscribe = this.oracle.on((event) => {
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
      durationMs: 0,
    };

    // 1. Self-evolve: detect regressions, heal low performers, re-check coherency
    try {
      report.evolution = evolve(this.oracle, {
        ...this.config.evolutionOptions,
        maxHeals: this.config.maxHealsPerCycle,
      });
    } catch {
      report.evolution = { error: 'evolution cycle failed' };
    }

    // 2. Auto-promote candidates with tests
    if (this.config.autoPromoteOnCycle) {
      try {
        report.promotion = this.oracle.autoPromote();
      } catch {
        report.promotion = { error: 'auto-promotion failed' };
      }
    }

    // 3. Auto-retag (enrich tags across library)
    if (this.config.autoRetagOnCycle) {
      try {
        report.retag = this.oracle.retagAll({ minAdded: 1 });
      } catch {
        report.retag = { error: 'retag failed' };
      }
    }

    // 4. Deep clean (remove duplicates, stubs)
    if (this.config.autoCleanOnCycle) {
      try {
        report.clean = this.oracle.deepClean({ dryRun: false });
      } catch {
        report.clean = { error: 'clean failed' };
      }
    }

    // 5. Sync to personal store
    if (this.config.autoSyncOnCycle) {
      try {
        const { syncToGlobal } = require('../core/persistence');
        const sqliteStore = this.oracle.store.getSQLiteStore();
        if (sqliteStore) {
          syncToGlobal(sqliteStore, { minCoherency: 0.6 });
          report.sync = { synced: true };
        }
      } catch {
        report.sync = { error: 'sync failed' };
      }
    }

    report.durationMs = Date.now() - cycleStart;

    // Record in history
    this._recordCycle(report);

    // Emit lifecycle event
    this.oracle._emit({
      type: 'lifecycle_cycle',
      cycle: report.cycle,
      healed: report.evolution?.healed?.length || 0,
      promoted: report.promotion?.promoted || 0,
      durationMs: report.durationMs,
    });

    return report;
  }

  /**
   * Handle an oracle event — increment counters and trigger cycles when thresholds are met.
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
    }
  }

  /**
   * Trigger a background evolution cycle.
   */
  _triggerCycle(reason) {
    try {
      const report = this.runCycle();
      report.triggeredBy = reason;
      return report;
    } catch {
      return null;
    }
  }

  /**
   * Try auto-promoting candidates with existing tests.
   */
  _tryAutoPromote() {
    try {
      return this.oracle.autoPromote();
    } catch {
      return null;
    }
  }

  /**
   * Record a cycle in history (capped at maxHistory).
   */
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

  /**
   * Get cycle history (most recent first).
   */
  getHistory() {
    return [...this._history].reverse();
  }

  /**
   * Reset all counters.
   */
  resetCounters() {
    this._counters = {
      feedbacks: 0,
      submissions: 0,
      registrations: 0,
      heals: 0,
      rejections: 0,
      cycles: this._counters.cycles,
    };
  }
}

module.exports = {
  LifecycleEngine,
  LIFECYCLE_DEFAULTS,
};
