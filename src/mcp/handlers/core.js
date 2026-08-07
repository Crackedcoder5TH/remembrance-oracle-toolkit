'use strict';

/**
 * mcp/handlers/core.js — the goggles surface + search, resolve, submit,
 * register, feedback, stats, pending-feedback. Extracted verbatim from
 * src/mcp/handlers.js in the third monolith decomposition; inline requires
 * repathed one level deeper, nothing else changed.
 */

const path = require('path');
const { trackPull, inferFeedbackFromActivity, clearPendingPull, getPendingPulls } = require('../feedback-tracker');
const { _searchEnforcementNotice } = require('./helpers');

const CORE = {
  // ─── 0. GOGGLES — the one surface ───
  //
  // Shells out to the canonical runner rather than re-implementing any of
  // it. That is deliberate: the goggles already routes every operation to
  // its canonical script across the ecosystem, and a second in-process copy
  // of that routing is exactly the kind of duplicate that drifts. One
  // implementation, reached two ways (CLI and MCP).
  goggles(oracle, args) {
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    const ROOT = path.resolve(__dirname, '..', '..', '..');
    const mode = String(args.mode || 'read');

    const argv = [];
    let script = path.join(ROOT, 'src', 'tools', 'goggles.js');

    if (mode === 'brief') {
      script = path.join(ROOT, 'src', 'tools', 'brief.js');
      if (!args.target) return { error: 'brief requires a target (file, symbol or topic)' };
      argv.push(String(args.target));
    } else if (mode === 'map') {
      argv.push('--map', String(args.target || process.cwd()));
      if (args.deep) argv.push('--deep');
    } else if (mode === 'diff') {
      script = path.join(ROOT, '.claude', 'skills', 'goggles', 'run.mjs');
      argv.push('--diff');
    } else if (mode === 'do') {
      if (!args.verb) return { error: 'do requires a verb (field, drift, harvest, absorb, publish, coin, export, verify)' };
      script = path.join(ROOT, '.claude', 'skills', 'goggles', 'run.mjs');
      argv.push('--do', String(args.verb));
      if (args.target) argv.push(String(args.target));
    } else {
      if (!args.target) return { error: 'read requires a target file' };
      argv.push(String(args.target));
      if (args.lines) argv.push('--lines', String(args.lines));
      // Auto-ingest is ON by default — looking witnesses. Only an explicit
      // false turns it off, so an omitted flag never silently stops the
      // substrate from learning.
      if (args.ingest === false) argv.push('--no-ingest');
    }

    try {
      const out = execFileSync('node', [script, ...argv], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000,
      });
      return { mode, target: args.target || null, verb: args.verb || null, reading: out };
    } catch (e) {
      // A goggle that fails still reports — an absent reading is itself a
      // reading, and swallowing it would hide that the substrate went quiet.
      return {
        mode,
        error: (e.message || String(e)).slice(0, 400),
        stderr: (e.stderr ? String(e.stderr) : '').slice(0, 1200),
        stdout: (e.stdout ? String(e.stdout) : '').slice(0, 4000),
      };
    }
  },


  // ─── 1. Search (unified) ───
  oracle_search(oracle, args) {
    const mode = args.mode || 'hybrid';
    let result;
    // Structured query mode: description provided without query
    if (args.description && !args.query) {
      result = oracle.query({
        description: args.description || '',
        tags: args.tags || [],
        language: args.language,
        limit: args.limit || 5,
      });
    } else if (!args.query) {
      throw new Error('Either "query" or "description" is required');
    } else if (mode === 'smart') {
      result = oracle.smartSearch(args.query, {
        language: args.language,
        limit: args.limit || 10,
        mode: 'hybrid',
      });
    } else {
      result = oracle.search(args.query, {
        limit: args.limit || 5,
        language: args.language,
        mode: mode,
      });
    }
    // Instrumentation: track search in session
    try {
      const { trackSearch } = require('../../core/session-tracker');
      trackSearch(args.query || args.description || '', result, { mode, language: args.language });
    } catch (_) { /* non-fatal */ }
    // Lifecycle: increment pull_count on every pattern that was retrieved.
    // Distinct from usage_count — pulling means "an outside caller saw this",
    // using means "they applied it." Best-effort; never blocks the result.
    try {
      const items = Array.isArray(result) ? result
                  : Array.isArray(result && result.results) ? result.results
                  : Array.isArray(result && result.patterns) ? result.patterns
                  : [];
      const ids = items.map((p) => p && p.id).filter(Boolean);
      if (ids.length && oracle.patterns && typeof oracle.patterns.recordPulls === 'function') {
        oracle.patterns.recordPulls(ids);
      }
    } catch (_) { /* non-fatal — counters are observational, not transactional */ }
    return result;
  },


  // ─── 2. Resolve ───
  oracle_resolve(oracle, args) {
    const request = {
      description: args.description || '',
      tags: args.tags || [],
      language: args.language,
      heal: args.heal !== false,
    };
    const result = oracle.resolve(request);
    // Instrumentation: track resolve in session + feedback tracker
    try {
      const { trackResolve } = require('../../core/session-tracker');
      trackResolve(result, request);
    } catch (_) { /* non-fatal */ }
    if (result.pattern && result.pattern.id) {
      trackPull(result.pattern.id, result.pattern.name, result.decision);
    }
    return result;
  },


  // ─── 3. Submit ───
  oracle_submit(oracle, args) {
    if (!args.code || typeof args.code !== 'string') {
      throw new Error('"code" is required and must be a non-empty string');
    }
    const notice = _searchEnforcementNotice();
    const result = oracle.submit(args.code, {
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
    // Infer feedback for any pending pulls — model wrote new code, so pulled patterns were useful
    const inferred = inferFeedbackFromActivity(oracle);
    const out = notice ? { ...result, ...notice } : result;
    if (inferred.length > 0) {
      out._inferredFeedback = inferred;
    }
    // Instrumentation: log submit to session
    try {
      const { getSession } = require('../../core/session-tracker');
      const session = getSession();
      if (!session._submits) session._submits = [];
      session._submits.push({
        timestamp: new Date().toISOString(),
        language: args.language || null,
        description: args.description || '',
        inferredFeedback: inferred.length,
      });
    } catch (_) { /* non-fatal */ }
    return out;
  },


  // ─── 4. Register ───
  oracle_register(oracle, args) {
    if (!args.name || typeof args.name !== 'string') {
      throw new Error('"name" is required and must be a non-empty string');
    }
    if (!args.code || typeof args.code !== 'string') {
      throw new Error('"code" is required and must be a non-empty string');
    }
    const notice = _searchEnforcementNotice();
    const result = oracle.registerPattern({
      name: args.name,
      code: args.code,
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
    // Infer feedback for any pending pulls — model registered new code, so pulled patterns were useful
    const inferred = inferFeedbackFromActivity(oracle);
    const out = notice ? { ...result, ...notice } : result;
    if (inferred.length > 0) {
      out._inferredFeedback = inferred;
    }
    // Instrumentation: log register to session
    try {
      const { getSession } = require('../../core/session-tracker');
      const session = getSession();
      if (!session._registers) session._registers = [];
      session._registers.push({
        timestamp: new Date().toISOString(),
        name: args.name,
        language: args.language || null,
        inferredFeedback: inferred.length,
      });
    } catch (_) { /* non-fatal */ }
    return out;
  },


  // ─── 5. Feedback ───
  oracle_feedback(oracle, args) {
    if (!args.id) {
      throw new Error('"id" is required for feedback');
    }
    if (args.success === undefined || args.success === null) {
      throw new Error('"success" (boolean) is required for feedback');
    }
    const result = oracle.feedback(args.id, !!args.success);
    // Clear from pending pulls — explicit feedback was given
    clearPendingPull(args.id);
    // Instrumentation: track feedback in session
    try {
      const { trackFeedback } = require('../../core/session-tracker');
      trackFeedback(args.id);
    } catch (_) { /* non-fatal */ }
    return result;
  },


  // ─── 6. Stats ───
  oracle_stats(oracle) {
    const storeStats = oracle.stats();
    const patternStats = oracle.patternStats();
    const candidateStats = oracle.candidateStats();
    // Publication stats from SQLite
    let publicationStats = { published: 0 };
    try {
      const sqliteStore = oracle.store?.getSQLiteStore?.() || (oracle.patterns && oracle.patterns._sqlite);
      if (sqliteStore && sqliteStore.db) {
        const pub = sqliteStore.db.prepare('SELECT COUNT(*) as c FROM patterns WHERE blockchain_tx IS NOT NULL').get();
        publicationStats.published = pub ? pub.c : 0;
      }
    } catch (_) { /* non-fatal */ }
    return { store: storeStats, patterns: patternStats, candidates: candidateStats, publications: publicationStats };
  },

  // ─── 13. Pending Feedback ───
  oracle_pending_feedback(_oracle, _args) {
    const pending = getPendingPulls();
    let sessionPending = [];
    try {
      const { getPendingFeedback } = require('../../core/session-tracker');
      sessionPending = getPendingFeedback();
    } catch (_) { /* non-fatal */ }
    return { mcpPending: pending, sessionPending };
  },
};

module.exports = { CORE };
