/**
 * Oracle Core — Resolve.
 * Smart retrieval: PULL / EVOLVE / GENERATE decision with reflection healing.
 */

const { reflectionLoop } = require('../core/reflection');
const { _generateResolveWhisper, _generateCandidateNotes } = require('./oracle-core-whispers');
const { parseIntent, ARCHITECTURAL_PATTERNS } = require('../core/search-intelligence');

module.exports = {
  /**
   * Resolves a code request by deciding whether to PULL, EVOLVE, or GENERATE.
   * Falls back to built-in architectural patterns for structural queries.
   */
  resolve(request = {}) {
    if (request == null || typeof request !== 'object') request = {};
    const { description = '', tags = [], language, minCoherency, heal = true } = request;

    let decision = this.patterns.decide({ description, tags, language, minCoherency });
    const historyResults = this.query({ description, tags, language, limit: 3, minCoherency: 0.5 });

    // For structural queries with no strong match, check built-in architectural patterns.
    // Use a higher threshold (0.65) since low-confidence matches from the store
    // (like "validate-email" at 0.52) aren't useful for architectural questions.
    if (decision.decision === 'generate' || (decision.confidence || 0) < 0.65) {
      const intent = parseIntent(description);
      const isStructural = intent.intents.some(i => i.structural);
      if (isStructural && ARCHITECTURAL_PATTERNS.length > 0) {
        const words = (intent.rewritten || description).toLowerCase().split(/\s+/);
        let bestMatch = null;
        let bestScore = 0;
        for (const ap of ARCHITECTURAL_PATTERNS) {
          const allText = [ap.name, ap.description, ...ap.tags].join(' ').toLowerCase();
          const hits = words.filter(w => w.length > 2 && allText.includes(w)).length;
          const score = words.length > 0 ? hits / words.length : 0;
          if (score > bestScore) { bestScore = score; bestMatch = ap; }
        }
        if (bestMatch && bestScore > 0.2) {
          decision = {
            decision: 'pull', confidence: Math.min(1, bestScore + 0.3),
            reasoning: `Architectural pattern match: ${bestMatch.name}`,
            pattern: { ...bestMatch, coherencyScore: { total: 1.0 }, patternType: 'architecture' },
            alternatives: [],
          };
        }
      }
    }

    const patternData = decision.pattern ? {
      id: decision.pattern.id, name: decision.pattern.name, code: decision.pattern.code,
      language: decision.pattern.language, patternType: decision.pattern.patternType,
      complexity: decision.pattern.complexity, coherencyScore: decision.pattern.coherencyScore?.total,
      tags: decision.pattern.tags,
    } : null;

    let healedCode = patternData?.code || null;
    let healing = null;
    if (heal && patternData && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      try {
        const lang = language || patternData.language || 'javascript';
        const maxLoops = decision.decision === 'evolve' ? 3 : 2;

        this._emit({
          type: 'healing_start', patternId: patternData.id, patternName: patternData.name,
          decision: decision.decision, maxLoops,
        });

        healing = reflectionLoop(patternData.code, {
          language: lang, description, tags, maxLoops,
          onLoop: (loopData) => {
            this._emit({
              type: 'healing_progress', patternId: patternData.id, patternName: patternData.name,
              loop: loopData.loop, maxLoops, coherence: loopData.coherence, strategy: loopData.strategy,
              reflectionScore: loopData.reflectionScore, changed: loopData.changed,
            });
          },
        });
        healedCode = healing.code;

        this._emit({
          type: 'healing_complete', patternId: patternData.id, patternName: patternData.name,
          decision: decision.decision, loops: healing.loops, originalCoherence: healing.reflection?.I_AM,
          finalCoherence: healing.reflection?.finalCoherence, improvement: healing.reflection?.improvement,
          healingPath: healing.healingPath,
        });
      } catch (_) {
        healedCode = patternData.code;
        this._emit({
          type: 'healing_failed', patternId: patternData?.id, patternName: patternData?.name,
          error: _.message || 'Unknown healing error',
        });
      }
    }

    const whisper = _generateResolveWhisper(decision, patternData, healing);
    const candidateNotes = _generateCandidateNotes(decision);

    // Auto-record usage feedback when a pattern is pulled or evolved
    // This closes the feedback loop that was previously manual-only
    if (patternData?.id && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      try {
        this.patterns.recordUsage(patternData.id, true);
        this._emit({ type: 'feedback', id: patternData.id, succeeded: true, source: 'auto-resolve' });
      } catch { /* best effort — never break resolve */ }
    }

    return {
      decision: decision.decision, confidence: decision.confidence, reasoning: decision.reasoning,
      pattern: patternData, healedCode, whisper, candidateNotes,
      healing: healing ? {
        loops: healing.loops, originalCoherence: healing.reflection?.I_AM,
        finalCoherence: healing.reflection?.finalCoherence, improvement: healing.reflection?.improvement,
        healingPath: healing.healingPath,
      } : null,
      alternatives: decision.alternatives, historyMatches: historyResults,
    };
  },
};
