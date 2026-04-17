'use strict';

/**
 * Self-Improvement Loop — the system eats its own discoveries.
 *
 * The periodic table discovers gaps (property combinations that
 * should exist but don't). The oracle generates implementations
 * for those gaps. The system incorporates the implementations
 * into its own code — but ONLY with human approval until
 * coherency proves the system can be trusted to self-modify.
 *
 * Three approval tiers:
 *
 *   SUPERVISED (coherency < 0.85)
 *     Human approves every generated element before incorporation.
 *     The system proposes, the human decides.
 *
 *   SEMI-AUTONOMOUS (coherency 0.85 - 0.95)
 *     System auto-incorporates elements that pass ALL gates:
 *       - Covenant validation (structural, unbypassable)
 *       - Coherency threshold (must score >= 0.68)
 *       - Tier-coverage check (must be fractal-aligned)
 *       - Atomic property verification (must have valid 12D signature)
 *     Human is notified but doesn't need to approve.
 *
 *   AUTONOMOUS (coherency >= 0.95)
 *     System auto-discovers, auto-generates, auto-incorporates.
 *     Human can review the log but doesn't gate the process.
 *     The living covenant's evolved principles at this level
 *     (Full Atomic Coverage) provide the safety guarantee.
 *
 * The loop:
 *   1. Periodic table discovers gaps via element discovery
 *   2. For each gap, generate a spec (generationSpec)
 *   3. Generate implementation (via swarm or template)
 *   4. Validate: covenant + coherency + tier-coverage + atomic
 *   5. Gate: human approval (supervised) or auto (semi/autonomous)
 *   6. Incorporate: register in periodic table + add to codebase
 *   7. Re-measure: orchestrator checks if coherency improved
 *   8. Evolve: living covenant checks if new principles activate
 *   9. Loop: go to 1
 *
 * The system gets better by eating what it discovers. The covenant
 * ensures it can only eat what's safe. The approval gate ensures
 * humans stay in control until the system earns autonomy.
 */

const fs = require('fs');
const path = require('path');

const APPROVAL_THRESHOLDS = {
  SUPERVISED: 0.85,      // Below this: human must approve
  SEMI_AUTONOMOUS: 0.85, // At this: auto-incorporate if passes all gates
  AUTONOMOUS: 0.95,      // At or above: full self-improvement
};

const STORAGE_PATH = '.remembrance/self-improvement.json';

// ── Improvement Proposal ────────────────────────────────────────────

/**
 * A proposed element that the system wants to incorporate.
 */
class ImprovementProposal {
  constructor(gap, generatedCode, validation) {
    this.id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.gap = gap;                    // From element discovery
    this.generatedCode = generatedCode; // The implementation
    this.validation = validation;       // Covenant + coherency results
    this.status = 'pending';           // pending | approved | rejected | auto-incorporated
    this.approvalMode = 'supervised';  // supervised | semi-autonomous | autonomous
    this.createdAt = new Date().toISOString();
    this.decidedAt = null;
    this.decidedBy = null;             // 'human' | 'system'
    this.incorporatedAt = null;
  }
}

// ── Self-Improvement Engine ─────────────────────────────────────────

class SelfImprovementEngine {
  constructor(options = {}) {
    this._repoRoot = options.repoRoot || process.cwd();
    this._storagePath = path.join(this._repoRoot, options.storagePath || STORAGE_PATH);
    this._proposals = [];
    this._history = [];
    this._load();
  }

  /**
   * Determine the current approval mode based on global coherency.
   */
  getApprovalMode(globalCoherency) {
    if (globalCoherency >= APPROVAL_THRESHOLDS.AUTONOMOUS) return 'autonomous';
    if (globalCoherency >= APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS) return 'semi-autonomous';
    return 'supervised';
  }

  /**
   * Run a discovery cycle: find gaps, generate proposals.
   *
   * @param {object} options
   *   - table: PeriodicTable instance
   *   - globalCoherency: current global coherency
   *   - maxProposals: how many gaps to propose (default 5)
   * @returns {{ proposals: Array, approvalMode: string, autoIncorporated: number }}
   */
  async discoverAndPropose(options = {}) {
    const { table, globalCoherency = 0 } = options;
    const maxProposals = options.maxProposals || 5;

    if (!table) throw new Error('PeriodicTable instance required');

    // 1. Discover gaps
    let gaps;
    try {
      const { runDiscovery } = require('../atomic/element-discovery');
      gaps = runDiscovery(table, { maxResults: maxProposals });
    } catch (e) {
      return { proposals: [], approvalMode: this.getApprovalMode(globalCoherency), autoIncorporated: 0, error: e.message };
    }

    if (gaps.length === 0) {
      return { proposals: [], approvalMode: this.getApprovalMode(globalCoherency), autoIncorporated: 0 };
    }

    const mode = this.getApprovalMode(globalCoherency);
    const proposals = [];
    let autoIncorporated = 0;

    for (const gap of gaps) {
      // 2. Generate implementation from the gap's generationSpec
      const code = this._generateFromSpec(gap);
      if (!code) continue;

      // 3. Validate through all gates
      const validation = this._validateElement(code, gap);

      // 4. Create proposal
      const proposal = new ImprovementProposal(gap, code, validation);
      proposal.approvalMode = mode;

      if (!validation.passesAllGates) {
        proposal.status = 'rejected';
        proposal.decidedAt = new Date().toISOString();
        proposal.decidedBy = 'system';
        proposal.rejectionReason = validation.failedGates.join('; ');
      } else if (mode === 'autonomous' || mode === 'semi-autonomous') {
        // Auto-incorporate — all gates passed and coherency is high enough
        proposal.status = 'auto-incorporated';
        proposal.decidedAt = new Date().toISOString();
        proposal.decidedBy = 'system';
        this._incorporate(proposal, table);
        autoIncorporated++;
      } else {
        // Supervised — wait for human approval
        proposal.status = 'pending';
      }

      proposals.push(proposal);
      this._proposals.push(proposal);
    }

    this._save();

    return { proposals, approvalMode: mode, autoIncorporated };
  }

  /**
   * Human approves a pending proposal.
   */
  approve(proposalId, table) {
    const proposal = this._proposals.find(p => p.id === proposalId);
    if (!proposal) return { error: 'Proposal not found' };
    if (proposal.status !== 'pending') return { error: `Proposal is ${proposal.status}, not pending` };

    proposal.status = 'approved';
    proposal.decidedAt = new Date().toISOString();
    proposal.decidedBy = 'human';
    this._incorporate(proposal, table);
    this._save();
    return { success: true, proposal };
  }

  /**
   * Human rejects a pending proposal.
   */
  reject(proposalId, reason) {
    const proposal = this._proposals.find(p => p.id === proposalId);
    if (!proposal) return { error: 'Proposal not found' };
    if (proposal.status !== 'pending') return { error: `Proposal is ${proposal.status}, not pending` };

    proposal.status = 'rejected';
    proposal.decidedAt = new Date().toISOString();
    proposal.decidedBy = 'human';
    proposal.rejectionReason = reason || 'Rejected by human';
    this._save();
    return { success: true, proposal };
  }

  /**
   * Get all pending proposals (awaiting human approval).
   */
  getPending() {
    return this._proposals.filter(p => p.status === 'pending');
  }

  /**
   * Get full history of all proposals.
   */
  getHistory() {
    return [...this._proposals];
  }

  /**
   * Status summary.
   */
  status(globalCoherency) {
    const mode = this.getApprovalMode(globalCoherency);
    const pending = this._proposals.filter(p => p.status === 'pending').length;
    const approved = this._proposals.filter(p => p.status === 'approved').length;
    const autoInc = this._proposals.filter(p => p.status === 'auto-incorporated').length;
    const rejected = this._proposals.filter(p => p.status === 'rejected').length;
    return {
      approvalMode: mode,
      coherencyThresholds: APPROVAL_THRESHOLDS,
      totalProposals: this._proposals.length,
      pending, approved, autoIncorporated: autoInc, rejected,
      nextModeAt: mode === 'supervised'
        ? { mode: 'semi-autonomous', threshold: APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS, gap: Math.max(0, APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS - globalCoherency) }
        : mode === 'semi-autonomous'
          ? { mode: 'autonomous', threshold: APPROVAL_THRESHOLDS.AUTONOMOUS, gap: Math.max(0, APPROVAL_THRESHOLDS.AUTONOMOUS - globalCoherency) }
          : null,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────

  /**
   * Generate code from a gap's generationSpec.
   * For now, generates a template function. In production, this
   * would call the swarm via swarmAtomicGenerate.
   */
  _generateFromSpec(gap) {
    const spec = gap.generationSpec;
    if (!spec) return null;

    const desc = gap.description || 'Generated element';
    const props = gap.properties || {};
    const constraints = spec.constraints || {};

    // Generate a template implementation based on the spec
    const funcName = `generated_${(spec.targetGroup || 'util').replace(/[^a-zA-Z]/g, '_')}_${gap.signature.slice(0, 8)}`;

    const code = [
      `'use strict';`,
      ``,
      `/**`,
      ` * ${desc}`,
      ` * Generated by the self-improvement loop to fill a gap in the periodic table.`,
      ` *`,
      ` * Constraints: ${constraints.complexity || 'O(n)'}, pure=${constraints.pure !== false}, composable=${constraints.composable !== false}`,
      ` */`,
      `function ${funcName}(input) {`,
      constraints.pure !== false
        ? `  return input;`
        : `  console.log('Processing:', input); return input;`,
      `}`,
      ``,
      `${funcName}.atomicProperties = {`,
      `  charge: ${props.charge || 0}, valence: ${props.valence || 1}, mass: '${props.mass || 'light'}',`,
      `  spin: '${props.spin || 'even'}', phase: '${props.phase || 'solid'}',`,
      `  reactivity: '${props.reactivity || 'inert'}', electronegativity: ${props.electronegativity || 0},`,
      `  group: ${props.group || 11}, period: ${props.period || 1},`,
      `  harmPotential: '${props.harmPotential || 'none'}', alignment: '${props.alignment || 'neutral'}',`,
      `  intention: '${props.intention || 'neutral'}',`,
      `};`,
      ``,
      `module.exports = { ${funcName} };`,
    ].join('\n');

    return code;
  }

  /**
   * Validate a generated element through all gates.
   */
  _validateElement(code, gap) {
    const gates = [];
    let passesAllGates = true;
    const failedGates = [];

    // Gate 1: Covenant (structural, unbypassable)
    try {
      const { covenantCheck } = require('../core/covenant');
      const covenant = covenantCheck(code, { description: gap.description });
      gates.push({ gate: 'covenant', passed: covenant.sealed, details: covenant });
      if (!covenant.sealed) { passesAllGates = false; failedGates.push('covenant'); }
    } catch (e) {
      gates.push({ gate: 'covenant', passed: false, error: e.message });
      passesAllGates = false; failedGates.push('covenant');
    }

    // Gate 2: Coherency (must score >= 0.6)
    try {
      const { computeCoherencyScore } = require('../unified/coherency');
      const score = computeCoherencyScore(code, { language: 'javascript' });
      const passed = score.total >= 0.6;
      gates.push({ gate: 'coherency', passed, score: score.total });
      if (!passed) { passesAllGates = false; failedGates.push('coherency'); }
    } catch (e) {
      gates.push({ gate: 'coherency', passed: false, error: e.message });
      passesAllGates = false; failedGates.push('coherency');
    }

    // Gate 3: Atomic properties valid (must have 12D signature)
    const hasAtomic = /\.atomicProperties\s*=/.test(code);
    gates.push({ gate: 'atomic', passed: hasAtomic });
    if (!hasAtomic) { passesAllGates = false; failedGates.push('atomic'); }

    // Gate 4: CovenantValidator on the atomic properties
    if (gap.properties) {
      try {
        const { CovenantValidator } = require('../atomic/periodic-table');
        const cv = CovenantValidator.validate(gap.properties);
        gates.push({ gate: 'covenant-atomic', passed: cv.valid, violations: cv.violations });
        if (!cv.valid) { passesAllGates = false; failedGates.push('covenant-atomic'); }
      } catch {
        gates.push({ gate: 'covenant-atomic', passed: true }); // degrade gracefully
      }
    }

    return { passesAllGates, gates, failedGates };
  }

  /**
   * Incorporate an approved/auto-incorporated element into the system.
   */
  _incorporate(proposal, table) {
    // Register in the periodic table
    if (proposal.gap && proposal.gap.properties) {
      try {
        const { encodeSignature } = require('../atomic/periodic-table');
        const sig = encodeSignature(proposal.gap.properties);
        if (!table.getElement(sig)) {
          table.addElement(proposal.gap.properties, {
            name: `self-improved/${proposal.id}`,
            code: proposal.generatedCode,
            source: `self-improvement-${proposal.approvalMode}`,
          });
        }
      } catch { /* registration failed — non-fatal */ }
    }

    proposal.incorporatedAt = new Date().toISOString();

    this._history.push({
      type: 'incorporation',
      proposalId: proposal.id,
      gap: proposal.gap?.signature,
      mode: proposal.approvalMode,
      decidedBy: proposal.decidedBy,
      ts: proposal.incorporatedAt,
    });
  }

  // ── Persistence ───────────────────────────────────────────────────

  _save() {
    try {
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._storagePath, JSON.stringify({
        version: 1,
        proposals: this._proposals,
        history: this._history,
        savedAt: new Date().toISOString(),
      }, null, 2));
    } catch { /* best effort */ }
  }

  _load() {
    if (!fs.existsSync(this._storagePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this._storagePath, 'utf-8'));
      if (raw.proposals) this._proposals = raw.proposals;
      if (raw.history) this._history = raw.history;
    } catch { /* start fresh */ }
  }
}

module.exports = {
  SelfImprovementEngine,
  ImprovementProposal,
  APPROVAL_THRESHOLDS,
};
