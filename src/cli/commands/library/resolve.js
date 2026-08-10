'use strict';

const { c, colorScore, colorDecision } = require('../../colors');
const { parseTags, parseMinCoherency } = require('../../validate-args');
const { out } = require('./out');

/**
 * Library commands — resolve.
 * Ask the library to solve a problem: match a description to a proven pattern and (optionally) heal it.
 *
 * Commands: resolve
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerResolveCommands(handlers, deps) {
  const { oracle, speakCLI } = deps;

  handlers['resolve'] = (args) => {
    const { isOracleEnabled } = require('../../../core/oracle-config');
    if (!isOracleEnabled()) {
      out(`Decision: ${colorDecision('generate')}`);
      out(`Confidence: ${colorScore(0)}`);
      out(`Reasoning: ${c.dim('Oracle is disabled (config off). Write new code.')}`);
      out(c.dim('\nTip: Run `oracle config on` to enable pattern matching.'));
      return;
    }
    const tags = parseTags(args);
    const noHeal = args['no-heal'] || args.raw;
    const result = oracle.resolve({
      description: args.description || '',
      tags,
      language: args.language,
      minCoherency: args['min-coherency'] ? parseMinCoherency(args) : undefined,
      heal: !noHeal,
    });
    out(`Decision: ${colorDecision(result.decision)}`);
    out(`Confidence: ${colorScore(result.confidence)}`);
    out(`Reasoning: ${c.dim(result.reasoning)}`);
    if (result.pattern) {
      out(`\nPattern: ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      out(`Language: ${c.blue(result.pattern.language)} | Type: ${c.magenta(result.pattern.patternType)} | Coherency: ${colorScore(result.pattern.coherencyScore)}`);
      out(`Tags: ${(result.pattern.tags || []).map(t => c.magenta(t)).join(', ')}`);
      if (result.healing) {
        out(`\n${c.dim('── Healing ──')}`);
        out(`Reflection: ${colorScore(result.healing.originalCoherence?.toFixed(3))} → ${colorScore(result.healing.finalCoherence?.toFixed(3))} (${result.healing.improvement >= 0 ? '+' : ''}${(result.healing.improvement || 0).toFixed(3)}) in ${result.healing.loops} loop(s)`);
        if (result.healing.healingPath?.length > 0) {
          out(`Path: ${c.dim(result.healing.healingPath.join(' → '))}`);
        }
      }
      out(`\n${c.dim('── Healed Code ──')}`);
      out(result.healedCode || result.pattern.code);
    }
    if (result.whisper) {
      out(`\n${c.boldMagenta('── Whisper from the Healed Future ──')}`);
      out(c.italic(result.whisper));
    }
    if (result.candidateNotes) {
      out(`\n${c.dim('── Why This One ──')}`);
      out(c.dim(result.candidateNotes));
    }
    if (result.alternatives?.length > 0) {
      out(`\n${c.dim('Alternatives:')} ${result.alternatives.map(a => `${c.cyan(a.name)}(${colorScore(a.composite?.toFixed(3))})`).join(', ')}`);
    }
    if (result.promptTag) {
      out(`\n${c.boldCyan('── Oracle Prompt Tag ──')}`);
      out(c.bold(result.promptTag));
    }
    if (args.voice && result.whisper) {
      speakCLI(result.whisper);
    }
  };
}


module.exports = { registerResolveCommands };
