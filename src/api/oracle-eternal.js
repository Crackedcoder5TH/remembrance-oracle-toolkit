/**
 * Oracle Eternal — The 8 kingdom features mixed into the oracle.
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
   * @param {string} remoteUrl — e.g. 'http://localhost:3579'
   * @param {string} token — JWT auth token
   * @param {object} options — { pullSuperior, pushSuperior, pullUnique, pushUnique, minCoherency }
   */
  async negotiate(remoteUrl, token, options = {}) {
    const { negotiate } = require('../cloud/negotiation');
    return negotiate(this, remoteUrl, token, options);
  },

  /**
   * Feature 3: Generate a manifest of all patterns for negotiation.
   */
  generateManifest() {
    const { generateManifest } = require('../cloud/negotiation');
    return generateManifest(this);
  },

  /**
   * Feature 4: Get temporal memory interface.
   * Records pattern success/failure over time with environmental context.
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
   * The oracle's voice — it generates code from its own library.
   */
  compose(description, options = {}) {
    const { compose } = require('../core/pattern-composer');
    return compose(this, description, options);
  },

  /**
   * Feature 6: Generate a self-awareness coverage map.
   * The oracle's mirror — it sees what it knows and what it doesn't.
   */
  coverageMap() {
    const { generateCoverageMap } = require('../evolution/coverage-map');
    return generateCoverageMap(this);
  },

  /**
   * Feature 7: Discover new covenant principles from violation patterns.
   */
  discoverCovenantPrinciples(options = {}) {
    const { discoverPrinciples } = require('../core/covenant-evolution');
    return discoverPrinciples(options);
  },

  /**
   * Feature 7: Record a covenant near-miss (code that passed but caused problems).
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
   * Returns a daemon controller with status(), runNow(), stop().
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
};
