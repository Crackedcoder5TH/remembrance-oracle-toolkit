/**
 * Oracle Daemon — The Missing Sleep (Dream State)
 *
 * A background daemon that runs full oracle maintenance on a schedule.
 * While you sleep, it heals patterns, promotes candidates, consolidates
 * duplicates, syncs stores, analyzes coverage gaps, and evolves the covenant.
 *
 * You wake up to a better oracle than you left.
 *
 * Usage:
 *   const daemon = startDaemon(oracle, { intervalHours: 4 });
 *   daemon.status();   // Check daemon state
 *   daemon.runNow();   // Force a cycle
 *   daemon.stop();     // Stop the daemon
 */

const { TemporalMemory, EVENT_TYPES } = require('./temporal-memory');
const { generateCoverageMap } = require('./coverage-map');
const { discoverPrinciples, createEvolvedRegistry, evolvedCovenantStats } = require('../core/covenant-evolution');
const { setPrincipleRegistry } = require('../core/covenant');

const DAEMON_DEFAULTS = {
  intervalHours: 6,
  enableHealing: true,
  enablePromotion: true,
  enableSync: true,
  enableCoverageAnalysis: true,
  enableCovenantEvolution: true,
  enableTemporalTracking: true,
  maxHealsPerCycle: 10,
  minPromotionCoherency: 0.7,
  quiet: false,
};

/**
 * Start the oracle daemon.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {object} options — Override DAEMON_DEFAULTS
 * @returns {object} DaemonController
 */
function startDaemon(oracle, options = {}) {
  const config = { ...DAEMON_DEFAULTS, ...options };
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  let timer = null;
  let running = false;
  let cycleCount = 0;
  let lastReport = null;
  const history = [];
  const maxHistory = 50;

  // Initialize evolved covenant
  if (config.enableCovenantEvolution) {
    try {
      const registry = createEvolvedRegistry();
      setPrincipleRegistry(registry);
    } catch { /* evolved principles not yet created */ }
  }

  // Initialize temporal memory
  let temporal = null;
  if (config.enableTemporalTracking) {
    try {
      const sqliteStore = oracle.store?.getSQLiteStore?.();
      if (sqliteStore) {
        temporal = new TemporalMemory(sqliteStore);
      }
    } catch { /* temporal tracking not available */ }
  }

  function log(msg) {
    if (!config.quiet) {
      const ts = new Date().toISOString().slice(11, 19);
      process.stderr.write(`[daemon ${ts}] ${msg}\n`);
    }
  }

  /**
   * Run a single maintenance cycle.
   */
  function runCycle() {
    if (running) return lastReport;
    // Acquire maintenance lock — prevent lifecycle from overlapping
    if (oracle._maintenanceInProgress) {
      log(`Skipping cycle — maintenance already in progress (source: ${oracle._maintenanceSource})`);
      return lastReport;
    }
    running = true;
    oracle._maintenanceInProgress = true;
    oracle._maintenanceSource = 'daemon';
    const start = Date.now();
    cycleCount++;

    const report = {
      cycle: cycleCount,
      timestamp: new Date().toISOString(),
      healing: null,
      promotion: null,
      sync: null,
      coverage: null,
      covenant: null,
      temporal: null,
      durationMs: 0,
      errors: [],
    };

    try {
      // 1. Healing: self-evolve + reflection
      if (config.enableHealing) {
        try {
          log('Healing patterns...');
          if (typeof oracle.selfImprove === 'function') {
            report.healing = oracle.selfImprove();
          } else if (oracle.lifecycle && typeof oracle.lifecycle.runCycle === 'function') {
            report.healing = oracle.lifecycle.runCycle();
          }
        } catch (err) {
          report.errors.push(`healing: ${err.message}`);
        }
      }

      // 2. Promotion: auto-promote candidates
      if (config.enablePromotion) {
        try {
          log('Promoting candidates...');
          if (typeof oracle.autoPromote === 'function') {
            report.promotion = oracle.autoPromote();
          }
        } catch (err) {
          report.errors.push(`promotion: ${err.message}`);
        }
      }

      // 3. Sync: push to personal store
      if (config.enableSync) {
        try {
          log('Syncing to personal store...');
          const { syncToGlobal } = require('../core/persistence');
          const sqliteStore = oracle.store?.getSQLiteStore?.();
          if (sqliteStore) {
            syncToGlobal(sqliteStore, { minCoherency: 0.6 });
            report.sync = { synced: true };
          }
        } catch (err) {
          report.errors.push(`sync: ${err.message}`);
        }
      }

      // 4. Coverage analysis: identify gaps and emit events for blind spots
      if (config.enableCoverageAnalysis) {
        try {
          log('Analyzing coverage...');
          report.coverage = generateCoverageMap(oracle);

          // Emit events for critical blind spots — feeds into generation queue
          if (report.coverage.blindSpots?.length > 0) {
            for (const spot of report.coverage.blindSpots.filter(b => b.severity === 'critical').slice(0, 3)) {
              try {
                oracle._emit?.({
                  type: 'coverage_gap_detected',
                  domain: spot.domain,
                  suggestion: spot.suggestion,
                });
              } catch { /* emit not available */ }
            }
            log(`  Coverage gaps: ${report.coverage.blindSpots.map(b => b.domain).join(', ')}`);
          }
        } catch (err) {
          report.errors.push(`coverage: ${err.message}`);
        }
      }

      // 5. Covenant evolution: discover new principles
      if (config.enableCovenantEvolution) {
        try {
          log('Evolving covenant...');
          const proposals = discoverPrinciples({ minOccurrences: 3, autoPromote: true });
          report.covenant = {
            proposals: proposals.length,
            stats: evolvedCovenantStats(),
          };
          // Re-register evolved principles
          const registry = createEvolvedRegistry();
          setPrincipleRegistry(registry);
        } catch (err) {
          report.errors.push(`covenant: ${err.message}`);
        }
      }

      // 6. Temporal tracking: detect regressions and trigger priority heals
      if (config.enableTemporalTracking && temporal) {
        try {
          report.temporal = temporal.stats();

          // Detect regressions and mark for priority healing
          const regressions = temporal.detectRegressions({ lookbackDays: 7 });
          if (regressions.length > 0) {
            report.temporal.regressions = regressions.length;
            log(`  Detected ${regressions.length} regression(s) in last 7 days`);

            // Trigger priority healing for regressed patterns
            if (oracle.recycler && typeof oracle.recycler.capture === 'function') {
              for (const reg of regressions.slice(0, 5)) {
                const pattern = oracle.patterns?.get?.(reg.patternId);
                if (pattern) {
                  try {
                    oracle.recycler.capture(
                      { name: pattern.name, code: pattern.code, language: pattern.language },
                      `Temporal regression detected: ${reg.possibleCause || 'unknown'}`,
                      null
                    );
                  } catch { /* capture failed */ }
                }
              }
            }
          }
        } catch (err) {
          report.errors.push(`temporal: ${err.message}`);
        }
      }

    } catch (err) {
      report.errors.push(`cycle: ${err.message}`);
    }

    report.durationMs = Date.now() - start;
    // Release maintenance lock
    oracle._maintenanceInProgress = false;
    oracle._maintenanceSource = null;
    lastReport = report;
    history.push({
      cycle: report.cycle,
      timestamp: report.timestamp,
      durationMs: report.durationMs,
      errors: report.errors.length,
      healed: report.healing?.evolution?.healed?.length || 0,
      promoted: report.promotion?.promoted || 0,
    });
    if (history.length > maxHistory) history.shift();

    log(`Cycle ${cycleCount} complete in ${report.durationMs}ms (${report.errors.length} errors)`);
    running = false;
    return report;
  }

  // Start the interval timer
  log(`Daemon starting — interval: ${config.intervalHours}h`);
  timer = setInterval(runCycle, intervalMs);
  if (timer.unref) timer.unref(); // Don't keep process alive

  // Run first cycle immediately
  runCycle();

  return {
    get isRunning() { return timer !== null; },
    get isCycleRunning() { return running; },
    get lastReport() { return lastReport; },
    get cycleCount() { return cycleCount; },
    get temporal() { return temporal; },

    status() {
      return {
        running: timer !== null,
        cycleCount,
        lastCycle: lastReport?.timestamp || null,
        nextCycle: lastReport
          ? new Date(new Date(lastReport.timestamp).getTime() + intervalMs).toISOString()
          : null,
        intervalHours: config.intervalHours,
        errors: lastReport?.errors || [],
        coverageHealth: lastReport?.coverage?.healthScore ?? null,
        evolvedPrinciples: lastReport?.covenant?.stats?.evolvedPrinciples ?? 0,
      };
    },

    runNow() {
      return runCycle();
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log('Daemon stopped');
      }
      return { stopped: true, totalCycles: cycleCount };
    },

    getHistory() {
      return [...history].reverse();
    },
  };
}

module.exports = {
  startDaemon,
  DAEMON_DEFAULTS,
};
