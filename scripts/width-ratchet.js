#!/usr/bin/env node
'use strict';
/**
 * width-ratchet — ONE representation: the 232-D fractal decoder.
 *
 * Every pattern vector any consumer compares, searches, stores or indexes
 * is the decoder at its active depth (decoder-stack.composedAtDepth, 8 × 29
 * = 232-D), and every comparison between two of them is taken in the one
 * resonance space (resonance-space.js / whitening_reference.py). Nothing
 * else is a representation:
 *   - the retired 256-sample byte waveform (np.interp of bytes, `to_waveform`,
 *     `new Array(256)` histograms dressed as a waveform);
 *   - the depth-4 / depth-5 / depth-7 checkpoints (`composed_v1` 116-D,
 *     `composed_v2` 145-D, `composed_v4` 203-D) read as a vector;
 *   - the L1 fractal alone (29-D, `entry.fractal`) carried as a vector.
 * Measured 2026-09-07 through the census below, before the sweep: 41 live
 * sites across the hub, Void and the Interface still read one of those —
 * every benchmark on the 116-D checkpoint, the RAG query and four scoring
 * pipelines on the 256-sample byte interp, the residual monitor on L1
 * alone, the store builder resampling to 256 — while the substrate itself
 * was already canonical (`--do redecode all`: 2,614 of 2,614 entries).
 *
 * THE LAW: the census of such sites only shrinks. Every site is DEBT; the
 * baseline is the floor; a new site blocks. What the census does NOT count,
 * by name and by reason (ALLOW below): the decoder and its layers, the
 * whitening reference (per-layer blocks), the refusals themselves (a line
 * that names the retired width in order to refuse it), the compressor's own
 * chunk window (void_compressor_v*.py resamples byte chunks to 256 samples
 * to blend them — that is how the instrument produces a coherency, not a
 * representation of the pattern), byte histograms for entropy, sha256, and
 * completed migrations kept as record.
 *
 *   node scripts/width-ratchet.js                 check
 *   node scripts/width-ratchet.js --report        every site
 *   node scripts/width-ratchet.js --json
 *   node scripts/width-ratchet.js --save-baseline ratchet the floor down
 *
 * Reached through the goggles: `--do gate width [--report]`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');
const { refuseIfLoosening } = require('./lib/ratchet-law');

const ROOT = path.resolve(__dirname, '..');
const HOME = path.dirname(ROOT);
const BASELINE_PATH = process.env.WIDTH_BASELINE || path.join(ROOT, '.width-baseline.json');
const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
});

// Where consumers live. Tests are judged too: a test that pins a retired width is a consumer.
const SCOPES = [
  { repo: 'remembrance-oracle-toolkit', dirs: ['src', 'scripts', 'packages/field-tool/src', 'tests'], ext: ['.js', '.mjs', '.cjs'] },
  { repo: 'Void-Data-Compressor', dirs: ['.', 'scripts', 'tests'], ext: ['.py', '.mjs', '.cjs'], shallow: ['.'] },
  { repo: 'REMEMBRANCE-BLOCKCHAIN', dirs: ['src', 'scripts', 'bin', 'tests'], ext: ['.js'] },
  { repo: 'REMEMBRANCE-Interface', dirs: ['src'], ext: ['.ts', '.tsx', '.js'] },
];

// A site: a non-comment line that reads a non-canonical vector.
const PATTERNS = [
  { id: 'checkpoint-key', re: /\b(composed_v1|composed_v2|composed_v4|composed_v5)\b/, why: 'a depth checkpoint read as the vector' },
  { id: 'width-116', re: /(?:length|DIM|WIDTH|size|shape\[1\])\s*(?:===|!==|==|!=|=)\s*116\b|\b116-D\b/, why: 'the 116-D depth-4 checkpoint as a width' },
  { id: 'width-145', re: /(?:length|DIM|WIDTH|size|shape\[1\])\s*(?:===|!==|==|!=|=)\s*145\b|\b145-D\b/, why: 'the 145-D depth-5 checkpoint as a width' },
  { id: 'width-203', re: /(?:length|DIM|WIDTH|size|shape\[1\])\s*(?:===|!==|==|!=|=)\s*203\b|\b203-D\b/, why: 'the 203-D depth-7 checkpoint as a width' },
  // The 29-D L1 is the first block of the one vector; carried alone (a `=== 29` guard, a
  // `.slice(0, 29)` / `[:29]` handed on as a vector) it is a truncation given its own name.
  // Decoder internals that BUILD the block (`% 29`, `< 29` loops, `* 29`) are not consumers.
  { id: 'l1-width-29', re: /(?:\.length|TARGET_LEN|DIM|WIDTH)\s*(?:===|!==|==|!=)\s*29\b|\.(?:slice|subarray)\(0,\s*(?:29|LAYER_DIM|FRACTAL_DIM)\)|(?:vec|composed|waveform|wf|fractal|row|arr|v|w|x)\w*\[:29\]/, why: 'the 29-D L1 carried as a vector of its own' },
  { id: 'width-128', re: /(?:length|DIM|WIDTH|TARGET_LEN|size|shape\[1\])\s*(?:===|!==|==|!=|=)\s*128\b|\b128-(?:D|point)\b/, why: 'the retired 128-point byte resample as a width' },
  { id: 'width-256', re: /(?:length|DIM|WIDTH|size|shape\[1\])\s*(?:===|!==|==|!=|=)\s*256\b|len\([^\n)]*\)\s*(?:==|!=)\s*256\b|\b256-D\b/, why: 'a guard or width that keys on the retired 256-sample waveform' },
  { id: 'byte-waveform-256', re: /np\.interp\([^\n]*\b256\b|linspace\([^\n]*\b256\)|np\.(zeros|full|ones|random\.random|random\.randn)\(256\b|randn\(256\)|new (?:Float64Array|Float32Array|Array)\(256\)|\bto_waveform\(|_resample_to_256|WAVEFORM_LEN = 256|TARGET_LEN = 256|DIM = 256/, why: 'the retired 256-sample byte waveform' },
  // `.fractal` is also the name of the fractal-alignment TEMPLATES (resonant.fractal, result.fractal.alignment);
  // only an index entry's `fractal` field carried as a vector counts.
  { id: 'l1-as-vector', re: /\b(?:entry|e|s|p|v|idx\[[^\]]+\])\.fractal\b(?!Health|Alignment|ity|s\b|\.is)|\b(?:entry|e|p|v|item|rec)\['fractal'\]|\.get\('fractal'\)/, why: 'the 29-D L1 alone carried as a vector' },
];

// Files that are the instrument, the refusals, or records — named, with the reason.
const ALLOW = [
  [/src\/core\/decoder-stack\.js$/, 'the decoder itself: its checkpoints are its own layers'],
  [/src\/core\/fractal-index\.js$/, 'pads whole-block vectors to the canonical width; names the old widths to pad them'],
  [/src\/core\/(whitening|whitening-reference|resonance-space)\.js$/, 'the one space: per-layer blocks; the refusal of 256'],
  [/src\/core\/(fractal|lexical|numerical|spectral|redundancy|dimensional|dynamical)-waveform\.js$/, 'the decoder layers'],
  [/src\/core\/content-projection\.js$/, 'a decoder layer'],
  [/packages\/field-tool\/src\//, 'the vendored decoder layers (byte-identical to src/core, held by field-tool-parity)'],
  [/src\/unified\/coherency-token-components\.js$/, 'refuses the retired width by name'],
  [/src\/core\/void-library\.js$/, 'reads the canonical vector; names the checkpoints only to say they are never read'],
  [/scripts\/(migrate-void-v4\.cjs|redecode-substrate\.js|merge-substrate\.js|substrate-state\.js)$/, 'completed migrations / census tools that name the old keys to retire or count them'],
  [/scripts\/harvest-repo-to-substrate\.js$/, 'writes the canonical vector; names the checkpoints only in the record of what it no longer writes'],
  [/src\/cli\/commands\/(verify|onboard)\.js$|src\/cli\/registry\.js$|tests\/(onboard|verify|one-cosine-guard)\.test\.js$/, 'decoder conformance checks: the depth checkpoints are properties of the one decoder, beside the canonical 232 check'],
  [/scripts\/width-ratchet\.js$|tests\/width-ratchet\.test\.js$/, 'this gate and its test: they name the widths in order to census them'],
  [/Void-Data-Compressor\/scripts\/quantum-lens-test\.mjs$/, 'an experiment record reading composed_v5 — the 232-D depth-8 vector under its pre-canonical name'],
  [/src\/(audit\/dep-scanner|compression\/void-bridge)\.js$|scripts\/goggle-web\.js$/, 'byte histograms for entropy (256 byte values), not a waveform'],
  [/tests\/(healed-overlap-space|coherency-token-components|whitening-reference|fractals)\.test\.js$/, 'tests that assert the refusal of the retired width'],
  [/REMEMBRANCE-BLOCKCHAIN\/(src\/waveform\.js|src\/uniqueness-gate\.js|tests\/uniqueness-gate\.test\.js|scripts\/git-history-coin\.js|\.claude\/skills\/goggles\/change-coin\.py)$/, 'refusals of the retired width, the width census'],
  [/Void-Data-Compressor\/(void_compressor_v[345]\.py|shell_as_compressor_blend\.py|test_residual_compressor\.py|l2_cultivator\.py|field_builder\.py|realtime_crawler\.py|substrate_node\.py|datacenter_layer\.py|tests\/test_compressor_core\.py|tests\/test_resonance\.py|tests\/test_signal_dictionary\.py)$/, 'the compressor\'s own chunk window and blend library (how the instrument produces a coherency), byte histograms, and their tests — not a representation'],
  [/Void-Data-Compressor\/(canonical_vector|fractal_decoder|whitening_reference|coherency_token_v1|verify_capabilities)\.py$/, 'the Python door, the decoder bridge, the one space, the refusals, the contracts'],
  [/Void-Data-Compressor\/(rag_query|score_v3_records|score_for_bugs|score_cross_repo_records|build_pattern_store|merge_cross_repo_to_store|merge_crawler_inbox|substrate_serf|seed_language_substrate|oracle_bridge|refine_loop|fractal_compute|fractal_retro_search|scripts\/harvest_to_store|scripts\/ingest_gate)\.py$/, 'rewritten to canonical_vector on 2026-09-07; the census still reads them (a regression here counts)'],
  [/Void-Data-Compressor\/tests\/(test_coherency_token_v1|test_living_remembrance_space)\.py$/, 'tests that assert the refusal of the retired width'],
  [/Void-Data-Compressor\/\.claude\//, 'the surface'],
  [/remembrance-oracle-toolkit\/(src\/core\/(fractal-waveform|fractal-index|compose|lexical-waveform|numerical-waveform|spectral-waveform|redundancy-waveform|content-projection|dimensional-waveform|dynamical-waveform|relational-waveform)\.js|packages\/field-tool\/src\/[^/]+\.js)$/, 'the decoder layers themselves and the vendored field-tool decoder: they BUILD the 29-D block that becomes the one vector'],
  [/Void-Data-Compressor\/(fractal_decoder|fractal_encoder|to_fractal_waveform|verify_fractal_parity)\.py$/, 'the Python decoder and its JS-parity check: they build the 29-D block, never carry it as a reading'],
  [/(remembrance-oracle-toolkit\/scripts\/migrate-waveforms-to-fractal\.js|Void-Data-Compressor\/rebuild_pattern_store_fractal\.py)$/, 'completed migrations off the 256-sample waveform; they name the retired width only as the history they replaced'],
  [/Void-Data-Compressor\/scripts\/(benchmark_|coherence_decomposition|equation_morphing|depth_vs_breadth|other_half_of_entropy|verify_compression_equation|compression_equation_guard|desaturation_test|whitening_separability|reencode-v5|domain-overlap-check|universal-structure-test|coherency-flow-map|lens-block-analysis|ingest-real-domains|ingest-genomes-languages)/, 'experiment records and completed re-encodes that name the old keys as history'],
];
// Allowed files are still scanned for the RETIRED byte waveform being BUILT or GUARDED ON (not refused) — except the compressor internals.
const NEVER_ALLOW_BUILD = /Void-Data-Compressor\/(rag_query|score_v3_records|score_for_bugs|score_cross_repo_records|build_pattern_store|merge_cross_repo_to_store|merge_crawler_inbox|substrate_serf|scripts\/harvest_to_store|scripts\/ingest_gate)\.py$/;

function walk(dir, exts, shallow) {
  const out = [];
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'experiments' || e.name === 'digital-cathedral' || e.name === 'dist' || e.name === 'build') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!shallow) out.push(...walk(p, exts, false)); }
    else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}
walk.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

const isComment = (line) => /^\s*(\/\/|\*|\/\*|#)/.test(line);
const refusesIt = (line) => /retired|RETIRED|refus|never (a|the)|not (a|the) (decoder|canonical)|canonical|the ONE|one width|is not the/i.test(line);

/** Every live site: { file, line, id, text }. */
function census() {
  const sites = [];
  for (const scope of SCOPES) {
    const base = path.join(HOME, scope.repo);
    if (!fs.existsSync(base)) continue;
    const files = [];
    for (const d of scope.dirs) files.push(...walk(path.join(base, d), scope.ext, scope.shallow && scope.shallow.includes(d)));
    for (const abs of [...new Set(files)]) {
      const rel = path.relative(HOME, abs);
      const allow = ALLOW.find(([re]) => re.test(abs));
      let text;
      try { text = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isComment(line)) continue;
        for (const p of PATTERNS) {
          if (!p.re.test(line)) continue;
          if (refusesIt(line)) continue;                       // a refusal names the width to refuse it
          if (allow && !((p.id === 'byte-waveform-256' || p.id === 'width-256' || p.id === 'l1-width-29') && NEVER_ALLOW_BUILD.test(abs))) continue;
          sites.push({ file: rel, line: i + 1, id: p.id, why: p.why, text: line.trim().slice(0, 120) });
          break;
        }
      }
    }
  }
  const byFile = {};
  for (const s of sites) byFile[s.file] = (byFile[s.file] || 0) + 1;
  return { sites, byFile, total: sites.length };
}
census.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function loadBaseline() { try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { return null; } }
loadBaseline.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const current = census();
  if (argv.includes('--report')) {
    console.log(`== consumers of a non-canonical vector: ${current.total} site(s) in ${Object.keys(current.byFile).length} file(s) ==`);
    for (const s of current.sites) console.log(`  ${s.file}:${s.line}  [${s.id}]  ${s.text}`);
    return 0;
  }
  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    if (prev) {
      const debt = [];
      for (const [f, n] of Object.entries(current.byFile)) {
        const base = prev.byFile[f];
        if (base === undefined) debt.push(`NEW consumer of a non-canonical width: ${f} (${n})`);
        else if (n > base) debt.push(`GREW: ${f} ${base} -> ${n}`);
      }
      if (refuseIfLoosening('width', debt, argv)) return 1;
    }
    _writeBaseline(_sealedGate(), BASELINE_PATH, JSON.stringify({
      note: 'width baseline — live sites that read a non-canonical vector (the 116/145/203-D checkpoints, the 29-D L1 alone, the retired 256-sample byte waveform). Shrink-only: route the site through the 232-D decoder and the one space, never widen the allowlist.',
      savedAt: new Date().toISOString(), total: current.total, byFile: current.byFile,
    }, null, 1) + '\n');
    console.log(`[width] baseline saved: ${prev ? prev.total : 'none'} -> ${current.total} site(s) in ${Object.keys(current.byFile).length} file(s)`);
    return 0;
  }
  const baseline = loadBaseline();
  if (!baseline) { console.error('[width] no baseline — run --save-baseline first'); return 1; }
  const grown = [], fresh = [];
  for (const [f, n] of Object.entries(current.byFile)) {
    const base = baseline.byFile[f];
    if (base === undefined) fresh.push({ f, n });
    else if (n > base) grown.push({ f, n, base });
  }
  const ok = !grown.length && !fresh.length;
  if (argv.includes('--json')) { console.log(JSON.stringify({ ok, total: current.total, baseline: baseline.total, fresh, grown, sites: current.sites }, null, 1)); return ok ? 0 : 1; }
  if (ok) {
    console.log(`[width] ✓ holds — ${current.total} consumer(s) of a non-canonical width (baseline ${baseline.total}); the one representation is the 232-D fractal decoder`);
    if (current.total < baseline.total) console.log('  the debt shrank — run --save-baseline to ratchet down');
    return 0;
  }
  console.error('[width] ✗ BLOCKED — a consumer reads something other than the 232-D fractal decoder:');
  for (const g of fresh) console.error(`  NEW: ${g.f} (${g.n})`);
  for (const g of grown) console.error(`  ${g.f}: ${g.base} -> ${g.n}`);
  console.error('  route it through decoder-stack.composedAtDepth(…, currentDepth()) / canonical_vector and the one space; run --report to see the line');
  return 1;
}
main.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { census, PATTERNS, ALLOW };
