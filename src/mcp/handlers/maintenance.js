'use strict';

/**
 * mcp/handlers/maintenance.js — debug, sync, harvest, maintain, healing
 * (lineage) and the unified heal pipeline. Extracted verbatim from
 * src/mcp/handlers.js in the third monolith decomposition. oracle_heal's
 * write-back of healed source now rides the covenant gate (sealed below)
 * instead of a file-level exemption.
 */

const path = require('path');
const fs = require('fs');

// oracle_heal's opt-in write-back replaces a source file with its healed form — a real mutation, so it rides the covenant gate like every other write in this codebase.
const { createGate, requireGate } = require('../../core/covenant-fractal');
const _writeHealed = requireGate((gate, file, source) => fs.writeFileSync(file, source, 'utf-8'));
const _sealedGate = () => createGate().seal({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2, harmPotential: 'none', alignment: 'neutral', intention: 'benevolent', domain: 'healing' });

const MAINTENANCE = {

  // ─── 7. Debug (unified) ───
  oracle_debug(oracle, args) {
    const action = args.action || 'stats';
    switch (action) {
      case 'capture':
        return oracle.debugCapture({
          errorMessage: args.errorMessage,
          stackTrace: args.stackTrace || '',
          fixCode: args.fixCode,
          fixDescription: args.fixDescription || '',
          language: args.language || 'javascript',
          tags: args.tags || [],
        });
      case 'search':
        return oracle.debugSearch({
          errorMessage: args.errorMessage,
          stackTrace: args.stackTrace || '',
          language: args.language,
          limit: args.limit || 5,
          federated: args.federated !== false,
        });
      case 'feedback':
        return oracle.debugFeedback(args.id, args.resolved);
      case 'stats':
        return oracle.debugStats();
      case 'grow':
        return oracle.debugGrow({ limit: args.limit });
      case 'patterns':
        return oracle.debugPatterns({
          language: args.language,
          errorClass: args.errorClass,
        });
      case 'decohere':
        return oracle.debugDecohereSweep({
          maxDays: args.maxDays || 180,
        });
      case 'reexcite':
        if (!args.id) throw new Error('id is required for reexcite action');
        return oracle.debugReexcite(args.id);
      case 'entanglement':
        if (!args.id) throw new Error('id is required for entanglement action');
        return oracle.debugEntanglementGraph(args.id, args.depth || 2);
      case 'field': {
        const fieldStats = oracle.debugStats();
        return { ...fieldStats, view: 'quantum-field' };
      }
      default:
        throw new Error(`Unknown debug action: ${action}. Use: capture, search, feedback, stats, grow, patterns, decohere, reexcite, entanglement, field`);
    }
  },


  // ─── 8. Sync (unified) ───
  oracle_sync(oracle, args) {
    const scope = args.scope || 'personal';
    if (scope === 'community' || scope === 'both') {
      const shareResult = oracle.share({
        patterns: args.patterns,
        tags: args.tags,
        minCoherency: args.minCoherency ?? 0.7,
        dryRun: args.dryRun || false,
      });
      if (scope === 'community') {
        return shareResult;
      }
      // scope === 'both': also sync personal
      const dir = args.direction || 'both';
      const opts = { dryRun: args.dryRun || false, language: args.language };
      let personalResult;
      if (dir === 'push') personalResult = oracle.syncToGlobal(opts);
      else if (dir === 'pull') personalResult = oracle.syncFromGlobal(opts);
      else personalResult = oracle.sync(opts);
      return { personal: personalResult, community: shareResult };
    }
    // scope === 'personal' (default)
    const dir = args.direction || 'both';
    const opts = { dryRun: args.dryRun || false, language: args.language };
    if (dir === 'push') return oracle.syncToGlobal(opts);
    if (dir === 'pull') return oracle.syncFromGlobal(opts);
    return oracle.sync(opts);
  },


  // ─── 9. Harvest ───
  oracle_harvest(oracle, args) {
    const { harvest } = require('../../ci/harvest');
    const path = require('path');
    const os = require('os');

    // Security: restrict local harvest paths to the project directory or home directory.
    // Remote URLs (git clone) are allowed since they clone to a temp directory.
    const source = args.path || '';
    const isUrl = (source.includes('://') && !source.startsWith('file://')) || source.startsWith('git@');
    if (!isUrl) {
      const fs = require('fs');
      let resolved = path.resolve(source);
      // Resolve symlinks to prevent path traversal via symlinked directories
      try { resolved = fs.realpathSync(resolved); } catch (_) { /* path may not exist yet */ }
      const cwd = process.cwd();
      const home = os.homedir();
      const tmp = os.tmpdir();
      const isBelowCwd = resolved.startsWith(cwd + path.sep) || resolved === cwd;
      const isBelowHome = resolved.startsWith(home + path.sep) || resolved === home;
      const isBelowTmp = resolved.startsWith(tmp + path.sep) || resolved === tmp;
      if (!isBelowCwd && !isBelowHome && !isBelowTmp) {
        throw new Error(
          `Harvest path must be within the project directory or home directory. ` +
          `Resolved "${resolved}" is outside allowed boundaries.`
        );
      }
      // Block sensitive directories
      const sensitive = ['.ssh', '.gnupg', '.aws', '.config', '.kube', '.docker'].map(d => path.join(home, d));
      if (sensitive.some(s => resolved.startsWith(s + path.sep) || resolved === s)) {
        throw new Error(`Harvest path "${resolved}" points to a sensitive directory.`);
      }
    }

    return harvest(oracle, source, {
      language: args.language,
      dryRun: args.dryRun || false,
      splitMode: args.splitMode || 'file',
      branch: args.branch,
      maxFiles: args.maxFiles || 200,
    });
  },


  // ─── 10. Maintain (unified) ───
  oracle_maintain(oracle, args) {
    const action = args.action || 'full-cycle';
    switch (action) {
      case 'full-cycle':
        return oracle.fullOptimizationCycle({
          maxHealsPerRun: args.maxHealsPerRun || 20,
        });
      // fractal store integrity — check finds orphaned deltas/embeddings
      // and stale templates; repair removes them. Both existed tested and
      // uncalled until 2026-08-08 (wire-later ledger). Check is read-only;
      // repair mutates and therefore requires the explicit action word.
      case 'fractal-integrity': {
        const { checkFractalIntegrity } = require('../../compression/fractal-library-bridge');
        return checkFractalIntegrity(oracle.patterns._sqlite || oracle.store);
      }
      case 'fractal-repair': {
        const { repairFractalIntegrity } = require('../../compression/fractal-library-bridge');
        return repairFractalIntegrity(oracle.patterns._sqlite || oracle.store);
      }
      case 'candidates': {
        const filters = {};
        if (args.language) filters.language = args.language;
        if (args.minCoherency != null) filters.minCoherency = args.minCoherency;
        if (args.method) filters.generationMethod = args.method;
        const candidates = oracle.candidates(filters);
        const stats = oracle.candidateStats();
        return { stats, candidates: candidates.slice(0, 50) };
      }
      case 'promote':
        return oracle.autoPromote();
      case 'synthesize':
        return oracle.synthesizeTests({
          maxCandidates: args.maxCandidates,
          dryRun: args.dryRun || false,
          autoPromote: true,
        });
      case 'reflect': {
        const { reflectionLoop } = require('../../core/reflection');
        const result = reflectionLoop(args.code || '', {
          language: args.language,
          maxLoops: args.maxLoops || 3,
          targetCoherence: args.targetCoherence ?? 0.9,
        });
        result.history = (result.history || []).map(h => ({
          loop: h.loop,
          coherence: h.coherence,
          strategy: h.strategy,
          reflectionScore: h.reflectionScore,
        }));
        return result;
      }
      case 'covenant': {
        const { covenantCheck } = require('../../core/covenant');
        return covenantCheck(args.code || '', {
          description: args.description || '',
          tags: args.tags || [],
        });
      }
      default:
        throw new Error(`Unknown maintain action: ${action}. Use: full-cycle, candidates, promote, synthesize, reflect, covenant`);
    }
  },


  // ─── 11. Healing (lineage, stats, variants, improvements) ───
  oracle_healing(oracle, args) {
    const action = args.action || 'stats';
    switch (action) {
      case 'lineage': {
        if (!args.patternId) throw new Error('patternId is required for lineage action');
        return oracle.getHealingLineage(args.patternId);
      }
      case 'stats': {
        if (args.patternId) {
          // Per-pattern stats
          const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
          if (sqliteStore && typeof sqliteStore.getPatternHealingStats === 'function') {
            return sqliteStore.getPatternHealingStats(args.patternId);
          }
          const __retVal = { patternId: args.patternId, attempts: 0, successes: 0, rate: 1.0 };
          // field contribution removed: contributed unnamed scalar, not a coherency.
          // Auto-wired by scripts/wire-field-couplings.js, whose NUMERIC_FIELDS
          // list treated any numeric-looking return field as a coherence signal.
          return __retVal;
        }
        // Aggregate stats
        return oracle.healingStats();
      }
      case 'improved': {
        return oracle.queryHealingImprovement(args.minDelta ?? 0.2);
      }
      case 'variants': {
        if (!args.patternId) throw new Error('patternId is required for variants action');
        const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
        if (sqliteStore && typeof sqliteStore.getHealedVariants === 'function') {
          return sqliteStore.getHealedVariants(args.patternId);
        }
        return [];
      }
      case 'best': {
        if (!args.patternId) throw new Error('patternId is required for best action');
        const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
        if (sqliteStore && typeof sqliteStore.getBestHealedVariant === 'function') {
          return sqliteStore.getBestHealedVariant(args.patternId);
        }
        return null;
      }
      default:
        throw new Error(`Unknown healing action: ${action}. Use: lineage, stats, improved, variants, best`);
    }
  },


  // ─── 18. Heal (unified pipeline) ───
  async oracle_heal(oracle, args) {
    const fs = require('fs');
    const { heal } = require('../../core/heal');
    let source, filePath = null;
    if (args.file) {
      filePath = args.file;
      source = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      source = args.code;
    } else {
      throw new Error('oracle_heal requires file or code');
    }
    const result = await heal(source, {
      filePath,
      maxLevel: args.maxLevel || 'generate',
      targetRule: args.targetRule,
      dryRun: args.dryRun,
    });
    if (args.writeFile && result.success && filePath && !args.dryRun) {
      _writeHealed(_sealedGate(), filePath, result.source);
    }
    return {
      success: result.success,
      level: result.level,
      source: args.writeFile ? undefined : result.source,
      before: { findings: result.before?.findings?.length ?? 0 },
      after:  { findings: result.after?.findings?.length ?? 0 },
      patches: result.patches?.length ?? 0,
    };
  },
};

module.exports = { MAINTENANCE };
