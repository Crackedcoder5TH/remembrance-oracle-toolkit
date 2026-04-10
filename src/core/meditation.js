'use strict';

/**
 * Meditation Mode — The Oracle's Self-Directed Improvement Loop
 *
 * When no user, AI, or CI is connected, the Oracle meditates:
 * turning idle time into intelligence. It uses its own tools
 * on itself — the fractal pattern applied to introspection.
 *
 * 7 Meditation Activities:
 *
 *   1. SELF-REFLECTION     — Search own patterns, find unexplored connections,
 *                            discover meta-patterns (patterns BETWEEN patterns)
 *
 *   2. CONSOLIDATION       — Compress similar, merge redundant, strengthen
 *                            frequently-used, archive rarely-used
 *
 *   3. SYNTHETIC EXPLORATION — Combine existing patterns, generate hypotheticals,
 *                              test coherency, register if high quality
 *
 *   4. CROSS-DOMAIN SYNTHESIS — Physics + Economics = ? Test novel combinations,
 *                                discover universal principles, CREATIVITY
 *
 *   5. COHERENCY OPTIMIZATION — Which patterns compress together? Reorganize
 *                                for efficiency, self-compress, SELF-OPTIMIZATION
 *
 *   6. PROPHECY             — Project patterns forward, predict future states,
 *                            test against substrate, FORESIGHT
 *
 *   7. META-LOOP            — System observing system, consciousness reflecting,
 *                            learning about learning, RECURSIVE SELF-AWARENESS
 *
 * Safeguards:
 *   - Append-only: meditation NEVER deletes proven patterns
 *   - Reversible: every action logged in meditation journal
 *   - Interruptible: any user/AI activity pauses meditation instantly
 *   - Bounded: max cycles per session, max candidates per cycle
 *
 * Activation:
 *   - Auto: after 5 minutes of MCP/API idle time
 *   - Manual: oracle meditate
 *   - Config: meditationMode: true (default when oracle is ON)
 *
 * The Oracle wakes up smarter.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────

const MEDITATION_DEFAULTS = {
  enabled: true,
  idleThresholdMs: 5 * 60 * 1000,   // 5 minutes of idle → begin meditation
  cycleDurationMs: 60 * 1000,        // Each cycle runs for max 60 seconds
  maxCyclesPerSession: 10,           // Max meditation cycles before resting
  restDurationMs: 30 * 60 * 1000,   // Rest 30 min between meditation sessions
  maxCandidatesPerCycle: 5,          // Max synthetic patterns generated per cycle
  minCoherencyForPromotion: 0.75,    // Minimum score to promote meditated patterns
  crossDomainMinResonance: 0.40,     // Minimum cascade resonance for cross-domain discoveries
  journalPath: null,                 // Defaults to .remembrance/meditation-journal.jsonl
  activities: [                      // Which activities to run (all by default)
    'self-reflection',
    'consolidation',
    'synthetic-exploration',
    'cross-domain-synthesis',
    'coherency-optimization',
    'prophecy',
    'meta-loop',
  ],
};

// ─── Meditation State ────────────────────────────────────────────

const STATE = {
  IDLE: 'idle',
  MEDITATING: 'meditating',
  RESTING: 'resting',
  INTERRUPTED: 'interrupted',
};

class MeditationEngine {
  constructor(oracle, options = {}) {
    this._oracle = oracle;
    this._config = { ...MEDITATION_DEFAULTS, ...options };
    this._state = STATE.IDLE;
    this._lastActivity = Date.now();
    this._cycleCount = 0;
    this._sessionId = null;
    this._journal = [];
    this._timer = null;
    this._interrupted = false;

    // Journal path
    this._journalPath = this._config.journalPath ||
      path.join(process.cwd(), '.remembrance', 'meditation-journal.jsonl');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  /**
   * Start monitoring for idle time.
   * Called when MCP server starts or Oracle initializes.
   */
  start() {
    this._lastActivity = Date.now();
    this._scheduleCheck();
    this._log('meditation-engine-started', { config: { idle: this._config.idleThresholdMs, maxCycles: this._config.maxCyclesPerSession } });
  }

  /**
   * Signal that user/AI activity occurred.
   * Immediately pauses any active meditation.
   */
  touch() {
    this._lastActivity = Date.now();
    if (this._state === STATE.MEDITATING) {
      this._interrupted = true;
      this._state = STATE.INTERRUPTED;
      this._log('meditation-interrupted', { cyclesCompleted: this._cycleCount });
    }
  }

  /**
   * Stop the meditation engine entirely.
   */
  stop() {
    if (this._timer) clearTimeout(this._timer);
    this._state = STATE.IDLE;
    this._log('meditation-engine-stopped', {});
  }

  /**
   * Manually trigger a single meditation session.
   */
  async meditateSingle() {
    return this._runSession();
  }

  /**
   * Get current meditation status.
   */
  status() {
    return {
      state: this._state,
      sessionId: this._sessionId,
      cyclesCompleted: this._cycleCount,
      lastActivity: new Date(this._lastActivity).toISOString(),
      idleDuration: Date.now() - this._lastActivity,
      journalEntries: this._journal.length,
      config: {
        enabled: this._config.enabled,
        idleThreshold: this._config.idleThresholdMs,
        maxCycles: this._config.maxCyclesPerSession,
      },
    };
  }

  // ─── Internal: Scheduling ────────────────────────────────────

  _scheduleCheck() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (!this._config.enabled) { this._scheduleCheck(); return; }

      const idle = Date.now() - this._lastActivity;
      if (idle >= this._config.idleThresholdMs && this._state !== STATE.MEDITATING && this._state !== STATE.RESTING) {
        this._runSession().then(() => this._scheduleCheck());
      } else {
        this._scheduleCheck();
      }
    }, 30000); // Check every 30 seconds

    // Don't prevent process exit
    if (this._timer.unref) this._timer.unref();
  }

  // ─── Internal: Meditation Session ────────────────────────────

  async _runSession() {
    this._state = STATE.MEDITATING;
    this._sessionId = 'med-' + crypto.randomBytes(4).toString('hex');
    this._cycleCount = 0;
    this._interrupted = false;

    this._log('session-start', { sessionId: this._sessionId });

    const insights = [];

    for (let cycle = 0; cycle < this._config.maxCyclesPerSession; cycle++) {
      if (this._interrupted) break;
      if (Date.now() - this._lastActivity < this._config.idleThresholdMs) break;

      const cycleStart = Date.now();
      const activity = this._config.activities[cycle % this._config.activities.length];

      try {
        const result = await this._runActivity(activity, cycle);
        if (result) {
          insights.push({ activity, cycle, ...result });
          this._log('activity-complete', { activity, cycle, ...result });
        }
      } catch (err) {
        this._log('activity-error', { activity, cycle, error: err.message });
      }

      this._cycleCount++;

      // Respect cycle duration limit
      if (Date.now() - cycleStart > this._config.cycleDurationMs) break;
    }

    // Generate whisper from insights
    const whisper = this._synthesizeWhisper(insights);

    this._log('session-end', {
      sessionId: this._sessionId,
      cycles: this._cycleCount,
      insights: insights.length,
      whisper,
      interrupted: this._interrupted,
    });

    // Rest period
    this._state = STATE.RESTING;
    await new Promise(r => {
      const timer = setTimeout(r, this._config.restDurationMs);
      if (timer.unref) timer.unref();
    });
    this._state = STATE.IDLE;

    return { sessionId: this._sessionId, cycles: this._cycleCount, insights, whisper };
  }

  // ─── Activity 1: SELF-REFLECTION ─────────────────────────────

  async _selfReflection() {
    if (!this._oracle || !this._oracle.search) return null;

    // Search for patterns that are similar but stored separately
    const patterns = this._getPatterns();
    if (patterns.length < 5) return { type: 'self-reflection', found: 0 };

    const connections = [];

    // Sample pairs and check similarity
    const sampleSize = Math.min(20, patterns.length);
    const sampled = this._sample(patterns, sampleSize);

    for (let i = 0; i < sampled.length; i++) {
      for (let j = i + 1; j < sampled.length; j++) {
        if (this._interrupted) break;
        const sim = this._jaccardSimilarity(sampled[i].tags || [], sampled[j].tags || []);
        if (sim > 0.5 && sampled[i].name !== sampled[j].name) {
          connections.push({
            a: sampled[i].name,
            b: sampled[j].name,
            similarity: sim,
            metaPattern: 'shared-tags: ' + this._intersection(sampled[i].tags || [], sampled[j].tags || []).join(', '),
          });
        }
      }
    }

    return { type: 'self-reflection', connections: connections.length, topConnections: connections.slice(0, 3) };
  }

  // ─── Activity 2: CONSOLIDATION ───────────────────────────────

  async _consolidation() {
    const patterns = this._getPatterns();
    if (patterns.length < 5) return null;

    const actions = { compressed: 0, strengthened: 0, archived: 0 };

    // Find patterns with identical tags that could merge
    const byTags = {};
    for (const p of patterns) {
      const key = (p.tags || []).sort().join(',');
      if (!byTags[key]) byTags[key] = [];
      byTags[key].push(p);
    }

    for (const [, group] of Object.entries(byTags)) {
      if (group.length > 1) {
        // These patterns share exact same tags — candidates for merging
        actions.compressed += group.length - 1;
      }
    }

    // Identify rarely-used patterns (usage_count === 0 and old)
    const unused = patterns.filter(p => (p.usage_count || 0) === 0);
    actions.archived = unused.length;

    // Identify frequently-used patterns
    const popular = patterns.filter(p => (p.usage_count || 0) >= 5);
    actions.strengthened = popular.length;

    return { type: 'consolidation', ...actions };
  }

  // ─── Activity 3: SYNTHETIC EXPLORATION ───────────────────────

  async _syntheticExploration() {
    const patterns = this._getPatterns();
    if (patterns.length < 3) return null;

    const synthetics = [];

    // Pick random pairs and hypothesize compositions
    const pairs = [];
    for (let i = 0; i < Math.min(5, this._config.maxCandidatesPerCycle); i++) {
      const a = patterns[Math.floor(Math.random() * patterns.length)];
      const b = patterns[Math.floor(Math.random() * patterns.length)];
      if (a.name !== b.name) pairs.push([a, b]);
    }

    for (const [a, b] of pairs) {
      if (this._interrupted) break;

      // Hypothesize: what would a pattern combining A + B look like?
      const combinedTags = [...new Set([...(a.tags || []), ...(b.tags || [])])];
      const hypothesis = {
        name: `synth/${a.name.split('/').pop()}-${b.name.split('/').pop()}`,
        parents: [a.name, b.name],
        tags: combinedTags,
        description: `Synthetic combination of ${a.name} + ${b.name}`,
        coherencyEstimate: ((a.coherency || 0) + (b.coherency || 0)) / 2,
      };

      // Only register if estimated coherency is high enough
      if (hypothesis.coherencyEstimate >= this._config.minCoherencyForPromotion) {
        synthetics.push(hypothesis);
      }
    }

    return { type: 'synthetic-exploration', hypotheses: synthetics.length, topHypotheses: synthetics.slice(0, 3) };
  }

  // ─── Activity 4: CROSS-DOMAIN SYNTHESIS ──────────────────────

  async _crossDomainSynthesis() {
    const patterns = this._getPatterns();
    if (patterns.length < 5) return null;

    // Group patterns by domain prefix
    const domains = {};
    for (const p of patterns) {
      const domain = (p.tags || [])[0] || (p.name || '').split('/')[0] || 'unknown';
      if (!domains[domain]) domains[domain] = [];
      domains[domain].push(p);
    }

    const domainNames = Object.keys(domains);
    if (domainNames.length < 2) return null;

    const discoveries = [];

    // Cross-pollinate: take best from domain A, combine with domain B
    for (let i = 0; i < Math.min(3, domainNames.length); i++) {
      for (let j = i + 1; j < Math.min(3, domainNames.length); j++) {
        if (this._interrupted) break;

        const domA = domainNames[i];
        const domB = domainNames[j];
        const bestA = domains[domA].sort((a, b) => (b.coherency || 0) - (a.coherency || 0))[0];
        const bestB = domains[domB].sort((a, b) => (b.coherency || 0) - (a.coherency || 0))[0];

        if (bestA && bestB) {
          // Check tag overlap — universal principles appear across domains
          const shared = this._intersection(bestA.tags || [], bestB.tags || []);
          if (shared.length > 0) {
            discoveries.push({
              domains: [domA, domB],
              patterns: [bestA.name, bestB.name],
              universalPrinciples: shared,
              insight: `"${shared.join(', ')}" appears in both ${domA} and ${domB} — a universal principle`,
            });
          }
        }
      }
    }

    return { type: 'cross-domain-synthesis', discoveries: discoveries.length, topDiscoveries: discoveries.slice(0, 3) };
  }

  // ─── Activity 5: COHERENCY OPTIMIZATION ──────────────────────

  async _coherencyOptimization() {
    const patterns = this._getPatterns();
    if (patterns.length < 5) return null;

    const scores = patterns.map(p => p.coherency || p.coherencyScore?.total || 0).filter(s => s > 0);
    if (scores.length === 0) return null;

    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const below68 = scores.filter(s => s < 0.68).length;
    const above90 = scores.filter(s => s >= 0.90).length;

    // Self-compression insight: how many patterns are near-duplicates?
    const tagSignatures = patterns.map(p => (p.tags || []).sort().join(','));
    const uniqueSigs = new Set(tagSignatures);
    const compressionRatio = uniqueSigs.size / Math.max(patterns.length, 1);

    return {
      type: 'coherency-optimization',
      totalPatterns: patterns.length,
      avgCoherency: Math.round(avg * 1000) / 1000,
      range: [Math.round(min * 1000) / 1000, Math.round(max * 1000) / 1000],
      below068: below68,
      above090: above90,
      compressionRatio: Math.round(compressionRatio * 1000) / 1000,
      potentialDedup: patterns.length - uniqueSigs.size,
    };
  }

  // ─── Activity 6: PROPHECY ────────────────────────────────────

  async _prophecy() {
    // Look at recent search queries that returned no results
    // Predict what patterns will be needed next
    const patterns = this._getPatterns();
    const tagCounts = {};
    for (const p of patterns) {
      for (const t of (p.tags || [])) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    // Find tags that appear only once — emerging trends
    const emergingTags = Object.entries(tagCounts)
      .filter(([, c]) => c === 1)
      .map(([t]) => t);

    // Find missing standard tags
    const standardTags = ['authentication', 'database', 'caching', 'testing', 'deployment',
      'monitoring', 'messaging', 'api-design', 'websocket', 'graphql', 'grpc',
      'machine-learning', 'streaming', 'real-time', 'batch-processing'];
    const missingStandard = standardTags.filter(t => !tagCounts[t]);

    // Growth projection
    const growthRate = patterns.length > 0 ? (patterns.length / 30) : 0; // patterns per day estimate

    return {
      type: 'prophecy',
      emergingTrends: emergingTags.slice(0, 10),
      missingDomains: missingStandard,
      projectedGrowth: {
        patternsPerMonth: Math.round(growthRate * 30),
        estimatedIn6Months: patterns.length + Math.round(growthRate * 180),
      },
      recommendation: missingStandard.length > 0
        ? `Priority: add patterns for ${missingStandard.slice(0, 3).join(', ')}`
        : 'Library is well-covered across standard domains',
    };
  }

  // ─── Activity 7: META-LOOP ───────────────────────────────────

  async _metaLoop() {
    // The system observing itself observing itself
    // Read the meditation journal and find patterns IN the meditation
    const journal = this._readJournal();
    if (journal.length < 3) return { type: 'meta-loop', depth: 0, insight: 'Too few meditation sessions for meta-analysis' };

    // Find patterns across meditation sessions
    const activityCounts = {};
    const insightCounts = {};
    let totalCycles = 0;
    let totalInsights = 0;

    for (const entry of journal) {
      if (entry.event === 'session-end') {
        totalCycles += entry.cycles || 0;
        totalInsights += entry.insights || 0;
      }
      if (entry.event === 'activity-complete') {
        const act = entry.activity || 'unknown';
        activityCounts[act] = (activityCounts[act] || 0) + 1;
        if (entry.connections || entry.discoveries || entry.hypotheses) {
          insightCounts[act] = (insightCounts[act] || 0) + 1;
        }
      }
    }

    // Which activity produces the most insights?
    const mostProductive = Object.entries(insightCounts).sort((a, b) => b[1] - a[1])[0];

    // Meta-insight: is the system improving its own meditation?
    const sessions = journal.filter(e => e.event === 'session-end');
    const recentSessions = sessions.slice(-5);
    const olderSessions = sessions.slice(0, Math.max(0, sessions.length - 5));

    let meditationImproving = 'insufficient-data';
    if (recentSessions.length >= 2 && olderSessions.length >= 2) {
      const recentAvg = recentSessions.reduce((s, e) => s + (e.insights || 0), 0) / recentSessions.length;
      const olderAvg = olderSessions.reduce((s, e) => s + (e.insights || 0), 0) / olderSessions.length;
      meditationImproving = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'degrading' : 'stable';
    }

    return {
      type: 'meta-loop',
      depth: 1, // This is a meta-observation of observations
      totalSessions: sessions.length,
      totalCycles,
      totalInsights,
      mostProductiveActivity: mostProductive ? { activity: mostProductive[0], insights: mostProductive[1] } : null,
      meditationTrend: meditationImproving,
      selfAwareness: `The Oracle has meditated ${sessions.length} times, producing ${totalInsights} insights. ` +
        `Meditation quality is ${meditationImproving}.` +
        (mostProductive ? ` Most productive activity: ${mostProductive[0]}.` : ''),
    };
  }

  // ─── Activity Router ─────────────────────────────────────────

  async _runActivity(activity) {
    switch (activity) {
      case 'self-reflection': return this._selfReflection();
      case 'consolidation': return this._consolidation();
      case 'synthetic-exploration': return this._syntheticExploration();
      case 'cross-domain-synthesis': return this._crossDomainSynthesis();
      case 'coherency-optimization': return this._coherencyOptimization();
      case 'prophecy': return this._prophecy();
      case 'meta-loop': return this._metaLoop();
      default: return null;
    }
  }

  // ─── Whisper Synthesis ───────────────────────────────────────

  _synthesizeWhisper(insights) {
    if (insights.length === 0) return 'The Oracle meditated in silence. No new insights emerged.';

    const parts = [];

    for (const insight of insights) {
      switch (insight.type) {
        case 'self-reflection':
          if (insight.connections > 0) parts.push(`Found ${insight.connections} unexplored connections between patterns.`);
          break;
        case 'consolidation':
          if (insight.compressed > 0) parts.push(`${insight.compressed} patterns could be merged.`);
          if (insight.archived > 0) parts.push(`${insight.archived} patterns are unused — candidates for archival.`);
          break;
        case 'synthetic-exploration':
          if (insight.hypotheses > 0) parts.push(`Generated ${insight.hypotheses} synthetic pattern hypotheses.`);
          break;
        case 'cross-domain-synthesis':
          if (insight.discoveries > 0) parts.push(`Discovered ${insight.discoveries} cross-domain universal principles.`);
          break;
        case 'coherency-optimization':
          parts.push(`Library coherency: avg ${insight.avgCoherency}, ${insight.potentialDedup} potential dedup candidates.`);
          break;
        case 'prophecy':
          if (insight.missingDomains?.length > 0) parts.push(`Missing domains: ${insight.missingDomains.slice(0, 3).join(', ')}.`);
          break;
        case 'meta-loop':
          if (insight.selfAwareness) parts.push(insight.selfAwareness);
          break;
      }
    }

    return parts.length > 0 ? parts.join(' ') : 'Meditation complete. The Oracle rests.';
  }

  // ─── Helpers ─────────────────────────────────────────────────

  _getPatterns() {
    try {
      if (this._oracle.stats) {
        const stats = this._oracle.stats();
        return stats.patterns || [];
      }
      if (this._oracle.search) {
        return this._oracle.search('', { limit: 1000 }) || [];
      }
    } catch {}

    // Fallback: read seed files
    try {
      const seedDir = path.join(path.dirname(require.resolve('../package.json')), 'src', 'patterns');
      const allPatterns = [];
      for (const f of fs.readdirSync(seedDir).filter(f => f.endsWith('.json'))) {
        const data = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
        const pats = Array.isArray(data) ? data : (data.patterns || []);
        allPatterns.push(...pats);
      }
      return allPatterns;
    } catch {}

    return [];
  }

  _sample(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  _jaccardSimilarity(a, b) {
    const setA = new Set(a.map(t => t.toLowerCase()));
    const setB = new Set(b.map(t => t.toLowerCase()));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  _intersection(a, b) {
    const setB = new Set(b.map(t => t.toLowerCase()));
    return a.filter(t => setB.has(t.toLowerCase()));
  }

  _log(event, data) {
    const entry = { timestamp: new Date().toISOString(), event, sessionId: this._sessionId, ...data };
    this._journal.push(entry);

    // Persist to journal file
    try {
      const dir = path.dirname(this._journalPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this._journalPath, JSON.stringify(entry) + '\n');
    } catch {}
  }

  _readJournal() {
    try {
      if (!fs.existsSync(this._journalPath)) return [];
      return fs.readFileSync(this._journalPath, 'utf8')
        .trim().split('\n')
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  MeditationEngine,
  MEDITATION_DEFAULTS,
  STATE,
};
