#!/usr/bin/env node
'use strict';

/**
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
out.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 11, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input; try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
const cmd = (input.tool_input || {}).command || '';
if (!cmd || cmd.length < 40) process.exit(0);

// ── CHECKS THAT APPLY TO EVERY COMMAND ──────────────────────────────────────
//
// These run BEFORE the inline gate below, because the inline gate is exactly
// how this hook was walked around for a whole working session (2026-08-12).
// It refused `node -e "require('./src/core/void-service')…"` correctly — so
// the bypass simply moved: write the same logic to a file in a scratch dir,
// then run the file. Not inline, so the hook exited at the gate and never
// looked. A gate that watches one doorway is a gate with a wall next to it.

// 1. THE RAW TOOL PATH. The goggles are ONE surface: `run.mjs`. Invoking the
//    underlying script directly gets a plausible-looking read with none of the
//    routed verbs (--do ratchets / call / field / drift …) — the reader then
//    believes they used the instrument. Measured: an entire session of
//    `node src/tools/goggles.js <file>` while `--do` was never available on
//    that path at all.
const RAW_GOGGLES = /\bnode\s+\S*src\/tools\/goggles(?:-fp)?\.js\b/;
if (RAW_GOGGLES.test(cmd)) {
  out('deny',
    'GOGGLES — RAW TOOL PATH refused\n' +
    '  src/tools/goggles.js is the implementation, not the surface. It has no --do verbs,\n' +
    '  so a read taken this way silently misses everything the goggles can actually drive.\n' +
    '  Use:  node .claude/skills/goggles/run.mjs <file>        (focused read)\n' +
    '        node .claude/skills/goggles/run.mjs --map          (macro map)\n' +
    '        node .claude/skills/goggles/run.mjs --diff         (changed vs HEAD)\n' +
    '        node .claude/skills/goggles/run.mjs --do <verb>    (drive the substrate)');
}

// 2. THE SCRATCH SCRIPT. A measurement written to a temp file and executed is
//    the same bypass as an inline one, minus the enforcement — and it is the
//    shape an assistant reaches for most naturally, because writing code is
//    cheaper than finding the verb that already does it. Only DENY when the
//    script actually reaches into the ecosystem: a pure codemod over fs/path
//    is honest work and stays allowed.
const SCRATCH_RUN = /\b(?:node|python3?)\s+((?:\/tmp\/|\/var\/tmp\/)\S+\.(?:js|mjs|cjs|py))/;
const scratch = cmd.match(SCRATCH_RUN);
if (scratch) {
  let body = '';
  try { body = fs.readFileSync(scratch[1], 'utf8'); } catch (_) { body = ''; }
  const REACHES_ECOSYSTEM =
    /require\s*\(\s*['"`][^'"`]*(?:src\/(?:core|tools|audit|atomic|compression|patterns)\/|scripts\/[a-z-]*ratchet)[^'"`]*['"`]\s*\)/.test(body)
    || /\b(?:import|from)\s+(?:fractal_decoder|void_compressor(?:_v\d)?|coherency_v\d|living_remembrance|resonance_detector|compressor_service)\b/.test(body);
  if (REACHES_ECOSYSTEM) {
    out('deny',
      'GOGGLES — SCRATCH-SCRIPT BYPASS refused\n' +
      '  ' + scratch[1] + ' reaches into ecosystem modules and is being run outside the goggles.\n' +
      '  Writing the measurement is not cheaper than finding it: the substrate already owns\n' +
      '  these readings, and one taken this way is invisible to everything that tracks them.\n' +
      '  Use:  node .claude/skills/goggles/run.mjs --do <verb>\n' +
      '        node .claude/skills/goggles/run.mjs --do call <repo>/<path>#<fn> [jsonArg …]\n' +
      '  If no verb or export reaches what you need, that is a MISSING VERB to report — not a bypass.\n' +
      '  (A scratch script that only uses fs/path — a codemod, a fixture — is fine and not denied.)');
  }
}

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
// ── the ONE-SURFACE bypass ───────────────────────────────────────────────
// The list above guards the substrate's MATH. This guards the substrate's
// SURFACE. Requiring an ecosystem module inline and calling its functions is
// running the instrument beside the goggles rather than through them — the
// reading is real, but nothing that reads it knows it happened, and the
// caller invents the inputs by hand. `goggles --do call <path>#<fn> [json…]`
// exists precisely for this and takes JSON arguments.
//
// Recorded because it kept happening: voidProfile was invoked through `node -e`
// with a hand-made flow array and the output reported as a verification.
const SURFACE_REQUIRE = /require\s*\(\s*['"`][^'"`]*(?:src\/core\/|src\/tools\/|src\/audit\/|\.\.\/core\/|\.\/src\/)[^'"`]*['"`]\s*\)/;
const SURFACE_CALL = /\.\s*[a-zA-Z_$][\w$]*\s*\(/;
// The Python side of the same seam: Void's own modules imported inline and
// called directly, rather than through the goggles.
const SURFACE_PY = /\b(?:import|from)\s+(fractal_decoder|void_compressor(?:_v\d)?|coherency_v\d|living_remembrance|rag_query|compressor_service|resonance_detector)\b/;
if ((SURFACE_REQUIRE.test(cmd) && SURFACE_CALL.test(cmd)) || SURFACE_PY.test(cmd)) {
  out('deny',
    'GOGGLES — ONE-SURFACE BYPASS refused in an inline command\n' +
    '  This requires an ecosystem module and calls it directly, outside the goggles.\n' +
    '  The reading may be correct, but nothing that reads the substrate knows it was taken,\n' +
    '  and inline callers hand-build the inputs — which is how a fabricated array got\n' +
    '  reported as a verification.\n' +
    '  Use:  goggles --do call <repo>/<path>#<fn> [jsonArg …]\n' +
    '    e.g. goggles --do call oracle/src/core/decoder-stack.js#flowCheckpoints\n' +
    '  Naming a function that is not exported lists the ones that are.\n' +
    '  If no verb or export reaches what you need, that is a MISSING VERB to report — not a bypass.');
}

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
