/**
 * MCP Tool Handlers
 *
 * Dispatch map for all MCP tool calls. Each handler is a function
 * (oracle, args) => result that implements one tool's logic.
 *
 * 12 focused handlers (down from 55+).
 * Extracted from the monolithic switch in server.js for maintainability.
 */

const HANDLERS = {
  // ─── 1. Search (unified) ───
  oracle_search(oracle, args) {
    const mode = args.mode || 'hybrid';
    // Structured query mode: description provided without query
    if (args.description && !args.query) {
      return oracle.query({
        description: args.description || '',
        tags: args.tags || [],
        language: args.language,
        limit: args.limit || 5,
      });
    }
    if (!args.query) {
      throw new Error('Either "query" or "description" is required');
    }
    if (mode === 'smart') {
      return oracle.smartSearch(args.query, {
        language: args.language,
        limit: args.limit || 10,
        mode: 'hybrid',
      });
    }
    return oracle.search(args.query, {
      limit: args.limit || 5,
      language: args.language,
      mode: mode,
    });
  },

  // ─── 2. Resolve ───
  oracle_resolve(oracle, args) {
    return oracle.resolve({
      description: args.description || '',
      tags: args.tags || [],
      language: args.language,
      heal: args.heal !== false,
    });
  },

  // ─── 3. Submit ───
  oracle_submit(oracle, args) {
    return oracle.submit(args.code, {
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
  },

  // ─── 4. Register ───
  oracle_register(oracle, args) {
    return oracle.registerPattern({
      name: args.name,
      code: args.code,
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
  },

  // ─── 5. Feedback ───
  oracle_feedback(oracle, args) {
    return oracle.feedback(args.id, args.success);
  },

  // ─── 6. Stats ───
  oracle_stats(oracle) {
    const storeStats = oracle.stats();
    const patternStats = oracle.patternStats();
    const candidateStats = oracle.candidateStats();
    return { store: storeStats, patterns: patternStats, candidates: candidateStats };
  },

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
        minCoherency: args.minCoherency || 0.7,
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
    const { harvest } = require('../ci/harvest');
    const path = require('path');
    const os = require('os');

    // Security: restrict local harvest paths to the project directory or home directory.
    // Remote URLs (git clone) are allowed since they clone to a temp directory.
    const source = args.path || '';
    const isUrl = source.includes('://') || source.startsWith('git@');
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
        const { reflectionLoop } = require('../core/reflection');
        const result = reflectionLoop(args.code || '', {
          language: args.language,
          maxLoops: args.maxLoops || 3,
          targetCoherence: args.targetCoherence || 0.9,
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
        const { covenantCheck } = require('../core/covenant');
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
          return { patternId: args.patternId, attempts: 0, successes: 0, rate: 1.0 };
        }
        // Aggregate stats
        return oracle.healingStats();
      }
      case 'improved': {
        return oracle.queryHealingImprovement(args.minDelta || 0.2);
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

  // ─── 12. Swarm (multi-agent orchestration) ───
  async oracle_swarm(oracle, args) {
    const action = args.action || 'code';
    const { swarm, swarmCode, swarmReview, swarmHeal, resolveProviders, loadSwarmConfig } = require('../swarm');

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
};

module.exports = { HANDLERS };
