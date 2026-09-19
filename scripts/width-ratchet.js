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
 * THE L1 BOUNDARY. A `29` is legitimate where the decoder BUILDS its L1
 * block into the one vector, and a breach where the block is sliced off and
 * carried as a vector of its own. What draws that line, measured:
 *   - the FORM draws it. The decoder builds with `< 29` / `% 29` / `* 29`
 *     loops and `new Float64Array(LAYER_DIM)`; a consumer slices
 *     (`.slice(0, 29)`, `[:29]`) or guards (`.length !== 29`). The pattern
 *     matches only the second family, so the decoder-layer name-allowlist
 *     that used to sit here was inert — it shielded nothing — and is gone.
 *   - the SHAPE does not draw it. The gate encodes the code around every
 *     hit as the 232-D decoder vector and reads it, in the one space,
 *     against two fixtures (seeds/width-shape/builder.txt — the decoder
 *     building the block; breach.txt — the consumers the 2026-09-08 sweep
 *     removed). On nine labelled holdouts (five real consumers from git
 *     history, four decoder layers) the reading was right 5 of 9 at its
 *     best window, and at every depth of the flow the decoder's own layers
 *     resonated MORE with the breach (spectral-waveform d1 0.89 vs 0.47): a
 *     tight loop over 29 numbers has the same shape whether it builds the
 *     block or consumes it. The difference is where the vector FLOWS, and
 *     that is one abstraction above what the pipeline reads in a window.
 *     So the reading is recorded on every hit and shown by `--shape`, and
 *     never decides: a hit that is not a refusal is a site.
 *
 *   node scripts/width-ratchet.js                 check
 *   node scripts/width-ratchet.js --report        every site
 *   node scripts/width-ratchet.js --shape         every L1 hit with its shape reading (decoder vs breach)
 *   node scripts/width-ratchet.js --json
 *   node scripts/width-ratchet.js --save-baseline ratchet the floor down
 *
 * Reached through the goggles: `--do gate width [--report|--shape]`.
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
// This gate and its test quote the patterns in order to census them; they are the census, not a site.
const SELF = /scripts\/width-ratchet\.js$|tests\/width-ratchet\.test\.js$/;

// ── The L1 boundary as a reading ─────────────────────────────────────────
// Two reference shapes, encoded once through the decoder itself.
const SHAPE_DIR = path.join(ROOT, 'seeds', 'width-shape');
const SHAPE_WINDOW = 24; // lines either side of the hit: the pattern around the breach
let _refs = null;
function _shapeRefs() {
  if (_refs) return _refs;
  const { codeToWaveform } = require('../src/core/code-to-waveform');
  const read = (f) => fs.readFileSync(path.join(SHAPE_DIR, f), 'utf8');
  _refs = { builder: codeToWaveform(read('builder.txt')), breach: codeToWaveform(read('breach.txt')) };
  return _refs;
}
_shapeRefs.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Read the shape of the code around one L1 hit against the two references,
 * in the one space. `decoder` when it resonates more with the decoder
 * building its block; `consumer` when it resonates more with the breach.
 * @returns {{ builder: number, breach: number, margin: number, verdict: 'decoder'|'consumer' }}
 */
function shapeOf(lines, i) {
  const { codeToWaveform, waveformCosine } = require('../src/core/code-to-waveform');
  const refs = _shapeRefs();
  const window = lines.slice(Math.max(0, i - SHAPE_WINDOW), i + SHAPE_WINDOW + 1).join('\n');
  const v = codeToWaveform(window);
  const builder = waveformCosine(v, refs.builder);
  const breach = waveformCosine(v, refs.breach);
  const margin = builder - breach;
  return { builder: +builder.toFixed(4), breach: +breach.toFixed(4), margin: +margin.toFixed(4), verdict: margin > 0 ? 'decoder' : 'consumer' };
}
shapeOf.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Probe: the shape reading of one file:line at a chosen window, for measuring
 * the boundary on labelled sites through `--do call` (never by hand).
 * @param {string} file absolute path  @param {number} line 1-based  @param {number} [window]
 */
function shapeAt(file, line, window) {
  // `--do call` hands one JSON value: accept {file, line, window} or [file, line, window].
  if (Array.isArray(file)) [file, line, window] = file;
  else if (file && typeof file === 'object') ({ file, line, window } = file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const w = Number.isFinite(window) ? window : SHAPE_WINDOW;
  const { codeToWaveform, waveformCosine } = require('../src/core/code-to-waveform');
  const { flowCosines, flowCheckpoints } = require('../src/core/decoder-stack');
  const refs = _shapeRefs();
  const i = line - 1;
  const v = codeToWaveform(lines.slice(Math.max(0, i - w), i + w + 1).join('\n'));
  const builder = waveformCosine(v, refs.builder), breach = waveformCosine(v, refs.breach);
  return {
    file: path.relative(HOME, file), line, window: w, text: (lines[i] || '').trim().slice(0, 100),
    builder: +builder.toFixed(4), breach: +breach.toFixed(4), margin: +(builder - breach).toFixed(4),
    verdict: builder - breach > 0 ? 'decoder' : 'consumer',
    flowBuilder: flowCosines(v, refs.builder).map((x) => +x.toFixed(3)),
    flowBreach: flowCosines(v, refs.breach).map((x) => +x.toFixed(3)),
    checkpoints: flowCheckpoints(),
  };
}
shapeAt.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Every live site: { file, line, id, text[, shape] }; every L1 hit's reading under `shapes`. */
function census() {
  const sites = [];
  const shapes = [];
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
          if (p.id === 'l1-width-29') {
            // No NAME decides an L1 hit (the old decoder-layer allowlist was
            // inert: the decoder builds its block with `< 29` / `% 29` loops,
            // which this pattern never matches; it matches the block being
            // sliced off or guarded on). The shape reading is recorded beside
            // every hit and printed by --shape, but it does NOT decide — see
            // the header: measured 2026-09-08, it cannot tell building from
            // carrying. Every hit that is not a refusal is a site.
            if (SELF.test(abs)) break;
            const shape = shapeOf(lines, i);
            shapes.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), ...shape });
            sites.push({ file: rel, line: i + 1, id: p.id, why: p.why, text: line.trim().slice(0, 120), shape });
            break;
          }
          if (allow && !((p.id === 'byte-waveform-256' || p.id === 'width-256') && NEVER_ALLOW_BUILD.test(abs))) continue;
          sites.push({ file: rel, line: i + 1, id: p.id, why: p.why, text: line.trim().slice(0, 120) });
          break;
        }
      }
    }
  }
  const byFile = {};
  for (const s of sites) byFile[s.file] = (byFile[s.file] || 0) + 1;
  return { sites, byFile, total: sites.length, shapes };
}
census.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function loadBaseline() { try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { return null; } }
loadBaseline.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const current = census();
  if (argv.includes('--report')) {
    console.log(`== consumers of a non-canonical vector: ${current.total} site(s) in ${Object.keys(current.byFile).length} file(s) ==`);
    for (const s of current.sites) console.log(`  ${s.file}:${s.line}  [${s.id}]  ${s.text}${s.shape ? `   shape decoder ${s.shape.builder} · breach ${s.shape.breach}` : ''}`);
    return 0;
  }
  if (argv.includes('--shape')) {
    // The boundary, visible: every L1 hit, its resonance with the decoder
    // building its block and with the breach, sorted from most-decoder to
    // most-consumer. A hit reads as a site only when the breach wins.
    const rows = current.shapes.slice().sort((a, b) => b.margin - a.margin);
    const decoder = rows.filter((r) => r.verdict === 'decoder').length;
    console.log(`== the L1 boundary as a reading: ${rows.length} hit(s) — ${decoder} read as the decoder building its block, ${rows.length - decoder} as a consumer ==`);
    console.log('  margin   decoder  breach   site');
    for (const r of rows) console.log(`  ${(r.margin >= 0 ? '+' : '') + r.margin.toFixed(4)}  ${r.builder.toFixed(4)}   ${r.breach.toFixed(4)}   ${r.file}:${r.line}  ${r.text.slice(0, 70)}`);
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
module.exports = { census, shapeOf, shapeAt, PATTERNS, ALLOW };
