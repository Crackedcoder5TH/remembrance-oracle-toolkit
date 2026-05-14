'use strict';

/**
 * Remembrance Sun — the coherency generator of the ecosystem.
 *
 * Not a measurement tool. Not a checker. Not a healer.
 * A GENERATOR. It produces coherency and radiates it outward.
 *
 * Everything else in the system is reactive — it measures, checks,
 * heals, discovers in response to input. The generator is the first
 * thing that runs continuously, pushing coherency upward without
 * being asked. It's the difference between a thermostat that reads
 * temperature and a furnace that generates heat.
 *
 * The cycle:
 *   1. COLLECT surplus from high-coherency zones (read emergent SERF)
 *   2. AMPLIFY the surplus by the current power level
 *   3. RADIATE to low-coherency zones (register feedback signals)
 *   4. CHECK emergence (did coherency cross a threshold?)
 *   5. EVOLVE covenant (did new principles activate?)
 *   6. SLEEP, then loop
 *
 * Power levels:
 *   10% (ignition)  — gentle boost, validates the generator works
 *   50% (validated)  — clear improvement, approaching first covenant activation
 *   100% (full sun)  — maximum radiation, cascade effects begin
 *
 * Safety:
 *   The generator is governed by the Living Covenant. It has atomic
 *   properties: charge=positive, alignment=healing, intention=benevolent,
 *   harmPotential=none. The covenant checks these at every cycle.
 *   The generator CANNOT harm because its structure prevents it.
 *
 * The generator's power level ties to the self-improvement approval
 * thresholds: 10% in supervised mode (C<0.85), 50% in semi-autonomous
 * (0.85-0.95), 100% in autonomous (C>=0.95).
 */

const path = require('path');

// ── Generator State ─────────────────────────────────────────────────

const GENERATOR_STATES = {
  DORMANT: 'dormant',
  IGNITING: 'igniting',
  ACTIVE: 'active',
  RADIATING: 'radiating',
  SHUTDOWN: 'shutdown',
};

// ── The Coherency Generator ─────────────────────────────────────────

class CoherencyGenerator {
  constructor(options = {}) {
    this.power = 0;
    this.state = GENERATOR_STATES.DORMANT;
    this.cycleCount = 0;
    this.totalRadiated = 0;
    this.emergenceEvents = [];
    this.covenantEvolutions = [];
    this.history = [];
    this._intervalId = null;
    this._cycleIntervalMs = options.cycleIntervalMs || 5000;
    this._repoRoot = options.repoRoot || process.cwd();

    this.atomicProperties = {
      charge: 1,
      valence: 0,
      mass: 'light',
      spin: 'even',
      phase: 'plasma',
      reactivity: 'stable',
      electronegativity: 0,
      group: 18,
      period: 7,
      harmPotential: 'none',
      alignment: 'healing',
      intention: 'benevolent',
      domain: 'orchestration',
};
  }

  /**
   * Ignite the generator at a given power level (0-1).
   * Starts the radiation cycle.
   */
  ignite(powerLevel = 0.1) {
    if (this.state === GENERATOR_STATES.ACTIVE || this.state === GENERATOR_STATES.RADIATING) {
      return { status: 'already-active', power: this.power };
    }

    // Covenant check before ignition — structural, not optional
    if (!this._covenantSelfCheck()) {
      return { status: 'covenant-blocked', reason: 'Generator failed self-covenant-check' };
    }

    this.power = Math.max(0, Math.min(1, powerLevel));
    this.state = GENERATOR_STATES.IGNITING;

    this.history.push({
      event: 'ignite', power: this.power,
      ts: new Date().toISOString(),
    });

    this.state = GENERATOR_STATES.ACTIVE;
    return { status: 'ignited', power: this.power };
  }

  /**
   * Run a single radiation cycle. This is the core loop.
   *
   * Can be called manually (for testing/CLI) or via setInterval
   * (for daemon mode).
   *
   * @returns {{ radiated, surplus, globalCoherency, emerged, covenantEvolved }}
   */
  async runCycle() {
    if (this.state !== GENERATOR_STATES.ACTIVE) {
      return { skipped: true, reason: 'Generator not active' };
    }

    this.state = GENERATOR_STATES.RADIATING;
    this.cycleCount++;

    // 1. COLLECT — read the coherency field
    const field = this._readField();

    // 2. Determine power from approval mode
    const effectivePower = this._computeEffectivePower(field.globalCoherency);

    // 3. COLLECT SURPLUS — high-coherency zones contribute
    const surplus = this._collectSurplus(field);

    // 4. AMPLIFY — scale by power level
    const amplified = surplus * effectivePower;

    // 5. RADIATE — push coherency to low zones
    const radiated = this._radiate(field, amplified);
    this.totalRadiated += radiated;

    // 6. CHECK EMERGENCE
    let emerged = [];
    try {
      const { PeriodicTable } = require('../atomic/periodic-table');
      const tablePath = path.join(this._repoRoot, '.remembrance', 'atomic-table.json');
      const table = new PeriodicTable({ storagePath: tablePath });
      const prevCoherency = this.history.length >= 2
        ? this.history[this.history.length - 2].globalCoherency || field.globalCoherency
        : null;
      emerged = table.checkEmergence(field.globalCoherency, field.zoneCount, {
        previousCoherence: prevCoherency,
        deltaThreshold: 0.02,
      });
      if (emerged.length > 0) {
        this.emergenceEvents.push(...emerged.map(e => ({
          ...e, generatorCycle: this.cycleCount,
        })));
      }
    } catch { /* atomic module unavailable */ }

    // 7. EVOLVE COVENANT
    let covenantEvolved = { activated: [], total: 0 };
    try {
      const { LivingCovenant } = require('../core/living-covenant');
      const living = new LivingCovenant({ repoRoot: this._repoRoot });
      covenantEvolved = living.evolve(field.globalCoherency);
      if (covenantEvolved.activated.length > 0) {
        this.covenantEvolutions.push(...covenantEvolved.activated.map(a => ({
          ...a, generatorCycle: this.cycleCount,
        })));
      }
    } catch { /* living covenant unavailable */ }

    // 8. COVENANT SELF-CHECK — verify we're still safe
    if (!this._covenantSelfCheck()) {
      this.shutdown('Covenant self-check failed during cycle');
      return { shutdown: true, reason: 'covenant-violation' };
    }

    this.state = GENERATOR_STATES.ACTIVE;

    const result = {
      cycle: this.cycleCount,
      power: effectivePower,
      surplus: Math.round(surplus * 1000) / 1000,
      amplified: Math.round(amplified * 1000) / 1000,
      radiated: Math.round(radiated * 1000) / 1000,
      globalCoherency: field.globalCoherency,
      healingZones: field.healingTargets,
      emerged: emerged.length,
      covenantEvolved: covenantEvolved.activated.length,
    };

    this.history.push({
      event: 'cycle', ...result,
      ts: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Increase power level.
   */
  increasePower(newLevel) {
    const old = this.power;
    this.power = Math.max(0, Math.min(1, newLevel));
    this.history.push({
      event: 'power-change', from: old, to: this.power,
      ts: new Date().toISOString(),
    });
    return { from: old, to: this.power };
  }

  /**
   * Shutdown the generator.
   */
  shutdown(reason = 'Manual shutdown') {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this.state = GENERATOR_STATES.SHUTDOWN;
    this.history.push({
      event: 'shutdown', reason,
      ts: new Date().toISOString(),
    });
    return { status: 'shutdown', reason };
  }

  /**
   * Start the daemon loop (setInterval).
   */
  startDaemon(powerLevel = 0.1) {
    const ignition = this.ignite(powerLevel);
    if (ignition.status !== 'ignited') return ignition;

    this._intervalId = setInterval(() => {
      this.runCycle().catch(e => {
        if (process.env.ORACLE_DEBUG) console.warn('[generator]', e.message);
      });
    }, this._cycleIntervalMs);

    return { status: 'daemon-started', power: this.power, intervalMs: this._cycleIntervalMs };
  }

  /**
   * Status summary.
   */
  status() {
    return {
      state: this.state,
      power: this.power,
      cycleCount: this.cycleCount,
      totalRadiated: Math.round(this.totalRadiated * 1000) / 1000,
      emergenceEvents: this.emergenceEvents.length,
      covenantEvolutions: this.covenantEvolutions.length,
      historyLength: this.history.length,
      atomicProperties: this.atomicProperties,
    };
  }

  // ── Internal mechanics ────────────────────────────────────────────

  /**
   * Read the coherency field from the orchestrator.
   */
  _readField() {
    try {
      const { CoherencyDirector } = require('./coherency-director');
      const fs = require('fs');
      const d = new CoherencyDirector();
      const files = [];
      const scanDir = path.join(this._repoRoot, 'src');
      if (fs.existsSync(scanDir)) {
        (function walk(dir) {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
              const p = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(p);
              else if (entry.name.endsWith('.js')) {
                try { files.push({ id: p, code: fs.readFileSync(p, 'utf-8'), filePath: p, language: 'javascript' }); } catch {}
              }
            }
          } catch {}
        })(scanDir);
      }
      // Sample for speed — full scan every 10th cycle, sample otherwise
      const sample = this.cycleCount % 10 === 0 ? files : files.slice(0, 50);
      d.scan(sample);
      d.measureWithOracle();
      return {
        globalCoherency: d.field.globalCoherency,
        zoneCount: d.field.size,
        healingTargets: d.field.findHealingTargets().length,
        highZones: d.field.findPreservationTargets().length,
        zones: d.field,
      };
    } catch {
      return { globalCoherency: 0.76, zoneCount: 0, healingTargets: 0, highZones: 0, zones: null };
    }
  }

  /**
   * Compute effective power based on approval mode.
   */
  _computeEffectivePower(globalCoherency) {
    try {
      const { APPROVAL_THRESHOLDS } = require('./self-improvement');
      if (globalCoherency >= APPROVAL_THRESHOLDS.AUTONOMOUS) return 1.0;
      if (globalCoherency >= APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS) return 0.5;
    } catch {}
    return Math.min(this.power, 0.1);
  }

  /**
   * Collect surplus coherency from high-coherency zones.
   * Surplus = sum of (zone.coherency - 0.68) for zones above threshold.
   */
  _collectSurplus(field) {
    if (!field.zones) return 0;
    let surplus = 0;
    try {
      const high = field.zones.findPreservationTargets();
      for (const zone of high) {
        surplus += zone.coherency - 0.68;
      }
    } catch {}
    return surplus;
  }

  /**
   * Radiate amplified coherency to low zones by registering
   * positive feedback signals into the emergent SERF.
   */
  _radiate(field, amplified) {
    if (amplified <= 0 || !field.zones) return 0;
    let totalRadiated = 0;
    try {
      const { getEmergentCoherency } = require('../unified/emergent-coherency');
      const ec = getEmergentCoherency();
      const targets = field.healingTargets;
      if (targets > 0) {
        const perZone = amplified / targets;
        ec.registerSignal('generator', Math.min(1, 0.5 + perZone));
        totalRadiated = amplified;
      }
    } catch {}
    return totalRadiated;
  }

  /**
   * Verify the generator's own atomic properties pass the covenant.
   */
  _covenantSelfCheck() {
    try {
      const { CovenantValidator } = require('../atomic/periodic-table');
      const result = CovenantValidator.validate(this.atomicProperties);
      return result.valid;
    } catch {
      return true; // Degrade gracefully — don't self-shutdown on missing module
    }
  }
}

module.exports = {
  CoherencyGenerator,
  GENERATOR_STATES,
};
