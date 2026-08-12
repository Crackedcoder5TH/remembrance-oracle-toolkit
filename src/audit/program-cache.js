'use strict';

/**
 * program-cache — the shared parsed program, as a leaf.
 *
 * The three checker modules (ast, lint, smell) each have a file-level API
 * (auditFile / lintFile / smellFile) that needs one thing before it can run:
 * the light AST for the source. They used to get it by calling
 * `analyzeCached()` in core/analyze and reading `env.program` — the only
 * field of the envelope any of them touched.
 *
 * That single field cost a require cycle. analyze builds its envelope BY
 * calling auditCode / lintCode / smellCode, so:
 *
 *   analyze → ast-checkers → analyze
 *   analyze → lint-checkers → analyze
 *   analyze → smell-checkers → analyze
 *
 * The functions were never circular — `analyze()` calls the *code-level*
 * checkers, and the *file-level* checkers call analyze — but the modules
 * were, which is what the cycle ratchet sees and what makes the load order
 * fragile.
 *
 * So the shared thing gets its own home. This module caches exactly what
 * the checkers asked for — a parsed program per (filePath, source) — over
 * the parser, which is itself a leaf. The stated benefit of the old
 * envelope cache is preserved: audit, lint and smell run over the same file
 * in one session and parse it once between them.
 *
 * Same LRU size and the same key as the envelope cache it replaces for this
 * purpose, and the same graceful fallback: a parse failure returns an empty
 * Program rather than throwing, so a checker still runs over a file it
 * cannot parse.
 */

const crypto = require('crypto');
const { quiet } = require('../core/quiet');

const _cache = new Map();
const CACHE_MAX = 500;

function sourceHash(source) {
  return crypto.createHash('sha1').update(source || '').digest('hex').slice(0, 16);
}

/** The empty-Program shape returned when a source cannot be parsed. */
function emptyProgram(source) {
  return {
    type: 'Program', source, tokens: [], comments: [],
    lines: String(source || '').split('\n'), body: [], functions: [],
  };
}

/**
 * Parsed program for a source, memoized per (filePath, source-hash).
 *
 * @param {string} source
 * @param {string} [filePath] - part of the cache key; no file is read here
 * @returns {object} the light AST, or an empty Program if parsing fails
 */
function programCached(source, filePath) {
  if (typeof source !== 'string') return emptyProgram(source);
  const key = `${filePath || ''}::${sourceHash(source)}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  const { parseProgram } = require('./parser');
  let program;
  try {
    program = parseProgram(source);
  } catch (e) {
    // Named, not swallowed: quiet() counts the failure per site and speaks
    // under ORACLE_DEBUG on stderr, so an unparseable file is a measurement
    // rather than a silent empty Program — and this leaf adds no print
    // surface (console-ratchet holds it at zero).
    quiet('audit:program-cache:parse', e);
    program = emptyProgram(source);
  }

  _cache.set(key, program);
  // Simple LRU: if over cap, drop the oldest entry.
  if (_cache.size > CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  return program;
}
programCached.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'odd', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
};

/** Drop every cached program. */
function clearProgramCache() { _cache.clear(); }
clearProgramCache.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

module.exports = { programCached, clearProgramCache };
