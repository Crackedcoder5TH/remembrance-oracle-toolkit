'use strict';

/**
 * Session Tracker — records oracle interactions during a coding session.
 *
 * Tracks what the oracle "said" (resolve decisions, search results) and
 * what it "whispered" (poetic whispers, prompt tags, candidate notes)
 * so a summary can be displayed at session end.
 *
 * Storage: JSON file at .remembrance/session-log.json
 * Each session is identified by a start timestamp.
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILE = 'session-log.json';

let _session = null;

/**
 * Create a fresh session state object.
 */
function _newSession() {
  return {
    startedAt: new Date().toISOString(),
    endedAt: null,
    resolves: [],   // What the oracle "said" — decisions made
    searches: [],   // Search queries and result counts
    whispers: [],   // What the oracle "whispered" — poetic messages
    promptTags: [], // Prompt tags delivered
    stats: {
      totalResolves: 0,
      totalSearches: 0,
      pulls: 0,
      evolves: 0,
      generates: 0,
      healingLoops: 0,
      patternsUsed: new Set(),
    },
  };
}

/**
 * Get or create the current session.
 */
function getSession() {
  if (!_session) {
    _session = _newSession();
  }
  return _session;
}

/**
 * Record a resolve interaction.
 */
function trackResolve(result, request) {
  const session = getSession();
  const entry = {
    timestamp: new Date().toISOString(),
    description: request?.description || '',
    decision: result.decision,
    confidence: result.confidence,
    reasoning: result.reasoning,
    patternName: result.pattern?.name || null,
    patternId: result.pattern?.id || null,
    language: result.pattern?.language || request?.language || null,
    coherency: result.pattern?.coherencyScore || null,
    healing: result.healing ? {
      loops: result.healing.loops,
      improvement: result.healing.improvement,
      originalCoherence: result.healing.originalCoherence,
      finalCoherence: result.healing.finalCoherence,
    } : null,
  };

  session.resolves.push(entry);
  session.stats.totalResolves++;

  if (result.decision === 'pull') session.stats.pulls++;
  else if (result.decision === 'evolve') session.stats.evolves++;
  else if (result.decision === 'generate') session.stats.generates++;

  if (result.healing?.loops) {
    session.stats.healingLoops += result.healing.loops;
  }

  if (result.pattern?.id) {
    session.stats.patternsUsed.add(result.pattern.id);
  }

  // Track whisper
  if (result.whisper) {
    session.whispers.push({
      timestamp: new Date().toISOString(),
      type: 'resolve',
      decision: result.decision,
      patternName: result.pattern?.name || null,
      message: result.whisper,
    });
  }

  // Track candidate notes
  if (result.candidateNotes) {
    session.whispers.push({
      timestamp: new Date().toISOString(),
      type: 'candidate-notes',
      message: result.candidateNotes,
    });
  }

  // Track prompt tag
  if (result.promptTag) {
    session.promptTags.push({
      timestamp: new Date().toISOString(),
      tag: result.promptTag,
    });
  }
}

/**
 * Record a search interaction.
 */
function trackSearch(term, results, options) {
  const session = getSession();
  const topResults = (results || []).slice(0, 3).map(r => ({
    name: r.name || r.description || 'untitled',
    matchScore: r.matchScore,
    coherency: r.coherency,
    source: r.source,
  }));

  session.searches.push({
    timestamp: new Date().toISOString(),
    term,
    mode: options?.mode || 'hybrid',
    language: options?.language || null,
    resultCount: (results || []).length,
    topResults,
  });

  session.stats.totalSearches++;
}

/**
 * Build a formatted session summary.
 */
function buildSummary() {
  const session = getSession();
  session.endedAt = new Date().toISOString();

  const stats = session.stats;
  const uniquePatterns = stats.patternsUsed instanceof Set
    ? stats.patternsUsed.size
    : (stats.patternsUsed || []).length;

  const summary = {
    duration: _duration(session.startedAt, session.endedAt),
    stats: {
      totalResolves: stats.totalResolves,
      totalSearches: stats.totalSearches,
      pulls: stats.pulls,
      evolves: stats.evolves,
      generates: stats.generates,
      healingLoops: stats.healingLoops,
      uniquePatternsUsed: uniquePatterns,
    },
    said: [],     // What the oracle "said"
    whispered: [], // What the oracle "whispered"
  };

  // Build "what the oracle said" — each resolve decision
  for (const r of session.resolves) {
    const healing = r.healing
      ? ` (healed ${r.healing.loops} loop(s), improvement: ${((r.healing.improvement || 0) * 100).toFixed(1)}%)`
      : '';
    summary.said.push({
      description: r.description,
      decision: r.decision,
      patternName: r.patternName,
      confidence: r.confidence,
      coherency: r.coherency,
      text: r.patternName
        ? `${r.decision.toUpperCase()} "${r.patternName}" (confidence: ${(r.confidence || 0).toFixed(3)}, coherency: ${(r.coherency || 0).toFixed(3)})${healing}`
        : `${r.decision.toUpperCase()} — ${r.reasoning}`,
    });
  }

  // Build "what the oracle whispered"
  for (const w of session.whispers) {
    summary.whispered.push({
      type: w.type,
      decision: w.decision || null,
      patternName: w.patternName || null,
      message: w.message,
    });
  }

  // Unique prompt tags used
  const uniqueTags = [...new Set(session.promptTags.map(t => t.tag))];
  if (uniqueTags.length > 0) {
    summary.promptTags = uniqueTags;
  }

  return summary;
}

/**
 * Save the session log to disk.
 */
function saveSession(baseDir) {
  const session = getSession();
  session.endedAt = session.endedAt || new Date().toISOString();

  // Convert Set to array for JSON serialization
  const toSave = {
    ...session,
    stats: {
      ...session.stats,
      patternsUsed: session.stats.patternsUsed instanceof Set
        ? [...session.stats.patternsUsed]
        : session.stats.patternsUsed,
    },
  };

  const dir = baseDir || path.join(process.cwd(), '.remembrance');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, SESSION_FILE);

    // Read existing sessions
    let sessions = [];
    if (fs.existsSync(filePath)) {
      try {
        sessions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!Array.isArray(sessions)) sessions = [sessions];
      } catch (_) {
        sessions = [];
      }
    }

    // Keep last 20 sessions
    sessions.push(toSave);
    if (sessions.length > 20) sessions = sessions.slice(-20);

    fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
    return filePath;
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[session-tracker] save failed:', e.message);
    return null;
  }
}

/**
 * Reset the session (start fresh).
 */
function resetSession() {
  _session = _newSession();
}

/**
 * Check if the session has any recorded interactions.
 */
function hasInteractions() {
  if (!_session) return false;
  return _session.stats.totalResolves > 0 || _session.stats.totalSearches > 0;
}

/**
 * Calculate duration between two ISO timestamps.
 */
function _duration(start, end) {
  try {
    const ms = new Date(end) - new Date(start);
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  } catch (_) {
    return 'unknown';
  }
}

module.exports = {
  getSession,
  trackResolve,
  trackSearch,
  buildSummary,
  saveSession,
  resetSession,
  hasInteractions,
};
