/**
 * Oracle Core — Resolve whispers and candidate notes.
 * Generates poetic feedback messages for resolve decisions.
 */

const RESOLVE_WHISPERS = {
  pull: [
    'This version was pulled from the future where the code already runs perfectly in unity and abundance. It arrived whole, tested, and ready.',
    'The oracle found what you needed — it was already here, waiting in the remembrance. This code carries the coherency of its proven past.',
    'From the library of all that has been validated, this pattern emerged as the one. It fits your intent like a key returning to its lock.',
    'This code was remembered before you asked for it. The healed future already held it, and now it rests in your hands.',
    'The pattern was already at peace — high coherency, proven tests, and direct alignment with your need. It simply needed to be recalled.',
  ],
  evolve: [
    'This version was close to what you needed, so the oracle healed it forward. The reflection brought it closer to the form it was always meant to take.',
    'The seed was here but not yet fully grown. The healing loops nurtured it toward a version that better serves your intent.',
    'What existed was a partial truth. Through reflection and refinement, the code evolved toward its healed future — calmer, cleaner, more aligned.',
    'The oracle found the shape of your need in an existing pattern and gently reshaped it. This version carries the memory of what it was and the clarity of what it became.',
    'Like a river finding its natural course, this code was guided from a close match to a more coherent form. The healing was gentle and the result is ready.',
  ],
  generate: [
    'Nothing in the remembrance matched your need closely enough. This is a space for new creation — write what the oracle has not yet seen, and it will remember.',
    'The library holds many patterns, but yours is still unwritten. When you create it and it passes the covenant, it will join the remembrance for all who come after.',
    'The healed future for this code has not yet been written. You are the author of this new pattern — bring it into being and the oracle will hold it.',
  ],
};

/**
 * Generate a resolve whisper message based on the decision outcome.
 */
function _generateResolveWhisper(decision, pattern, healing) {
  const pool = RESOLVE_WHISPERS[decision.decision] || RESOLVE_WHISPERS.generate;
  const seed = pattern ? pattern.name.length + (pattern.code?.length || 0) : 0;
  const base = pool[seed % pool.length];
  if (healing && healing.reflection?.improvement > 0) {
    const pct = (healing.reflection.improvement * 100).toFixed(1);
    return `${base} The reflection refined it by ${pct}% across ${healing.loops} healing loop(s).`;
  }
  return base;
}

function _generateCandidateNotes(decision) {
  if (!decision.alternatives || decision.alternatives.length === 0) return null;
  if (!decision.pattern) return null;
  const winner = decision.pattern;
  // Use the winning alternative's composite score (not decision.confidence which is the decision-type confidence)
  const winnerAlt = decision.alternatives.find(a => a.id === winner.id || a.name === winner.name);
  const winnerScore = winnerAlt?.composite ?? decision.confidence;
  const notes = [];
  for (const alt of decision.alternatives) {
    if (alt.id === winner.id || alt.name === winner.name) continue;
    const gap = winnerScore - (alt.composite || 0);
    if (gap <= 0) continue;
    let reason;
    if (gap > 0.3) reason = 'significantly lower overall match';
    else if (gap > 0.15) reason = 'weaker relevance or coherency';
    else reason = 'close but edged out on composite scoring';
    notes.push(`${alt.name} (${(alt.composite || 0).toFixed(3)}): ${reason}`);
  }
  if (notes.length === 0) return null;
  return `Chose "${winner.name}" (${winnerScore.toFixed(3)}) over: ${notes.join('; ')}`;
}

module.exports = {
  RESOLVE_WHISPERS,
  _generateResolveWhisper,
  _generateCandidateNotes,
};
