/**
 * Oracle Core — Resolve.
 * Smart retrieval: PULL / EVOLVE / GENERATE decision with reflection healing.
 */

const { reflectionLoop } = require('../core/reflection');
const { _generateResolveWhisper, _generateCandidateNotes } = require('./oracle-core-whispers');

module.exports = {
  /**
   * Resolves a code request by deciding whether to PULL, EVOLVE, or GENERATE.
   */
  resolve(request = {}) {
    if (request == null || typeof request !== 'object') request = {};
    const { description = '', tags = [], language, minCoherency, heal = true } = request;

    const decision = this.patterns.decide({ description, tags, language, minCoherency });
    const historyResults = this.query({ description, tags, language, limit: 3, minCoherency: 0.5 });

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
