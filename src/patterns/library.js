/**
 * Pattern Library — The heart of the Oracle's intelligence.
 *
 * Stores reusable code patterns categorized by:
 * - Pattern type (algorithm, data-structure, utility, design-pattern, etc.)
 * - Complexity tier (atomic, composite, architectural)
 * - Language variants (same pattern, multiple language implementations)
 *
 * The Decision Engine uses coherency scoring to decide:
 *   - PULL: if an existing pattern scores above the pull threshold
 *   - GENERATE: if no pattern is good enough, flag for new generation
 *   - EVOLVE: if a pattern exists but can be improved, fork + upgrade
 *
 * Backend: SQLite (shared with history store) when available, falls back to JSON.
 * Storage: .remembrance/oracle.db (SQLite) or .remembrance/pattern-library.json (JSON)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeCoherencyScore } = require('../core/coherency');
const { computeRelevance } = require('../core/relevance');

const PATTERN_FILE = 'pattern-library.json';

const PATTERN_TYPES = [
  'algorithm', 'data-structure', 'utility', 'design-pattern',
  'validation', 'transformation', 'io', 'concurrency', 'testing',
];

const COMPLEXITY_TIERS = ['atomic', 'composite', 'architectural'];

// Decision thresholds
const THRESHOLDS = {
  pull: 0.70,       // Above this: pull directly from library
  evolve: 0.50,     // Between evolve and pull: fork + upgrade
  generate: 0.50,   // Below this: generate new pattern
  retire: 0.30,     // Below this: pattern should be retired
};

/**
 * Try to get or create a shared SQLite instance.
 */
function tryGetSQLite(storeDir) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (!DatabaseSync) return null;
    const { SQLiteStore } = require('../store/sqlite');

    // Re-use the VerifiedHistoryStore's shared instance if it exists
    const { VerifiedHistoryStore } = require('../store/history');
    if (VerifiedHistoryStore._sqliteInstances && VerifiedHistoryStore._sqliteInstances.has(storeDir)) {
      return VerifiedHistoryStore._sqliteInstances.get(storeDir);
    }

    // storeDir may be a .remembrance dir (from Oracle flow) or a raw dir (from tests).
    // SQLiteStore expects a baseDir and creates .remembrance inside it.
    // If storeDir already ends with .remembrance, go one level up.
    const baseDir = path.basename(storeDir) === '.remembrance'
      ? path.dirname(storeDir)
      : storeDir;
    const instance = new SQLiteStore(baseDir);
    if (!VerifiedHistoryStore._sqliteInstances) {
      VerifiedHistoryStore._sqliteInstances = new Map();
    }
    VerifiedHistoryStore._sqliteInstances.set(storeDir, instance);
    return instance;
  } catch {}
  return null;
}

class PatternLibrary {
  constructor(storeDir) {
    this.storeDir = storeDir;
    this.libraryPath = path.join(storeDir, PATTERN_FILE);
    this._backend = 'json';

    const sqlite = tryGetSQLite(storeDir);
    if (sqlite) {
      this._sqlite = sqlite;
      this._backend = 'sqlite';
    } else {
      this._ensureJSON();
    }
  }

  get backend() { return this._backend; }

  _ensureJSON() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    if (!fs.existsSync(this.libraryPath)) {
      this._writeJSON({
        patterns: [],
        meta: { created: new Date().toISOString(), version: 1, decisions: 0 },
      });
    }
  }

  _readJSON() {
    return JSON.parse(fs.readFileSync(this.libraryPath, 'utf-8'));
  }

  _writeJSON(data) {
    fs.writeFileSync(this.libraryPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  // ─── Public API ───

  register(pattern) {
    const coherency = computeCoherencyScore(pattern.code, {
      language: pattern.language,
      testPassed: pattern.testPassed,
      historicalReliability: pattern.reliability ?? 0.5,
    });

    if (this._backend === 'sqlite') {
      const record = this._sqlite.addPattern({
        name: pattern.name,
        code: pattern.code,
        language: pattern.language || coherency.language,
        patternType: pattern.patternType || classifyPattern(pattern.code, pattern.name),
        complexity: pattern.complexity || inferComplexity(pattern.code),
        description: pattern.description || '',
        tags: pattern.tags || [],
        coherencyScore: coherency,
        variants: pattern.variants || [],
        testCode: pattern.testCode || null,
      });
      this._sqlite.incrementDecisions();
      return record;
    }

    return this._registerJSON(pattern, coherency);
  }

  decide(request) {
    const { description = '', tags = [], language, minCoherency } = request;
    const patterns = this.getAll();

    if (patterns.length === 0) {
      return {
        decision: 'generate',
        pattern: null,
        confidence: 1.0,
        reasoning: 'Pattern library is empty — generation required',
        alternatives: [],
      };
    }

    const scored = patterns.map(p => {
      const relevance = computeRelevance(
        { description, tags, language },
        {
          description: `${p.name} ${p.description}`,
          tags: p.tags,
          language: p.language,
          coherencyScore: p.coherencyScore,
        }
      );

      const nameBonus = description.toLowerCase().includes(p.name.toLowerCase()) ? 0.15 : 0;
      const focusBonus = p.complexity === 'atomic' ? 0.08 : p.complexity === 'composite' ? 0.04 : 0;
      const coherency = p.coherencyScore?.total ?? 0;
      const reliability = p.usageCount > 0 ? p.successCount / p.usageCount : 0.5;
      const composite = relevance.relevance * 0.40 + coherency * 0.25 + reliability * 0.15 + nameBonus + focusBonus;

      return { pattern: p, relevance: relevance.relevance, coherency, reliability, composite };
    }).sort((a, b) => b.composite - a.composite);

    const best = scored[0];
    const threshold = minCoherency ?? THRESHOLDS.pull;

    if (best.composite >= threshold && best.relevance >= 0.3) {
      return {
        decision: 'pull',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" matches with composite score ${best.composite.toFixed(3)} (relevance=${best.relevance.toFixed(3)}, coherency=${best.coherency.toFixed(3)}, reliability=${best.reliability.toFixed(3)})`,
        alternatives: scored.slice(1, 4).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
      };
    }

    if (best.composite >= THRESHOLDS.evolve && best.relevance >= 0.2) {
      return {
        decision: 'evolve',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" is a partial match (${best.composite.toFixed(3)}) — can be evolved to fit`,
        alternatives: scored.slice(1, 4).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
      };
    }

    return {
      decision: 'generate',
      pattern: scored.length > 0 ? scored[0].pattern : null,
      confidence: 1.0 - (best.composite || 0),
      reasoning: `Best match "${best.pattern.name}" scored too low (${best.composite.toFixed(3)}) — new pattern needed`,
      alternatives: scored.slice(0, 3).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
    };
  }

  recordUsage(id, succeeded) {
    if (this._backend === 'sqlite') {
      return this._sqlite.recordPatternUsage(id, succeeded);
    }
    return this._recordUsageJSON(id, succeeded);
  }

  evolve(parentId, newCode, metadata = {}) {
    if (this._backend === 'sqlite') {
      return this._evolveSQLite(parentId, newCode, metadata);
    }
    return this._evolveJSON(parentId, newCode, metadata);
  }

  retire(minScore = THRESHOLDS.retire) {
    if (this._backend === 'sqlite') {
      return this._sqlite.retirePatterns(minScore);
    }
    return this._retireJSON(minScore);
  }

  getAll(filters = {}) {
    if (this._backend === 'sqlite') {
      return this._sqlite.getAllPatterns(filters);
    }
    return this._getAllJSON(filters);
  }

  summary() {
    if (this._backend === 'sqlite') {
      return this._sqlite.patternSummary();
    }
    return this._summaryJSON();
  }

  // ─── Composition ───

  /**
   * Compose a new pattern from existing components.
   * spec: { name, components: [id|name, ...], code?, description?, tags? }
   */
  compose(spec) {
    const { name, components: componentIds = [], code: customCode, description, tags: extraTags = [] } = spec;
    if (!componentIds.length) {
      return { composed: false, reason: 'No components specified' };
    }

    const resolved = [];
    for (const ref of componentIds) {
      let p = null;
      if (this._backend === 'sqlite') {
        p = this._sqlite.getPattern(ref) || this._sqlite.getPatternByName(ref);
      } else {
        const data = this._readJSON();
        p = data.patterns.find(x => x.id === ref || x.name === ref);
      }
      if (!p) {
        return { composed: false, reason: `Component not found: ${ref}` };
      }
      resolved.push(p);
    }

    const mergedTags = [...new Set([...extraTags, ...resolved.flatMap(p => p.tags || []), 'composed'])];
    const composedCode = customCode || resolved.map(p =>
      `// ─── ${p.name} ───\n${p.code}`
    ).join('\n\n');

    const pattern = this.register({
      name,
      code: composedCode,
      language: resolved[0].language,
      description: description || `Composed from: ${resolved.map(p => p.name).join(', ')}`,
      tags: mergedTags,
      requires: resolved.map(p => p.id),
    });

    pattern.composedOf = resolved.map(p => ({ id: p.id, name: p.name }));
    if (this._backend === 'sqlite') {
      this._sqlite.updatePattern(pattern.id, {
        composedOf: pattern.composedOf,
        requires: pattern.requires || resolved.map(p => p.id),
      });
    }

    return { composed: true, pattern, components: resolved };
  }

  /**
   * Resolve full dependency tree for a pattern (depth-first).
   */
  resolveDependencies(id) {
    const visited = new Set();
    const result = [];

    const walk = (patternId) => {
      if (visited.has(patternId)) return;
      visited.add(patternId);

      let p;
      if (this._backend === 'sqlite') {
        p = this._sqlite.getPattern(patternId);
      } else {
        const data = this._readJSON();
        p = data.patterns.find(x => x.id === patternId);
      }
      if (!p) return;

      const requires = p.requires || [];
      for (const depId of requires) {
        walk(depId);
      }
      result.push(p);
    };

    walk(id);
    return result;
  }

  // ─── SQLite evolution ───

  _evolveSQLite(parentId, newCode, metadata) {
    const parent = this._sqlite.getPattern(parentId);
    if (!parent) return null;

    const evolved = this.register({
      ...metadata,
      name: metadata.name || `${parent.name} (evolved)`,
      code: newCode,
      language: metadata.language || parent.language,
      patternType: metadata.patternType || parent.patternType,
      tags: metadata.tags || parent.tags,
      description: metadata.description || `Evolved from: ${parent.description}`,
    });

    const now = new Date().toISOString();
    evolved.evolutionHistory = [...(parent.evolutionHistory || []), { parentId, evolvedAt: now }];
    parent.evolutionHistory = [...(parent.evolutionHistory || []), { childId: evolved.id, evolvedAt: now }];

    this._sqlite.updatePattern(evolved.id, { evolutionHistory: evolved.evolutionHistory });
    this._sqlite.updatePattern(parentId, { evolutionHistory: parent.evolutionHistory });

    return evolved;
  }

  // ─── JSON implementations (fallback) ───

  _registerJSON(pattern, coherency) {
    const data = this._readJSON();
    const id = this._hash(pattern.code + pattern.name + Date.now());
    const record = {
      id,
      name: pattern.name,
      code: pattern.code,
      language: pattern.language || coherency.language,
      patternType: pattern.patternType || classifyPattern(pattern.code, pattern.name),
      complexity: pattern.complexity || inferComplexity(pattern.code),
      description: pattern.description || '',
      tags: pattern.tags || [],
      coherencyScore: coherency,
      variants: pattern.variants || [],
      testCode: pattern.testCode || null,
      usageCount: 0,
      successCount: 0,
      evolutionHistory: [],
      requires: pattern.requires || [],
      composedOf: pattern.composedOf || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.patterns.push(record);
    data.meta.decisions++;
    this._writeJSON(data);
    return record;
  }

  _recordUsageJSON(id, succeeded) {
    const data = this._readJSON();
    const pattern = data.patterns.find(p => p.id === id);
    if (!pattern) return null;
    pattern.usageCount++;
    if (succeeded) pattern.successCount++;
    pattern.updatedAt = new Date().toISOString();
    this._writeJSON(data);
    return pattern;
  }

  _evolveJSON(parentId, newCode, metadata) {
    const data = this._readJSON();
    const parent = data.patterns.find(p => p.id === parentId);
    if (!parent) return null;

    const evolved = this.register({
      ...metadata,
      name: metadata.name || `${parent.name} (evolved)`,
      code: newCode,
      language: metadata.language || parent.language,
      patternType: metadata.patternType || parent.patternType,
      tags: metadata.tags || parent.tags,
      description: metadata.description || `Evolved from: ${parent.description}`,
    });

    evolved.evolutionHistory = [...(parent.evolutionHistory || []), { parentId, evolvedAt: new Date().toISOString() }];
    parent.evolutionHistory = [...(parent.evolutionHistory || []), { childId: evolved.id, evolvedAt: new Date().toISOString() }];
    parent.updatedAt = new Date().toISOString();

    const freshData = this._readJSON();
    const evolvedRecord = freshData.patterns.find(p => p.id === evolved.id);
    const parentRecord = freshData.patterns.find(p => p.id === parentId);
    if (evolvedRecord) evolvedRecord.evolutionHistory = evolved.evolutionHistory;
    if (parentRecord) {
      parentRecord.evolutionHistory = parent.evolutionHistory;
      parentRecord.updatedAt = parent.updatedAt;
    }
    this._writeJSON(freshData);
    return evolved;
  }

  _retireJSON(minScore = THRESHOLDS.retire) {
    const data = this._readJSON();
    const before = data.patterns.length;
    data.patterns = data.patterns.filter(p => {
      const coherency = p.coherencyScore?.total ?? 0;
      const reliability = p.usageCount > 0 ? p.successCount / p.usageCount : 0.5;
      return (coherency * 0.6 + reliability * 0.4) >= minScore;
    });
    this._writeJSON(data);
    return { retired: before - data.patterns.length, remaining: data.patterns.length };
  }

  _getAllJSON(filters = {}) {
    const data = this._readJSON();
    let patterns = data.patterns;
    if (filters.language) {
      patterns = patterns.filter(p => p.language?.toLowerCase() === filters.language.toLowerCase());
    }
    if (filters.patternType) {
      patterns = patterns.filter(p => p.patternType === filters.patternType);
    }
    if (filters.complexity) {
      patterns = patterns.filter(p => p.complexity === filters.complexity);
    }
    if (filters.minCoherency != null) {
      patterns = patterns.filter(p => (p.coherencyScore?.total ?? 0) >= filters.minCoherency);
    }
    return patterns;
  }

  _summaryJSON() {
    const patterns = this.getAll();
    return {
      totalPatterns: patterns.length,
      byType: countBy(patterns, 'patternType'),
      byComplexity: countBy(patterns, 'complexity'),
      byLanguage: countBy(patterns, 'language'),
      avgCoherency: patterns.length > 0
        ? Math.round(patterns.reduce((s, p) => s + (p.coherencyScore?.total ?? 0), 0) / patterns.length * 1000) / 1000
        : 0,
    };
  }
}

// ─── Helpers ───

function classifyPattern(code, name = '') {
  const combined = (code + ' ' + name).toLowerCase();
  if (/sort|search|bfs|dfs|dijkstra|binary.?search|merge|quick|heap/i.test(combined)) return 'algorithm';
  if (/tree|graph|queue|stack|linked.?list|hash.?map|trie|heap/i.test(combined)) return 'data-structure';
  if (/debounce|throttle|memoize|curry|compose|pipe|retry/i.test(combined)) return 'utility';
  if (/singleton|factory|observer|decorator|adapter|strategy|proxy/i.test(combined)) return 'design-pattern';
  if (/valid|sanitize|check|assert|guard|verify/i.test(combined)) return 'validation';
  if (/map|filter|reduce|transform|convert|parse|serialize/i.test(combined)) return 'transformation';
  if (/read|write|fetch|request|stream|file|http/i.test(combined)) return 'io';
  if (/async|promise|worker|thread|mutex|semaphore/i.test(combined)) return 'concurrency';
  if (/test|spec|mock|stub|fixture|assert/i.test(combined)) return 'testing';
  return 'utility';
}

function inferComplexity(code) {
  const lines = code.split('\n').filter(l => l.trim()).length;
  const depth = maxNestingDepth(code);
  if (lines <= 15 && depth <= 2) return 'atomic';
  if (lines <= 60 && depth <= 4) return 'composite';
  return 'architectural';
}

function maxNestingDepth(code) {
  let max = 0, current = 0;
  for (const ch of code) {
    if (ch === '{' || ch === '(' || ch === '[') { current++; max = Math.max(max, current); }
    else if (ch === '}' || ch === ')' || ch === ']') { current = Math.max(0, current - 1); }
  }
  return max;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = {
  PatternLibrary,
  classifyPattern,
  inferComplexity,
  THRESHOLDS,
  PATTERN_TYPES,
  COMPLEXITY_TIERS,
};
