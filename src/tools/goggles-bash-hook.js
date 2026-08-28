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
const { quiet } = require('../core/quiet');

function out(decision, reason) {
  // THE DENIAL LOG (leak map: "the measurement that makes this durable").
  // Every deny is appended as one JSON line — timestamp, the rule's first
  // line, the command (truncated). The stream IS the ongoing leak map: a
  // recurring denial is a Class-A weld working; a novel one is the next
  // verb to build. When it goes quiet across fresh sessions, the surface
  // is closed. Read it: goggles --do denials. Best-effort, never blocks.
  if (decision === 'deny') {
    try {
      const path = require('node:path');
      const dir = path.join(__dirname, '..', '..', '.remembrance');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'goggles-denials.jsonl'), JSON.stringify({
        ts: new Date().toISOString(),
        rule: String(reason).split('\n')[0].trim(),
        cmd: String(cmd).slice(0, 300),
      }) + '\n');
    } catch (e) { quiet('tools:goggles-bash-hook:denial-log', e); }
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}
out.atomicProperties = { charge: 0, valence: 1, mass: "heavy", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 1, group: 3, period: 3, harmPotential: "dangerous", alignment: "degrading", intention: "neutral", domain: "utility" };
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input; try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }
const cmd = (input.tool_input || {}).command || '';
if (!cmd) process.exit(0);
// NOTE: the old `cmd.length < 40` early-exit lived HERE — which let every
// short command skip every check, including RAW_GOGGLES (`node
// src/tools/goggles.js x.js` is ~30 chars). The length gate now sits just
// before the inline-analysis section, which is the only part it was ever
// meant to cheapen. Full-command welds below run on every command.

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
const RAW_GOGGLES = /\bnode\s+\S*src\/(?:tools\/goggles(?:-fp)?|cli)\.js\b/;
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
  // Match the ECOSYSTEM PATH anywhere in the body, not only inside a require().
  // Found by immediately violating this rule while writing it: a scratch script
  // that shells out — execSync('node src/tools/…') — names the module as a
  // STRING, so a require-only check reads it as an honest codemod and lets it
  // through. Shelling out is the same bypass wearing a different quote.
  const REACHES_ECOSYSTEM =
    /['"`][^'"`]*(?:src\/(?:core|tools|audit|atomic|compression|patterns)\/|scripts\/[a-z-]*ratchet)[^'"`]*['"`]/.test(body)
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

// ── CLASS-A WELDS (from docs/GOGGLES-LEAK-MAP.md) ───────────────────────────
// Each of these is a door an agent walked through in a measured session while
// the verb already existed (or exists now). Every deny names the verb — a
// wall without a signpost just breeds the next workaround.

// 3. THE CONTRACTS by hand. `python3 verify_capabilities.py` invoked directly
//    is the truth-spine read outside the surface (>=6 times in one session).
//    The goggles' own `--do contracts` runs the same script as a child of
//    run.mjs, which never passes through this hook — so the verb is unaffected.
const RAW_CONTRACTS = /\bpython3?\s+\S*verify_capabilities\.py\b/;
if (RAW_CONTRACTS.test(cmd)) {
  out('deny',
    'GOGGLES — CONTRACTS BY HAND refused\n' +
    '  verify_capabilities.py is the truth-spine; read it through the surface so the\n' +
    '  reading is the one everything else tracks.\n' +
    '  Use:  node .claude/skills/goggles/run.mjs --do contracts [--strict] [--id C-NN]');
}

// 4. SERVICE LIFECYCLE by hand. Zombie processes, duplicate starts and silent
//    3-minute loads cost one measured session 30+ minutes — all from managing
//    compressor_service with pkill/nohup/python3 directly. `--do service` is
//    idempotent and reports HEALTHY/LOADING/DOWN/ZOMBIE with evidence.
//    (pgrep/ps stay open: read-only diagnosis is not a mutation.)
const RAW_SERVICE = /\b(?:python3?\s+\S*compressor_service\.py\b|(?:pkill|killall)\s+(?:-\S+\s+)*['"]?[^'"|;]*compressor_service)/;
if (RAW_SERVICE.test(cmd)) {
  out('deny',
    'GOGGLES — SERVICE LIFECYCLE BY HAND refused\n' +
    '  Hand-managed starts/kills are how zombies and duplicate services happen.\n' +
    '  Use:  node .claude/skills/goggles/run.mjs --do service status\n' +
    '        node .claude/skills/goggles/run.mjs --do service start [--wait]\n' +
    '        node .claude/skills/goggles/run.mjs --do service stop | restart');
}

// 5. THE INSTRUMENT'S PORT by hand. curl to the compressor endpoints is a
//    reading nothing else can see (and /compress on text is trap #1's classic
//    mistake). `--do read` labels the reading via:'void:compress_signal';
//    `--do service status` owns /health.
const RAW_PORT = /\bcurl\b[^|;&]*\b(?:127\.0\.0\.1|localhost):8765(\/[a-z_]*)?/;
const m = cmd.match(RAW_PORT);
if (m) {
  const route = m[1] || '';
  if (route === '/health' || route === '' || route === '/') {
    out('deny',
      'GOGGLES — SERVICE HEALTH BY HAND refused\n' +
      '  Use:  node .claude/skills/goggles/run.mjs --do service status\n' +
      '  (HEALTHY / LOADING / DOWN / ZOMBIE, with evidence — not a silent empty curl.)');
  }
  out('deny',
    'GOGGLES — INSTRUMENT PORT BY HAND refused (' + route + ')\n' +
    '  A reading taken by raw curl is invisible to everything that tracks readings,\n' +
    '  and /compress on text is the classic trap-#1 misread.\n' +
    '  Use:  node .claude/skills/goggles/run.mjs --do read <file> [--json]\n' +
    '        node .claude/skills/goggles/run.mjs --do read --series \'[1,2,...]\'\n' +
    '  Other endpoints route through --do call / --do resonance / --do state.');
}

// only look at commands that actually run inline code (a bare heredoc into
// cat/tee is document-writing, not execution — the literal word 'heredoc'
// in the first cut matched prose and denied documentation commands).
// Short commands stop HERE (not at the top — full-command welds above must
// see every command; this gate only cheapens the inline analysis below).
if (cmd.length < 40) process.exit(0);
const INLINE = /(python3?\s+(-c|-\s*<<|<<)|node\s+(-e|--eval|-\s*<<|<<))/i;
if (!INLINE.test(cmd)) process.exit(0);

// 6. STORE PEEKS inline. Loading the substrate's stores in a -c/heredoc to
//    count/inspect them is a substrate-state reading taken beside the surface
//    (>=4 times in one session while `--do state` existed). Script files that
//    legitimately build/consume the stores are unaffected — this fires only
//    on INLINE code.
const STORE_PEEK = /pattern_store(?:\.legacy256)?\.npz|pattern_index_fractal\.json|pattern_uri_index\.json/;
if (STORE_PEEK.test(cmd)) {
  out('deny',
    'GOGGLES — INLINE STORE PEEK refused\n' +
    '  Substrate state read by ad-hoc inline code is invisible to everything that\n' +
    '  tracks readings, and one-off counts drift from the canonical ones.\n' +
    '  Use:  node .claude/skills/goggles/run.mjs --do state\n' +
    '        node .claude/skills/goggles/run.mjs --do contracts --id C-01\n' +
    '  (Committed scripts that build or consume the stores are not affected.)');
}

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
