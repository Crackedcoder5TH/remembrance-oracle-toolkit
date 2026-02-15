/**
 * Remembrance Self-Reflector — Pattern Library Hook
 *
 * Before healing a file, query the Oracle's pattern library for similar
 * proven patterns and feed them as "healed examples" to guide strategy.
 *
 * 1. queryPatternsForFile — search library for patterns matching a file's purpose
 * 2. buildHealingContext — assemble matched patterns into a healing context
 * 3. hookBeforeHeal — the actual hook: takes a file, returns enriched config
 * 4. batchPatternLookup — look up patterns for multiple files at once
 * 5. patternHookStats — stats on how many healings were pattern-guided
 *
 * Uses only Node.js built-ins + existing Oracle modules.
 */

const { readFileSync } = require('fs');
const { basename, extname } = require('path');
const { PatternLibrary } = require('../patterns/library');
const { detectLanguage } = require('../core/coherency');
const { ensureDir, loadJSON, saveJSON, trimArray } = require('./utils');
const { join } = require('path');

// ─── Query Patterns for File ───

/**
 * Extract purpose/description keywords from a file's content.
 * Uses the file name, leading comments, and exported function names.
 *
 * @param {string} code - File source code
 * @param {string} filePath - File path for name hints
 * @returns {object} { description, tags, language }
 */
function extractFileHints(code, filePath) {
  const language = detectLanguage(code);
  const name = basename(filePath, extname(filePath));
  const tags = [];

  // Extract leading comment block for description
  let description = name.replace(/[-_.]/g, ' ');
  const commentMatch = code.match(/^\/\*\*?\s*([\s\S]*?)\*\//);
  if (commentMatch) {
    const comment = commentMatch[1]
      .replace(/^\s*\*\s?/gm, '')
      .replace(/\n/g, ' ')
      .trim();
    if (comment.length > 5) {
      description = comment.slice(0, 200);
    }
  }
  // Also try single-line leading comments
  if (description === name.replace(/[-_.]/g, ' ')) {
    const lineComments = code.match(/^(?:\/\/|#)\s*(.+)/m);
    if (lineComments) {
      description = lineComments[1].trim().slice(0, 200);
    }
  }

  // Extract exported function names as tags
  const fnMatches = code.matchAll(/(?:function|const|let|var)\s+(\w+)/g);
  for (const m of fnMatches) {
    if (m[1].length > 2 && m[1].length < 30) {
      tags.push(m[1]);
    }
    if (tags.length >= 10) break;
  }

  // Add file name parts as tags
  const nameParts = name.split(/[-_.]/).filter(p => p.length > 2);
  tags.push(...nameParts);

  return { description, tags: [...new Set(tags)], language };
}

/**
 * Query the pattern library for patterns similar to a given file.
 *
 * @param {string} code - File source code
 * @param {string} filePath - File path
 * @param {object} options - { storeDir, maxResults, minScore }
 * @returns {object} { matches, decision, bestMatch, query }
 */
function queryPatternsForFile(code, filePath, options = {}) {
  const {
    storeDir,
    maxResults = 3,
    minScore = 0.3,
  } = options;

  const hints = extractFileHints(code, filePath);

  // Initialize a PatternLibrary
  let library;
  try {
    const dir = storeDir || join(process.cwd(), '.remembrance');
    library = new PatternLibrary(dir);
  } catch {
    return { matches: [], decision: 'generate', bestMatch: null, query: hints };
  }

  // Use the library's decide() for best match info
  const decision = library.decide({
    description: hints.description,
    tags: hints.tags,
    language: hints.language,
  });

  // Get all patterns and compute relevance for top-N
  let allPatterns;
  try {
    allPatterns = library.getAll();
  } catch {
    allPatterns = [];
  }

  if (allPatterns.length === 0) {
    return { matches: [], decision: 'generate', bestMatch: null, query: hints };
  }

  // Score and rank
  const { computeRelevance } = require('../core/relevance');
  const scored = allPatterns.map(p => {
    const rel = computeRelevance(
      { description: hints.description, tags: hints.tags, language: hints.language },
      {
        description: `${p.name} ${p.description || ''}`,
        tags: p.tags || [],
        language: p.language,
        coherencyScore: p.coherencyScore,
      }
    );
    return { pattern: p, relevance: rel.relevance, coherency: p.coherencyScore?.total ?? 0 };
  })
    .filter(s => s.relevance >= minScore)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);

  return {
    matches: scored.map(s => ({
      id: s.pattern.id,
      name: s.pattern.name,
      code: s.pattern.code,
      language: s.pattern.language,
      relevance: Math.round(s.relevance * 1000) / 1000,
      coherency: Math.round(s.coherency * 1000) / 1000,
      tags: s.pattern.tags,
    })),
    decision: decision.decision,
    bestMatch: decision.pattern ? {
      id: decision.pattern.id,
      name: decision.pattern.name,
      confidence: Math.round(decision.confidence * 1000) / 1000,
    } : null,
    query: hints,
  };
}

// ─── Build Healing Context ───

/**
 * Assemble matched patterns into a healing context object.
 * This context can be passed to the healing engine to guide strategy.
 *
 * @param {object[]} matches - Array of pattern matches from queryPatternsForFile
 * @returns {object} Healing context with example code snippets and strategies
 */
function buildHealingContext(matches) {
  if (!matches || matches.length === 0) {
    return {
      hasExamples: false,
      examples: [],
      suggestedStrategy: 'default',
      summary: 'No similar patterns found. Healing with default strategy.',
    };
  }

  const examples = matches.map(m => ({
    name: m.name,
    code: m.code,
    language: m.language,
    relevance: m.relevance,
    coherency: m.coherency,
  }));

  // Determine suggested strategy from best match
  const best = matches[0];
  let suggestedStrategy = 'default';
  if (best.relevance >= 0.7 && best.coherency >= 0.8) {
    suggestedStrategy = 'pattern-guided';
  } else if (best.relevance >= 0.4) {
    suggestedStrategy = 'pattern-inspired';
  }

  return {
    hasExamples: true,
    examples,
    suggestedStrategy,
    bestPattern: best.name,
    bestRelevance: best.relevance,
    summary: `Found ${matches.length} similar pattern(s). Best: "${best.name}" (relevance: ${best.relevance}, coherency: ${best.coherency}). Strategy: ${suggestedStrategy}.`,
  };
}

// ─── Hook Before Heal ───

/**
 * The main hook: given a file path, query the pattern library and return
 * an enriched config object to guide healing.
 *
 * Usage:
 *   const context = hookBeforeHeal(filePath, { storeDir });
 *   // pass context.healingContext to the healer
 *
 * @param {string} filePath - File to heal
 * @param {object} options - { storeDir, maxResults, minScore, rootDir }
 * @returns {object} { filePath, query, matches, healingContext, patternGuided }
 */
function hookBeforeHeal(filePath, options = {}) {
  const { storeDir, maxResults = 3, minScore = 0.3, rootDir } = options;

  let code;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch {
    return {
      filePath,
      query: null,
      matches: [],
      healingContext: buildHealingContext([]),
      patternGuided: false,
    };
  }

  const result = queryPatternsForFile(code, filePath, {
    storeDir: storeDir || (rootDir ? join(rootDir, '.remembrance') : undefined),
    maxResults,
    minScore,
  });

  const healingContext = buildHealingContext(result.matches);

  return {
    filePath,
    query: result.query,
    matches: result.matches,
    healingContext,
    patternGuided: healingContext.hasExamples,
    decision: result.decision,
    bestMatch: result.bestMatch,
  };
}

// ─── Batch Pattern Lookup ───

/**
 * Look up patterns for multiple files at once.
 * Returns a Map of filePath → hookResult.
 *
 * @param {string[]} filePaths - Array of file paths
 * @param {object} options - { storeDir, maxResults, minScore, rootDir }
 * @returns {Map<string, object>} Map of filePath → hook result
 */
function batchPatternLookup(filePaths, options = {}) {
  const results = new Map();
  for (const fp of filePaths) {
    results.set(fp, hookBeforeHeal(fp, options));
  }
  return results;
}

// ─── Stats ───

/**
 * Get the path to the pattern hook log file.
 */
function getPatternHookLogPath(rootDir) {
  return join(rootDir, '.remembrance', 'pattern-hook-log.json');
}

/**
 * Record a pattern hook usage (called after healing with pattern context).
 *
 * @param {string} rootDir - Repository root
 * @param {object} entry - { filePath, patternGuided, patternName, improvement }
 */
function recordPatternHookUsage(rootDir, entry) {
  const logPath = getPatternHookLogPath(rootDir);
  ensureDir(join(rootDir, '.remembrance'));
  const log = loadJSON(logPath, []);
  log.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  trimArray(log, 200);
  saveJSON(logPath, log);
}

/**
 * Get stats on pattern-guided healings.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} Stats
 */
function patternHookStats(rootDir) {
  const log = loadJSON(getPatternHookLogPath(rootDir), []);
  if (log.length === 0) {
    return { totalHealings: 0, patternGuided: 0, patternGuidedRate: 0, avgImprovement: { guided: 0, unguided: 0 } };
  }

  const guided = log.filter(e => e.patternGuided);
  const unguided = log.filter(e => !e.patternGuided);
  const avgImprovement = (entries) => {
    const improvements = entries.filter(e => typeof e.improvement === 'number');
    if (improvements.length === 0) return 0;
    return Math.round(improvements.reduce((s, e) => s + e.improvement, 0) / improvements.length * 1000) / 1000;
  };

  return {
    totalHealings: log.length,
    patternGuided: guided.length,
    patternGuidedRate: Math.round(guided.length / log.length * 1000) / 1000,
    avgImprovement: {
      guided: avgImprovement(guided),
      unguided: avgImprovement(unguided),
    },
    topPatterns: getTopPatterns(guided),
  };
}

/**
 * Get the most-used patterns from guided healings.
 */
function getTopPatterns(guidedEntries) {
  const counts = {};
  for (const e of guidedEntries) {
    if (e.patternName) {
      counts[e.patternName] = (counts[e.patternName] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Format pattern hook result as human-readable text.
 */
function formatPatternHook(hookResult) {
  const lines = [];
  lines.push('── Pattern Library Hook ──');
  lines.push('');
  lines.push(`File:     ${hookResult.filePath}`);
  lines.push(`Decision: ${hookResult.decision || 'N/A'}`);
  lines.push(`Guided:   ${hookResult.patternGuided ? 'Yes' : 'No'}`);
  lines.push('');

  if (hookResult.matches && hookResult.matches.length > 0) {
    lines.push('Matched Patterns:');
    for (const m of hookResult.matches) {
      lines.push(`  - ${m.name} (relevance: ${m.relevance}, coherency: ${m.coherency})`);
    }
    lines.push('');
  }

  lines.push(`Strategy: ${hookResult.healingContext?.suggestedStrategy || 'default'}`);
  lines.push(hookResult.healingContext?.summary || '');

  return lines.join('\n');
}

module.exports = {
  extractFileHints,
  queryPatternsForFile,
  buildHealingContext,
  hookBeforeHeal,
  batchPatternLookup,
  recordPatternHookUsage,
  patternHookStats,
  formatPatternHook,
};
