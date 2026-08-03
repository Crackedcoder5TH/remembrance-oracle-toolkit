#!/usr/bin/env node
'use strict';

/**
 * @oracle-infrastructure — PreToolUse hook for Bash; read-only inspection of the command about
 * to run, internal-state-bounded, never user-input-driven.
 *
 * goggles-bash-hook — closes the inline-analysis seam.
 *
 * The pre-write hook refuses a substrate bypass in a FILE. But an inline heredoc or -c/-e block
 * never becomes a file, so it slipped straight past: `python3 - <<PY … np.corrcoef … PY` is the
 * same bypass with none of the enforcement. This inspects the command text itself.
 *
 * Deliberately NARROW to stay honest: numpy is not the offence. Using numpy/sklearn to stand in
 * for the substrate's own SIMILARITY, RESONANCE or COHERENCE is. Loading an .npz, resampling with
 * interp, reading a buffer — all fine and all still allowed.
 *
 * Fails open on any internal error.
 */
const fs = require('node:fs');

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input; try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
const cmd = (input.tool_input || {}).command || '';
if (!cmd || cmd.length < 40) process.exit(0);

// only look at commands that actually run inline code (a bare heredoc into
// cat/tee is document-writing, not execution — the literal word 'heredoc'
// in the first cut matched prose and denied documentation commands)
const INLINE = /(python3?\s+(-c|-\s*<<|<<)|node\s+(-e|--eval|-\s*<<|<<))/i;
if (!INLINE.test(cmd)) process.exit(0);

// bypasses of the substrate's OWN similarity/coherence — not general numpy use
const BYPASS = [
  [/np\.corrcoef|numpy\.corrcoef/, 'numpy.corrcoef standing in for the substrate\'s own resonance'],
  [/cosine_similarity|sklearn\.metrics\.pairwise/, 'sklearn cosine standing in for composedCosine'],
  [/np\.dot\s*\([^)]*\)\s*\/\s*\(?\s*(np|numpy)\.linalg\.norm/, 'hand-rolled cosine (np.dot / linalg.norm)'],
  [/def\s+cos(ine)?\s*\([^)]*\)\s*:/, 'a hand-written cosine function'],
  [/const\s+cos\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,200}?Math\.sqrt/, 'a hand-written cosine arrow function'],
  [/for\s*\([^)]*\)\s*\{[^}]{0,160}na\s*\+=[^}]{0,160}nb\s*\+=/, 'the twin-accumulator cosine loop'],
  [/scipy\.spatial\.distance\.cosine|pdist|squareform/, 'scipy distance standing in for substrate resonance'],
  [/PCA\s*\(|TruncatedSVD\s*\(/, 'sklearn decomposition standing in for whitening/participationRatio'],
];
for (const [re, why] of BYPASS) {
  if (re.test(cmd)) {
    out('deny',
      'GOGGLES — SUBSTRATE BYPASS refused in an inline command\n' +
      '  ' + why + '\n' +
      '  This is the same bypass the pre-write hook refuses in a file; an inline heredoc is not an exemption.\n' +
      '  Use the substrate\'s own functions:\n' +
      '    similarity/resonance → decoder-stack.composedCosine · whitening.applyWhitening/participationRatio\n' +
      '    retrieval            → compression/holographic.holoSearch · FractalIndex.searchFlow\n' +
      '    compression/coherence→ void_compressor_v5.compress (result.avg_coherence, result.mint)\n' +
      '    field history        → field-coupling.contribute / peekField\n' +
      '  numpy is fine for loading, resampling and buffers — it is not fine as the measurement.');
  }
}
process.exit(0);
