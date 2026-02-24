/**
 * Oracle Eternal — The 8 kingdom features mixed into the oracle.
 *
 * Optimized Kingdom Version: All features are now cross-connected into
 * self-reinforcing loops. Temporal memory feeds coverage, coverage feeds
 * negotiation, healing feeds covenant evolution, the daemon coordinates
 * with lifecycle, and compositions auto-register.
 *
 * Feature 1: True Semantic Understanding — Enhanced via embeddings (already wired)
 * Feature 2: TypeScript Promotion — Fixed sandbox (already wired)
 * Feature 3: Inter-Oracle Teaching — negotiate()
 * Feature 4: Temporal Memory — temporal()
 * Feature 5: Intent-Aware Code Generation — compose()
 * Feature 6: Self-Awareness of Gaps — coverageMap()
 * Feature 7: Covenant Evolution — evolvedCovenant()
 * Feature 8: Dream State — startDaemon()
 */

module.exports = {
  /**
   * Feature 3: Negotiate with a remote oracle to exchange superior patterns.
   * Now coverage-aware: prioritizes pulling from blind spots.
   * Now temporal-aware: includes health data in manifests.
   */
  async negotiate(remoteUrl, token, options = {}) {
    const { negotiate } = require('../cloud/negotiation');
    return negotiate(this, remoteUrl, token, options);
  },

  /**
   * Feature 3: Generate a manifest of all patterns for negotiation.
   * Includes temporal health data for richer peer exchange.
   */
  generateManifest() {
    const { generateManifest } = require('../cloud/negotiation');
    return generateManifest(this);
  },

  /**
   * Feature 4: Get temporal memory interface.
   * Records pattern success/failure over time with environmental context.
   * Feeds into: coverage map (A.1), composer (A.5), daemon regression detection (D.3).
   */
  getTemporalMemory() {
    if (!this._temporalMemory) {
      const { TemporalMemory } = require('../evolution/temporal-memory');
      const sqliteStore = this.store?.getSQLiteStore?.();
      const db = sqliteStore?.db || sqliteStore?._db || null;
      if (db && typeof db.exec === 'function') {
        this._temporalMemory = new TemporalMemory(db);
      } else {
        return null;
      }
    }
    return this._temporalMemory;
  },

  /**
   * Feature 4: Record a temporal event for a pattern.
   */
  recordTemporalEvent(patternId, eventType, data = {}) {
    const tm = this.getTemporalMemory();
    if (tm) tm.record(patternId, eventType, data);
  },

  /**
   * Feature 4: Get a pattern's health timeline with narrative.
   */
  patternTimeline(patternId) {
    const tm = this.getTemporalMemory();
    if (!tm) return { status: 'unavailable', narrative: 'Temporal memory not initialized.' };
    return tm.analyzeHealth(patternId);
  },

  /**
   * Feature 5: Compose multiple patterns into a new function.
   * Now temporal-aware: avoids regressed building blocks.
   * Supports autoRegister to feed compositions back into the library.
   */
  compose(description, options = {}) {
    const { compose } = require('../core/pattern-composer');
    return compose(this, description, options);
  },

  /**
   * Feature 6: Generate a self-awareness coverage map.
   * Now temporal-aware: weights by pattern health (regressed patterns count less).
   * Now cached: reuses result within 5 minutes if pattern count unchanged.
   */
  coverageMap() {
    const { generateCoverageMap } = require('../evolution/coverage-map');
    return generateCoverageMap(this);
  },

  /**
   * Feature 7: Discover new covenant principles from violation patterns.
   * Supports autoPromote: strong clusters auto-become active principles.
   */
  discoverCovenantPrinciples(options = {}) {
    const { discoverPrinciples } = require('../core/covenant-evolution');
    return discoverPrinciples(options);
  },

  /**
   * Feature 7: Record a covenant near-miss (code that passed but caused problems).
   * Fed by: recycler heal failures (A.4).
   */
  recordCovenantViolation(code, reason, category) {
    const { recordViolation } = require('../core/covenant-evolution');
    recordViolation(code, reason, category);
  },

  /**
   * Feature 7: Get evolved covenant statistics.
   */
  evolvedCovenantStats() {
    const { evolvedCovenantStats } = require('../core/covenant-evolution');
    return evolvedCovenantStats();
  },

  /**
   * Feature 8: Start the oracle daemon for autonomous maintenance.
   * Now coordinates with lifecycle via maintenance lock (A.3).
   * Coverage gaps trigger events (D.2), regressions trigger heals (D.3),
   * covenant evolution auto-promotes strong principles (D.5).
   */
  startDaemon(options = {}) {
    if (this._daemon && this._daemon.isRunning) {
      return this._daemon;
    }
    const { startDaemon } = require('../evolution/daemon');
    this._daemon = startDaemon(this, options);
    return this._daemon;
  },

  /**
   * Feature 8: Get daemon status (if running).
   */
  daemonStatus() {
    if (!this._daemon) return { running: false };
    return this._daemon.status();
  },

  /**
   * Feature 8: Stop the daemon.
   */
  stopDaemon() {
    if (!this._daemon) return { stopped: false, reason: 'no daemon running' };
    return this._daemon.stop();
  },

  /**
   * Full self-evaluation: run all diagnostic features and return unified report.
   * Combines coverage map, temporal stats, covenant stats, and daemon status.
   */
  selfEvaluate() {
    const report = {
      timestamp: new Date().toISOString(),
      coverage: null,
      temporal: null,
      covenant: null,
      daemon: null,
      patterns: null,
    };

    try { report.coverage = this.coverageMap(); } catch { /* unavailable */ }

    try {
      const tm = this.getTemporalMemory();
      if (tm) {
        report.temporal = tm.stats();
        report.temporal.regressions = tm.detectRegressions({ lookbackDays: 7 }).length;
      }
    } catch { /* unavailable */ }

    try { report.covenant = this.evolvedCovenantStats(); } catch { /* unavailable */ }
    try { report.daemon = this.daemonStatus(); } catch { /* unavailable */ }

    try {
      const all = this.patterns?.getAll() || [];
      report.patterns = {
        total: all.length,
        avgCoherency: all.length > 0 ? +(all.reduce((s, p) => s + (p.coherencyScore?.total ?? 0), 0) / all.length).toFixed(3) : 0,
        languages: [...new Set(all.map(p => p.language).filter(Boolean))],
      };
    } catch { /* unavailable */ }

    return report;
  },
};
