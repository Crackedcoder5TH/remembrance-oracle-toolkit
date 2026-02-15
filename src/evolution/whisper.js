/**
 * Healing Whisper Summary — Aggregated reports of all healing activity.
 *
 * The whisper system collects healing events across the oracle's lifetime
 * and produces a summary "whisper" at the end of any operation that includes
 * healing activity. Think of it as the oracle quietly reporting what it fixed.
 *
 * Accepts an OracleContext (narrow interface) or raw oracle instance.
 *
 * Usage:
 *   const ctx = createOracleContext(oracle);
 *   const whisper = new HealingWhisper(ctx);
 *   whisper.start();
 *   // ... oracle operations that trigger healing ...
 *   const summary = whisper.summarize();
 *   console.log(summary.text);
 */

// ─── Whisper Messages ───

const WHISPER_INTROS = [
  'The oracle healed itself while you worked.',
  'Quiet refinement happened behind the scenes.',
  'Code was silently improved by the reflection loop.',
  'The refinement engine improved patterns in the background.',
  'Self-healing completed — the library grew stronger.',
  'Patterns were polished through iterative reflection.',
  'The oracle whispers: improvements were made.',
  'Background healing cycle complete.',
];

const WHISPER_DETAILS = {
  heal_single: (name, pct) => `  Healed "${name}" — coherency improved by ${pct}%`,
  heal_multi: (count, avgPct) => `  Healed ${count} patterns — average improvement: ${avgPct}%`,
  regression_found: (count) => `  Detected ${count} regression(s) — marked for healing`,
  promotion: (count) => `  Promoted ${count} candidate(s) to proven status`,
  coherency_update: (count) => `  Re-scored ${count} pattern(s) with updated coherency`,
  rejection_recovered: (count) => `  Recovered ${count} rejected submission(s) via reflection`,
  stale_flagged: (count) => `  Flagged ${count} stale pattern(s) for review`,
  no_action: 'The oracle is healthy — no healing needed.',
};

// ─── Healing Whisper ───

class HealingWhisper {
  /**
   * @param {object} ctx - OracleContext or RemembranceOracle instance
   */
  constructor(ctx) {
    this._ctx = ctx;
    // Resolve event subscription method
    this._on = ctx.on || ((cb) => { if (typeof ctx.on === 'function') return ctx.on(cb); return () => {}; });
    // Keep backward compat
    this.oracle = ctx._oracle || ctx;
    this._events = [];
    this._unsubscribe = null;
    this._listening = false;
    this._startTime = null;
  }

  /**
   * Start collecting healing events from the oracle.
   */
  start() {
    if (this._listening) return;

    this._listening = true;
    this._startTime = Date.now();
    this._events = [];

    this._unsubscribe = this._on((event) => {
      if (!this._listening) return;

      if (this._isHealingEvent(event)) {
        this._events.push({
          ...event,
          capturedAt: Date.now(),
        });
      }
    });
  }

  /**
   * Stop collecting and return the final summary.
   */
  stop() {
    this._listening = false;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    return this.summarize();
  }

  /**
   * Record an external healing event.
   */
  record(event) {
    this._events.push({
      ...event,
      capturedAt: Date.now(),
    });
  }

  /**
   * Record a full evolution report as healing events.
   */
  recordEvolutionReport(report) {
    if (!report) return;

    if (report.healed && report.healed.length > 0) {
      for (const h of report.healed) {
        this._events.push({
          type: 'auto_heal',
          id: h.id,
          name: h.name,
          improvement: h.improvement,
          newCoherency: h.newCoherency,
          loops: h.loops,
          capturedAt: Date.now(),
        });
      }
    }

    if (report.regressions && report.regressions.length > 0) {
      this._events.push({
        type: 'regressions_detected',
        count: report.regressions.length,
        patterns: report.regressions.map(r => ({ id: r.id, name: r.name, delta: r.delta })),
        capturedAt: Date.now(),
      });
    }

    if (report.coherencyUpdates && report.coherencyUpdates.length > 0) {
      this._events.push({
        type: 'coherency_rechecked',
        count: report.coherencyUpdates.length,
        updates: report.coherencyUpdates.map(u => ({ id: u.id, name: u.name, diff: u.diff })),
        capturedAt: Date.now(),
      });
    }

    if (report.staleCount > 0) {
      this._events.push({
        type: 'stale_detected',
        count: report.staleCount,
        capturedAt: Date.now(),
      });
    }
  }

  /**
   * Record a promotion report.
   */
  recordPromotionReport(report) {
    if (!report || !report.promoted) return;

    this._events.push({
      type: 'auto_promote',
      promoted: report.promoted,
      skipped: report.skipped || 0,
      vetoed: report.vetoed || 0,
      capturedAt: Date.now(),
    });
  }

  /**
   * Generate the healing whisper summary.
   */
  summarize() {
    const stats = this._computeStats();
    const text = this._generateText(stats);
    const durationMs = this._startTime ? Date.now() - this._startTime : 0;

    return {
      text,
      events: this._events.length,
      stats,
      hasActivity: this._events.length > 0,
      durationMs,
    };
  }

  getText() {
    return this.summarize().text;
  }

  _computeStats() {
    const stats = {
      healed: [],
      totalImprovement: 0,
      regressions: 0,
      promotions: 0,
      coherencyUpdates: 0,
      staleCount: 0,
      rejectionsRecovered: 0,
      totalLoops: 0,
    };

    for (const event of this._events) {
      switch (event.type) {
        case 'auto_heal':
          stats.healed.push({
            name: event.name || event.id || 'unknown',
            improvement: event.improvement || 0,
            newCoherency: event.newCoherency || 0,
            loops: event.loops || 0,
          });
          stats.totalImprovement += event.improvement || 0;
          stats.totalLoops += event.loops || 0;
          break;

        case 'healing_complete':
          if (event.improvement > 0) {
            stats.healed.push({
              name: event.patternName || event.patternId || 'unknown',
              improvement: event.improvement || 0,
              loops: event.loops || 0,
            });
            stats.totalImprovement += event.improvement || 0;
            stats.totalLoops += event.loops || 0;
          }
          break;

        case 'regressions_detected':
          stats.regressions += event.count || 0;
          break;

        case 'auto_promote':
          stats.promotions += event.promoted || 0;
          break;

        case 'coherency_rechecked':
          stats.coherencyUpdates += event.count || 0;
          break;

        case 'stale_detected':
          stats.staleCount += event.count || 0;
          break;

        case 'rejection_captured':
          stats.rejectionsRecovered++;
          break;
      }
    }

    return stats;
  }

  _generateText(stats) {
    if (this._events.length === 0) {
      return WHISPER_DETAILS.no_action;
    }

    const lines = [];

    const introIdx = this._events.length % WHISPER_INTROS.length;
    lines.push(WHISPER_INTROS[introIdx]);
    lines.push('');

    if (stats.healed.length === 1) {
      const h = stats.healed[0];
      const pct = (h.improvement * 100).toFixed(1);
      lines.push(WHISPER_DETAILS.heal_single(h.name, pct));
    } else if (stats.healed.length > 1) {
      const avgPct = stats.healed.length > 0
        ? ((stats.totalImprovement / stats.healed.length) * 100).toFixed(1)
        : '0.0';
      lines.push(WHISPER_DETAILS.heal_multi(stats.healed.length, avgPct));

      const top = stats.healed
        .sort((a, b) => b.improvement - a.improvement)
        .slice(0, 5);
      for (const h of top) {
        const pct = (h.improvement * 100).toFixed(1);
        lines.push(WHISPER_DETAILS.heal_single(h.name, pct));
      }
    }

    if (stats.regressions > 0) {
      lines.push(WHISPER_DETAILS.regression_found(stats.regressions));
    }

    if (stats.promotions > 0) {
      lines.push(WHISPER_DETAILS.promotion(stats.promotions));
    }

    if (stats.coherencyUpdates > 0) {
      lines.push(WHISPER_DETAILS.coherency_update(stats.coherencyUpdates));
    }

    if (stats.staleCount > 0) {
      lines.push(WHISPER_DETAILS.stale_flagged(stats.staleCount));
    }

    if (stats.healed.length > 0) {
      const totalPct = (stats.totalImprovement * 100).toFixed(1);
      lines.push('');
      lines.push(`  Total: ${stats.totalImprovement > 0 ? '+' : ''}${totalPct}% coherency gained across ${stats.totalLoops} reflection loop(s).`);
    }

    return lines.join('\n');
  }

  _isHealingEvent(event) {
    return [
      'auto_heal',
      'healing_start',
      'healing_progress',
      'healing_complete',
      'healing_failed',
      'auto_promote',
      'rejection_captured',
      'evolution_cycle',
      'lifecycle_cycle',
    ].includes(event.type);
  }

  clear() {
    this._events = [];
    this._startTime = Date.now();
  }
}

module.exports = {
  HealingWhisper,
  WHISPER_INTROS,
  WHISPER_DETAILS,
};
