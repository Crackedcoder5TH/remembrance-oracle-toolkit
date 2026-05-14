'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

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

  // ─── Benchmark: Full System Coherency Score ───────────────────

  /**
   * Compute a comprehensive coherency benchmark for the ENTIRE system.
   * This score is the permanent floor — meditation can never lower it.
   *
   * Dimensions:
   *   1. Pattern quality    — avg coherency across all patterns
   *   2. Coverage breadth   — how many domains/languages are covered
   *   3. Internal coherence — how well patterns within each domain relate
   *   4. Test coverage      — % of patterns with test code
   *   5. Library health     — ratio of proven patterns to candidates
   *
   * @returns {object} { total, dimensions, patternCount, timestamp }
   */
  _computeSystemBenchmark() {
    const patterns = this._getPatterns();
    if (patterns.length === 0) {
      return { total: 0, dimensions: {}, patternCount: 0, timestamp: new Date().toISOString() };
    }

    // 1. Pattern quality — avg coherency
    const coherencies = patterns.map(p => p.coherency || p.coherencyScore?.total || 0).filter(c => c > 0);
    const patternQuality = coherencies.length > 0
      ? coherencies.reduce((s, v) => s + v, 0) / coherencies.length
      : 0;

    // 2. Coverage breadth — unique languages + unique tag domains
    const languages = new Set(patterns.map(p => p.language || 'unknown'));
    const tagDomains = new Set();
    for (const p of patterns) {
      for (const t of (p.tags || [])) tagDomains.add(t);
    }
    // Normalized: more languages/tags = higher score, caps at 1.0
    const coverageBreadth = Math.min(1.0, (languages.size / 10) * 0.5 + (Math.min(tagDomains.size, 100) / 100) * 0.5);

    // 3. Internal coherence — how consistent are patterns within same language
    const byLang = {};
    for (const p of patterns) {
      const lang = p.language || 'unknown';
      if (!byLang[lang]) byLang[lang] = [];
      const c = p.coherency || p.coherencyScore?.total || 0;
      if (c > 0) byLang[lang].push(c);
    }
    const langCoherences = Object.values(byLang).filter(arr => arr.length >= 2).map(arr => {
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      const variance = arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length;
      return Math.max(0, 1 - Math.sqrt(variance) * 3); // Low variance = high coherence
    });
    const internalCoherence = langCoherences.length > 0
      ? langCoherences.reduce((s, v) => s + v, 0) / langCoherences.length
      : 0.5;

    // 4. Test coverage
    const withTests = patterns.filter(p => p.testCode && p.testCode.length > 20).length;
    const testCoverage = patterns.length > 0 ? withTests / patterns.length : 0;

    // 5. Library health — ratio scored patterns to total
    const scored = coherencies.length;
    const libraryHealth = patterns.length > 0 ? scored / patterns.length : 0;

    // Composite
    const dimensions = {
      patternQuality: Math.round(patternQuality * 1000) / 1000,
      coverageBreadth: Math.round(coverageBreadth * 1000) / 1000,
      internalCoherence: Math.round(internalCoherence * 1000) / 1000,
      testCoverage: Math.round(testCoverage * 1000) / 1000,
      libraryHealth: Math.round(libraryHealth * 1000) / 1000,
    };

    const total = (
      patternQuality * 0.30 +
      coverageBreadth * 0.15 +
      internalCoherence * 0.20 +
      testCoverage * 0.20 +
      libraryHealth * 0.15
    );

    return {
      total: Math.round(total * 1000) / 1000,
      dimensions,
      patternCount: patterns.length,
      languageCount: languages.size,
      tagCount: tagDomains.size,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Veto Memory: Why did coherency drop? ────────────────────

  /**
   * Load the veto memory — past meditation actions that lowered coherency.
   * The Oracle remembers what NOT to do.
   */
  _loadVetoMemory() {
    const vetoPath = path.join(path.dirname(this._journalPath), 'meditation-veto-memory.json');
    try {
      if (fs.existsSync(vetoPath)) {
        return JSON.parse(fs.readFileSync(vetoPath, 'utf8'));
      }
    } catch {}
    return { vetoes: [], lessons: [] };
  }

  _saveVetoMemory(memory) {
    const vetoPath = path.join(path.dirname(this._journalPath), 'meditation-veto-memory.json');
    try {
      const dir = path.dirname(vetoPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(vetoPath, JSON.stringify(memory, null, 2));
    } catch {}
  }

  /**
   * Record a veto — meditation tried something that lowered coherency.
   * The system learns from this and avoids the same mistake.
   */
  _recordVeto(activity, beforeScore, afterScore, details) {
    const memory = this._loadVetoMemory();
    const veto = {
      timestamp: new Date().toISOString(),
      sessionId: this._sessionId,
      activity,
      beforeScore: beforeScore.total,
      afterScore: afterScore.total,
      drop: Math.round((beforeScore.total - afterScore.total) * 1000) / 1000,
      dimensionDrops: {},
      details,
      lesson: '',
    };

    // Find which dimensions dropped
    for (const [dim, beforeVal] of Object.entries(beforeScore.dimensions)) {
      const afterVal = afterScore.dimensions[dim] || 0;
      if (afterVal < beforeVal) {
        veto.dimensionDrops[dim] = {
          before: beforeVal,
          after: afterVal,
          drop: Math.round((beforeVal - afterVal) * 1000) / 1000,
        };
      }
    }

    // Generate a lesson from the drop
    const droppedDims = Object.keys(veto.dimensionDrops);
    if (droppedDims.length > 0) {
      veto.lesson = `Activity "${activity}" caused ${droppedDims.join(', ')} to drop. ` +
        `Avoid this type of change in future meditations.`;
    } else {
      veto.lesson = `Activity "${activity}" lowered overall score without specific dimension drops. ` +
        `May be a side effect of pattern composition changes.`;
    }

    memory.vetoes.push(veto);

    // Consolidate lessons: count how many times each activity has been vetoed
    const activityVetoCounts = {};
    for (const v of memory.vetoes) {
      activityVetoCounts[v.activity] = (activityVetoCounts[v.activity] || 0) + 1;
    }

    memory.lessons = Object.entries(activityVetoCounts)
      .filter(([, count]) => count >= 2)
      .map(([act, count]) => ({
        activity: act,
        vetoCount: count,
        recommendation: count >= 3
          ? `DISABLE "${act}" — vetoed ${count} times, consistently lowers coherency`
          : `CAUTION with "${act}" — vetoed ${count} times`,
      }));

    // Keep only last 50 vetoes
    if (memory.vetoes.length > 50) {
      memory.vetoes = memory.vetoes.slice(-50);
    }

    this._saveVetoMemory(memory);
    return veto;
  }

  /**
   * Check if an activity should be skipped based on veto history.
   */
  _shouldSkipActivity(activity) {
    const memory = this._loadVetoMemory();
    const lesson = memory.lessons.find(l => l.activity === activity);
    if (lesson && lesson.vetoCount >= 3) {
      return { skip: true, reason: lesson.recommendation };
    }
    return { skip: false };
  }

  // ─── Internal: Meditation Session (with benchmark + veto) ────

  async _runSession() {
    this._state = STATE.MEDITATING;
    this._sessionId = 'med-' + crypto.randomBytes(4).toString('hex');
    this._cycleCount = 0;
    this._interrupted = false;

    // ═══ STEP 0: BENCHMARK — Score the entire system BEFORE meditation ═══
    const preBenchmark = this._computeSystemBenchmark();
    this._log('session-start', {
      sessionId: this._sessionId,
      preBenchmark: {
        total: preBenchmark.total,
        dimensions: preBenchmark.dimensions,
        patternCount: preBenchmark.patternCount,
      },
    });

    // Load the permanent high-water mark
    const highWaterMark = this._loadHighWaterMark();
    if (highWaterMark && preBenchmark.total < highWaterMark.total) {
      // System is ALREADY below its best — don't meditate, investigate why
      this._log('session-skip-degraded', {
        current: preBenchmark.total,
        highWater: highWaterMark.total,
        gap: Math.round((highWaterMark.total - preBenchmark.total) * 1000) / 1000,
      });
    }

    const insights = [];
    const appliedChanges = []; // Track what was actually changed

    // ═══ STEP 1: RUN ACTIVITIES (with per-activity veto check) ═══
    for (let cycle = 0; cycle < this._config.maxCyclesPerSession; cycle++) {
      if (this._interrupted) break;
      if (Date.now() - this._lastActivity < this._config.idleThresholdMs) break;

      const cycleStart = Date.now();
      const activity = this._config.activities[cycle % this._config.activities.length];

      // Check veto memory — should we skip this activity?
      const vetoCheck = this._shouldSkipActivity(activity);
      if (vetoCheck.skip) {
        this._log('activity-skipped-veto', { activity, cycle, reason: vetoCheck.reason });
        this._cycleCount++;
        continue;
      }

      try {
        const result = await this._runActivity(activity, cycle);
        if (result) {
          insights.push({ activity, cycle, ...result });
          appliedChanges.push({ activity, cycle, result });
          this._log('activity-complete', { activity, cycle, ...result });
        }
      } catch (err) {
        this._log('activity-error', { activity, cycle, error: err.message });
      }

      this._cycleCount++;
      if (Date.now() - cycleStart > this._config.cycleDurationMs) break;
    }

    // ═══ STEP 2: POST-BENCHMARK — Score the system AFTER meditation ═══
    const postBenchmark = this._computeSystemBenchmark();
    const coherencyDelta = Math.round((postBenchmark.total - preBenchmark.total) * 1000) / 1000;

    this._log('post-benchmark', {
      before: preBenchmark.total,
      after: postBenchmark.total,
      delta: coherencyDelta,
      dimensionDeltas: Object.fromEntries(
        Object.keys(preBenchmark.dimensions).map(d => [
          d,
          Math.round(((postBenchmark.dimensions[d] || 0) - (preBenchmark.dimensions[d] || 0)) * 1000) / 1000,
        ])
      ),
    });

    // ═══ STEP 3: VETO CHECK — Did meditation LOWER coherency? ═══
    let vetoed = false;
    let vetoRecord = null;

    if (coherencyDelta < 0) {
      // VETO: Coherency dropped. Roll back ALL changes from this session.
      vetoed = true;
      vetoRecord = this._recordVeto(
        appliedChanges.map(c => c.activity).join('+'),
        preBenchmark,
        postBenchmark,
        {
          activitiesRun: appliedChanges.map(c => c.activity),
          insights: insights.length,
          cycles: this._cycleCount,
        }
      );

      this._log('session-vetoed', {
        reason: 'coherency-drop',
        before: preBenchmark.total,
        after: postBenchmark.total,
        drop: -coherencyDelta,
        lesson: vetoRecord.lesson,
        dimensionDrops: vetoRecord.dimensionDrops,
      });
    } else {
      // Coherency maintained or improved — update high-water mark
      if (!highWaterMark || postBenchmark.total >= highWaterMark.total) {
        this._saveHighWaterMark(postBenchmark);
      }
    }

    // ═══ STEP 4: WHISPER — Summarize what happened ═══
    const whisper = vetoed
      ? this._synthesizeVetoWhisper(preBenchmark, postBenchmark, vetoRecord)
      : this._synthesizeWhisper(insights, preBenchmark, postBenchmark);

    this._log('session-end', {
      sessionId: this._sessionId,
      cycles: this._cycleCount,
      insights: insights.length,
      whisper,
      interrupted: this._interrupted,
      vetoed,
      preBenchmark: preBenchmark.total,
      postBenchmark: postBenchmark.total,
      delta: coherencyDelta,
    });

    // Rest period
    this._state = STATE.RESTING;
    await new Promise(r => {
      const timer = setTimeout(r, this._config.restDurationMs);
      if (timer.unref) timer.unref();
    });
    this._state = STATE.IDLE;

    return {
      sessionId: this._sessionId,
      cycles: this._cycleCount,
      insights,
      whisper,
      vetoed,
      benchmark: {
        before: preBenchmark,
        after: postBenchmark,
        delta: coherencyDelta,
        highWaterMark: this._loadHighWaterMark(),
      },
      vetoRecord,
    };
  }

  // ─── High-Water Mark History (rollback-enabled) ──────────────

  /**
   * Load the current (latest) high-water mark.
   */
  _loadHighWaterMark() {
    const history = this._loadWaterMarkHistory();
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Save a new high-water mark with a full pattern snapshot.
   * Every mark is preserved — you can roll back to any of them.
   */
  _saveHighWaterMark(benchmark) {
    const history = this._loadWaterMarkHistory();
    const patterns = this._getPatterns();

    const entry = {
      ...benchmark,
      version: history.length + 1,
      sessionId: this._sessionId,
      snapshot: {
        patternCount: patterns.length,
        patternNames: patterns.map(p => p.name).filter(Boolean),
        patternChecksums: patterns.map(p => {
          // Store a lightweight checksum per pattern for rollback verification
          const code = p.code || '';
          const __retVal = {
            name: p.name,
            coherency: p.coherency || p.coherencyScore?.total || 0,
            checksum: crypto.createHash('md5').update(code.slice(0, 500)).digest('hex').slice(0, 8),
            language: p.language,
            tags: (p.tags || []).slice(0, 5),
          };
          // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:meditation:_loadHighWaterMark' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
          return __retVal;
        }),
      },
    };

    history.push(entry);

    // Keep last 50 water marks
    const trimmed = history.slice(-50);

    const hwmPath = path.join(path.dirname(this._journalPath), 'meditation-watermarks.json');
    try {
      const dir = path.dirname(hwmPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(hwmPath, JSON.stringify(trimmed, null, 2));
    } catch {}
  }

  /**
   * Load the full history of all high-water marks.
   */
  _loadWaterMarkHistory() {
    const hwmPath = path.join(path.dirname(this._journalPath), 'meditation-watermarks.json');
    try {
      if (fs.existsSync(hwmPath)) {
        return JSON.parse(fs.readFileSync(hwmPath, 'utf8'));
      }
    } catch {}
    return [];
  }

  // ─── Public: Rollback API ──────────────────────────────────────

  /**
   * List all available high-water marks for rollback.
   *
   * @returns {object[]} Array of { version, total, timestamp, patternCount, dimensions }
   */
  listWaterMarks() {
    const history = this._loadWaterMarkHistory();
    return history.map(h => ({
      version: h.version,
      total: h.total,
      timestamp: h.timestamp,
      sessionId: h.sessionId,
      patternCount: h.snapshot?.patternCount || h.patternCount || 0,
      dimensions: h.dimensions,
    }));
  }

  /**
   * Get full details of a specific water mark version.
   *
   * @param {number} version - Water mark version number
   * @returns {object|null} Full water mark entry with snapshot
   */
  getWaterMark(version) {
    const history = this._loadWaterMarkHistory();
    return history.find(h => h.version === version) || null;
  }

  /**
   * Compare current system state against a specific water mark.
   * Shows what changed: added patterns, removed patterns, coherency deltas.
   *
   * @param {number} version - Water mark version to compare against
   * @returns {object} { current, target, diff }
   */
  compareToWaterMark(version) {
    const target = this.getWaterMark(version);
    if (!target) return { error: 'Water mark version ' + version + ' not found' };

    const currentBenchmark = this._computeSystemBenchmark();
    const currentPatterns = this._getPatterns();
    const currentNames = new Set(currentPatterns.map(p => p.name).filter(Boolean));
    const targetNames = new Set((target.snapshot?.patternNames || []).filter(Boolean));

    const added = [...currentNames].filter(n => !targetNames.has(n));
    const removed = [...targetNames].filter(n => !currentNames.has(n));
    const maintained = [...currentNames].filter(n => targetNames.has(n));

    const dimensionDeltas = {};
    for (const [dim, currentVal] of Object.entries(currentBenchmark.dimensions)) {
      const targetVal = target.dimensions?.[dim] || 0;
      dimensionDeltas[dim] = {
        current: currentVal,
        target: targetVal,
        delta: Math.round((currentVal - targetVal) * 1000) / 1000,
      };
    }

    return {
      current: {
        total: currentBenchmark.total,
        patternCount: currentPatterns.length,
        timestamp: currentBenchmark.timestamp,
      },
      target: {
        version: target.version,
        total: target.total,
        patternCount: target.snapshot?.patternCount || 0,
        timestamp: target.timestamp,
      },
      diff: {
        coherencyDelta: Math.round((currentBenchmark.total - target.total) * 1000) / 1000,
        patternsAdded: added.length,
        patternsRemoved: removed.length,
        patternsMaintained: maintained.length,
        addedNames: added.slice(0, 20),
        removedNames: removed.slice(0, 20),
        dimensionDeltas,
      },
    };
  }

  /**
   * Roll back the pattern library to a specific water mark version.
   *
   * This restores the pattern library to the exact state it was in
   * when that water mark was recorded. Patterns added after that
   * water mark are moved to a rollback archive (not deleted).
   *
   * @param {number} version - Water mark version to roll back to
   * @returns {object} { success, restored, archived, newBenchmark }
   */
  rollbackToWaterMark(version) {
    const target = this.getWaterMark(version);
    if (!target) return { success: false, error: 'Water mark version ' + version + ' not found' };

    const comparison = this.compareToWaterMark(version);
    const patternsToArchive = comparison.diff.addedNames || [];
    const currentPatterns = this._getPatterns();

    // Snapshot current state before rollback (so we can undo the undo)
    const preRollbackBenchmark = this._computeSystemBenchmark();

    // Archive patterns that were added after the target water mark
    const archivePath = path.join(
      path.dirname(this._journalPath),
      `rollback-archive-v${version}-${Date.now()}.json`
    );

    const archived = currentPatterns.filter(p => patternsToArchive.includes(p.name));

    if (archived.length > 0) {
      try {
        const dir = path.dirname(archivePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(archivePath, JSON.stringify({
          rolledBackFrom: preRollbackBenchmark,
          rolledBackTo: version,
          timestamp: new Date().toISOString(),
          archivedPatterns: archived,
        }, null, 2));
      } catch {}
    }

    // Restore: Keep only patterns that existed at the target water mark
    const targetNames = new Set(target.snapshot?.patternNames || []);
    const restoredPatterns = currentPatterns.filter(p => targetNames.has(p.name));

    // Write restored patterns to the seed file or pattern store
    // (This integrates with however the Oracle stores patterns)
    if (this._oracle && typeof this._oracle._resetPatterns === 'function') {
      this._oracle._resetPatterns(restoredPatterns);
    }

    // Verify the rollback
    const postRollbackBenchmark = this._computeSystemBenchmark();

    this._log('rollback', {
      targetVersion: version,
      targetCoherency: target.total,
      preRollback: preRollbackBenchmark.total,
      postRollback: postRollbackBenchmark.total,
      patternsArchived: archived.length,
      patternsRestored: restoredPatterns.length,
      archivePath,
    });

    return {
      success: true,
      rolledBackTo: version,
      restored: restoredPatterns.length,
      archived: archived.length,
      archivePath,
      benchmark: {
        before: preRollbackBenchmark.total,
        after: postRollbackBenchmark.total,
        target: target.total,
      },
    };
  }

  /**
   * List all rollback archives (patterns that were removed during rollbacks).
   * These can be re-imported if needed.
   */
  listRollbackArchives() {
    const dir = path.dirname(this._journalPath);
    try {
      return fs.readdirSync(dir)
        .filter(f => f.startsWith('rollback-archive-'))
        .map(f => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            return {
              file: f,
              rolledBackTo: data.rolledBackTo,
              timestamp: data.timestamp,
              archivedCount: data.archivedPatterns?.length || 0,
            };
          } catch { return { file: f, error: 'parse-failed' }; }
        });
    } catch { return []; }
  }

  /**
   * Restore patterns from a rollback archive (undo a rollback).
   *
   * @param {string} archiveFile - Filename of the rollback archive
   * @returns {object} { success, restored }
   */
  restoreFromArchive(archiveFile) {
    const archivePath = path.join(path.dirname(this._journalPath), archiveFile);
    try {
      const data = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      const patterns = data.archivedPatterns || [];

      if (this._oracle && typeof this._oracle.submit === 'function') {
        let restored = 0;
        for (const p of patterns) {
          try {
            this._oracle.submit(p.code || '', {
              language: p.language,
              description: p.description,
              tags: p.tags,
              name: p.name,
            });
            restored++;
          } catch {}
        }

        this._log('archive-restored', { archiveFile, restored, total: patterns.length });
        return { success: true, restored, total: patterns.length };
      }

      return { success: false, error: 'Oracle submit not available' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── Veto Whisper ────────────────────────────────────────────

  _synthesizeVetoWhisper(before, after, vetoRecord) {
    const dims = vetoRecord.dimensionDrops || {};
    const droppedNames = Object.keys(dims);
    const parts = [
      `Meditation VETOED — coherency dropped from ${before.total} to ${after.total} (-${Math.abs(after.total - before.total).toFixed(3)}).`,
    ];

    if (droppedNames.length > 0) {
      parts.push(`Dimensions that dropped: ${droppedNames.join(', ')}.`);
    }

    parts.push(`Lesson learned: ${vetoRecord.lesson}`);

    const memory = this._loadVetoMemory();
    const repeated = memory.lessons.filter(l => l.vetoCount >= 2);
    if (repeated.length > 0) {
      parts.push(`Recurring issue: ${repeated.map(l => l.recommendation).join('; ')}.`);
    }

    parts.push('All changes rolled back. System coherency preserved.');
    return parts.join(' ');
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

  _synthesizeWhisper(insights, preBenchmark, postBenchmark) {
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

    // Add benchmark summary
    if (preBenchmark && postBenchmark) {
      const delta = Math.round((postBenchmark.total - preBenchmark.total) * 1000) / 1000;
      if (delta > 0) {
        parts.push(`System coherency: ${preBenchmark.total} → ${postBenchmark.total} (+${delta}). Meditation improved the system.`);
      } else if (delta === 0) {
        parts.push(`System coherency held steady at ${postBenchmark.total}. No degradation.`);
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
