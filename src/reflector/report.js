/**
 * Remembrance Self-Reflector — Report & Integration
 *
 * Consolidated module combining:
 * - history.js — run history, logging, statistics, trend charts
 * - patternHook.js — pattern-guided healing context
 * - prFormatter.js — PR comment formatting
 * - github.js — git/GitHub operations
 * - autoCommit.js — auto-commit safety pipeline
 * - notifications.js — Discord/Slack notifications
 * - dashboard.js — reflector dashboard
 * - safety.js — backup, rollback, approval, coherence guard
 */

const { readFileSync, existsSync, copyFileSync, writeFileSync, appendFileSync } = require('fs');
const { join, relative, basename, extname } = require('path');
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// ─── Shared Utilities (inlined from utils.js) ───

function ensureDir(dir) {
  const { mkdirSync, existsSync: dirExists } = require('fs');
  if (!dirExists(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadJSON(filePath, fallback = null) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJSON(filePath, data) {
  ensureDir(join(filePath, '..'));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function trimArray(arr, max) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}


// ─── Lazy requires to avoid circular dependencies ───

function _getScoring() { return require('./scoring'); }
function _getMulti() { return require('./multi'); }


// ════════════════════════════════════════════════════════════════
// HISTORY — from history.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — Logging & History
 *
 * Rich run history with:
 * 1. Before/after coherence scores per run
 * 2. Changes applied (files healed, improvements)
 * 3. Whisper text from each run
 * 4. ASCII trend chart for coherence over time
 * 5. Structured log entries with timestamps
 * 6. Statistics and trend analysis
 *
 * History is stored in `.remembrance/reflector-history-v2.json`.
 * Uses only Node.js built-ins.
 */


// ─── History Storage ───

function getHistoryV2Path(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-history-v2.json');
}

function getLogPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector.log');
}

/**
 * Load the v2 history file.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} { runs[], summary }
 */
function loadHistoryV2(rootDir) {
  return loadJSON(getHistoryV2Path(rootDir), { runs: [], version: 2 });
}

/**
 * Save a run record to the v2 history.
 *
 * @param {string} rootDir - Repository root
 * @param {object} record - Run record to save
 * @param {object} options - { maxRuns }
 * @returns {object} The saved record
 */
function saveRunRecord(rootDir, record, options = {}) {
  const { maxRuns = 100 } = options;
  const history = loadHistoryV2(rootDir);
  history.runs.push(record);
  trimArray(history.runs, maxRuns);
  saveJSON(getHistoryV2Path(rootDir), history);
  return record;
}

/**
 * Create a structured run record from a reflector report.
 *
 * @param {object} report - Reflector report from reflect()
 * @param {object} preSnapshot - Snapshot taken before healing
 * @param {object} options - { runId, trigger, branch }
 * @returns {object} Structured run record
 */
function createRunRecord(report, preSnapshot, options = {}) {
  const {
    runId = `run-${Date.now()}`,
    trigger = 'manual',
    branch = null,
    durationMs = 0,
  } = options;

  const beforeCoherence = preSnapshot
    ? (preSnapshot.aggregate ? preSnapshot.aggregate.avgCoherence : preSnapshot.avgCoherence || 0)
    : report.snapshot.avgCoherence;

  const afterCoherence = report.snapshot.avgCoherence;

  return {
    id: runId,
    timestamp: new Date().toISOString(),
    trigger,
    branch,
    durationMs,

    // Before/after scores
    coherence: {
      before: Math.round(beforeCoherence * 1000) / 1000,
      after: Math.round(afterCoherence * 1000) / 1000,
      delta: Math.round((afterCoherence - beforeCoherence) * 1000) / 1000,
    },

    // Dimensions before (from snapshot)
    dimensions: report.snapshot.dimensionAverages || {},

    // Healing summary
    healing: {
      filesScanned: report.summary.filesScanned,
      filesBelowThreshold: report.summary.filesBelowThreshold,
      filesHealed: report.summary.filesHealed,
      totalImprovement: report.summary.totalImprovement,
      avgImprovement: report.summary.avgImprovement,
    },

    // Individual file changes
    changes: (report.healings || []).map(h => ({
      path: h.path,
      language: h.language,
      before: h.originalCoherence,
      after: h.healedCoherence,
      improvement: h.improvement,
      strategy: h.healingSummary || 'reflection',
    })),

    // Whisper
    whisper: report.collectiveWhisper
      ? (typeof report.collectiveWhisper === 'string' ? report.collectiveWhisper : report.collectiveWhisper.message)
      : '',

    // Health status
    health: report.collectiveWhisper
      ? (typeof report.collectiveWhisper === 'object' ? report.collectiveWhisper.overallHealth : 'unknown')
      : 'unknown',
  };
}

// ─── Log Writing ───

/**
 * Append a log entry to the reflector log file.
 *
 * @param {string} rootDir - Repository root
 * @param {string} level - 'INFO', 'WARN', 'ERROR'
 * @param {string} message - Log message
 * @param {object} [data] - Optional structured data
 */
function appendLog(rootDir, level, message, data) {
  ensureDir(join(rootDir, '.remembrance'));

  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    line += ` | ${JSON.stringify(data)}`;
  }
  line += '\n';

  appendFileSync(getLogPath(rootDir), line, 'utf-8');
}

/**
 * Read the last N lines from the log file.
 *
 * @param {string} rootDir - Repository root
 * @param {number} n - Number of lines to read
 * @returns {string[]} Last N log lines
 */
function readLogTail(rootDir, n = 20) {
  const logPath = getLogPath(rootDir);
  try {
    if (!existsSync(logPath)) return [];
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-n);
  } catch {
    return [];
  }
}

// ─── Statistics ───

/**
 * Compute statistics from run history.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} Statistics summary
 */
function computeStats(rootDir) {
  const history = loadHistoryV2(rootDir);
  const runs = history.runs;

  if (runs.length === 0) {
    return {
      totalRuns: 0,
      lastRun: null,
      trend: 'unknown',
      avgCoherence: 0,
      avgImprovement: 0,
      totalFilesHealed: 0,
    };
  }

  const coherenceValues = runs.map(r => r.coherence?.after || 0);
  const improvements = runs.map(r => r.healing?.avgImprovement || 0);
  const filesHealed = runs.reduce((s, r) => s + (r.healing?.filesHealed || 0), 0);

  const avgCoherence = coherenceValues.reduce((s, v) => s + v, 0) / coherenceValues.length;
  const avgImprovement = improvements.reduce((s, v) => s + v, 0) / improvements.length;

  // Trend: compare last 5 runs to previous 5
  let trend = 'stable';
  if (runs.length >= 4) {
    const mid = Math.floor(runs.length / 2);
    const recentAvg = coherenceValues.slice(mid).reduce((s, v) => s + v, 0) / (coherenceValues.length - mid);
    const olderAvg = coherenceValues.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    if (recentAvg - olderAvg > 0.02) trend = 'improving';
    else if (olderAvg - recentAvg > 0.02) trend = 'declining';
  }

  // Best and worst runs
  const sorted = [...runs].sort((a, b) => (b.coherence?.after || 0) - (a.coherence?.after || 0));

  return {
    totalRuns: runs.length,
    lastRun: runs[runs.length - 1],
    firstRun: runs[0],
    trend,
    avgCoherence: Math.round(avgCoherence * 1000) / 1000,
    avgImprovement: Math.round(avgImprovement * 1000) / 1000,
    totalFilesHealed: filesHealed,
    bestRun: sorted[0] ? { id: sorted[0].id, coherence: sorted[0].coherence?.after } : null,
    worstRun: sorted[sorted.length - 1] ? { id: sorted[sorted.length - 1].id, coherence: sorted[sorted.length - 1].coherence?.after } : null,
    recentRuns: runs.slice(-5).reverse().map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      coherence: r.coherence?.after,
      healed: r.healing?.filesHealed || 0,
      health: r.health,
    })),
  };
}

// ─── ASCII Trend Chart ───

/**
 * Generate an ASCII trend chart of coherence over time.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { width, height, last }
 * @returns {string} ASCII chart
 */
function generateTrendChart(rootDir, options = {}) {
  const { width = 60, height = 15, last = 30 } = options;
  const history = loadHistoryV2(rootDir);
  const runs = history.runs.slice(-last);

  if (runs.length === 0) {
    return 'No run history available. Run the reflector to generate data.';
  }

  const values = runs.map(r => r.coherence?.after || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.1; // Avoid division by zero

  const lines = [];

  // Title
  lines.push('Coherence Trend');
  lines.push('');

  // Chart area
  const chartWidth = Math.min(width, values.length);
  const step = values.length > chartWidth ? Math.floor(values.length / chartWidth) : 1;
  const sampled = [];
  for (let i = 0; i < values.length; i += step) {
    sampled.push(values[i]);
  }

  // Build the chart grid
  for (let row = height - 1; row >= 0; row--) {
    const threshold = min + (range * row / (height - 1));
    const label = threshold.toFixed(3);
    let line = label.padStart(6) + ' |';

    for (let col = 0; col < sampled.length; col++) {
      const val = sampled[col];
      const normalizedRow = Math.round((val - min) / range * (height - 1));

      if (normalizedRow === row) {
        line += '\u2588'; // Full block
      } else if (normalizedRow > row) {
        line += '\u2591'; // Light shade (below the data point)
      } else {
        line += ' ';
      }
    }

    lines.push(line);
  }

  // X-axis
  lines.push('       +' + '\u2500'.repeat(sampled.length));

  // Labels
  const firstDate = runs[0].timestamp ? runs[0].timestamp.slice(0, 10) : '?';
  const lastDate = runs[runs.length - 1].timestamp ? runs[runs.length - 1].timestamp.slice(0, 10) : '?';
  const axisLabel = `        ${firstDate}${' '.repeat(Math.max(0, sampled.length - 20))}${lastDate}`;
  lines.push(axisLabel);

  // Summary line
  lines.push('');
  lines.push(`Runs: ${values.length} | Avg: ${(values.reduce((s, v) => s + v, 0) / values.length).toFixed(3)} | Min: ${min.toFixed(3)} | Max: ${max.toFixed(3)}`);

  // Trend indicator
  if (values.length >= 2) {
    const recent = values[values.length - 1];
    const previous = values[values.length - 2];
    const delta = recent - previous;
    const arrow = delta > 0.01 ? '\u25B2' : delta < -0.01 ? '\u25BC' : '\u25C6';
    lines.push(`Trend: ${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`);
  }

  return lines.join('\n');
}

// ─── Run Timeline ───

/**
 * Generate a timeline view of recent runs.
 *
 * @param {string} rootDir - Repository root
 * @param {number} count - Number of runs to show
 * @returns {string} Formatted timeline
 */
function generateTimeline(rootDir, count = 10) {
  const history = loadHistoryV2(rootDir);
  const runs = history.runs.slice(-count).reverse();

  if (runs.length === 0) {
    return 'No run history available.';
  }

  const lines = [];
  lines.push('Run Timeline');
  lines.push('');

  for (const run of runs) {
    const date = run.timestamp ? run.timestamp.slice(0, 19).replace('T', ' ') : '?';
    const coh = run.coherence ? `${run.coherence.before.toFixed(3)} -> ${run.coherence.after.toFixed(3)}` : '?';
    const delta = run.coherence ? (run.coherence.delta >= 0 ? '+' : '') + run.coherence.delta.toFixed(3) : '';
    const healed = run.healing ? run.healing.filesHealed : 0;
    const health = run.health || 'unknown';

    lines.push(`  ${date}  [${run.id}]`);
    lines.push(`    Coherence: ${coh} (${delta})`);
    lines.push(`    Healed: ${healed} file(s) | Health: ${health}`);
    if (run.whisper) {
      lines.push(`    Whisper: "${run.whisper}"`);
    }
    if (run.changes && run.changes.length > 0) {
      for (const ch of run.changes.slice(0, 3)) {
        lines.push(`      ${ch.path}: ${ch.before.toFixed(3)} -> ${ch.after.toFixed(3)} (+${ch.improvement.toFixed(3)})`);
      }
      if (run.changes.length > 3) {
        lines.push(`      ... and ${run.changes.length - 3} more`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}



// ════════════════════════════════════════════════════════════════
// PATTERNHOOK — from patternHook.js
// ════════════════════════════════════════════════════════════════

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
  const { detectLanguage } = require('../core/coherency');
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
    const { PatternLibrary } = require('../patterns/library');
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



// ════════════════════════════════════════════════════════════════
// PRFORMATTER — from prFormatter.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — PR Comment Formatter
 *
 * Generates rich markdown for GitHub PR bodies and comments:
 *
 * 1. Before/after coherence delta with visual indicators
 * 2. Top 3 healed changes with file paths and improvements
 * 3. Whisper message with health context
 * 4. Deep score summary (if available)
 * 5. Security findings summary
 * 6. Dimensional breakdown with progress bars
 * 7. Approval prompt: "Approve to manifest this remembrance"
 *
 * Uses only Node.js built-ins.
 */

// ─── Progress Bar Generator ───

/**
 * Generate a markdown-compatible progress bar using Unicode blocks.
 *
 * @param {number} value - Value 0-1
 * @param {number} width - Bar width in characters
 * @returns {string} Visual bar
 */
function progressBar(value, width = 20) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Format a score with color-coded emoji indicator.
 */
function scoreIndicator(score) {
  if (typeof score !== 'number') return '\u2753 N/A';
  if (score >= 0.9) return `\u{1F7E2} ${score.toFixed(3)}`;   // Green
  if (score >= 0.7) return `\u{1F7E1} ${score.toFixed(3)}`;   // Yellow
  if (score >= 0.5) return `\u{1F7E0} ${score.toFixed(3)}`;   // Orange
  return `\u{1F534} ${score.toFixed(3)}`;                       // Red
}

/**
 * Format a delta with arrow and sign.
 */
function deltaIndicator(delta) {
  if (typeof delta !== 'number') return '';
  if (delta > 0.01) return `\u25B2 +${delta.toFixed(3)}`;
  if (delta < -0.01) return `\u25BC ${delta.toFixed(3)}`;
  return `\u25C6 ${delta.toFixed(3)}`;
}

// ─── PR Body Formatter ───

/**
 * Generate a full PR body with rich markdown.
 *
 * @param {object} report - Orchestration or reflector report
 * @param {object} options - { includeDeepScore, includeSecurity, includeFiles }
 * @returns {string} Markdown PR body
 */
function formatPRComment(report, options = {}) {
  const {
    includeDeepScore = true,
    includeSecurity = true,
    includeFiles = true,
    maxFiles = 10,
  } = options;

  const lines = [];

  // ── Header ──
  lines.push('## Remembrance Pull: Healed Refinement');
  lines.push('');

  // ── Coherence Delta ──
  const coherence = report.coherence || report.snapshot || {};
  const before = coherence.before ?? coherence.avgCoherence ?? 0;
  const after = coherence.after ?? before;
  const delta = coherence.delta ?? (after - before);

  lines.push('### Coherence');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Before | ${scoreIndicator(before)} |`);
  lines.push(`| After  | ${scoreIndicator(after)} |`);
  lines.push(`| Delta  | ${deltaIndicator(delta)} |`);
  lines.push('');

  // Visual bar
  lines.push(`\`Before:\` ${progressBar(before)} ${before.toFixed(3)}`);
  lines.push(`\`After: \` ${progressBar(after)} ${after.toFixed(3)}`);
  lines.push('');

  // ── Top Healed Changes ──
  const healings = report.changes || report.healings || [];
  if (healings.length > 0) {
    lines.push('### Top Changes');
    lines.push('');

    const top = healings
      .sort((a, b) => (b.improvement || 0) - (a.improvement || 0))
      .slice(0, 3);

    for (let i = 0; i < top.length; i++) {
      const h = top[i];
      const before = h.before ?? h.originalCoherence ?? 0;
      const after = h.after ?? h.healedCoherence ?? 0;
      const improve = h.improvement ?? (after - before);
      lines.push(`**${i + 1}. \`${h.path}\`**`);
      lines.push(`   ${before.toFixed(3)} \u2192 ${after.toFixed(3)} (+${improve.toFixed(3)})`);
      if (h.strategy) lines.push(`   _Strategy: ${h.strategy}_`);
      lines.push('');
    }

    if (healings.length > 3) {
      lines.push(`_...and ${healings.length - 3} more file(s) healed._`);
      lines.push('');
    }
  }

  // ── Healing Summary ──
  const healing = report.healing || {};
  if (healing.filesHealed !== undefined || healing.filesScanned !== undefined) {
    lines.push('### Healing Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    if (healing.filesScanned !== undefined) lines.push(`| Files Scanned | ${healing.filesScanned} |`);
    if (healing.filesBelowThreshold !== undefined) lines.push(`| Below Threshold | ${healing.filesBelowThreshold} |`);
    if (healing.filesHealed !== undefined) lines.push(`| Files Healed | ${healing.filesHealed} |`);
    if (healing.avgImprovement !== undefined) lines.push(`| Avg Improvement | +${healing.avgImprovement.toFixed(3)} |`);
    lines.push('');
  }

  // ── Deep Score ──
  if (includeDeepScore && report.deepScore) {
    const ds = report.deepScore;
    lines.push('### Deep Score Analysis');
    lines.push('');
    lines.push(`**Aggregate:** ${scoreIndicator(ds.aggregate)} | **Health:** ${ds.health}`);
    lines.push('');

    if (ds.dimensions) {
      lines.push('| Dimension | Score | Bar |');
      lines.push('|-----------|-------|-----|');
      for (const [dim, val] of Object.entries(ds.dimensions)) {
        const score = typeof val === 'number' ? val : val?.score || 0;
        lines.push(`| ${dim} | ${score.toFixed(3)} | ${progressBar(score, 15)} |`);
      }
      lines.push('');
    }

    if (ds.worstFiles?.length > 0) {
      lines.push('<details>');
      lines.push('<summary>Worst Files</summary>');
      lines.push('');
      for (const f of ds.worstFiles.slice(0, 5)) {
        lines.push(`- \`${f.path}\` — ${scoreIndicator(f.score)}`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // ── Security Findings ──
  if (includeSecurity) {
    const findings = report.securityFindings || report.deepScore?.securityFindings || [];
    const count = typeof findings === 'number' ? findings : findings.length;
    if (count > 0) {
      lines.push('### Security Findings');
      lines.push('');
      if (Array.isArray(findings)) {
        for (const f of findings.slice(0, 5)) {
          const icon = f.severity === 'critical' ? '\u{1F6A8}' : f.severity === 'high' ? '\u26A0\uFE0F' : '\u{1F50D}';
          lines.push(`- ${icon} **${f.severity}**: ${f.message}${f.file ? ` (\`${f.file}\`)` : ''}`);
        }
        if (findings.length > 5) {
          lines.push(`- _...and ${findings.length - 5} more finding(s)._`);
        }
      } else {
        lines.push(`- ${count} security finding(s) detected. Run \`reflector repo-score\` for details.`);
      }
      lines.push('');
    }
  }

  // ── All Changed Files ──
  if (includeFiles && healings.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>All Changed Files (${healings.length})</summary>`);
    lines.push('');
    lines.push('| File | Before | After | Delta |');
    lines.push('|------|--------|-------|-------|');
    for (const h of healings.slice(0, maxFiles)) {
      const before = h.before ?? h.originalCoherence ?? 0;
      const after = h.after ?? h.healedCoherence ?? 0;
      const delta = h.improvement ?? (after - before);
      lines.push(`| \`${h.path}\` | ${before.toFixed(3)} | ${after.toFixed(3)} | +${delta.toFixed(3)} |`);
    }
    if (healings.length > maxFiles) {
      lines.push(`| _...${healings.length - maxFiles} more_ | | | |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // ── Whisper ──
  const whisper = report.whisper || report.collectiveWhisper || '';
  const whisperText = typeof whisper === 'string' ? whisper : whisper.message || '';
  if (whisperText) {
    lines.push('### Whisper');
    lines.push('');
    lines.push(`> ${whisperText}`);
    lines.push('');
  }

  // ── Safety ──
  if (report.safety) {
    const s = report.safety;
    if (s.autoRolledBack) {
      lines.push('> \u26A0\uFE0F **Auto-rollback triggered** — coherence dropped after healing.');
      lines.push('');
    }
    if (s.backup) {
      lines.push(`_Backup: \`${s.backup}\`_`);
      lines.push('');
    }
  }

  // ── Footer ──
  lines.push('---');
  lines.push('');
  lines.push('**Approve to manifest this remembrance.**');
  lines.push('');
  lines.push('_Generated by the Remembrance Self-Reflector Bot._');

  return lines.join('\n');
}

/**
 * Generate a concise PR review comment (for inline comments on specific files).
 *
 * @param {object} fileResult - Per-file healing result
 * @returns {string} Markdown comment
 */
function formatFileComment(fileResult) {
  const before = fileResult.before ?? fileResult.originalCoherence ?? 0;
  const after = fileResult.after ?? fileResult.healedCoherence ?? 0;
  const improvement = fileResult.improvement ?? (after - before);

  const lines = [];
  lines.push(`**Remembrance Healed** \u2014 coherence: ${before.toFixed(3)} \u2192 ${after.toFixed(3)} (+${improvement.toFixed(3)})`);

  if (fileResult.strategy) {
    lines.push(`_Strategy: ${fileResult.strategy}_`);
  }

  if (fileResult.whisper) {
    lines.push(`> ${fileResult.whisper}`);
  }

  return lines.join('\n');
}

/**
 * Generate a PR status check summary (for GitHub Check Runs).
 *
 * @param {object} report - Orchestration result
 * @returns {object} { title, summary, conclusion }
 */
function formatCheckRun(report) {
  const coherence = report.coherence || report.snapshot || {};
  const after = coherence.after ?? coherence.avgCoherence ?? 0;
  const healed = report.healing?.filesHealed ?? 0;
  const whisper = typeof report.whisper === 'string' ? report.whisper : report.whisper?.message || '';

  const conclusion = after >= 0.8 ? 'success' :
                     after >= 0.6 ? 'neutral' : 'failure';

  return {
    title: `Coherence: ${after.toFixed(3)} | ${healed} file(s) healed`,
    summary: `**Coherence:** ${scoreIndicator(after)}\n**Healed:** ${healed} file(s)\n\n> ${whisper}`,
    conclusion,
  };
}



// ════════════════════════════════════════════════════════════════
// GITHUB — from github.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — GitHub Integration
 *
 * Handles all GitHub operations for the self-reflector:
 * 1. Creating healing branches from the current HEAD
 * 2. Committing healed file changes
 * 3. Opening PRs with whisper explanations
 * 4. Checking for existing reflector PRs
 * 5. Auto-merge support for high-coherence PRs
 *
 * Uses the `gh` CLI or raw `git` commands — no external dependencies.
 */


// ─── Branch Naming ───

/**
 * Generate a unique healing branch name.
 * Format: remembrance/heal-YYYY-MM-DD-HHMMSS
 */
function generateBranchName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `remembrance/heal-${date}-${time}`;
}

// ─── Git Operations ───

/**
 * Execute a git command in the given directory.
 * Returns stdout as a string.
 */
function git(command, cwd) {
  try {
    return execSync(`git ${command}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    throw new Error(`git ${command} failed: ${stderr || err.message}`);
  }
}

/**
 * Execute a gh CLI command.
 */
function gh(command, cwd) {
  try {
    return execSync(`gh ${command}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env },
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    throw new Error(`gh ${command} failed: ${stderr || err.message}`);
  }
}

/**
 * Check if gh CLI is available and authenticated.
 */
function isGhAvailable(cwd) {
  try {
    gh('auth status', cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name.
 */
function getCurrentBranch(cwd) {
  return git('rev-parse --abbrev-ref HEAD', cwd);
}

/**
 * Get the default remote branch (main or master).
 */
function getDefaultBranch(cwd) {
  try {
    const remote = git('remote show origin', cwd);
    const match = remote.match(/HEAD branch:\s*(\S+)/);
    if (match) return match[1];
  } catch {
    // Fallback
  }
  // Check if main exists, otherwise try master
  try {
    git('rev-parse --verify main', cwd);
    return 'main';
  } catch {
    try {
      git('rev-parse --verify master', cwd);
      return 'master';
    } catch {
      return 'main';
    }
  }
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
function isCleanWorkingTree(cwd) {
  const status = git('status --porcelain', cwd);
  return status === '';
}

// ─── Healing Branch Operations ───

/**
 * Create a healing branch, commit healed files, and optionally push + open PR.
 *
 * @param {object} report - Reflector report from engine.reflect()
 * @param {object} options - { push, openPR, autoMerge, baseBranch, cwd }
 * @returns {object} { branch, commits, prUrl, prNumber }
 */
function createHealingBranch(report, options = {}) {
  const {
    push = false,
    openPR = false,
    autoMerge = false,
    baseBranch,
    cwd = report.rootDir,
    branchName,
  } = options;

  if (!report.healedFiles || report.healedFiles.length === 0) {
    return { branch: null, commits: 0, message: 'No files to heal' };
  }

  const currentBranch = getCurrentBranch(cwd);
  const base = baseBranch || currentBranch;
  const branch = branchName || generateBranchName();
  const result = { branch, baseBranch: base, commits: 0, files: [] };

  // Stash any uncommitted changes
  let stashed = false;
  if (!isCleanWorkingTree(cwd)) {
    git('stash push -m "reflector: stash before healing"', cwd);
    stashed = true;
  }

  try {
    // Create and switch to healing branch
    git(`checkout -b ${branch}`, cwd);

    // Write healed files
    for (const file of report.healedFiles) {
      const absPath = file.absolutePath || join(cwd, file.path);
      writeFileSync(absPath, file.code, 'utf-8');
      git(`add "${file.path}"`, cwd);
      result.files.push(file.path);
    }

    // Commit
    const healingCount = report.healedFiles.length;
    const commitMsg = `Remembrance Pull: Healed ${healingCount} file(s)\n\n${report.collectiveWhisper.message}\n\nAvg improvement: +${report.summary.avgImprovement.toFixed(3)}\nOverall health: ${report.collectiveWhisper.overallHealth}`;

    // Use env var to pass commit message safely (avoids shell injection via backticks/$())
    try {
      execSync('git commit -m "$REMEMBRANCE_COMMIT_MSG"', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
        env: { ...process.env, REMEMBRANCE_COMMIT_MSG: commitMsg },
      });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      throw new Error(`git commit failed: ${stderr || err.message}`);
    }
    result.commits = 1;

    // Push if requested
    if (push) {
      git(`push -u origin ${branch}`, cwd);
      result.pushed = true;
    }

    // Open PR if requested
    if (openPR && push) {
      const prResult = openHealingPR(report, {
        branch,
        baseBranch: base,
        autoMerge,
        cwd,
      });
      result.prUrl = prResult.url;
      result.prNumber = prResult.number;
    }
  } finally {
    // Return to original branch
    try {
      git(`checkout ${currentBranch}`, cwd);
    } catch {
      // Best effort
    }

    // Restore stashed changes
    if (stashed) {
      try {
        git('stash pop', cwd);
      } catch {
        // Best effort
      }
    }
  }

  return result;
}

// ─── PR Operations ───

/**
 * Open a Healing PR with the reflector report as the body.
 *
 * @param {object} report - Reflector report
 * @param {object} options - { branch, baseBranch, autoMerge, cwd }
 * @returns {object} { url, number }
 */
function openHealingPR(report, options = {}) {
  const {
    branch,
    baseBranch = 'main',
    autoMerge = false,
    cwd,
  } = options;

  if (!isGhAvailable(cwd)) {
    return { url: null, error: 'gh CLI not available or not authenticated' };
  }

  const { formatPRBody } = require('./multi');
  const body = formatPRBody(report);

  const title = `Remembrance Pull: Healed Refinement (+${report.summary.avgImprovement.toFixed(3)})`;
  const labels = 'remembrance,auto-heal';

  // Escape body for shell
  const escapedBody = body.replace(/'/g, "'\\''");

  try {
    const output = gh(
      `pr create --title '${title}' --body '${escapedBody}' --base ${baseBranch} --head ${branch} --label '${labels}'`,
      cwd
    );

    // Parse PR URL from output
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const numberMatch = output.match(/\/pull\/(\d+)/);

    const result = {
      url: urlMatch ? urlMatch[0] : output,
      number: numberMatch ? parseInt(numberMatch[1]) : null,
    };

    // Auto-merge if requested and high coherence
    if (autoMerge && report.summary.autoMergeRecommended && result.number) {
      try {
        gh(`pr merge ${result.number} --auto --squash`, cwd);
        result.autoMergeEnabled = true;
      } catch {
        result.autoMergeEnabled = false;
      }
    }

    return result;
  } catch (err) {
    return { url: null, error: err.message };
  }
}

/**
 * Check if there's already an open reflector PR.
 *
 * @param {string} cwd - Repository directory
 * @returns {object|null} Existing PR info or null
 */
function findExistingReflectorPR(cwd) {
  if (!isGhAvailable(cwd)) return null;

  try {
    const output = gh('pr list --label remembrance --state open --json number,title,url', cwd);
    const prs = JSON.parse(output);
    return prs.length > 0 ? prs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Generate the GitHub Actions workflow YAML for the self-reflector.
 */
function generateReflectorWorkflow(config = {}) {
  const {
    schedule = '0 */6 * * *',  // Every 6 hours
    minCoherence = 0.7,
    autoMerge = false,
    nodeVersion = '22',
  } = config;

  return `name: Remembrance Self-Reflector

on:
  schedule:
    - cron: '${schedule}'
  push:
    branches: [main, master]
  pull_request:
    types: [opened, synchronize]
  workflow_dispatch:
    inputs:
      min_coherence:
        description: 'Minimum coherence threshold (0-1)'
        required: false
        default: '${minCoherence}'
      auto_merge:
        description: 'Auto-merge high-coherence PRs'
        required: false
        default: '${autoMerge}'
        type: boolean

permissions:
  contents: write
  pull-requests: write

jobs:
  reflect:
    name: Self-Reflect & Heal
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'

      - name: Run Self-Reflector
        run: |
          MIN_COHERENCE=\${{ github.event.inputs.min_coherence || '${minCoherence}' }}
          AUTO_MERGE=\${{ github.event.inputs.auto_merge || '${autoMerge}' }}
          node src/cli.js reflector run --min-coherence "$MIN_COHERENCE" --push --open-pr \\
            \${{ env.AUTO_MERGE == 'true' && '--auto-merge' || '' }} --json
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reflector-report
          path: .remembrance/reflector-report.json
          retention-days: 30
`;
}



// ════════════════════════════════════════════════════════════════
// AUTOCOMMIT — from autoCommit.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — Auto-Commit Safety
 *
 * Ensures healing never damages the repo by:
 *
 * 1. createSafetyBranch — create a backup branch at current HEAD before changes
 * 2. runTestGate — execute build/test commands on the healing branch
 * 3. mergeIfPassing — only merge into base when test gate passes
 * 4. safeAutoCommit — full pipeline: branch → heal → test → merge (or abort)
 *
 * Uses only Node.js built-ins.
 */


// ─── Safety Branch ───

/**
 * Create a safety branch at current HEAD before any healing begins.
 * This preserves the exact state for rollback if tests fail.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { label }
 * @returns {object} { branch, headCommit, baseBranch, timestamp }
 */
function createSafetyBranch(rootDir, options = {}) {
  const { label = '' } = options;
  const timestamp = new Date().toISOString();
  const baseBranch = getCurrentBranch(rootDir);
  const headCommit = git('rev-parse HEAD', rootDir);
  const safetyBranch = `remembrance/safety-${Date.now()}`;

  git(`branch ${safetyBranch}`, rootDir);

  return {
    branch: safetyBranch,
    headCommit,
    baseBranch,
    timestamp,
    label: label || `Safety snapshot before healing at ${timestamp}`,
  };
}

// ─── Test Gate ───

/**
 * Run build/test commands on the current branch.
 * Returns structured result: pass/fail, stdout, stderr, duration.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { testCommand, buildCommand, timeoutMs }
 * @returns {object} { passed, steps[] }
 */
function runTestGate(rootDir, options = {}) {
  const config = _getScoring().resolveConfig(rootDir, { env: process.env });
  const {
    testCommand = config.autoCommit?.testCommand || 'npm test',
    buildCommand = config.autoCommit?.buildCommand || '',
    timeoutMs = config.autoCommit?.testTimeoutMs || 120000,
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    passed: true,
    steps: [],
  };

  const commands = [];
  if (buildCommand) commands.push({ name: 'build', command: buildCommand });
  if (testCommand) commands.push({ name: 'test', command: testCommand });

  for (const step of commands) {
    const stepResult = runCommand(step.command, rootDir, timeoutMs);
    stepResult.name = step.name;
    result.steps.push(stepResult);

    if (!stepResult.passed) {
      result.passed = false;
      result.failedStep = step.name;
      result.failReason = stepResult.error || `${step.name} command exited with non-zero code`;
      break; // Stop on first failure
    }
  }

  return result;
}

/**
 * Execute a single command with timeout, capturing output.
 */
function runCommand(command, cwd, timeoutMs = 120000) {
  const start = Date.now();
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    });
    return {
      command,
      passed: true,
      durationMs: Date.now() - start,
      stdout: truncate(stdout, 5000),
    };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    return {
      command,
      passed: false,
      durationMs: Date.now() - start,
      exitCode: err.status || 1,
      stdout: truncate(stdout, 5000),
      stderr: truncate(stderr, 5000),
      error: err.message,
    };
  }
}

/**
 * Truncate a string to maxLen characters.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + `\n... (truncated, ${str.length} total chars)`;
}

// ─── Merge If Passing ───

/**
 * Merge healing branch into base only if test gate passed.
 * If tests fail, abort and switch back to base branch.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { healingBranch, baseBranch, safetyBranch, testResult, squash }
 * @returns {object} { merged, aborted, reason }
 */
function mergeIfPassing(rootDir, options = {}) {
  const {
    healingBranch,
    baseBranch,
    safetyBranch,
    testResult,
    squash = true,
  } = options;

  if (!testResult || !testResult.passed) {
    // Test gate failed — abort and restore
    try {
      git(`checkout ${baseBranch}`, rootDir);
    } catch {
      // Best effort
    }

    // Delete the healing branch since it failed
    try {
      git(`branch -D ${healingBranch}`, rootDir);
    } catch {
      // Best effort
    }

    return {
      merged: false,
      aborted: true,
      reason: testResult
        ? `Test gate failed at step: ${testResult.failedStep || 'unknown'}. ${testResult.failReason || ''}`
        : 'No test result provided',
      safetyBranch,
    };
  }

  // Tests passed — merge into base
  try {
    git(`checkout ${baseBranch}`, rootDir);

    if (squash) {
      git(`merge --squash ${healingBranch}`, rootDir);
      git(`commit -m "Remembrance Pull: Healed refinement (test-verified)"`, rootDir);
    } else {
      git(`merge ${healingBranch} --no-ff -m "Remembrance Pull: Healed refinement (test-verified)"`, rootDir);
    }

    // Clean up the safety branch (no longer needed since merge succeeded)
    try {
      git(`branch -D ${safetyBranch}`, rootDir);
    } catch {
      // Keep safety branch if delete fails
    }

    return {
      merged: true,
      aborted: false,
      reason: 'All tests passed. Healing merged successfully.',
      baseBranch,
      healingBranch,
    };
  } catch (err) {
    // Merge conflict or error — abort
    try {
      git('merge --abort', rootDir);
    } catch {
      // Best effort
    }

    return {
      merged: false,
      aborted: true,
      reason: `Merge failed: ${err.message}`,
      safetyBranch,
    };
  }
}

// ─── Full Safe Auto-Commit Pipeline ───

/**
 * Full auto-commit safety pipeline:
 * 1. Create safety branch (backup)
 * 2. Create healing branch from base
 * 3. Apply healed files
 * 4. Run test gate on healing branch
 * 5. Merge if tests pass, abort if they fail
 * 6. Record result to auto-commit history
 *
 * @param {string} rootDir - Repository root
 * @param {object} healedFiles - Array of { path, code } from reflector
 * @param {object} options - { testCommand, buildCommand, timeoutMs, squash, dryRun }
 * @returns {object} Full pipeline result
 */
function safeAutoCommit(rootDir, healedFiles, options = {}) {
  const {
    testCommand,
    buildCommand,
    timeoutMs,
    squash = true,
    dryRun = false,
    commitMessage,
  } = options;

  const startTime = Date.now();
  const result = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'live',
    pipeline: [],
  };

  if (!healedFiles || healedFiles.length === 0) {
    result.skipped = true;
    result.reason = 'No healed files to commit';
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Step 1: Ensure clean working tree
  if (!isCleanWorkingTree(rootDir)) {
    result.skipped = true;
    result.reason = 'Working tree has uncommitted changes. Stash or commit them first.';
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Step 2: Create safety branch (backup)
  let safetyInfo;
  try {
    safetyInfo = createSafetyBranch(rootDir);
    result.pipeline.push({ step: 'safety-branch', status: 'ok', branch: safetyInfo.branch });
  } catch (err) {
    result.pipeline.push({ step: 'safety-branch', status: 'error', error: err.message });
    result.aborted = true;
    result.reason = `Failed to create safety branch: ${err.message}`;
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  const baseBranch = safetyInfo.baseBranch;
  const healingBranch = generateBranchName();

  if (dryRun) {
    result.pipeline.push({ step: 'dry-run', status: 'ok', message: 'Would create healing branch, apply files, run tests, and merge if passing.' });
    result.dryRun = {
      safetyBranch: safetyInfo.branch,
      healingBranch,
      filesCount: healedFiles.length,
      testCommand: testCommand || 'npm test',
      buildCommand: buildCommand || '(none)',
    };
    // Clean up the safety branch in dry-run
    try { git(`branch -D ${safetyInfo.branch}`, rootDir); } catch { /* ignore */ }
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  // Step 3: Create healing branch and apply healed files
  try {
    git(`checkout -b ${healingBranch}`, rootDir);
    result.pipeline.push({ step: 'healing-branch', status: 'ok', branch: healingBranch });

    for (const file of healedFiles) {
      const absPath = file.absolutePath || join(rootDir, file.path);
      fs.writeFileSync(absPath, file.code, 'utf-8');
      git(`add "${file.path}"`, rootDir);
    }

    const msg = commitMessage || `Remembrance Pull: Healed ${healedFiles.length} file(s)`;
    git(`commit -m "${msg.replace(/"/g, '\\"')}"`, rootDir);
    result.pipeline.push({ step: 'commit', status: 'ok', files: healedFiles.length });
  } catch (err) {
    result.pipeline.push({ step: 'commit', status: 'error', error: err.message });
    // Abort — go back to base
    try { git(`checkout ${baseBranch}`, rootDir); } catch { /* ignore */ }
    try { git(`branch -D ${healingBranch}`, rootDir); } catch { /* ignore */ }
    try { git(`branch -D ${safetyInfo.branch}`, rootDir); } catch { /* ignore */ }
    result.aborted = true;
    result.reason = `Failed to commit healed files: ${err.message}`;
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  // Step 4: Run test gate
  const testResult = runTestGate(rootDir, { testCommand, buildCommand, timeoutMs });
  result.pipeline.push({
    step: 'test-gate',
    status: testResult.passed ? 'ok' : 'failed',
    steps: testResult.steps.map(s => ({ name: s.name, passed: s.passed, durationMs: s.durationMs })),
  });
  result.testResult = testResult;

  // Step 5: Merge or abort
  const mergeResult = mergeIfPassing(rootDir, {
    healingBranch,
    baseBranch,
    safetyBranch: safetyInfo.branch,
    testResult,
    squash,
  });
  result.pipeline.push({
    step: 'merge',
    status: mergeResult.merged ? 'ok' : 'aborted',
    reason: mergeResult.reason,
  });
  result.merged = mergeResult.merged;
  result.aborted = mergeResult.aborted || false;
  result.reason = mergeResult.reason;
  result.safetyBranch = safetyInfo.branch;
  result.healingBranch = healingBranch;
  result.durationMs = Date.now() - startTime;

  // Step 6: Record to history
  recordAutoCommit(rootDir, result);

  return result;
}

// ─── History ───

/**
 * Get the path to the auto-commit history file.
 */
function getAutoCommitHistoryPath(rootDir) {
  return join(rootDir, '.remembrance', 'auto-commit-history.json');
}

/**
 * Record an auto-commit result to history.
 */
function recordAutoCommit(rootDir, result) {
  const historyPath = getAutoCommitHistoryPath(rootDir);
  ensureDir(join(rootDir, '.remembrance'));
  const history = loadJSON(historyPath, []);
  history.push({
    timestamp: result.timestamp,
    mode: result.mode,
    merged: result.merged || false,
    aborted: result.aborted || false,
    skipped: result.skipped || false,
    reason: result.reason,
    durationMs: result.durationMs,
    testPassed: result.testResult ? result.testResult.passed : null,
  });
  trimArray(history, 100);
  saveJSON(historyPath, history);
}

/**
 * Load auto-commit history.
 */
function loadAutoCommitHistory(rootDir) {
  return loadJSON(getAutoCommitHistoryPath(rootDir), []);
}

/**
 * Get auto-commit stats from history.
 */
function autoCommitStats(rootDir) {
  const history = loadAutoCommitHistory(rootDir);
  if (history.length === 0) {
    return { totalRuns: 0, merged: 0, aborted: 0, skipped: 0, successRate: 0 };
  }

  const merged = history.filter(h => h.merged).length;
  const aborted = history.filter(h => h.aborted).length;
  const skipped = history.filter(h => h.skipped).length;
  const tested = history.filter(h => h.testPassed !== null).length;
  const testsPassed = history.filter(h => h.testPassed === true).length;

  return {
    totalRuns: history.length,
    merged,
    aborted,
    skipped,
    successRate: tested > 0 ? Math.round((testsPassed / tested) * 1000) / 1000 : 0,
    avgDurationMs: Math.round(history.reduce((s, h) => s + (h.durationMs || 0), 0) / history.length),
    lastRun: history[history.length - 1],
  };
}

/**
 * Format auto-commit result as human-readable text.
 */
function formatAutoCommit(result) {
  const lines = [];
  lines.push('── Auto-Commit Safety Report ──');
  lines.push('');
  lines.push(`Mode:      ${result.mode || 'live'}`);
  lines.push(`Time:      ${result.timestamp}`);
  lines.push(`Duration:  ${result.durationMs}ms`);
  lines.push('');

  if (result.skipped) {
    lines.push(`SKIPPED: ${result.reason}`);
    return lines.join('\n');
  }

  lines.push('Pipeline Steps:');
  for (const step of (result.pipeline || [])) {
    const icon = step.status === 'ok' ? '[OK]' : step.status === 'failed' ? '[FAIL]' : '[SKIP]';
    lines.push(`  ${icon} ${step.step}${step.branch ? ` (${step.branch})` : ''}${step.reason ? ` — ${step.reason}` : ''}`);
  }
  lines.push('');

  if (result.merged) {
    lines.push('RESULT: Healing merged successfully (test-verified).');
  } else if (result.aborted) {
    lines.push(`RESULT: Aborted — ${result.reason}`);
    if (result.safetyBranch) {
      lines.push(`Safety branch preserved: ${result.safetyBranch}`);
    }
  }

  return lines.join('\n');
}



// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS — from notifications.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — Discord / Slack Notifications
 *
 * Post PR links, coherence deltas, whispers, and healing summaries
 * to Discord or Slack channels via webhook URLs.
 *
 * 1. sendDiscordNotification — POST to Discord webhook
 * 2. sendSlackNotification — POST to Slack webhook
 * 3. formatDiscordEmbed — Rich embed for Discord
 * 4. formatSlackBlocks — Block Kit message for Slack
 * 5. notify — Unified: auto-detect platform from webhook URL
 * 6. notifyFromReport — Build message from reflector report and send
 *
 * Uses only Node.js built-ins (https module for webhook POST).
 */


// ─── HTTP POST Helper ───

/**
 * POST JSON to a URL. Returns a promise-like result via callback or sync wrapper.
 * Since the project is zero-dependency and uses sync patterns,
 * this returns a synchronous result using a blocking approach.
 *
 * @param {string} webhookUrl - Full URL to POST to
 * @param {object} payload - JSON body
 * @param {object} options - { timeoutMs }
 * @returns {object} { ok, status, error }
 */
function postJSON(webhookUrl, payload, options = {}) {
  const { timeoutMs = 10000 } = options;

  try {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const mod = url.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = mod.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              body: data,
            });
          });
        }
      );

      req.on('error', (err) => {
        resolve({ ok: false, status: 0, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, error: 'Request timed out' });
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    return Promise.resolve({ ok: false, status: 0, error: err.message });
  }
}

// ─── Discord ───

/**
 * Build a Discord embed object from a reflector report.
 *
 * @param {object} report - Reflector/orchestration report
 * @param {object} options - { repoName, prUrl }
 * @returns {object} Discord embed object
 */
function formatDiscordEmbed(report, options = {}) {
  const { repoName = 'unknown', prUrl } = options;

  const coherenceBefore = report.coherence?.before ?? report.safety?.preCoherence ?? 0;
  const coherenceAfter = report.coherence?.after ?? report.safety?.coherenceGuard?.postCoherence ?? 0;
  const delta = coherenceAfter - coherenceBefore;
  const filesHealed = report.report?.filesHealed ?? report.healing?.filesHealed ?? 0;
  const whisper = extractWhisper(report);

  const color = delta > 0 ? 0x00cc66 : delta < 0 ? 0xcc3333 : 0x999999;
  const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);

  const fields = [
    { name: 'Coherence', value: `${coherenceBefore.toFixed(3)} → ${coherenceAfter.toFixed(3)} (${deltaStr})`, inline: true },
    { name: 'Files Healed', value: `${filesHealed}`, inline: true },
  ];

  if (prUrl) {
    fields.push({ name: 'Pull Request', value: `[View PR](${prUrl})`, inline: false });
  }

  if (whisper) {
    fields.push({ name: 'Whisper', value: whisper, inline: false });
  }

  return {
    embeds: [{
      title: `Remembrance Pull: ${repoName}`,
      description: `Healed ${filesHealed} file(s) with coherence delta ${deltaStr}.`,
      color,
      fields,
      footer: { text: 'Remembrance Self-Reflector Bot' },
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Send a notification to a Discord webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function sendDiscordNotification(webhookUrl, report, options = {}) {
  const embed = formatDiscordEmbed(report, options);
  return postJSON(webhookUrl, embed, { timeoutMs: options.timeoutMs });
}

// ─── Slack ───

/**
 * Build Slack Block Kit blocks from a reflector report.
 *
 * @param {object} report - Reflector/orchestration report
 * @param {object} options - { repoName, prUrl }
 * @returns {object} Slack message payload
 */
function formatSlackBlocks(report, options = {}) {
  const { repoName = 'unknown', prUrl } = options;

  const coherenceBefore = report.coherence?.before ?? report.safety?.preCoherence ?? 0;
  const coherenceAfter = report.coherence?.after ?? report.safety?.coherenceGuard?.postCoherence ?? 0;
  const delta = coherenceAfter - coherenceBefore;
  const filesHealed = report.report?.filesHealed ?? report.healing?.filesHealed ?? 0;
  const whisper = extractWhisper(report);
  const deltaStr = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3);
  const emoji = delta > 0 ? ':chart_with_upwards_trend:' : delta < 0 ? ':chart_with_downwards_trend:' : ':heavy_minus_sign:';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Remembrance Pull: ${repoName}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Coherence:*\n${coherenceBefore.toFixed(3)} → ${coherenceAfter.toFixed(3)} (${deltaStr}) ${emoji}` },
        { type: 'mrkdwn', text: `*Files Healed:*\n${filesHealed}` },
      ],
    },
  ];

  if (whisper) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> _${whisper}_` },
    });
  }

  if (prUrl) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Pull Request' },
        url: prUrl,
        style: 'primary',
      }],
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Remembrance Self-Reflector Bot_' }],
  });

  return { blocks, text: `Remembrance Pull: ${repoName} — ${filesHealed} file(s) healed (${deltaStr})` };
}

/**
 * Send a notification to a Slack webhook.
 *
 * @param {string} webhookUrl - Slack incoming webhook URL
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function sendSlackNotification(webhookUrl, report, options = {}) {
  const payload = formatSlackBlocks(report, options);
  return postJSON(webhookUrl, payload, { timeoutMs: options.timeoutMs });
}

// ─── Unified Notify ───

/**
 * Auto-detect platform from webhook URL and send notification.
 *
 * @param {string} webhookUrl - Webhook URL (Discord or Slack)
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, platform, timeoutMs }
 * @returns {Promise<object>} Send result
 */
async function notify(webhookUrl, report, options = {}) {
  const platform = options.platform || detectPlatform(webhookUrl);

  if (platform === 'discord') {
    return sendDiscordNotification(webhookUrl, report, options);
  }
  if (platform === 'slack') {
    return sendSlackNotification(webhookUrl, report, options);
  }

  // Generic: try Slack-style payload
  return sendSlackNotification(webhookUrl, report, options);
}

/**
 * Detect the platform from a webhook URL.
 */
function detectPlatform(webhookUrl) {
  if (!webhookUrl) return 'unknown';
  if (webhookUrl.includes('discord.com') || webhookUrl.includes('discordapp.com')) return 'discord';
  if (webhookUrl.includes('hooks.slack.com')) return 'slack';
  return 'generic';
}

// ─── Notify From Report ───

/**
 * Build a notification from a reflector report and send it.
 * Reads webhook config from central config.
 *
 * @param {string} rootDir - Repository root
 * @param {object} report - Reflector report
 * @param {object} options - { repoName, prUrl, webhookUrl, platform }
 * @returns {Promise<object>} Send result
 */
async function notifyFromReport(rootDir, report, options = {}) {
  const config = _getScoring().resolveConfig(rootDir, { env: process.env });

  const webhookUrl = options.webhookUrl
    || config.notifications?.webhookUrl
    || process.env.REFLECTOR_WEBHOOK_URL;

  if (!webhookUrl) {
    return { ok: false, error: 'No webhook URL configured. Set notifications.webhookUrl in central config or REFLECTOR_WEBHOOK_URL env var.' };
  }

  const repoName = options.repoName || config.notifications?.repoName || rootDir.split('/').pop();
  const platform = options.platform || config.notifications?.platform || detectPlatform(webhookUrl);

  const result = await notify(webhookUrl, report, { ...options, repoName, platform });

  // Record notification in history
  recordNotification(rootDir, {
    platform,
    webhookUrl: webhookUrl.slice(0, 40) + '...',
    ok: result.ok,
    status: result.status,
    error: result.error,
  });

  return result;
}

// ─── Notification History ───

function getNotificationLogPath(rootDir) {
  return join(rootDir, '.remembrance', 'notification-log.json');
}

function recordNotification(rootDir, entry) {
  ensureDir(join(rootDir, '.remembrance'));
  const logPath = getNotificationLogPath(rootDir);
  const log = loadJSON(logPath, []);
  log.push({ ...entry, timestamp: new Date().toISOString() });
  trimArray(log, 100);
  saveJSON(logPath, log);
}

function loadNotificationHistory(rootDir) {
  return loadJSON(getNotificationLogPath(rootDir), []);
}

function notificationStats(rootDir) {
  const log = loadNotificationHistory(rootDir);
  if (log.length === 0) return { total: 0, sent: 0, failed: 0, successRate: 0 };

  const sent = log.filter(e => e.ok).length;
  return {
    total: log.length,
    sent,
    failed: log.length - sent,
    successRate: Math.round(sent / log.length * 1000) / 1000,
    lastNotification: log[log.length - 1],
  };
}

// ─── Helpers ───

function extractWhisper(report) {
  if (typeof report.whisper === 'string') return report.whisper;
  if (report.whisper?.message) return report.whisper.message;
  if (typeof report.collectiveWhisper === 'string') return report.collectiveWhisper;
  if (report.collectiveWhisper?.message) return report.collectiveWhisper.message;
  if (report.report?.collectiveWhisper) return report.report.collectiveWhisper;
  return '';
}



// ════════════════════════════════════════════════════════════════
// DASHBOARD — from dashboard.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — Dashboard Integration
 *
 * A lightweight dashboard showing:
 * 1. Repo coherence trend over time (from history v2)
 * 2. Recent healing pulls (files healed, improvements)
 * 3. Healing history timeline
 * 4. Current config mode & thresholds
 * 5. Auto-commit & notification stats
 *
 * Serves a single-page HTML dashboard via Node's built-in http module.
 * Zero external dependencies.
 */


// ─── Data Cache (TTL-based, avoids redundant I/O on rapid requests) ───

const _cache = new Map(); // key: rootDir, value: { data, expiry }
const CACHE_TTL_MS = 5000; // 5-second TTL

function getCached(rootDir) {
  const entry = _cache.get(rootDir);
  if (entry && Date.now() < entry.expiry) return entry.data;
  return null;
}

function setCache(rootDir, data) {
  _cache.set(rootDir, { data, expiry: Date.now() + CACHE_TTL_MS });
}

// ─── Data Aggregation ───

/**
 * Gather all dashboard data for a repo.
 * Uses a 5-second TTL cache to avoid repeated I/O on rapid dashboard refreshes.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { bypassCache }
 * @returns {object} Dashboard data
 */
function gatherDashboardData(rootDir, options = {}) {
  if (!options.bypassCache) {
    const cached = getCached(rootDir);
    if (cached) return cached;
  }
  const history = loadHistoryV2(rootDir);
  const stats = computeStats(rootDir);
  const config = _getScoring().resolveConfig(rootDir, { env: process.env });
  const mode = config._mode || _getScoring().getCurrentMode(rootDir);
  const autoCommit = autoCommitStats(rootDir);
  const notifications = notificationStats(rootDir);
  const patternHook = patternHookStats(rootDir);

  // Build coherence trend from history
  const trend = history.runs
    .slice(-30) // Last 30 runs
    .map(r => ({
      timestamp: r.timestamp,
      coherence: r.coherence?.after ?? 0,
      filesHealed: r.healing?.filesHealed ?? 0,
      improvement: r.healing?.avgImprovement ?? 0,
    }));

  // Recent healings
  const recentRuns = history.runs.slice(-10).reverse().map(r => ({
    timestamp: r.timestamp,
    mode: r.trigger || 'live',
    filesScanned: r.healing?.filesScanned ?? 0,
    filesHealed: r.healing?.filesHealed ?? 0,
    coherenceBefore: r.coherence?.before ?? 0,
    coherenceAfter: r.coherence?.after ?? 0,
    avgImprovement: r.healing?.avgImprovement ?? 0,
    durationMs: r.durationMs ?? 0,
  }));

  const result = {
    repo: rootDir.split('/').pop(),
    mode,
    thresholds: config.thresholds || {},
    trend,
    stats,
    recentRuns,
    autoCommit,
    notifications,
    patternHook,
    generatedAt: new Date().toISOString(),
  };

  setCache(rootDir, result);
  return result;
}

// ─── JSON API ───

/**
 * Handle API requests for the dashboard.
 *
 * @param {string} rootDir - Repository root
 * @param {string} path - Request path
 * @returns {object|null} JSON response or null for unmatched paths
 */
function handleApiRequest(rootDir, path) {
  if (path === '/api/dashboard') {
    return gatherDashboardData(rootDir);
  }
  if (path === '/api/trend') {
    const history = loadHistoryV2(rootDir);
    return history.runs.slice(-50).map(r => ({
      timestamp: r.timestamp,
      coherence: r.coherence?.after ?? r.coherence?.before ?? 0,
      filesHealed: r.healing?.filesHealed ?? 0,
    }));
  }
  if (path === '/api/stats') {
    return computeStats(rootDir);
  }
  if (path === '/api/config') {
    return _getScoring().resolveConfig(rootDir, { env: process.env });
  }
  if (path === '/api/ascii-trend') {
    return { chart: generateTrendChart(rootDir) };
  }
  return null;
}

// ─── HTML Dashboard ───

/**
 * Generate the full HTML for the reflector dashboard.
 * Single-page app with inline CSS and JS — no external dependencies.
 *
 * @param {object} data - Dashboard data from gatherDashboardData()
 * @returns {string} HTML string
 */
function generateDashboardHTML(data) {
  const trendJSON = JSON.stringify(data.trend || []);
  const recentJSON = JSON.stringify(data.recentRuns || []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remembrance Reflector — ${escapeHTML(data.repo)}</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --green: #3fb950; --yellow: #d29922; --red: #f85149; --blue: #58a6ff; --dim: #8b949e; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; color: var(--blue); margin-bottom: 12px; }
  .subtitle { color: var(--dim); font-size: 14px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-value { font-size: 32px; font-weight: 700; }
  .stat-label { color: var(--dim); font-size: 13px; margin-top: 4px; }
  .stat-green { color: var(--green); }
  .stat-yellow { color: var(--yellow); }
  .stat-red { color: var(--red); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); color: var(--dim); font-weight: 600; }
  td { padding: 8px; border-bottom: 1px solid var(--border); }
  .bar-container { width: 100%; height: 20px; background: #21262d; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .chart-area { width: 100%; height: 200px; position: relative; background: #0d1117; border-radius: 4px; padding: 8px; }
  canvas { width: 100% !important; height: 100% !important; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-strict { background: #f851491a; color: var(--red); }
  .badge-balanced { background: #d299221a; color: var(--yellow); }
  .badge-relaxed { background: #3fb9501a; color: var(--green); }
  .badge-custom { background: #58a6ff1a; color: var(--blue); }
  .footer { text-align: center; color: var(--dim); font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<h1>Remembrance Self-Reflector</h1>
<p class="subtitle">${escapeHTML(data.repo)} &middot; Mode: <span class="badge badge-${escapeHTML(data.mode)}">${escapeHTML(data.mode)}</span> &middot; Generated: ${escapeHTML(data.generatedAt)}</p>

<div class="grid">
  <div class="card">
    <div class="stat-value ${getCoherenceClass(data.stats?.avgCoherence)}">${formatNum(data.stats?.avgCoherence)}</div>
    <div class="stat-label">Current Avg Coherence</div>
  </div>
  <div class="card">
    <div class="stat-value">${data.stats?.totalRuns ?? 0}</div>
    <div class="stat-label">Total Healing Runs</div>
  </div>
  <div class="card">
    <div class="stat-value">${data.stats?.totalFilesHealed ?? 0}</div>
    <div class="stat-label">Total Files Healed</div>
  </div>
  <div class="card">
    <div class="stat-value stat-green">+${formatNum(data.stats?.avgImprovement)}</div>
    <div class="stat-label">Avg Improvement per Run</div>
  </div>
</div>

<div class="card" style="margin-bottom: 24px;">
  <h2>Coherence Trend</h2>
  <div class="chart-area"><canvas id="trendChart"></canvas></div>
</div>

<div class="card" style="margin-bottom: 24px;">
  <h2>Recent Healing Runs</h2>
  <table>
    <thead><tr><th>Time</th><th>Mode</th><th>Scanned</th><th>Healed</th><th>Before</th><th>After</th><th>Improvement</th><th>Duration</th></tr></thead>
    <tbody id="runsTable"></tbody>
  </table>
</div>

<div class="grid">
  <div class="card">
    <h2>Thresholds</h2>
    <table>
      <tr><td>Min Coherence</td><td>${formatNum(data.thresholds?.minCoherence)}</td></tr>
      <tr><td>Auto-Merge Threshold</td><td>${formatNum(data.thresholds?.autoMergeThreshold)}</td></tr>
      <tr><td>Target Coherence</td><td>${formatNum(data.thresholds?.targetCoherence)}</td></tr>
      <tr><td>Approval File Threshold</td><td>${data.thresholds?.approvalFileThreshold ?? 'N/A'}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Auto-Commit Safety</h2>
    <table>
      <tr><td>Total Runs</td><td>${data.autoCommit?.totalRuns ?? 0}</td></tr>
      <tr><td>Merged</td><td class="stat-green">${data.autoCommit?.merged ?? 0}</td></tr>
      <tr><td>Aborted</td><td class="stat-red">${data.autoCommit?.aborted ?? 0}</td></tr>
      <tr><td>Success Rate</td><td>${formatPercent(data.autoCommit?.successRate)}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Notifications</h2>
    <table>
      <tr><td>Total Sent</td><td>${data.notifications?.total ?? 0}</td></tr>
      <tr><td>Successful</td><td class="stat-green">${data.notifications?.sent ?? 0}</td></tr>
      <tr><td>Failed</td><td class="stat-red">${data.notifications?.failed ?? 0}</td></tr>
      <tr><td>Success Rate</td><td>${formatPercent(data.notifications?.successRate)}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Pattern Hook</h2>
    <table>
      <tr><td>Total Healings</td><td>${data.patternHook?.totalHealings ?? 0}</td></tr>
      <tr><td>Pattern-Guided</td><td class="stat-green">${data.patternHook?.patternGuided ?? 0}</td></tr>
      <tr><td>Guided Rate</td><td>${formatPercent(data.patternHook?.patternGuidedRate)}</td></tr>
      <tr><td>Avg Improvement (Guided)</td><td>${formatNum(data.patternHook?.avgImprovement?.guided)}</td></tr>
      <tr><td>Avg Improvement (Unguided)</td><td>${formatNum(data.patternHook?.avgImprovement?.unguided)}</td></tr>
    </table>
  </div>
</div>

<div class="footer">Remembrance Self-Reflector Bot &middot; Zero Dependencies &middot; Powered by Node.js</div>

<script>
const trend = ${trendJSON};
const runs = ${recentJSON};

// Populate runs table
const tbody = document.getElementById('runsTable');
runs.forEach(r => {
  const tr = document.createElement('tr');
  const delta = (r.coherenceAfter - r.coherenceBefore).toFixed(3);
  const deltaColor = delta > 0 ? 'stat-green' : delta < 0 ? 'stat-red' : '';
  tr.innerHTML = \`
    <td>\${new Date(r.timestamp).toLocaleString()}</td>
    <td>\${r.mode}</td>
    <td>\${r.filesScanned}</td>
    <td>\${r.filesHealed}</td>
    <td>\${r.coherenceBefore.toFixed(3)}</td>
    <td>\${r.coherenceAfter.toFixed(3)}</td>
    <td class="\${deltaColor}">+\${r.avgImprovement.toFixed(3)}</td>
    <td>\${(r.durationMs / 1000).toFixed(1)}s</td>
  \`;
  tbody.appendChild(tr);
});

// Draw trend chart (simple canvas)
const canvas = document.getElementById('trendChart');
if (canvas && trend.length > 1) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const values = trend.map(t => t.coherence);
  const minV = Math.min(...values) * 0.95;
  const maxV = Math.max(...values, 1.0);
  const rangeV = maxV - minV || 1;

  // Grid lines
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.fillText((maxV - (rangeV * i / 4)).toFixed(2), 4, y + 4);
  }

  // Line
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 2;
  ctx.beginPath();
  trend.forEach((t, i) => {
    const x = pad.left + (plotW * i / (trend.length - 1));
    const y = pad.top + plotH - (plotH * (t.coherence - minV) / rangeV);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#3fb950';
  trend.forEach((t, i) => {
    const x = pad.left + (plotW * i / (trend.length - 1));
    const y = pad.top + plotH - (plotH * (t.coherence - minV) / rangeV);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}
</script>
</body>
</html>`;
}

// ─── HTML Helpers ───

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNum(n) {
  if (typeof n !== 'number') return 'N/A';
  return n.toFixed(3);
}

function formatPercent(n) {
  if (typeof n !== 'number') return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function getCoherenceClass(n) {
  if (typeof n !== 'number') return '';
  if (n >= 0.8) return 'stat-green';
  if (n >= 0.6) return 'stat-yellow';
  return 'stat-red';
}

// ─── HTTP Server ───

/**
 * Create a dashboard HTTP server.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { port }
 * @returns {object} { server, port }
 */
function createReflectorDashboard(rootDir, options = {}) {
  const { port = 3456 } = options;

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    // API routes
    if (url.startsWith('/api/')) {
      const apiResult = handleApiRequest(rootDir, url);
      if (apiResult) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(apiResult, null, 2));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Dashboard HTML
    const data = gatherDashboardData(rootDir);
    const html = generateDashboardHTML(data);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return { server, port };
}

/**
 * Start the reflector dashboard server.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { port }
 * @returns {object} { server, port, url }
 */
function startReflectorDashboard(rootDir, options = {}) {
  const { server, port } = createReflectorDashboard(rootDir, options);
  server.listen(port);
  return { server, port, url: `http://localhost:${port}` };
}



// ════════════════════════════════════════════════════════════════
// SAFETY — from safety.js
// ════════════════════════════════════════════════════════════════

/**
 * Remembrance Self-Reflector — Safety & Revert Mechanism
 *
 * Axiom 3: No harm. Every healing must be reversible.
 *
 * 1. Backup Branch — snapshot current state before any healing
 * 2. Dry-Run Mode — simulate healing without writing files or committing
 * 3. Approval Gate — require explicit approval before auto-merge
 * 4. Rollback — revert to backup if coherence drops after healing
 *
 * Uses only Node.js built-ins — no external dependencies.
 */


// ─── Backup State ───

/**
 * Get the path to the backup manifest file.
 */
function getBackupManifestPath(rootDir) {
  return join(rootDir, '.remembrance', 'backup-manifest.json');
}

/**
 * Create a backup of the current state before healing.
 *
 * Two strategies:
 *   - 'git-branch': Create a git branch at current HEAD (lightweight, requires git)
 *   - 'file-copy': Copy files to .remembrance/backups/ (works without git)
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { strategy, filePaths }
 * @returns {object} Backup manifest
 */
function createBackup(rootDir, options = {}) {
  const {
    strategy = 'git-branch',
    filePaths = [],
    label = '',
  } = options;

  const backupId = `backup-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const manifest = {
    id: backupId,
    timestamp,
    strategy,
    rootDir,
    label: label || `Pre-healing backup ${timestamp}`,
    files: [],
  };

  if (strategy === 'git-branch') {
    // Create a lightweight backup branch at current HEAD
    const currentBranch = getCurrentBranch(rootDir);
    const backupBranch = `remembrance/backup-${Date.now()}`;

    try {
      git(`branch ${backupBranch}`, rootDir);
      manifest.branch = backupBranch;
      manifest.baseBranch = currentBranch;
      manifest.headCommit = git('rev-parse HEAD', rootDir);
    } catch (err) {
      // Fall back to file-copy if git branch fails
      manifest.strategy = 'file-copy';
      manifest.branchError = err.message;
      return createFileCopyBackup(rootDir, filePaths, manifest);
    }
  } else {
    return createFileCopyBackup(rootDir, filePaths, manifest);
  }

  // Save manifest
  saveBackupManifest(rootDir, manifest);
  return manifest;
}

/**
 * Create file-copy backup (fallback when git-branch not available).
 */
function createFileCopyBackup(rootDir, filePaths, manifest) {
  const backupDir = join(rootDir, '.remembrance', 'backups', manifest.id);
  ensureDir(backupDir);
  manifest.backupDir = backupDir;

  for (const filePath of filePaths) {
    const absPath = filePath.startsWith('/') ? filePath : join(rootDir, filePath);
    if (!existsSync(absPath)) continue;

    const relPath = relative(rootDir, absPath);
    const backupPath = join(backupDir, relPath);
    const parentDir = join(backupDir, ...relPath.split('/').slice(0, -1));
    if (relPath.includes('/')) {
      ensureDir(parentDir);
    }

    try {
      copyFileSync(absPath, backupPath);
      manifest.files.push({
        original: relPath,
        backup: backupPath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  saveBackupManifest(rootDir, manifest);
  return manifest;
}

/**
 * Save backup manifest to disk.
 */
function saveBackupManifest(rootDir, manifest) {
  const manifests = loadBackupManifests(rootDir);
  manifests.push(manifest);
  trimArray(manifests, 20);
  saveJSON(getBackupManifestPath(rootDir), manifests);
}

/**
 * Load all backup manifests.
 */
function loadBackupManifests(rootDir) {
  return loadJSON(getBackupManifestPath(rootDir), []);
}

/**
 * Get the most recent backup manifest.
 */
function getLatestBackup(rootDir) {
  const manifests = loadBackupManifests(rootDir);
  return manifests.length > 0 ? manifests[manifests.length - 1] : null;
}

// ─── Dry-Run Mode ───

/**
 * Run the reflector in dry-run mode.
 * Simulates healing without writing files or creating branches.
 * Returns what WOULD happen if healing were applied.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Dry-run report with projected changes
 */
function dryRun(rootDir, config = {}) {
  const startTime = Date.now();

  // Run the full reflect pipeline
  const report = _getMulti().reflect(rootDir, config);

  // Build a projection of what would change
  const projection = {
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    rootDir,
    wouldHeal: report.healedFiles.length,
    wouldChange: report.healedFiles.map(f => ({
      path: f.path,
      currentSize: f.code.length,
    })),
    projectedImprovement: report.summary.avgImprovement,
    projectedCoherence: {
      before: report.snapshot.avgCoherence,
      after: estimatePostHealCoherence(report),
    },
    healings: report.healings.map(h => ({
      path: h.path,
      language: h.language,
      currentCoherence: h.originalCoherence,
      projectedCoherence: h.healedCoherence,
      improvement: h.improvement,
      whisper: h.whisper,
      strategy: h.healingSummary,
    })),
    collectiveWhisper: report.collectiveWhisper,
    summary: {
      filesScanned: report.summary.filesScanned,
      filesBelowThreshold: report.summary.filesBelowThreshold,
      wouldHeal: report.summary.filesHealed,
      projectedAvgImprovement: report.summary.avgImprovement,
      autoMergeRecommended: report.summary.autoMergeRecommended,
    },
    durationMs: Date.now() - startTime,
    warning: report.healedFiles.length > 0
      ? 'This is a dry-run. No files were modified. Run without --dry-run to apply changes.'
      : 'No files need healing. The codebase is coherent.',
  };

  return projection;
}

/**
 * Estimate post-heal average coherence from a report.
 */
function estimatePostHealCoherence(report) {
  if (!report.healings || report.healings.length === 0) {
    return report.snapshot.avgCoherence;
  }

  const totalFiles = report.snapshot.totalFiles || report.summary.filesScanned;
  if (totalFiles === 0) return 0;

  // Sum of all file coherences, replacing healed files with new values
  const healedPaths = new Set(report.healings.map(h => h.path));
  const totalImprovement = report.healings.reduce((s, h) => s + h.improvement, 0);

  // Approximate: current avg * total + total improvement / total
  return Math.min(
    1,
    report.snapshot.avgCoherence + (totalImprovement / totalFiles)
  );
}

// ─── Approval Gate ───

/**
 * Check if a healing run requires approval before merging.
 *
 * Approval is required when:
 * - requireApproval is true in config
 * - autoMerge is true but coherence is below autoMergeThreshold
 * - The run modifies more than approvalFileThreshold files
 *
 * @param {object} report - Reflector report
 * @param {object} config - Safety configuration
 * @returns {object} { approved, reason, requiresManualReview }
 */
function checkApproval(report, config = {}) {
  const {
    requireApproval = false,
    autoMergeThreshold = 0.9,
    approvalFileThreshold = 10,
    autoMerge = false,
  } = config;

  // If approval not required and no auto-merge, always approve
  if (!requireApproval && !autoMerge) {
    return { approved: true, reason: 'No approval gate configured', requiresManualReview: false };
  }

  const filesHealed = report.summary ? report.summary.filesHealed : 0;
  const avgCoherence = report.snapshot ? report.snapshot.avgCoherence : 0;

  // Check if too many files were changed
  if (filesHealed > approvalFileThreshold) {
    return {
      approved: false,
      reason: `${filesHealed} files would be modified (threshold: ${approvalFileThreshold}). Manual review required.`,
      requiresManualReview: true,
      filesHealed,
      threshold: approvalFileThreshold,
    };
  }

  // Check if coherence is high enough for auto-merge
  if (autoMerge && avgCoherence < autoMergeThreshold) {
    return {
      approved: false,
      reason: `Avg coherence ${avgCoherence.toFixed(3)} is below auto-merge threshold ${autoMergeThreshold}. Manual review required.`,
      requiresManualReview: true,
      avgCoherence,
      autoMergeThreshold,
    };
  }

  // Explicit approval required
  if (requireApproval) {
    return {
      approved: false,
      reason: 'Explicit approval required (requireApproval is set). Review the dry-run report and approve manually.',
      requiresManualReview: true,
    };
  }

  return { approved: true, reason: 'All safety checks passed', requiresManualReview: false };
}

/**
 * Record an approval decision for a run.
 */
function recordApproval(rootDir, runId, decision) {
  const approvalPath = join(rootDir, '.remembrance', 'approvals.json');
  const approvals = loadJSON(approvalPath, []);

  approvals.push({
    runId,
    decision, // 'approved' | 'rejected'
    timestamp: new Date().toISOString(),
  });

  trimArray(approvals, 50);
  saveJSON(approvalPath, approvals);
  return { runId, decision, timestamp: new Date().toISOString() };
}

// ─── Rollback ───

/**
 * Rollback to a previous backup state.
 *
 * For git-branch backups: checkout the backup branch or reset to backup commit.
 * For file-copy backups: restore files from the backup directory.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { backupId, verify }
 * @returns {object} Rollback result
 */
function rollback(rootDir, options = {}) {
  const { backupId, verify = true } = options;

  // Find the backup
  const manifests = loadBackupManifests(rootDir);
  const backup = backupId
    ? manifests.find(m => m.id === backupId)
    : manifests[manifests.length - 1]; // Latest

  if (!backup) {
    return { success: false, error: 'No backup found to rollback to' };
  }

  const result = {
    backupId: backup.id,
    timestamp: new Date().toISOString(),
    strategy: backup.strategy,
    filesRestored: 0,
  };

  if (backup.strategy === 'git-branch' && backup.branch) {
    try {
      // Take a pre-rollback snapshot for comparison
      let preRollbackCoherence;
      if (verify) {
        const snap = _getMulti().takeSnapshot(rootDir);
        preRollbackCoherence = snap.aggregate.avgCoherence;
      }

      // Reset to the backup commit
      const currentBranch = getCurrentBranch(rootDir);
      if (backup.headCommit) {
        git(`reset --hard ${backup.headCommit}`, rootDir);
      } else {
        // Merge from backup branch
        git(`merge ${backup.branch} --no-commit`, rootDir);
      }

      result.success = true;
      result.restoredBranch = backup.branch;
      result.previousBranch = currentBranch;

      // Verify coherence after rollback
      if (verify) {
        const postSnap = _getMulti().takeSnapshot(rootDir);
        result.coherenceBefore = preRollbackCoherence;
        result.coherenceAfter = postSnap.aggregate.avgCoherence;
        result.coherenceDelta = Math.round(
          (result.coherenceAfter - result.coherenceBefore) * 1000
        ) / 1000;
      }
    } catch (err) {
      result.success = false;
      result.error = `Git rollback failed: ${err.message}`;
    }
  } else if (backup.strategy === 'file-copy' && backup.files) {
    // Restore files from backup directory
    for (const file of backup.files) {
      try {
        if (existsSync(file.backup)) {
          const targetPath = join(rootDir, file.original);
          copyFileSync(file.backup, targetPath);
          result.filesRestored++;
        }
      } catch {
        // Skip files that can't be restored
      }
    }
    result.success = result.filesRestored > 0 || backup.files.length === 0;

    // Verify coherence after rollback
    if (verify && result.success) {
      const postSnap = _getMulti().takeSnapshot(rootDir);
      result.coherenceAfter = postSnap.aggregate.avgCoherence;
    }
  } else {
    result.success = false;
    result.error = 'Unknown backup strategy or missing backup data';
  }

  // Record the rollback in history
  recordRollback(rootDir, result);

  return result;
}

/**
 * Record a rollback event.
 */
function recordRollback(rootDir, rollbackResult) {
  const rollbackPath = join(rootDir, '.remembrance', 'rollbacks.json');
  const rollbacks = loadJSON(rollbackPath, []);
  rollbacks.push(rollbackResult);
  trimArray(rollbacks, 20);
  saveJSON(rollbackPath, rollbacks);
}

/**
 * Load rollback history.
 */
function loadRollbacks(rootDir) {
  return loadJSON(join(rootDir, '.remembrance', 'rollbacks.json'), []);
}

// ─── Coherence Guard ───

/**
 * Check if coherence dropped after a healing run.
 * If it dropped, recommend rollback.
 *
 * @param {string} rootDir - Repository root
 * @param {object} preHealSnapshot - Snapshot taken before healing
 * @param {object} [postHealSnapshot] - Optional post-heal snapshot (avoids redundant scan)
 * @returns {object} { dropped, delta, recommendation }
 */
function coherenceGuard(rootDir, preHealSnapshot, postHealSnapshot) {
  const postSnap = postHealSnapshot || _getMulti().takeSnapshot(rootDir);

  const preAvg = preHealSnapshot.aggregate
    ? preHealSnapshot.aggregate.avgCoherence
    : preHealSnapshot.avgCoherence || 0;
  const postAvg = postSnap.aggregate
    ? postSnap.aggregate.avgCoherence
    : postSnap.avgCoherence || 0;
  const delta = Math.round((postAvg - preAvg) * 1000) / 1000;

  const result = {
    preCoherence: Math.round(preAvg * 1000) / 1000,
    postCoherence: Math.round(postAvg * 1000) / 1000,
    delta,
    dropped: delta < 0,
  };

  if (delta < -0.05) {
    result.severity = 'critical';
    result.recommendation = 'ROLLBACK RECOMMENDED. Coherence dropped significantly. The healing may have introduced issues.';
  } else if (delta < 0) {
    result.severity = 'warning';
    result.recommendation = 'Coherence dropped slightly. Review the changes carefully before merging.';
  } else if (delta === 0) {
    result.severity = 'neutral';
    result.recommendation = 'No coherence change. The healing had no measurable effect.';
  } else {
    result.severity = 'positive';
    result.recommendation = 'Coherence improved. Safe to proceed.';
  }

  return result;
}

// ─── Safe Reflect Pipeline ───

/**
 * Run the reflector with full safety protections:
 * 1. Create backup before any changes
 * 2. Run healing
 * 3. Check coherence guard
 * 4. Check approval gate
 * 5. Auto-rollback if coherence dropped
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Safe reflector result
 */
function safeReflect(rootDir, config = {}) {
  const {
    dryRunMode = false,
    requireApproval = false,
    autoRollback = true,
    approvalFileThreshold = 10,
    ...reflectConfig
  } = config;

  const startTime = Date.now();
  const result = {
    timestamp: new Date().toISOString(),
    mode: dryRunMode ? 'dry-run' : 'live',
    safety: {},
  };

  // Step 0: Dry-run mode
  if (dryRunMode) {
    result.dryRun = dryRun(rootDir, reflectConfig);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Step 1: Take pre-heal snapshot for coherence guard
  const preSnapshot = _getMulti().takeSnapshot(rootDir, reflectConfig);
  result.safety.preCoherence = preSnapshot.aggregate.avgCoherence;

  // Step 2: Create backup
  try {
    const filePaths = preSnapshot.files
      .filter(f => !f.error)
      .map(f => f.path);
    result.safety.backup = createBackup(rootDir, {
      strategy: 'git-branch',
      filePaths,
      label: `Pre-healing backup (avg coherence: ${preSnapshot.aggregate.avgCoherence.toFixed(3)})`,
    });
  } catch (err) {
    result.safety.backup = { error: err.message };
  }

  // Step 3: Run the reflector (pass preSnapshot to avoid redundant scan)
  const report = _getMulti().reflect(rootDir, { ...reflectConfig, _preSnapshot: preSnapshot });
  result.report = {
    filesScanned: report.summary.filesScanned,
    filesBelowThreshold: report.summary.filesBelowThreshold,
    filesHealed: report.summary.filesHealed,
    avgImprovement: report.summary.avgImprovement,
    autoMergeRecommended: report.summary.autoMergeRecommended,
    collectiveWhisper: report.collectiveWhisper.message,
  };
  result.healedFiles = report.healedFiles;

  // Step 4: Check approval gate
  result.safety.approval = checkApproval(report, {
    requireApproval,
    approvalFileThreshold,
    autoMerge: reflectConfig.autoMerge,
    autoMergeThreshold: reflectConfig.autoMergeThreshold,
  });

  // Step 5: Coherence guard — check if coherence dropped
  //   reflect() doesn't write files to disk, so re-scanning would show no change.
  //   Instead, build a synthetic post-snapshot from the report's estimated improvement.
  if (report.healedFiles && report.healedFiles.length > 0) {
    const estimatedPostCoherence = estimatePostHealCoherence(report);
    const syntheticPostSnap = {
      aggregate: { avgCoherence: estimatedPostCoherence },
    };
    result.safety.coherenceGuard = coherenceGuard(rootDir, preSnapshot, syntheticPostSnap);

    // Auto-rollback if coherence dropped and autoRollback is enabled
    if (autoRollback && result.safety.coherenceGuard.dropped && result.safety.coherenceGuard.severity === 'critical') {
      result.safety.autoRolledBack = true;
      result.safety.rollbackResult = rollback(rootDir, { verify: true });
      result.safety.rollbackReason = result.safety.coherenceGuard.recommendation;
    }
  }

  result.durationMs = Date.now() - startTime;
  return result;
}



// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════

module.exports = {
  // Utilities (shared)
  ensureDir, loadJSON, saveJSON, trimArray,

  // History
  loadHistoryV2, saveRunRecord, createRunRecord, getHistoryV2Path,
  appendLog, readLogTail, getLogPath, computeStats,
  generateTrendChart, generateTimeline,

  // Pattern Hook
  extractFileHints, queryPatternsForFile, buildHealingContext,
  hookBeforeHeal, batchPatternLookup,
  recordPatternHookUsage, patternHookStats, formatPatternHook,

  // PR Formatter
  progressBar, scoreIndicator, deltaIndicator,
  formatPRComment, formatFileComment, formatCheckRun,

  // GitHub
  generateBranchName, git, gh, isGhAvailable,
  getCurrentBranch, getDefaultBranch, isCleanWorkingTree,
  createHealingBranch, openHealingPR, findExistingReflectorPR,
  generateReflectorWorkflow,

  // Auto-Commit
  createSafetyBranch, runTestGate, runCommand,
  mergeIfPassing, safeAutoCommit,
  recordAutoCommit, loadAutoCommitHistory, autoCommitStats, formatAutoCommit,

  // Notifications
  postJSON, formatDiscordEmbed, sendDiscordNotification,
  formatSlackBlocks, sendSlackNotification,
  notify, detectPlatform, notifyFromReport,
  loadNotificationHistory, notificationStats, recordNotification,

  // Dashboard
  gatherDashboardData, handleApiRequest, generateDashboardHTML,
  createReflectorDashboard, startReflectorDashboard,

  // Safety
  createBackup, loadBackupManifests, getLatestBackup, getBackupManifestPath,
  dryRun, estimatePostHealCoherence,
  checkApproval, recordApproval,
  rollback, loadRollbacks, coherenceGuard,
  safeReflect,
};
