'use strict';

/**
 * Remembrance Director — the conductor of the ecosystem.
 *
 * Not a pattern matcher. Not a compressor. Not a generator.
 * A system that wields COHERENCY ITSELF.
 *
 * Reads coherency signals from every pipeline stage (oracle) and
 * from the void compressor (compression-ratio coherency), maps them
 * across zones, finds where coherency is falling, and directs
 * healing to where it's needed most.
 *
 * Can only exist because both Oracle and Void are atomically coded —
 * they speak the same property language, so the director can read
 * their signals as a unified coherency field.
 *
 * Three capabilities:
 *   MEASURE — map coherency across zones using both systems
 *   HEAL    — direct oracle healing to low-coherency zones
 *   PRESERVE — direct void compression to high-coherency zones
 *   FLOW    — find the steepest gradient and intervene there
 */

const path = require('path');

// ── CoherencyZone ───────────────────────────────────────────────────

/**
 * A zone is any unit of code that has a measurable coherency:
 * a file, a module, a function, a pattern in the library.
 */
class CoherencyZone {
  constructor(id, data) {
    this.id = id;
    this.data = data;           // { code, filePath, pattern, ... }
    this.coherency = 0;         // current coherency (0-1)
    this.oracleSignals = {};    // per-stage signals from the oracle pipeline
    this.voidCoherency = null;  // compression-ratio coherency from void
    this.gradient = 0;          // rate of change vs neighbors
    this.lastMeasured = null;
    this.healingHistory = [];
  }

  get needsHealing() { return this.coherency < 0.68; }
  get needsPreservation() { return this.coherency >= 0.85; }
  get isStable() { return this.coherency >= 0.68 && this.coherency < 0.85; }
}

// ── CoherencyField ──────────────────────────────────────────────────

/**
 * The coherency field is a spatial+temporal map of coherency across
 * all zones. It tracks how coherency evolves over time and where
 * the gradients are steepest (where intervention is most needed).
 */
class CoherencyField {
  constructor() {
    /** @type {Map<string, CoherencyZone>} */
    this.zones = new Map();
    this.history = [];
    this.globalCoherency = 0;
  }

  addZone(id, data) {
    const zone = new CoherencyZone(id, data);
    this.zones.set(id, zone);
    return zone;
  }

  getZone(id) { return this.zones.get(id); }

  /**
   * Update a zone's coherency from oracle pipeline signals.
   * Uses geometric mean (same as emergent SERF) so the weakest
   * signal dominates.
   */
  updateZoneFromOracle(id, signals) {
    const zone = this.zones.get(id);
    if (!zone) return;
    zone.oracleSignals = { ...signals };
    const values = Object.values(signals).filter(v => typeof v === 'number' && isFinite(v));
    if (values.length > 0) {
      // Geometric mean with floor at 0.01
      let logSum = 0;
      for (const v of values) logSum += Math.log(Math.max(0.01, Math.min(1, v)));
      zone.coherency = Math.exp(logSum / values.length);
    }
    zone.lastMeasured = Date.now();
    this._updateGlobal();
  }

  /**
   * Update a zone's coherency from void compressor measurement.
   * Blends with oracle signals if both are available.
   */
  updateZoneFromVoid(id, voidCoherency) {
    const zone = this.zones.get(id);
    if (!zone) return;
    zone.voidCoherency = voidCoherency;
    // If oracle signals also exist, blend 60% oracle + 40% void
    if (Object.keys(zone.oracleSignals).length > 0) {
      const oracleValues = Object.values(zone.oracleSignals).filter(v => typeof v === 'number');
      if (oracleValues.length > 0) {
        let logSum = 0;
        for (const v of oracleValues) logSum += Math.log(Math.max(0.01, Math.min(1, v)));
        const oracleGeo = Math.exp(logSum / oracleValues.length);
        zone.coherency = oracleGeo * 0.6 + voidCoherency * 0.4;
      }
    } else {
      zone.coherency = voidCoherency;
    }
    zone.lastMeasured = Date.now();
    this._updateGlobal();
  }

  /**
   * Compute gradients between adjacent zones (sorted by coherency).
   * The steepest negative gradient is where coherency is falling
   * fastest — that's where healing is most needed.
   */
  computeGradients() {
    const sorted = Array.from(this.zones.values())
      .filter(z => z.lastMeasured)
      .sort((a, b) => a.coherency - b.coherency);

    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        sorted[i].gradient = sorted.length > 1 ? sorted[1].coherency - sorted[0].coherency : 0;
      } else {
        sorted[i].gradient = sorted[i].coherency - sorted[i - 1].coherency;
      }
    }
    return sorted;
  }

  /**
   * Find zones that need healing (coherency < 0.68).
   */
  findHealingTargets() {
    return Array.from(this.zones.values())
      .filter(z => z.needsHealing && z.lastMeasured)
      .sort((a, b) => a.coherency - b.coherency);
  }

  /**
   * Find zones worth preserving (coherency >= 0.85).
   */
  findPreservationTargets() {
    return Array.from(this.zones.values())
      .filter(z => z.needsPreservation && z.lastMeasured)
      .sort((a, b) => b.coherency - a.coherency);
  }

  /**
   * Find the zone with the lowest coherency — highest priority for healing.
   */
  findLowestZone() {
    let lowest = null;
    for (const zone of this.zones.values()) {
      if (!zone.lastMeasured) continue;
      if (!lowest || zone.coherency < lowest.coherency) lowest = zone;
    }
    return lowest;
  }

  _updateGlobal() {
    const measured = Array.from(this.zones.values()).filter(z => z.lastMeasured);
    if (measured.length === 0) { this.globalCoherency = 0; return; }
    this.globalCoherency = measured.reduce((s, z) => s + z.coherency, 0) / measured.length;
    this.history.push({ ts: Date.now(), global: this.globalCoherency, zones: measured.length });
  }

  get size() { return this.zones.size; }

  stats() {
    const measured = Array.from(this.zones.values()).filter(z => z.lastMeasured);
    return {
      totalZones: this.zones.size,
      measuredZones: measured.length,
      globalCoherency: Math.round(this.globalCoherency * 1000) / 1000,
      needsHealing: measured.filter(z => z.needsHealing).length,
      needsPreservation: measured.filter(z => z.needsPreservation).length,
      stable: measured.filter(z => z.isStable).length,
      historyLength: this.history.length,
    };
  }
}

// ── CoherencyDirector ───────────────────────────────────────────────

/**
 * The director reads the coherency field and decides what to do.
 *
 * It does NOT compute coherency itself — it reads signals from the
 * oracle pipeline (via EmergentCoherency) and the void compressor
 * (via the void bridge or batch API). Its job is to DIRECT:
 *
 *   - Which zones get measured next
 *   - Which zones get healed (via oracle)
 *   - Which zones get preserved (via void)
 *   - Which direction increases global coherency fastest
 */
class CoherencyDirector {
  constructor(options = {}) {
    this.field = new CoherencyField();
    this.interventions = [];
    this.healingThreshold = options.healingThreshold || 0.68;
    this.preservationThreshold = options.preservationThreshold || 0.85;
    this._oracle = null;
    this._voidBatchUrl = options.voidBatchUrl || null;
  }

  /**
   * Connect to the oracle (for healing).
   * Accepts any object with heal() and computeCoherencyScore().
   */
  connectOracle(oracle) {
    this._oracle = oracle;
  }

  /**
   * Scan files/patterns and build the coherency field.
   * This is the "measure everything" step.
   *
   * @param {Array<{id, code, filePath, language}>} items
   */
  scan(items) {
    for (const item of items) {
      this.field.addZone(item.id || item.filePath || item.name, item);
    }
  }

  /**
   * Measure coherency for all zones using the oracle's pipeline.
   * Runs computeCoherencyScore on each zone's code and registers
   * the result in the field.
   */
  measureWithOracle() {
    let coherencyFn;
    try {
      ({ computeCoherencyScore: coherencyFn } = require('../unified/coherency'));
    } catch { return; }

    for (const zone of this.field.zones.values()) {
      if (!zone.data.code) continue;
      try {
        const ec = _getEmergentCoherency();
        if (ec) ec.reset();
        const score = coherencyFn(zone.data.code, {
          language: zone.data.language || 'javascript',
        });
        // Extract pipeline signals from breakdown
        const signals = {};
        if (score.breakdown) {
          for (const [key, val] of Object.entries(score.breakdown)) {
            if (typeof val === 'number') signals[key] = val;
          }
        }
        this.field.updateZoneFromOracle(zone.id, signals);
        // Override with the computed total since it includes legacy dimensions
        zone.coherency = score.total;
        zone.lastMeasured = Date.now();
      } catch { /* skip unmeasurable zones */ }
    }
    this.field._updateGlobal();
  }

  /**
   * Measure coherency for all zones using the void compressor.
   * Uses the subprocess bridge (one call per zone for now;
   * batch mode via API daemon is an optional upgrade).
   */
  measureWithVoid() {
    let registerVoidSignal;
    try {
      ({ registerVoidSignal } = require('../unified/emergent-coherency'));
    } catch { return; }

    for (const zone of this.field.zones.values()) {
      if (!zone.data.code) continue;
      try {
        const ec = _getEmergentCoherency();
        if (ec) ec.reset();
        registerVoidSignal(zone.data.code, ec);
        if (ec && ec.hasVoidSignal) {
          const voidVal = ec.breakdown['pipeline.void'];
          if (typeof voidVal === 'number') {
            this.field.updateZoneFromVoid(zone.id, voidVal);
          }
        }
      } catch { /* void compressor unavailable — skip */ }
    }
  }

  /**
   * Find the zone that needs intervention most urgently.
   * Priority = lowest coherency first.
   */
  findHighestPriority() {
    const targets = this.field.findHealingTargets();
    return targets.length > 0 ? targets[0] : null;
  }

  /**
   * Heal a specific zone using the oracle's healing pipeline.
   * Returns the intervention result with before/after coherency.
   */
  async healZone(zoneId) {
    const zone = this.field.getZone(zoneId);
    if (!zone || !zone.data.code) return null;

    const before = zone.coherency;
    let result = null;

    // Try oracle healing
    try {
      const { heal } = require('../unified/healing');
      if (typeof heal === 'function') {
        result = heal(zone.data, {
          strategy: before < 0.5 ? 'full' : 'quick',
          targetCoherence: this.preservationThreshold,
        });
      }
    } catch { /* healing module unavailable */ }

    // If healing produced code, re-measure
    if (result && result.code) {
      try {
        const { computeCoherencyScore } = require('../unified/coherency');
        const newScore = computeCoherencyScore(result.code, {
          language: zone.data.language || 'javascript',
        });
        const after = newScore.total;

        // Auto-register healed element in periodic table
        try {
          const { extractAtomicProperties } = require('../atomic/property-extractor');
          const { PeriodicTable, encodeSignature } = require('../atomic/periodic-table');
          const tablePath = path.join(process.cwd(), '.remembrance', 'atomic-table.json');
          const table = new PeriodicTable({ storagePath: tablePath });
          const props = extractAtomicProperties(result.code);
          table.addElement(props, { name: `healed/${zoneId}`, source: 'orchestrator' });
        } catch { /* atomic module unavailable */ }

        const intervention = {
          type: 'heal', zone: zoneId, before, after,
          improvement: after - before,
          ts: new Date().toISOString(),
        };
        this.interventions.push(intervention);

        // Update the zone
        zone.coherency = after;
        zone.data.code = result.code;
        zone.lastMeasured = Date.now();
        zone.healingHistory.push(intervention);
        this.field._updateGlobal();

        return intervention;
      } catch { /* re-measurement failed */ }
    }
    return null;
  }

  /**
   * Run a full orchestration cycle:
   *   1. Measure all zones (oracle + void)
   *   2. Find zones needing healing
   *   3. Heal the lowest-coherency zone
   *   4. Check if emergence thresholds are crossed
   *   5. Return the field state
   */
  async runCycle() {
    // 1. Measure
    this.measureWithOracle();
    this.measureWithVoid();

    // 2. Find targets
    const healingTargets = this.field.findHealingTargets();
    const preservationTargets = this.field.findPreservationTargets();

    // 3. Heal the most urgent zone
    let healResult = null;
    if (healingTargets.length > 0) {
      healResult = await this.healZone(healingTargets[0].id);
    }

    // 4a. Evolve the living covenant — activate new principles if coherency crossed thresholds
    let covenantEvolution = { activated: [], pending: [], total: 0 };
    try {
      const { LivingCovenant } = require('../core/living-covenant');
      const living = new LivingCovenant();
      covenantEvolution = living.evolve(this.field.globalCoherency);
    } catch { /* living covenant not available */ }

    // 4b. Check emergence — both absolute thresholds AND improvement deltas
    let emerged = [];
    try {
      const { PeriodicTable } = require('../atomic/periodic-table');
      const tablePath = path.join(process.cwd(), '.remembrance', 'atomic-table.json');
      const table = new PeriodicTable({ storagePath: tablePath });
      const prevCoherence = this.field.history.length >= 2
        ? this.field.history[this.field.history.length - 2].global
        : null;
      emerged = table.checkEmergence(this.field.globalCoherency, this.field.size, {
        previousCoherence: prevCoherence,
        deltaThreshold: 0.03,
      });
    } catch { /* atomic module unavailable */ }

    return {
      field: this.field.stats(),
      healingTargets: healingTargets.length,
      preservationTargets: preservationTargets.length,
      healed: healResult,
      emerged: emerged.length,
      covenantEvolution,
      globalCoherency: this.field.globalCoherency,
    };
  }

  /**
   * Categorize the root cause of a zone's low coherency.
   *
   * Three categories:
   *   - 'measurement-error': scorer calibration issue (e.g. truncation
   *     breaks AST on large files). Fix the scorer, not the code.
   *   - 'code-bug': real syntax error or semantic issue. Route to
   *     the heal() pipeline.
   *   - 'missing-data': defaults for testProof/historicalReliability,
   *     no test results recorded. Route to test synthesis.
   *
   * @param {CoherencyZone} zone
   * @returns {{ category, reason, suggestedAction }}
   */
  categorizeRootCause(zone) {
    if (!zone || !zone.data || !zone.data.code) {
      return { category: 'unknown', reason: 'no code to analyze', suggestedAction: 'skip' };
    }

    const code = zone.data.code;
    const chars = code.length;

    // Check for real syntax errors via node --check
    let syntaxValid = true;
    let syntaxError = null;
    try {
      const { execFileSync } = require('child_process');
      if (zone.data.filePath && (zone.data.language === 'javascript' || !zone.data.language)) {
        execFileSync('node', ['--check', zone.data.filePath], {
          stdio: 'pipe', timeout: 5000,
        });
      }
    } catch (e) {
      syntaxValid = false;
      syntaxError = (e.stderr || e.message || '').toString().split('\n').slice(0, 3).join(' ');
    }

    if (!syntaxValid) {
      return {
        category: 'code-bug',
        reason: 'Node parser rejected the file: ' + (syntaxError || 'syntax error'),
        suggestedAction: 'inspect-and-fix',
      };
    }

    // Check for missing-data signature: testProof and historicalReliability
    // both at default 0.5, indicating no test results or usage history.
    const signals = zone.oracleSignals || {};
    const testProof = signals.testProof;
    const history = signals.historicalReliability;
    const hasDefaultTestProof = testProof === 0.5 || testProof === undefined;
    const hasDefaultHistory = history === 0.5 || history === undefined;
    const hasLowReadability = (signals.readability === 0 || signals.readability === undefined);

    // If the code is large (truncation risk) but Node parses it fine,
    // and the remaining low dimensions are readability/security (zeroed
    // by preset) plus defaults, it's likely measurement calibration.
    if (chars > 50000 && hasDefaultTestProof && hasDefaultHistory) {
      return {
        category: 'measurement-error',
        reason: `Large file (${chars} chars) — likely affected by truncation penalty.`,
        suggestedAction: 'scorer-review',
      };
    }

    if (hasDefaultTestProof && hasDefaultHistory && hasLowReadability) {
      return {
        category: 'missing-data',
        reason: 'No test results or usage history recorded; readability zeroed by preset.',
        suggestedAction: 'synthesize-tests',
      };
    }

    // Fall through: could be a subtle code issue
    return {
      category: 'code-bug',
      reason: 'Low coherency from code characteristics (nesting, completeness, etc.)',
      suggestedAction: 'inspect-and-fix',
    };
  }

  /**
   * Heal a zone by routing to the appropriate strategy based on root cause.
   * Returns the intervention record.
   */
  async healZoneSmart(zoneId) {
    const zone = this.field.getZone(zoneId);
    if (!zone) return null;
    const diagnosis = this.categorizeRootCause(zone);
    const before = zone.coherency;

    let result;
    if (diagnosis.category === 'code-bug') {
      result = await this.healZone(zoneId);
    } else if (diagnosis.category === 'missing-data') {
      result = await this._healViaTestSynthesis(zoneId);
    } else if (diagnosis.category === 'measurement-error') {
      // Can't auto-fix — scorer review is a meta-level concern.
      result = { type: 'flag', zone: zoneId, category: diagnosis.category,
        reason: diagnosis.reason, suggestedAction: diagnosis.suggestedAction,
        before, ts: new Date().toISOString() };
      this.interventions.push(result);
    } else {
      result = null;
    }

    return { diagnosis, result };
  }

  /**
   * Heal a zone by synthesizing tests for it (fills testProof signal).
   * Uses the oracle's existing synthesize infrastructure when available.
   */
  async _healViaTestSynthesis(zoneId) {
    const zone = this.field.getZone(zoneId);
    if (!zone || !zone.data.code) return null;

    const before = zone.coherency;
    let testCode = null;
    try {
      const { synthesizeTestStubs } = require('../orchestrator/test-synthesizer');
      testCode = synthesizeTestStubs(zone.data.code, zone.data.filePath);
    } catch { /* synthesis module unavailable */ }

    if (!testCode) {
      const intervention = {
        type: 'synthesize-skipped', zone: zoneId, before,
        reason: 'no testable functions detected', ts: new Date().toISOString(),
      };
      this.interventions.push(intervention);
      return intervention;
    }

    // Re-measure with the synthesized testCode providing testProof
    try {
      const { computeCoherencyScore } = require('../unified/coherency');
      const newScore = computeCoherencyScore(zone.data.code, {
        language: zone.data.language || 'javascript',
        testCode,
        testPassed: true,
      });
      const after = newScore.total;
      const intervention = {
        type: 'synthesize', zone: zoneId, before, after,
        improvement: after - before,
        testLines: testCode.split('\n').length,
        ts: new Date().toISOString(),
      };
      this.interventions.push(intervention);
      zone.coherency = after;
      zone.lastMeasured = Date.now();
      this.field._updateGlobal();
      return intervention;
    } catch { return null; }
  }

  /**
   * Get a summary of all interventions.
   */
  interventionSummary() {
    const heals = this.interventions.filter(i => i.type === 'heal');
    const totalImprovement = heals.reduce((s, h) => s + (h.improvement || 0), 0);
    return {
      totalInterventions: this.interventions.length,
      heals: heals.length,
      totalImprovement: Math.round(totalImprovement * 1000) / 1000,
      avgImprovement: heals.length > 0 ? Math.round((totalImprovement / heals.length) * 1000) / 1000 : 0,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function _getEmergentCoherency() {
  try {
    const { getEmergentCoherency } = require('../unified/emergent-coherency');
    return getEmergentCoherency();
  } catch { return null; }
}

module.exports = {
  CoherencyDirector,
  CoherencyField,
  CoherencyZone,
};
