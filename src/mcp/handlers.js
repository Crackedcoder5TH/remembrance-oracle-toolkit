/**
 * MCP Tool Handlers
 *
 * Dispatch map for all MCP tool calls. Each handler is a function
 * (oracle, args) => result that implements one tool's logic.
 *
 * Consolidated to 10 focused handlers (down from 55+).
 * Extracted from the monolithic switch in server.js for maintainability.
 */

const HANDLERS = {
  // ─── 1. Search (unified) ───
  oracle_search(oracle, args) {
    const mode = args.mode || 'hybrid';
    if (mode === 'smart') {
      return oracle.smartSearch(args.query, {
        language: args.language,
        limit: args.limit || 10,
        mode: 'hybrid',
      });
    } else if (args.description && !args.query) {
      // Structured query mode (legacy oracle_query behavior)
      return oracle.query({
        description: args.description || '',
        tags: args.tags || [],
        language: args.language,
        limit: args.limit || 5,
      });
    } else {
      return oracle.search(args.query || '', {
        limit: args.limit || 5,
        language: args.language,
        mode: mode,
      });
    }
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
    const action = args.action;
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
      default:
        throw new Error(`Unknown debug action: ${action}. Use: capture, search, feedback, stats, grow, patterns`);
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
    return harvest(oracle, args.path, {
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
        if (args.minCoherency) filters.minCoherency = args.minCoherency;
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
        result.history = result.history.map(h => ({
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
};

module.exports = { HANDLERS };
