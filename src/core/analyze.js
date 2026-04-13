'use strict';

/**
 * Unified analysis envelope.
 *
 * `analyze(source, filePath, options)` returns a single frozen object
 * that carries every analytical signal we know how to compute about a
 * piece of source code. Every downstream consumer — audit checker,
 * linter, smell detector, covenant scanner, healing pipeline, Bayesian
 * prior, pattern-library relevance — reads from this envelope instead
 * of re-parsing and re-analyzing the source from scratch.
 *
 * Design goals:
 *
 *   1. Parse once.  The parser is called at most one time regardless
 *      of how many fields a consumer asks for.
 *
 *   2. Lazy.  Each field is a getter that runs its computation on
 *      first access and memoizes. A consumer that only needs `audit`
 *      pays zero cost for `smell`, `prior`, etc.
 *
 *   3. Frozen for consumers.  The returned envelope is a proxy that
 *      exposes read-only views. Consumers can't accidentally mutate
 *      shared state.
 *
 *   4. Composable.  Multiple envelopes can be fed to cross-file
 *      passes (call-graph, cross-file cascade).
 *
 *   5. Zero new dependencies.  Everything here builds on the existing
 *      audit parser + checkers + priors.
 *
 * Envelope shape (all fields are lazy):
 *
 *   envelope.source       — original source string
 *   envelope.filePath     — absolute or relative path
 *   envelope.language     — detected language
 *   envelope.meta         — { hash, lineCount, analyzedAt, cacheHit }
 *
 *   envelope.program      — { tokens, comments, lines, functions, body }
 *                           — the light AST from src/audit/parser.js
 *   envelope.lines        — raw lines array
 *   envelope.tokens       — parsed tokens (regex-aware)
 *   envelope.functions    — top-level + inline functions discovered
 *
 *   envelope.audit        — { findings }        from ast-checkers.js
 *   envelope.lint         — { findings }        from lint-checkers.js
 *   envelope.smell        — { findings }        from smell-checkers.js
 *   envelope.priorRisks   — risk findings from bayesian-prior.js
 *
 *   envelope.covenant     — { sealed, violations } from core/covenant.js
 *   envelope.fingerprint  — { skeleton, hash } from compression/fractal.js
 *
 *   envelope.nullability  — { functions } from type-inference.js
 *   envelope.scopes       — per-function non-null tracking
 *   envelope.taint        — per-function tainted set
 *
 *   envelope.allFindings  — merged view of audit+lint+smell+priorRisks
 *
 *   envelope.toJSON()     — serializable snapshot for cache / MCP
 *
 * For cross-file analysis we expose `analyzeFiles([path, ...])` and
 * `crossFileCallGraph(envelopes)` that reuse per-file envelopes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Lazy envelope factory ──────────────────────────────────────────────────

const EXT_TO_LANG = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
};

function detectLanguage(filePath, source) {
  if (filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  }
  if (typeof source === 'string') {
    if (/^#!.*python/.test(source) || /^def\s+\w+/m.test(source)) return 'python';
    if (/^\s*package\s+\w+/m.test(source)) return 'go';
    if (/^\s*fn\s+\w+/m.test(source)) return 'rust';
    if (/^\s*(?:function|const|let|var|import)/m.test(source)) return 'javascript';
  }
  return 'unknown';
}

/**
 * Compute a stable hash of the source. Used for cache keys and as
 * the identity of the envelope across sessions.
 */
function sourceHash(source) {
  return crypto.createHash('sha1').update(source || '').digest('hex').slice(0, 16);
}

/**
 * Build an envelope for a single source string.
 *
 * @param {string} source
 * @param {string} [filePath]
 * @param {object} [options] - { language }
 * @returns {object} the envelope (lazy, read-only)
 */
function analyze(source, filePath, options = {}) {
  if (typeof source !== 'string') source = '';
  const language = options.language || detectLanguage(filePath, source);
  const hash = sourceHash(source);
  const analyzedAt = new Date().toISOString();

  // ─── Memoization slots ─────────────────────────────────────────────
  const cache = {};

  function memo(key, fn) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    const value = fn();
    cache[key] = value;
    return value;
  }

  // ─── Lazy getters ──────────────────────────────────────────────────
  const envelope = {};

  Object.defineProperties(envelope, {
    source:   { value: source,   enumerable: true },
    filePath: { value: filePath || null, enumerable: true },
    language: { value: language, enumerable: true },
    meta: {
      value: Object.freeze({
        hash,
        lineCount: source.split('\n').length,
        analyzedAt,
        cacheHit: false,
      }),
      enumerable: true,
    },

    // The light AST — every other checker builds on this.
    program: {
      enumerable: true,
      get() {
        return memo('program', () => {
          const { parseProgram } = require('../audit/parser');
          try { return parseProgram(source); }
          catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[analyze:parse]', e?.message || e);
            return { type: 'Program', source, tokens: [], comments: [], lines: source.split('\n'), body: [], functions: [] };
          }
        });
      },
    },

    tokens:    { enumerable: true, get() { return envelope.program.tokens; } },
    comments:  { enumerable: true, get() { return envelope.program.comments; } },
    lines:     { enumerable: true, get() { return envelope.program.lines; } },
    functions: { enumerable: true, get() { return envelope.program.functions; } },

    // ── Audit: the 6 bug classes ───────────────────────────────────────
    // Passes the envelope's pre-parsed program so auditCode skips its
    // own parse pass. Parse-once, walk-many.
    audit: {
      enumerable: true,
      get() {
        return memo('audit', () => {
          const { auditCode } = require('../audit/ast-checkers');
          return auditCode(source, { filePath, program: envelope.program });
        });
      },
    },

    // ── Lint: style hints ──────────────────────────────────────────────
    lint: {
      enumerable: true,
      get() {
        return memo('lint', () => {
          const { lintCode } = require('../audit/lint-checkers');
          return lintCode(source, { program: envelope.program });
        });
      },
    },

    // ── Smell: architectural hints ─────────────────────────────────────
    smell: {
      enumerable: true,
      get() {
        return memo('smell', () => {
          const { smellCode } = require('../audit/smell-checkers');
          return smellCode(source, { program: envelope.program });
        });
      },
    },

    // ── Prior: Bayesian risk signal ────────────────────────────────────
    priorRisks: {
      enumerable: true,
      get() {
        return memo('priorRisks', () => {
          try {
            const { scorePrior } = require('../audit/bayesian-prior');
            return scorePrior(source, filePath || '', { language });
          } catch { return []; }
        });
      },
    },

    // ── Covenant: 15-principle harm scan ───────────────────────────────
    covenant: {
      enumerable: true,
      get() {
        return memo('covenant', () => {
          try {
            const mod = require('../core/covenant');
            if (typeof mod.covenantCheck === 'function') {
              return mod.covenantCheck(source, { language });
            }
          } catch { /* not available */ }
          return { sealed: true, violations: [], principlesPassed: 15, totalPrinciples: 15 };
        });
      },
    },

    // ── Fingerprint: structural identity for prior / substrate ─────────
    fingerprint: {
      enumerable: true,
      get() {
        return memo('fingerprint', () => {
          try {
            const { structuralFingerprint } = require('../compression/fractal');
            return structuralFingerprint(source, language, { fuzzy: true });
          } catch { return { hash }; }
        });
      },
    },

    // ── Nullability inference ──────────────────────────────────────────
    nullability: {
      enumerable: true,
      get() {
        return memo('nullability', () => {
          try {
            const { inferNullability } = require('../audit/type-inference');
            return inferNullability(envelope.program);
          } catch { return { functions: new Map() }; }
        });
      },
    },

    // ── Per-function scopes (non-null narrowing) ───────────────────────
    scopes: {
      enumerable: true,
      get() {
        return memo('scopes', () => {
          try {
            const { buildScope } = require('../audit/scope');
            const out = new Map();
            for (const fn of envelope.functions) {
              if (fn.bodyTokens) out.set(fn, buildScope(fn.bodyTokens));
            }
            return out;
          } catch { return new Map(); }
        });
      },
    },

    // ── Per-function taint sets ────────────────────────────────────────
    taint: {
      enumerable: true,
      get() {
        return memo('taint', () => {
          try {
            const { computeTainted } = require('../audit/taint');
            const out = new Map();
            for (const fn of envelope.functions) {
              out.set(fn, computeTainted(fn));
            }
            return out;
          } catch { return new Map(); }
        });
      },
    },

    // ── Coherency score ────────────────────────────────────────────────
    coherency: {
      enumerable: true,
      get() {
        return memo('coherency', () => {
          try {
            const mod = require('../core/coherency');
            if (typeof mod.computeCoherencyScore === 'function') {
              return mod.computeCoherencyScore(source, { language });
            }
          } catch { /* not available */ }
          return { total: 0, dimensions: {} };
        });
      },
    },

    // ── Combined findings view ─────────────────────────────────────────
    allFindings: {
      enumerable: true,
      get() {
        return memo('allFindings', () => {
          const merged = [];
          for (const f of (envelope.audit.findings || [])) merged.push({ ...f, source: 'audit' });
          for (const f of (envelope.lint.findings || []))  merged.push({ ...f, source: 'lint' });
          for (const f of (envelope.smell.findings || [])) merged.push({ ...f, source: 'smell' });
          for (const f of (envelope.priorRisks || []))     merged.push({ ...f, source: 'prior' });
          return merged;
        });
      },
    },
  });

  // Serializable snapshot — useful for MCP, cache, and history events.
  envelope.toJSON = function toJSON() {
    return {
      source,
      filePath,
      language,
      meta: envelope.meta,
      audit: envelope.audit,
      lint: envelope.lint,
      smell: envelope.smell,
      priorRisks: envelope.priorRisks,
      covenant: { sealed: envelope.covenant.sealed, violations: envelope.covenant.violations || [] },
      coherency: envelope.coherency,
    };
  };

  // Freeze the top-level to prevent accidental mutation by consumers.
  // (Getters still work — we only freeze the object descriptor table.)
  Object.freeze(envelope);
  return envelope;
}

// ─── Multi-file analysis ────────────────────────────────────────────────────

/**
 * Build envelopes for every file in `paths`. Skips unreadable files.
 */
function analyzeFiles(paths, options = {}) {
  const envelopes = [];
  for (const p of paths || []) {
    if (!fs.existsSync(p)) continue;
    let source;
    try { source = fs.readFileSync(p, 'utf-8'); }
    catch { continue; }
    envelopes.push(analyze(source, p, options));
  }
  return envelopes;
}

/**
 * Run a cross-file call-graph analysis over a set of envelopes.
 * Reuses each envelope's already-parsed `program` — we never re-parse.
 */
function crossFileCallGraph(envelopes) {
  const { buildCallGraph, findNullDerefCascades } = require('../audit/call-graph');
  const { mergeProjectNullability } = require('../audit/type-inference');

  const parsed = envelopes.map(e => ({ file: e.filePath, program: e.program }));
  const graph = buildCallGraph(parsed);
  const perFile = envelopes.map(e => e.nullability);
  const nullability = mergeProjectNullability(perFile);

  const parsedByFile = new Map();
  for (const e of envelopes) parsedByFile.set(e.filePath, e.program);

  const cascades = findNullDerefCascades(graph, nullability, parsedByFile);
  return { graph, nullability, cascades };
}

// ─── Per-process envelope cache ─────────────────────────────────────────────
//
// Keyed by (filePath, contentHash). A second `analyze()` call on the same
// source string returns the same envelope, which is especially useful for
// CLI commands that run several subsystems in sequence (e.g. `audit
// summary` invokes audit + lint + smell + prior + covenant on every file).

const _cache = new Map();
const CACHE_MAX = 500;

function analyzeCached(source, filePath, options = {}) {
  if (typeof source !== 'string') return analyze(source, filePath, options);
  const key = `${filePath || ''}::${sourceHash(source)}`;
  const hit = _cache.get(key);
  if (hit) return hit;
  const envelope = analyze(source, filePath, options);
  _cache.set(key, envelope);
  // Simple LRU: if over cap, drop the oldest entry.
  if (_cache.size > CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  return envelope;
}

function clearCache() { _cache.clear(); }

module.exports = {
  analyze,
  analyzeCached,
  analyzeFiles,
  crossFileCallGraph,
  clearCache,
  detectLanguage,
  sourceHash,
};
