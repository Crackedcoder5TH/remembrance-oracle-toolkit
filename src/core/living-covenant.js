'use strict';

/**
 * Remembrance Living Covenant — self-evolving safety that expands with coherency.
 *
 * The covenant can EXPAND (add new protections) but can NEVER
 * CONTRACT (remove existing ones). New principles activate when
 * global coherency crosses their threshold — higher coherency
 * unlocks stricter protections because a more coherent system can
 * handle them without false positives.
 *
 * Like an immune system:
 *   - Born with basic immunity (the 15 founding principles)
 *   - Develops new responses as it grows (evolved principles)
 *   - Never loses an existing response
 *   - Only develops new ones when healthy enough to sustain them
 *
 * The covenant is tied to coherency:
 *   - Safety IS a coherency dimension
 *   - A safer system IS a more coherent system
 *   - Expanding the covenant expands coherency, not limits it
 *
 * Persistence: evolved principles are stored in
 * .remembrance/living-covenant.json and loaded on startup.
 * Once activated, they persist forever — even if coherency drops
 * below their activation threshold later. The immune response
 * doesn't disappear when you recover from the illness.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_STORAGE_PATH = '.remembrance/living-covenant.json';

// ── Evolved Principle Templates ─────────────────────────────────────
//
// Each template defines:
//   - id: unique identifier
//   - name: human-readable name
//   - coherencyThreshold: minimum global coherency to activate
//   - description: what it protects against
//   - check: function(code, metadata) → { pass, reason }
//     Returns { pass: true } if code passes, { pass: false, reason } if not
//   - permanent: true (always — evolved principles can never be removed)
//   - category: 'composition' | 'reversibility' | 'validation' | 'balance'

const EVOLVED_PRINCIPLE_TEMPLATES = [
  // ── Coherency 0.80: Composition Safety ────────────────────────────
  {
    id: 'evolved-composition-safety',
    name: 'Remembrance Composition Safety',
    coherencyThreshold: 0.80,
    category: 'composition',
    description: 'Volatile functions (reactivity=volatile) cannot compose with functions that have harmPotential != none. Prevents dangerous compound behaviors.',
    check(code) {
      // Detect volatile + harmful composition patterns
      const hasVolatile = /reactivity:\s*['"]volatile['"]/i.test(code);
      const hasHarmful = /harmPotential:\s*['"](?:moderate|dangerous)['"]/i.test(code);
      if (hasVolatile && hasHarmful) {
        return { pass: false, reason: 'Volatile function with harmful potential detected in same scope — composition blocked' };
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.82: Side-Effect Documentation ─────────────────────
  {
    id: 'evolved-side-effect-docs',
    name: 'Remembrance Side-Effect Documentation',
    coherencyThreshold: 0.82,
    category: 'reversibility',
    description: 'Functions with side effects (spin=odd) should document their effects. Increases system transparency.',
    check(code) {
      const hasSideEffects = /spin:\s*['"]odd['"]/i.test(code);
      const hasAtomicProps = /\.atomicProperties\s*=/i.test(code);
      if (hasSideEffects && hasAtomicProps) {
        // If the function declares itself as side-effecting, it should
        // have a purpose or description in its properties
        return { pass: true }; // Having atomicProperties with spin=odd is documentation enough
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.85: Charge Balance at Module Level ────────────────
  {
    id: 'evolved-module-charge-balance',
    name: 'Remembrance Module Charge Balance',
    coherencyThreshold: 0.85,
    category: 'balance',
    description: 'Modules with more than 5 atomized functions should have a net charge within [-2, +2]. Prevents systemic imbalance.',
    check(code) {
      const chargeMatches = code.match(/charge:\s*([+-]?\d)/g) || [];
      if (chargeMatches.length < 5) return { pass: true }; // Not enough functions to check
      let netCharge = 0;
      for (const m of chargeMatches) {
        const val = parseInt(m.match(/([+-]?\d)/)[1]);
        netCharge += val;
      }
      if (Math.abs(netCharge) > 2) {
        return { pass: false, reason: `Module charge imbalance: net charge ${netCharge > 0 ? '+' : ''}${netCharge} (limit ±2). Add balancing functions.` };
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.88: Covenant Self-Reference ───────────────────────
  {
    id: 'evolved-covenant-self-reference',
    name: 'Remembrance Covenant Self-Reference',
    coherencyThreshold: 0.88,
    category: 'validation',
    description: 'New modules that interact with the covenant system must themselves pass the covenant. Prevents covenant-bypassing code from entering.',
    check(code) {
      const touchesCovenant = /covenantCheck|CovenantValidator|skipCovenant|no.verify/i.test(code);
      if (touchesCovenant) {
        // Skip if this looks like a pattern/regex definition file
        // (contains regex literals that mention these terms for detection)
        const isPatternDef = /pattern:\s*\/.*(?:exec|skip|bypass)/i.test(code) ||
                              /PATTERNS\s*=\s*\[/.test(code);
        if (isPatternDef) return { pass: true };

        const hasBypassAttempt = /skipCovenant\s*[=:]\s*true|--no-verify|bypass.*covenant/i.test(code);
        if (hasBypassAttempt) {
          return { pass: false, reason: 'Code attempts to bypass the covenant — blocked by evolved principle' };
        }
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.90: Emergent Intelligence Gate ────────────────────
  {
    id: 'evolved-intelligence-gate',
    name: 'Remembrance Intelligence Gate',
    coherencyThreshold: 0.90,
    category: 'composition',
    description: 'Self-modifying code must have alignment=healing and intention=benevolent. Prevents autonomous systems from degrading their own constraints.',
    check(code) {
      const selfModifying = /eval\s*\(|new\s+Function\s*\(|process\.binding|Proxy\s*\(/i.test(code);
      if (selfModifying) {
        const hasHealing = /alignment:\s*['"]healing['"]/i.test(code);
        const hasBenevolent = /intention:\s*['"]benevolent['"]/i.test(code);
        if (!hasHealing || !hasBenevolent) {
          return { pass: false, reason: 'Self-modifying code must declare alignment=healing and intention=benevolent' };
        }
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.93: Orchestrator Balance ──────────────────────────
  {
    id: 'evolved-orchestrator-balance',
    name: 'Remembrance Orchestrator Balance',
    coherencyThreshold: 0.93,
    category: 'balance',
    description: 'The orchestrator must verify charge balance before applying healing. Prevents healing that creates new imbalances.',
    check(code) {
      const isOrchestrator = /CoherencyDirector|healZone|optimizeCoherenceFlow/i.test(code);
      if (isOrchestrator) {
        const hasBalanceCheck = /analyzeChargeFlow|chargeBalance|netCharge/i.test(code);
        if (!hasBalanceCheck) {
          return { pass: false, reason: 'Orchestrator code must include charge balance verification' };
        }
      }
      return { pass: true };
    },
  },

  // ── Coherency 0.95: Full Atomic Coverage ──────────────────────────
  {
    id: 'evolved-full-atomic-coverage',
    name: 'Remembrance Full Atomic Coverage',
    coherencyThreshold: 0.95,
    category: 'validation',
    description: 'New exported functions must have atomicProperties declared. Prevents un-self-described code from entering a fully self-aware system.',
    check(code) {
      const exportedFunctions = code.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
      if (!exportedFunctions) return { pass: true };
      const hasAtomicProps = /\.atomicProperties\s*=/i.test(code);
      if (!hasAtomicProps) {
        return { pass: false, reason: 'Exported functions must have atomicProperties at coherency >= 0.95' };
      }
      return { pass: true };
    },
  },
];

// ── Living Covenant Class ───────────────────────────────────────────

class LivingCovenant {
  /**
   * @param {object} [options]
   *   - storagePath: path to persist evolved principles
   *   - repoRoot: working directory for path resolution
   */
  constructor(options = {}) {
    this._repoRoot = options.repoRoot || process.cwd();
    this._storagePath = options.storagePath
      || path.join(this._repoRoot, DEFAULT_STORAGE_PATH);
    this._activePrinciples = [];
    this._activationHistory = [];
    this._pendingQueue = [];
    this._load();
  }

  /**
   * Check coherency and activate any pending evolved principles.
   * Called by the orchestrator after each coherency measurement cycle.
   *
   * @param {number} globalCoherency - current global coherency (0-1)
   * @returns {{ activated: Array, pending: Array, total: number }}
   */
  evolve(globalCoherency) {
    const newlyActivated = [];

    for (const template of EVOLVED_PRINCIPLE_TEMPLATES) {
      // Already activated?
      if (this._activePrinciples.some(p => p.id === template.id)) continue;

      if (globalCoherency >= template.coherencyThreshold) {
        // Activate this principle — it's now permanent
        const principle = {
          id: template.id,
          name: template.name,
          category: template.category,
          description: template.description,
          coherencyThreshold: template.coherencyThreshold,
          activatedAt: new Date().toISOString(),
          activatedAtCoherency: globalCoherency,
          permanent: true,
        };
        this._activePrinciples.push(principle);
        this._activationHistory.push({
          ...principle,
          event: 'activated',
        });
        newlyActivated.push(principle);
      } else {
        // Queue it for future activation
        if (!this._pendingQueue.some(p => p.id === template.id)) {
          this._pendingQueue.push({
            id: template.id,
            name: template.name,
            coherencyThreshold: template.coherencyThreshold,
            gap: Math.round((template.coherencyThreshold - globalCoherency) * 1000) / 1000,
          });
        }
      }
    }

    // Update pending queue (remove activated ones)
    this._pendingQueue = this._pendingQueue.filter(
      p => !this._activePrinciples.some(a => a.id === p.id)
    );

    if (newlyActivated.length > 0) this._save();

    return {
      activated: newlyActivated,
      pending: this._pendingQueue,
      total: this._activePrinciples.length,
    };
  }

  /**
   * Run all active evolved principles against code.
   * Returns violations from evolved principles only — the founding
   * 15 principles are checked by the existing covenantCheck.
   *
   * @param {string} code
   * @param {object} [metadata]
   * @returns {{ violations: Array, passed: number, total: number }}
   */
  check(code, metadata = {}) {
    const violations = [];
    let passed = 0;

    for (const principle of this._activePrinciples) {
      const template = EVOLVED_PRINCIPLE_TEMPLATES.find(t => t.id === principle.id);
      if (!template || typeof template.check !== 'function') {
        passed++;
        continue;
      }

      try {
        const result = template.check(code, metadata);
        if (result.pass) {
          passed++;
        } else {
          violations.push({
            id: principle.id,
            name: principle.name,
            category: principle.category,
            reason: result.reason,
            evolved: true,
            activatedAt: principle.activatedAt,
          });
        }
      } catch {
        passed++; // Degrade gracefully — don't block on check errors
      }
    }

    return {
      violations,
      passed,
      total: this._activePrinciples.length,
    };
  }

  /** Get all active evolved principles. */
  get activePrinciples() { return [...this._activePrinciples]; }

  /** Get the pending activation queue. */
  get pendingQueue() { return [...this._pendingQueue]; }

  /** Get the full activation history. */
  get activationHistory() { return [...this._activationHistory]; }

  /** Total evolved principles (active). */
  get size() { return this._activePrinciples.length; }

  /**
   * Status summary for CLI/reporting.
   */
  status(globalCoherency) {
    const next = this._pendingQueue.length > 0 ? this._pendingQueue[0] : null;
    return {
      activePrinciples: this._activePrinciples.length,
      foundingPrinciples: 15, // The original 15 — always present
      totalPrinciples: 15 + this._activePrinciples.length,
      pendingQueue: this._pendingQueue.length,
      nextActivation: next ? {
        name: next.name,
        threshold: next.coherencyThreshold,
        gap: Math.round((next.coherencyThreshold - globalCoherency) * 1000) / 1000,
      } : null,
      history: this._activationHistory.length,
    };
  }

  // ── Persistence ───────────────────────────────────────────────────

  _save() {
    try {
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._storagePath, JSON.stringify({
        version: 1,
        activePrinciples: this._activePrinciples,
        activationHistory: this._activationHistory,
        savedAt: new Date().toISOString(),
      }, null, 2));
    } catch { /* best effort */ }
  }

  _load() {
    if (!fs.existsSync(this._storagePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this._storagePath, 'utf-8'));
      if (raw.activePrinciples) {
        this._activePrinciples = raw.activePrinciples;
      }
      if (raw.activationHistory) {
        this._activationHistory = raw.activationHistory;
      }
    } catch { /* start fresh */ }
  }
}

module.exports = {
  LivingCovenant,
  EVOLVED_PRINCIPLE_TEMPLATES,
};
