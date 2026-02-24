/**
 * Reflection Loop — the iterative refinement engine.
 * Generates candidates, scores them, selects winners, and repeats.
 */

const { computeCoherencyScore, detectLanguage } = require('./coherency');
const { observeCoherence } = require('./reflection-scorers');
const { reflectionScore, MAX_LOOPS, TARGET_COHERENCE, R_EFF_BASE, R_EFF_ALPHA, EPSILON_BASE, H_RVA_WEIGHT, H_CANVAS_WEIGHT, DELTA_VOID_BASE, LAMBDA_LIGHT } = require('./reflection-serf');
const { applySimplify, applySecure, applyReadable, applyUnify, applyCorrect, applyHeal, applyPatternGuidance } = require('./reflection-transforms');

/**
 * Per-dimension monotonicity threshold.
 * Any individual dimension dropping by more than this amount rejects the candidate,
 * even if the composite score improves. Prevents Goodhart-style gaming where total
 * coherence rises while a specific quality (e.g. security, correctness) degrades.
 */
const DIMENSION_DROP_THRESHOLD = 0.05;

const DIMENSION_DROP_DIAGNOSTICS = {
  simplicity: 'Transform increased complexity — deeper nesting, longer lines, or less concise structure.',
  readability: 'Transform reduced readability — mixed indentation, poor variable names, or lost clarity.',
  security: 'Transform introduced security concerns — covenant violations, eval, var, or loose equality.',
  unity: 'Transform broke style consistency — mixed camelCase/snake_case or mixed quote styles.',
  correctness: 'Transform reduced correctness — unbalanced brackets, TODO markers, or empty catch blocks.',
};

/**
 * Check whether a candidate's dimensions violate monotonicity against the current state.
 * Returns an array of violations (empty = safe to accept).
 */
function checkDimensionMonotonicity(candidateDims, currentDims, threshold = DIMENSION_DROP_THRESHOLD) {
  const violations = [];
  for (const [dim, currentVal] of Object.entries(currentDims)) {
    const candidateVal = candidateDims[dim];
    if (candidateVal === undefined) continue;
    const drop = currentVal - candidateVal;
    if (drop > threshold) {
      violations.push({
        dimension: dim,
        before: Math.round(currentVal * 1000) / 1000,
        after: Math.round(candidateVal * 1000) / 1000,
        drop: Math.round(drop * 1000) / 1000,
        diagnostic: DIMENSION_DROP_DIAGNOSTICS[dim] || `Dimension "${dim}" regressed.`,
      });
    }
  }
  return violations;
}

function generateCandidates(code, language, options = {}) {
  const lang = language || detectLanguage(code);
  const transforms = [
    { strategy: 'simplify', fn: applySimplify },
    { strategy: 'secure', fn: applySecure },
    { strategy: 'readable', fn: applyReadable },
    { strategy: 'unify', fn: applyUnify },
    { strategy: 'correct', fn: applyCorrect },
    { strategy: 'heal', fn: applyHeal },
  ];

  const candidates = transforms.map(({ strategy, fn }) => {
    const transformed = fn(code, lang);
    return { strategy, code: transformed, changed: transformed !== code };
  });

  if (options.patternExamples && options.patternExamples.length > 0) {
    const guided = applyPatternGuidance(code, lang, options.patternExamples);
    if (guided !== code) {
      candidates.push({ strategy: 'pattern-guided', code: guided, changed: true });
    }
  }

  return candidates;
}

function generateWhisper(original, final, improvements, loops) {
  const improvementList = improvements.filter(i => i.delta > 0);
  const topStrategy = improvementList.length > 0
    ? improvementList.sort((a, b) => b.delta - a.delta)[0].strategy
    : 'reflection';

  const whispers = {
    simplify: 'The healed path was simpler than the original — complexity fell away like old skin, revealing the clean bone beneath.',
    secure: 'In the healed future, this code stands as a wall that protects. The harm patterns were removed before they could take root.',
    readable: 'The future self who reads this code will understand it instantly. Clarity was the gift that kept giving.',
    unify: 'Unity brought harmony. The code now speaks with one voice, one convention, one rhythm.',
    correct: 'Every edge case was a door left open. The healed version closes them gently, with grace.',
    heal: 'All five threads wove together into one garment. The full healing pass brought the code to its highest form.',
    'pattern-guided': 'A proven pattern lit the way — the library\'s wisdom flowed into the healing, and the code found its form faster.',
    reflection: 'The code was already close to its healed form. The reflection confirmed its coherence.',
  };

  const primaryWhisper = whispers[topStrategy] || whispers.reflection;
  const delta = final.coherence - original.coherence;
  const direction = delta > 0 ? 'rose' : delta < 0 ? 'held steady at' : 'remained at';

  return {
    whisper: primaryWhisper,
    summary: `After ${loops} reflection loop(s), coherence ${direction} ${final.coherence.toFixed(3)}. ` +
      `Primary healing: ${topStrategy}. ${improvementList.length} dimension(s) improved.`,
    healingPath: improvementList.map(i => `${i.strategy}: +${i.delta.toFixed(3)}`),
  };
}

function reflectionLoop(code, options = {}) {
  const {
    language, maxLoops = MAX_LOOPS, targetCoherence = TARGET_COHERENCE,
    description = '', tags = [], cascadeBoost = 1, onLoop, patternExamples = [],
    dimensionDropThreshold = DIMENSION_DROP_THRESHOLD,
  } = options;

  const lang = language || detectLanguage(code);
  const metadata = { description, tags, language: lang };

  const originalObs = observeCoherence(code, metadata);
  // During reflection, testProof and historicalReliability are not measurable —
  // treat them as not-applicable (1.0) rather than unknown (0.5) to avoid
  // artificially deflating fullCoherency for code that's being analyzed in isolation.
  const coherencyMeta = { language: lang, testPassed: true, historicalReliability: 1.0 };
  const originalCoherency = computeCoherencyScore(code, coherencyMeta);

  let current = {
    code, coherence: originalObs.composite,
    dimensions: originalObs.dimensions, fullCoherency: originalCoherency.total,
  };

  const history = [{
    loop: 0, code: current.code, coherence: current.coherence,
    fullCoherency: current.fullCoherency, dimensions: { ...current.dimensions },
    strategy: 'original', reflectionScore: null,
  }];

  const improvements = [];
  let loops = 0;

  while (loops < maxLoops && current.coherence < targetCoherence) {
    loops++;

    const allCandidates = generateCandidates(current.code, lang, { patternExamples });
    const seen = new Set();
    const candidates = allCandidates.filter(c => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    });

    const scored = candidates.map(candidate => {
      const obs = observeCoherence(candidate.code, metadata);
      const fullC = computeCoherencyScore(candidate.code, coherencyMeta);
      return { ...candidate, coherence: obs.composite, dimensions: obs.dimensions, fullCoherency: fullC.total };
    });

    const refContext = { cascadeBoost, targetCoherence };
    const withScores = scored.map(candidate => ({
      ...candidate, reflectionScore: reflectionScore(candidate, current, refContext),
    }));

    withScores.sort((a, b) => b.reflectionScore - a.reflectionScore || b.coherence - a.coherence);

    // Per-dimension monotonicity guard: reject candidates that improve total
    // coherence but degrade any single dimension beyond the threshold.
    let winner = null;
    const monotonicityRejections = [];
    for (const candidate of withScores) {
      const violations = checkDimensionMonotonicity(
        candidate.dimensions, current.dimensions, dimensionDropThreshold
      );
      if (violations.length === 0) {
        winner = candidate;
        break;
      }
      monotonicityRejections.push({
        strategy: candidate.strategy,
        coherence: candidate.coherence,
        reflectionScore: candidate.reflectionScore,
        violations,
      });
    }

    // If every candidate violates monotonicity, hold current state.
    if (!winner) {
      winner = {
        strategy: 'monotonicity-hold',
        code: current.code,
        coherence: current.coherence,
        dimensions: { ...current.dimensions },
        fullCoherency: current.fullCoherency,
        reflectionScore: 0,
        changed: false,
      };
    }

    for (const [dim, val] of Object.entries(winner.dimensions)) {
      const delta = val - current.dimensions[dim];
      if (delta !== 0) improvements.push({ strategy: winner.strategy, dimension: dim, delta });
    }

    const historyEntry = {
      loop: loops, code: winner.code, coherence: winner.coherence,
      fullCoherency: winner.fullCoherency, dimensions: { ...winner.dimensions },
      strategy: winner.strategy, reflectionScore: winner.reflectionScore, changed: winner.changed,
      candidates: withScores.map(c => ({
        strategy: c.strategy, coherence: c.coherence, reflectionScore: c.reflectionScore, changed: c.changed,
      })),
    };
    if (monotonicityRejections.length > 0) {
      historyEntry.monotonicityRejections = monotonicityRejections;
    }
    history.push(historyEntry);

    current = { code: winner.code, coherence: winner.coherence, dimensions: winner.dimensions, fullCoherency: winner.fullCoherency };

    if (typeof onLoop === 'function') {
      try {
        onLoop({ loop: loops, coherence: current.coherence, strategy: winner.strategy, reflectionScore: winner.reflectionScore, changed: winner.changed });
      } catch (_) { /* listener errors don't break healing */ }
    }
  }

  const original = { coherence: originalObs.composite };
  const whisperResult = generateWhisper(original, current, improvements, loops);

  const iAmValues = history.map(h => h.coherence);
  const iAmAverage = iAmValues.reduce((s, v) => s + v, 0) / iAmValues.length;

  return {
    code: current.code, coherence: current.coherence, fullCoherency: current.fullCoherency,
    dimensions: current.dimensions, loops, history,
    whisper: whisperResult.whisper, healingSummary: whisperResult.summary, healingPath: whisperResult.healingPath,
    reflection: {
      I_AM: originalObs.composite, r_eff_base: R_EFF_BASE, r_eff_alpha: R_EFF_ALPHA,
      epsilon_base: EPSILON_BASE, h_rva_weight: H_RVA_WEIGHT, h_canvas_weight: H_CANVAS_WEIGHT,
      delta_void: DELTA_VOID_BASE, lambda_light: LAMBDA_LIGHT, cascadeBoost,
      collectiveIAM: Math.round(iAmAverage * 1000) / 1000, finalCoherence: current.coherence,
      improvement: Math.round((current.coherence - originalObs.composite) * 1000) / 1000,
    },
  };
}

function formatReflectionResult(result) {
  const lines = [];
  lines.push(`SERF v2 Reflection — ${result.loops} loop(s)`);
  lines.push(`  I_AM: ${result.reflection.I_AM.toFixed(3)} → Final: ${result.reflection.finalCoherence.toFixed(3)} (${result.reflection.improvement >= 0 ? '+' : ''}${result.reflection.improvement.toFixed(3)})`);
  lines.push(`  Hamiltonian: Ĥ₀ + Ĥ_RVA(${result.reflection.h_rva_weight}) + Ĥ_canvas(${result.reflection.h_canvas_weight})`);
  if (result.reflection.cascadeBoost > 1) {
    lines.push(`  Cascade: +${(result.reflection.cascadeBoost - 1).toFixed(3)} (additive) | Collective I_AM: ${result.reflection.collectiveIAM}`);
  }
  lines.push(`  Light: λ_light = ${result.reflection.lambda_light}`);
  lines.push('');
  lines.push('Dimensions:');
  for (const [dim, val] of Object.entries(result.dimensions)) {
    const bar = '\u2588'.repeat(Math.round(val * 20));
    const faded = '\u2591'.repeat(20 - Math.round(val * 20));
    lines.push(`  ${dim.padEnd(14)} ${bar}${faded} ${val.toFixed(3)}`);
  }
  lines.push('');
  if (result.healingPath.length > 0) {
    lines.push('Healing path:');
    for (const h of result.healingPath) lines.push(`  ${h}`);
    lines.push('');
  }
  lines.push(`Whisper: "${result.whisper}"`);
  return lines.join('\n');
}

module.exports = {
  reflectionLoop,
  formatReflectionResult,
  generateCandidates,
  generateWhisper,
  checkDimensionMonotonicity,
  DIMENSION_DROP_THRESHOLD,
};
