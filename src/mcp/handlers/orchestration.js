'use strict';
const { quiet } = require('../../core/quiet');

/**
 * mcp/handlers/orchestration.js — swarm, forge, diagnostic, ratchet,
 * ecosystem, reason, meditate and ecosystem_orient. Extracted verbatim
 * from src/mcp/handlers.js in the third monolith decomposition; inline
 * requires and __dirname paths repathed one level deeper, nothing else
 * changed.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { _loadEcosystemDoc, _extractSection } = require('./helpers');

const ORCHESTRATION = {

  // ─── 12. Swarm (multi-agent orchestration) ───
  async oracle_swarm(oracle, args) {
    const action = args.action || 'code';
    const { swarm, swarmCode, swarmReview, swarmHeal, resolveProviders, loadSwarmConfig } = require('../../swarm');

    switch (action) {
      case 'code':
        if (!args.task) throw new Error('task is required for code action');
        return swarmCode(args.task, args.language || 'javascript', {
          rootDir: process.cwd(),
          crossScoring: args.crossScoring,
          oracle,
        });
      case 'review':
        if (!args.code) throw new Error('code is required for review action');
        return swarmReview(args.code, {
          rootDir: process.cwd(),
          language: args.language,
          oracle,
        });
      case 'heal':
        if (!args.code) throw new Error('code is required for heal action');
        return swarmHeal(args.code, {
          rootDir: process.cwd(),
          language: args.language,
          oracle,
        });
      case 'status': {
        const config = loadSwarmConfig(process.cwd()) || {};
        const providers = resolveProviders(config);
        return {
          ready: providers.length >= (config.minAgents || 1),
          providers: providers.length,
          minRequired: config.minAgents || 1,
          crossScoring: config.crossScoring !== false,
          dimensions: (config.dimensions || []).length,
        };
      }
      case 'providers': {
        const config = loadSwarmConfig(process.cwd());
        const available = resolveProviders(config);
        return { available, total: 6 };
      }
      default:
        throw new Error(`Unknown swarm action: ${action}. Use: code, review, heal, status, providers`);
    }
  },


  // ─── 15. Test Forge (auto-generate, run, score tests) ───
  oracle_forge(oracle, args) {
    const { TestForge } = require('../../test-forge');
    const forge = new TestForge(oracle);
    const action = args.action || 'forge';

    switch (action) {
      case 'forge': {
        if (args.id) {
          return forge.forgeTest(args.id, { dryRun: !!args.dryRun });
        }
        return forge.forgeTests({ dryRun: !!args.dryRun, limit: args.limit });
      }
      case 'run':
        return forge.runTests();
      case 'score':
        return forge.scoreTests();
      case 'promote':
        return forge.forgeAndPromote({ limit: args.limit });
      default:
        throw new Error(`Unknown forge action: ${action}. Use: forge, run, score, promote`);
    }
  },


  // ─── Diagnostic, Ratchet, Ecosystem ────────────────────────────────────

  async oracle_diagnostic(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const action = args.action || 'run';
    const scriptPath = path.resolve(__dirname, '../../../scripts/cathedral-diagnostic.js');
    const reportPath = path.resolve(__dirname, '../../../.remembrance/diagnostics/cathedral-latest.json');

    if (action === 'summary') {
      try {
        return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      } catch {
        return { error: 'no diagnostic report yet — run action=run first' };
      }
    }

    const flag = {
      run: [], fix: ['--fix'], 'dry-fix': ['--dry-fix'], 'suggest-suppressions': ['--suggest-suppressions'],
    }[action];
    if (!flag) throw new Error(`Unknown diagnostic action: ${action}`);
    const scriptArgs = [scriptPath, ...flag];
    if (args.path) { scriptArgs.push('--path', args.path); }
    const r = spawnSync(process.execPath, scriptArgs, { encoding: 'utf-8' });
    const stdoutTail = (r.stdout || '').split('\n').slice(-12).join('\n');
    let summary = null;
    try { summary = JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch (_e) { quiet('mcp:handlers:orchestration:spawnSync', _e);}
    return {
      action,
      exitCode: r.status,
      summary: summary ? {
        generatedAt: summary.generatedAt,
        filesScanned: summary.filesScanned,
        totalFindings: summary.summary?.totalFindings,
        bySeverity: summary.summary?.bySeverity,
        bySource: summary.summary?.bySource,
        fixesApplied: summary.fixes?.applied,
      } : null,
      tail: stdoutTail,
    };
  },


  async oracle_ratchet(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const action = args.action || 'check';
    const scriptPath = path.resolve(__dirname, '../../../scripts/covenant-ratchet.js');
    const cliArgs = [scriptPath, '--json'];
    if (action === 'save-baseline') cliArgs.push('--save-baseline');
    if (typeof args.tolerance === 'number') cliArgs.push('--tolerance', String(args.tolerance));
    const r = spawnSync(process.execPath, cliArgs, { encoding: 'utf-8' });
    let parsed = null;
    try { parsed = JSON.parse(r.stdout || '{}'); } catch { parsed = { raw: r.stdout }; }
    return { action, exitCode: r.status, result: parsed };
  },


  async oracle_ecosystem(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const action = args.action || 'run';
    const diagScript = path.resolve(__dirname, '../../../scripts/ecosystem-diagnostic.js');
    const ratchetScript = path.resolve(__dirname, '../../../scripts/ecosystem-ratchet.js');
    const reportPath = path.resolve(__dirname, '../../../.remembrance/diagnostics/ecosystem-latest.json');
    const parent = args.parent || path.resolve(__dirname, '../../../..');

    const loadReport = () => {
      try { return JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch { return null; }
    };

    if (action === 'summary') {
      const r = loadReport();
      if (!r) return { error: 'no ecosystem report yet — run action=run first' };
      return {
        generatedAt: r.generatedAt,
        totalRepos: r.repos.length,
        foundRepos: r.repos.filter((x) => x.found).length,
        totalFindings: r.repos.reduce((s, x) => s + (x.counts?.findings ?? 0), 0),
        totalGaps: r.repos.reduce((s, x) => s + (x.wiringGaps?.length ?? 0), 0),
        perRepo: r.repos.map((x) => ({
          repo: x.repo,
          found: x.found,
          findings: x.counts?.findings ?? 0,
          high: x.bySeverity?.high ?? 0,
          wiringGaps: x.wiringGaps ?? [],
        })),
      };
    }

    if (action === 'gaps') {
      const r = loadReport();
      if (!r) return { error: 'no ecosystem report yet' };
      const gaps = [];
      for (const repo of r.repos) {
        if (!repo.found || !repo.wiringGaps?.length) continue;
        for (const g of repo.wiringGaps) gaps.push({ repo: repo.repo, primitive: g });
      }
      return { totalGaps: gaps.length, gaps };
    }

    if (action === 'run') {
      const res = spawnSync(process.execPath, [diagScript, '--parent', parent], { encoding: 'utf-8' });
      return { action, exitCode: res.status, summary: loadReport() ? {
        generatedAt: loadReport().generatedAt,
        totalGaps: loadReport().repos.reduce((s, x) => s + (x.wiringGaps?.length ?? 0), 0),
      } : null, tail: (res.stdout || '').split('\n').slice(-12).join('\n') };
    }

    if (action === 'save-baseline') {
      const res = spawnSync(process.execPath, [ratchetScript, '--save-baseline'], { encoding: 'utf-8' });
      return { action, exitCode: res.status, stdout: res.stdout };
    }

    if (action === 'ratchet') {
      const res = spawnSync(process.execPath, [ratchetScript, '--json'], { encoding: 'utf-8' });
      let parsed = null;
      try { parsed = JSON.parse(res.stdout || '{}'); } catch { parsed = { raw: res.stdout }; }
      return { action, exitCode: res.status, result: parsed };
    }

    throw new Error(`Unknown ecosystem action: ${action}`);
  },


  // ─── oracle_reason ───
  // Cross-pattern abstract reasoning. Wraps src/core/abstract-reasoning.reason()
  // which returns analogies, metaphors, conceptual bridges, and identity matches
  // for a source pattern across a cascade of matches.
  oracle_reason: async (oracle, args) => {
    const { reason } = require('../../core/abstract-reasoning');
    const { sourcePattern, cascadeMatches } = args || {};
    if (!sourcePattern || typeof sourcePattern !== 'object') {
      throw new Error('oracle_reason: sourcePattern is required');
    }
    if (!Array.isArray(cascadeMatches)) {
      throw new Error('oracle_reason: cascadeMatches must be an array');
    }
    const report = reason(cascadeMatches, sourcePattern);
    return {
      sourcePattern: { name: sourcePattern.name },
      cascadeCount: cascadeMatches.length,
      report,
    };
  },


  // ─── oracle_meditate ───
  // Single tick of the auto-improvement loop: discover gaps, propose fills,
  // validate each. Bounded by maxProposals to prevent runaway compute.
  // Output is advisory — proposals stay 'pending' unless autoApprove is set
  // and the global coherency exceeds the autonomous-mode threshold.
  oracle_meditate: async (oracle, args) => {
    const { SelfImprovementEngine, APPROVAL_THRESHOLDS } = require('../../orchestrator/self-improvement');
    const { PeriodicTable } = require('../../atomic/periodic-table');
    const maxProposals = (args && Number.isInteger(args.maxProposals)) ? args.maxProposals : 3;
    const autoApprove = !!(args && args.autoApprove);

    const table = new PeriodicTable();
    const engine = new SelfImprovementEngine({ maxProposals });
    const result = await engine.discoverAndPropose({ table });

    let approved = [];
    if (autoApprove && Array.isArray(result.proposals)) {
      const mode = engine.getApprovalMode(result.globalCoherency || 0);
      if (mode === 'autonomous') {
        for (const p of result.proposals) {
          const r = engine.approve(p.id, table);
          if (!r.error) approved.push(p.id);
        }
      }
    }

    return {
      gapsFound: result.gapsFound || 0,
      proposalsGenerated: (result.proposals || []).length,
      proposals: (result.proposals || []).map((p) => ({
        id: p.id,
        gap: p.gap,
        coherency: p.coherency,
        status: p.status,
      })),
      autoApproved: approved,
      globalCoherency: result.globalCoherency || null,
    };
  },


  // ─── ecosystem_orient: return canonical 12-repo protocol on demand ───
  ecosystem_orient(_oracle, args) {
    const doc = _loadEcosystemDoc();
    if (!doc) {
      return {
        error: 'ECOSYSTEM.md not found at repo root. The hub is misconfigured — re-run the propagation script.',
        canonicalUrl: 'https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md',
      };
    }
    const format = (args && args.format) || 'full';
    const hash = crypto.createHash('sha256').update(doc).digest('hex').slice(0, 16);
    const base = {
      canonicalHash: hash,
      canonicalUrl: 'https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md',
      acknowledgement: 'Read ECOSYSTEM.md. Will run audit → reflect → covenant → swarm → substrate → ledger per change.',
      workflowSteps: [
        'a. oracle audit check / oracle reflect / oracle covenant / oracle security-scan / oracle risk-score (must return SEALED 15/15)',
        'b. oracle debug capture (record fix as pattern in quantum field)',
        'c. Reflector-oracle- reflect (independent cross-validation)',
        'd. REMEMBRANCE-AGENT-Swarm- review (for multi-file or >50 LoC changes)',
        'e. Void-Data-Compressor absorb (compress reusable patterns into substrate)',
        'f. REMEMBRANCE-BLOCKCHAIN publish (covenant-sealed changes get logged)',
        'g. git commit + push (only after a-f succeed)',
      ],
    };
    if (format === 'checklist') {
      return { ...base, section: _extractSection(doc, '## 2.') };
    }
    if (format === 'topology') {
      return { ...base, section: _extractSection(doc, '## 1.') };
    }
    return { ...base, document: doc };
  },
};

module.exports = { ORCHESTRATION };
