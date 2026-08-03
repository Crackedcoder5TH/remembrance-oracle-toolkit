#!/usr/bin/env node
'use strict';

/**
 * @oracle-infrastructure — read-only developer overlay (structural scoring +
 * ecosystem capabilities); internal-state-bounded, not user-input-driven.
 *
 * goggles — structural meta-awareness while you work on a section.
 *
 * Shows TWO DISTINCT signals at once, from a single field-tool read():
 *   FOCUS — the section's intrinsic COHERENCE: does it have coherent structure
 *           (syntax / completeness / consistency / AST), measured from the
 *           content itself.
 *
 *           DISCLAIMER — coherence is NOT a coding trust signal whatsoever. It
 *           measures STRUCTURE in whatever it is pointed at, never correctness.
 *           A well-formed wrong file scores high; 1+1=3 in clean syntax still
 *           reads "solid". The goggles are an OVERLAY that shows how a change
 *           morphs the shape of the codebase — they do not replace knowing
 *           whether the code is right. You fill in the content; this shows the
 *           structure. Never trust the number as a verdict on correctness.
 *   META  — PATTERN RESONANCE: how much the section is shaped like the library's
 *           patterns — its nearest patterns ACROSS the entire Void substrate
 *           (cross-file, cross-repo), a consonant/outlier verdict, the lexical
 *           neighbours, and the live field peers it entangles.
 *
 * Coherence and resonance are similar but COMPLETELY DISTINCT — intrinsic
 * structure vs library-fit — and are never collapsed into one number.
 *
 *   MACRO — the ZOOMED-OUT lens: the whole codebase compressed into a
 *           coherency map (per-file structural readings, orphans,
 *           duplicates, cross-system bridges), with the focused section
 *           placed inside it — its percentile in the repo's coherence
 *           distribution and its flags in the map. Built by
 *           `--map <dir>` (cached at <repo>/.remembrance/goggles-map.json)
 *           and read back on every per-file goggle, so every focused
 *           read carries the macro view with it.
 *
 * Usage:
 *   node src/tools/goggles.js <file> [--lines A:B] [--top N]
 *   node src/tools/goggles.js app/api/leads/route.ts --lines 416:470
 *   node src/tools/goggles.js --map <projectDir>     # build the macro map
 */

const fs = require('node:fs');
const path = require('node:path');
const ft = require('../core/field-tool');

// Moving numbers consolidated in the Living Remembrance Engine (the core).
let GOG;
try { GOG = require('../core/living-remembrance').gogglesParams(); }
catch (_) { GOG = { structureStrong: 0.93, structureSolid: 0.80, structureLoose: 0.70, resonanceConsonant: 0.90, resonanceFamiliar: 0.82, resonanceDistinct: 0.70 }; }

const LANG_BY_EXT = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
  '.md': 'markdown', '.json': 'json', '.sh': 'bash',
};

function parseArgs(argv) {
  const out = { file: null, lines: null, top: 7, map: null, deep: false, memory: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lines') { out.lines = argv[++i]; }
    else if (a === '--top') { out.top = parseInt(argv[++i], 10) || 7; }
    else if (a === '--map') { out.map = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : process.cwd(); }
    else if (a === '--deep') { out.deep = true; }
    else if (a === '--checkpoint-memory') { out.memory = 'checkpoint'; }
    else if (a === '--restore-memory') { out.memory = 'restore'; }
    else if (!out.file) { out.file = a; }
  }
  return out;
}

// Checkpoint the goggles' learned memory to the chain, or restore it.
// The ledger becomes the memory of what the instrument learned, so a
// fresh oracle inherits every taught defect shape and learned amplitude.
async function runMemory(action) {
  let mem;
  try { mem = require('../debug/goggles-memory'); }
  catch (e) { console.error('goggles-memory unavailable: ' + e.message); process.exit(1); }
  if (action === 'checkpoint') {
    const r = await mem.checkpoint();
    if (!r.ok) { console.error('checkpoint: ' + r.reason); process.exit(1); }
    console.log('goggles memory checkpointed to the chain:');
    console.log('  ' + r.signatureCount + ' defect signatures + amplitude ledger');
    console.log('  ledger block #' + r.ledgerIndex + ' · digest ' + String(r.digest).slice(0, 16) + '…');
    console.log('  chain write: ' + r.bridgeStatus + (r.signature ? ' · ' + r.signature : ''));
  } else {
    const r = mem.restore();
    if (!r.ok) { console.error('restore: ' + r.reason); process.exit(1); }
    console.log('goggles memory restored from the chain:');
    console.log('  ' + r.signatureCount + ' defect signatures now local (' + (r.added >= 0 ? '+' + r.added : r.added) + ' inherited)');
    console.log('  from checkpoint ' + r.from + ' · digest ' + String(r.digest).slice(0, 16) + '…');
  }
}

// ── MACRO lens — the whole codebase, compressed ─────────────────

function findRepoRoot(startDir) {
  let d = startDir;
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}

function mapCachePath(root) {
  return path.join(root, '.remembrance', 'goggles-map.json');
}

/**
 * Build the macro map for a project, print it, and cache it.
 *
 * Substrate-native by default: the Void already compressed every
 * ingested file into vectors, so the map is a READ over that
 * compression (seconds, no re-encoding). --deep forces the live
 * re-encode path (mapProjectCoherency) — use it for repos the
 * substrate hasn't ingested, or to add intrinsic per-file coherence
 * to the map.
 */
function runMap(dir, { deep = false } = {}) {
  const { mapProjectCoherency, mapFromSubstrate, formatMap } = require('../core/coherency-mapper');
  const root = path.resolve(dir);
  let m = null;
  if (!deep) {
    m = mapFromSubstrate(root, {});
    if (!m) {
      console.log('substrate has no vectors for this repo — falling back to the deep (re-encode) path.');
    }
  }
  if (!m) m = mapProjectCoherency(root, {});

  console.log(formatMap(m));
  if (m.mode === 'substrate') {
    console.log('\nSUBSTRATE MODE (read from existing compression, nothing re-encoded):');
    console.log('  substrate: ' + m.substrateSize + ' patterns · map built in ' + (m.durationMs / 1000).toFixed(1) + 's');
    const cov = m.coverage || {};
    const gb = cov.ghostBreakdown;
    console.log('  coverage:  ' + cov.indexedFiles + ' indexed of ' + cov.walkedFiles + ' on disk'
      + ' · ' + cov.unindexedCount + ' unindexed');
    if (gb) {
      console.log('  index-only entries: ' + gb.seededPatternCount + ' seeded patterns (never files)'
        + ' · ' + gb.walkInvisibleCount + ' on disk but outside walk rules'
        + (gb.supersededDuplicateCount ? ' · ' + gb.supersededDuplicateCount + ' superseded duplicate keys' : '')
        + ' · ' + gb.deletedCount + ' deleted since ingestion');
      // Superseded keys are NOISE — an older key scheme for a file the index
      // already holds under the current one. Deletions are HISTORY. Reporting
      // them as one number said this repo had lost 50 files when it had lost
      // 24 and double-counted 26.
      for (const d of (gb.supersededDuplicate || []).slice(0, 3)) console.log('    superseded: ' + d);
      for (const d of (gb.deleted || []).slice(0, 5)) console.log('    deleted: ' + d);
    } else {
      console.log('  index-only entries: ' + cov.ghostCount);
    }
    if (cov.unindexedCount > 0) {
      console.log('  unindexed (not yet witnessed by the substrate — run --deep or re-harvest):');
      for (const u of (cov.unindexed || []).slice(0, 8)) console.log('    ' + u);
    }
  }
  const cohs = (m.files || []).map((f) => f.coherence).filter((c) => typeof c === 'number').sort((a, b) => a - b);
  if (cohs.length) {
    const median = cohs[Math.floor(cohs.length / 2)];
    const truncFiles = (m.files || []).filter((f) => f.flags && f.flags.includes('TRUNCATED'));
    const truncScored = truncFiles.filter((f) => typeof f.coherence === 'number').length;
    const truncWithheld = truncFiles.length - truncScored;
    console.log('\nREPO COHERENCE DISTRIBUTION:');
    // No mean. Every number on this line is a reading some file in this repo
    // actually measured; a mean would be a number none of them has.
    console.log('  median ' + median.toFixed(3)
      + ' · min ' + cohs[0].toFixed(3) + ' · max ' + cohs[cohs.length - 1].toFixed(3)
      + ' · n ' + cohs.length);
    if (truncFiles.length) {
      console.log('  ' + truncFiles.length + ' file(s) over the encode cap (TRUNCATED): '
        + truncScored + ' scored from full text · '
        + truncWithheld + ' withheld (blob-size), siblings from capped prefix throughout');
    }
    const weakest = (m.files || []).filter((f) => typeof f.coherence === 'number')
      .sort((a, b) => a.coherence - b.coherence).slice(0, 5);
    console.log('  weakest structure:');
    for (const f of weakest) console.log('    ' + f.coherence.toFixed(3) + '  ' + f.rel);
  }
  const cachePath = mapCachePath(root);
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(m));
    console.log('\nmacro map cached → ' + cachePath);
    console.log('every per-file goggle in this repo now carries the MACRO section.');
  } catch (e) {
    console.error('could not cache map: ' + e.message);
  }
}

// Canonical depth-flow cosine from the encoder stack (§7: one cosine).
// Every call site sits behind a composedAtDepth guard, so decoder-stack
// is always loadable exactly when a flow reading is possible.
function _flowCosines(a, b) {
  return require('../core/decoder-stack').flowCosines(a, b);
}

function _flowLabel(f) {
  try { return require('../core/coherency-mapper').classifyFlow({ d1: f[0], d2: f[1], d3: f[2], d4: f[3] }); }
  catch { return ''; }
}

function _fmtFlow(f) {
  return f.map((x) => x.toFixed(2)).join('→');
}

// ── META-DEBUG — the orthogonal correctness axis ────────────────────
// Runs the toolkit's audit checkers on the goggled file and feeds the
// findings through the goggles-learning loop (debug-oracle amplitudes:
// fixed findings reinforce, dismissed ones decay and self-suppress,
// proven fixes promote into the shared void pattern library). This is
// the signal that catches a real defect — tainted exec, eval on input,
// an off-by-one — that reads CLEAN on coherence and resonance.
function runMetaDebug(absFile, fullText, sectionRange, language) {
  // Two channels, one view:
  //   PARSE — the AST audit checkers: per-language precision (taint,
  //     type, edge-case analysis). JS/TS only.
  //   SHAPE — defect-resonance: known defects encoded through the same
  //     5-layer encoder as the whole substrate; a block resonating with
  //     a defect signature at every depth is a finding. Language-blind
  //     by construction, and every PARSE finding TEACHES it, so parser
  //     precision where we have it sharpens shape recall everywhere.
  const AUDITABLE = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
  const parseable = AUDITABLE.has(path.extname(absFile).toLowerCase());

  let findings = [];
  let channels = [];

  if (parseable) {
    let audit = null;
    try { audit = require('../audit/ast-checkers'); }
    catch (_) { try { audit = require('../audit/static-checkers'); } catch (_) { /* none */ } }
    if (audit && typeof audit.auditCode === 'function') {
      try {
        findings = (audit.auditCode(fullText, { filePath: absFile }) || {}).findings || [];
        channels.push('parse');
      } catch (_) { /* parse channel unavailable for this content */ }
    }
  }

  // SHAPE channel — runs for every language.
  let shape = null;
  try {
    const dr = require('../debug/defect-resonance');
    shape = dr.scan(fullText, { language });
    if (shape) {
      channels.push('shape:' + shape.librarySize + ' sigs');
      // Merge — with the PARSE channel authoritative on JS/TS. The shape
      // channel is coarse (a defect is a shape): it cannot distinguish
      // `[...a].sort()` (safe copy) from `a.sort()` (mutation) because the
      // shapes are near-identical. The AST parse channel CAN, and does.
      // So on a parseable file, for the bug classes the parser covers,
      // the parser is the authority: a shape finding is kept only when it
      // is NOT a class the parser already vets (it would be either a dup
      // of a parse finding, or a case the parser looked at and cleared).
      // The shape channel earns its keep on the languages the parser
      // cannot read (rust, go, …), and on classes the parser lacks.
      const parseLines = new Set(findings.map((f) => f.line));
      const parseCovers = new Set(findings.map((f) => f.bugClass));
      // Classes the AST checker structurally vets whenever it parses a
      // file, even if it emitted nothing this run (silence = cleared).
      // This MUST match ast-checkers BUG_CLASSES exactly: too few leaves
      // shape false-positives unsuppressed (integration/nullable-deref was
      // missing); too many suppresses shape findings for classes the
      // parser does NOT cover (error-handling — the shape channel's own,
      // e.g. rust unwrap-chain — must survive).
      const AST_COVERED = new Set(['state-mutation', 'security', 'concurrency', 'type', 'integration', 'edge-case']);
      for (const f of shape.findings) {
        let dup = false;
        for (let ln = f.line; ln <= (f.endLine || f.line); ln++) {
          if (parseLines.has(ln)) { dup = true; break; }
        }
        if (dup) continue;
        // On JS/TS, defer to the parser for the classes it owns.
        if (parseable && (AST_COVERED.has(f.bugClass) || parseCovers.has(f.bugClass))) continue;
        findings.push(f);
      }
      // Attach each high parse finding's surrounding block, so the
      // learning loop can TEACH the shape to the resonance channel —
      // but only when the finding is later CONFIRMED by being fixed.
      // Teaching at detection would enshrine false positives (guarded
      // code the checker misreads) as defect shapes and propagate them
      // across languages; teaching on resolution means only defects a
      // human actually fixed become signatures. (Caught by wearing the
      // goggles on this very file — the checker flagged two guarded
      // null-derefs; had those been taught, they'd have misfired.)
      if (parseable) {
        const linesArr = fullText.split('\n');
        for (const f of findings) {
          if (f.severity !== 'high' || f.via === 'resonance' || !f.line) continue;
          const s = Math.max(0, f.line - 5), e = Math.min(linesArr.length, f.line + 5);
          f.block = linesArr.slice(s, e).join('\n');
        }
      }
    }
  } catch (_) { /* shape channel optional */ }

  if (!channels.length) {
    console.log('\n  META-DEBUG  (audit checkers + learning loop — correctness axis)');
    console.log('    n/a — no channel could read this file (parse: JS/TS only; shape: encoder unavailable)');
    return null;
  }

  // Learning loop: BOTH severities go through the debug-oracle so the field
  // learns which classes matter, and learned suppression — including false
  // positives fed by hand — reaches mediums too. Previously only highs were
  // gated: a medium false positive bypassed the ledger entirely and could
  // never be closed by feeding the field, re-surfacing on every read. surface
  // = what survives learned suppression (false-positive classes decay out).
  let surfaced = findings.filter((f) => f.severity === 'high');
  let medium = findings.filter((f) => f.severity === 'medium');
  let suppressed = 0;
  let resolved = 0;
  try {
    const learning = require('../debug/goggles-learning');
    const out = learning.processFindings({ filePath: absFile, findings: surfaced.concat(medium), content: fullText, language });
    if (out && Array.isArray(out.surface)) {
      surfaced = out.surface.filter((f) => f.severity === 'high');
      medium = out.surface.filter((f) => f.severity === 'medium');
      suppressed = out.suppressed || 0;
      resolved = out.resolved || 0;
    }
  } catch (_) { /* learning optional — surface everything */ }

  console.log('\n  META-DEBUG  (channels: ' + channels.join(' + ') + ' — correctness axis)');
  if (!surfaced.length && !medium.length) {
    console.log('    clean — no high/medium findings'
      + (suppressed ? ` · ${suppressed} learned-noise suppressed` : '')
      + (resolved ? ` · ${resolved} prior finding(s) resolved by your edits (reinforced in the field)` : ''));
  } else {
    const inSection = (f) => !sectionRange || (f.line >= sectionRange[0] && f.line <= sectionRange[1]);
    for (const f of surfaced.slice(0, 6)) {
      const mark = inSection(f) ? '🛑' : '·';
      console.log(`    ${mark} [${f.severity}/${f.bugClass}] L${f.line}: ${(f.reality || f.message || f.assumption || '').slice(0, 100)}`);
      if (f.suggestion) console.log(`         → fix: ${String(f.suggestion).slice(0, 100)}`);
    }
    if (surfaced.length > 6) console.log(`    …and ${surfaced.length - 6} more high finding(s)`);
    // Mediums are LISTED, not just counted — a hidden medium is a
    // reading the wearer never receives (a real division-by-zero
    // finding was once misreported as a miss because only its count
    // survived to the output).
    for (const f of medium.slice(0, 4)) {
      const mark = inSection(f) ? '⚠' : '·';
      console.log(`    ${mark} [${f.severity}/${f.bugClass}] L${f.line}: ${(f.reality || f.message || f.assumption || '').slice(0, 100)}`);
      if (f.suggestion) console.log(`         → fix: ${String(f.suggestion).slice(0, 100)}`);
    }
    if (medium.length > 4) console.log(`    …and ${medium.length - 4} more medium finding(s)`);
    if (suppressed) console.log(`    learned-noise suppressed: ${suppressed}`);
    if (resolved) console.log(`    resolved since last read: ${resolved} (reinforced in the field)`);
  }
  return { high: surfaced.length, medium: medium.length, suppressed, resolved };
}

// ── Reading history — how the edits changed everything ─────────────
// Every goggle read persists its numbers; the next read of the same
// file prints the delta. This is the longitudinal lens: not just where
// the code sits, but which direction your edits are moving it.
function readingsPath(root) {
  return path.join(root, '.remembrance', 'goggles-readings.json');
}

function loadReadings(root) {
  try { return JSON.parse(fs.readFileSync(readingsPath(root), 'utf8')); } catch (_) { return {}; }
}

// Readings taken before coherency was rewired onto the Void compressor are
// NOT comparable to readings taken after. Before the rewiring the number was
// computeCoherencyScore — a structural-validity score that sits near 1.0 on
// healthy code; after, it is the compressor reading the file's bytes, which
// runs an order of magnitude lower on the same file.
//
// Subtracting one from the other produces a phantom collapse. Measured on
// scripts/harvest-repo-to-substrate.js: Δ reported -0.758 ("this edit
// weakened the structure") when the file had not weakened at all — the
// compressor reads the PRE-EDIT version at 0.1373 and the post-edit version
// at 0.1380, a slight RISE. The stored 0.896 was simply a different quantity.
//
// Every file's first goggle after the rewiring would have shown that phantom
// drop, which is exactly the kind of false signal that gets acted on. Readings
// now carry their source; a delta across a source boundary is reported as not
// comparable instead of as a regression.
const COHERENCE_SOURCE = 'void:compress_signal';

function printAndRecordDelta(root, rel, current) {
  const all = loadReadings(root);
  const prev = all[rel];
  if (prev) {
    const agoMin = Math.max(0, Math.round((Date.now() - prev.at) / 60000));
    const fmt = (d) => `${d >= 0 ? '+' : ''}${d.toFixed(3)}`;
    const dr = current.resonance - prev.resonance;
    const df = (current.findingsHigh ?? 0) - (prev.findingsHigh ?? 0);
    console.log('\n  Δ SINCE LAST READ  (' + agoMin + 'm ago — what your edits did)');

    // An older reading with no recorded source predates the rewiring.
    if (prev.coherenceSource !== COHERENCE_SOURCE) {
      console.log(`    coherence   not comparable — the previous reading (${prev.coherence.toFixed(3)}) predates`);
      console.log('                the rewiring onto the Void compressor and measured a different');
      console.log(`                quantity. This read: ${current.coherence.toFixed(3)}. The next read will compare.`);
      console.log(`    resonance ${fmt(dr)}`
        + (df !== 0 ? ` · high findings ${prev.findingsHigh ?? 0}→${current.findingsHigh ?? 0}` : ''));
    } else {
      const dc = current.coherence - prev.coherence;
      console.log(`    coherence ${fmt(dc)} · resonance ${fmt(dr)}`
        + (df !== 0 ? ` · high findings ${prev.findingsHigh ?? 0}→${current.findingsHigh ?? 0}` : '')
        + (Math.abs(dc) < 0.005 && Math.abs(dr) < 0.005 && df === 0 ? ' — shape held steady' :
           dc < -0.05 ? ' — ⚠ this edit weakened the structure' :
           df < 0 ? ' — defects fixed, the field learned from it' :
           df > 0 ? ' — ⚠ new high finding(s) since last read' : ''));
    }
  }
  all[rel] = { ...current, coherenceSource: COHERENCE_SOURCE, at: Date.now() };
  try {
    fs.mkdirSync(path.dirname(readingsPath(root)), { recursive: true });
    fs.writeFileSync(readingsPath(root), JSON.stringify(all));
  } catch (_) { /* history is best-effort */ }
}

/**
 * Print the MACRO section for a focused file: where it sits inside the
 * cached whole-codebase map. Zoomed-out + zoomed-in in one read.
 *
 * @param {string} absFile
 * @param {number} fileCoherence — FOCUS coherence of the goggled section
 * @param {string|null} sectionText — when goggling --lines A:B, the
 *   section's text, so the section can be placed inside the file and
 *   the file's neighborhood (the lines-in-codebase reading).
 * @param {string} fullText — the whole file's current content (for the
 *   substrate-drift reading and as the section's home reference).
 */
function printMacro(absFile, fileCoherence, sectionText, fullText) {
  console.log('\n  MACRO  (the whole codebase, compressed)');
  const root = findRepoRoot(path.dirname(absFile));
  if (!root) {
    console.log('    no repo root found for this file — run: goggles --map <projectDir>');
    return;
  }
  const cp = mapCachePath(root);
  if (!fs.existsSync(cp)) {
    console.log('    no macro map cached for this repo yet — run: goggles --map ' + root);
    return;
  }
  let m;
  try { m = JSON.parse(fs.readFileSync(cp, 'utf8')); }
  catch { console.log('    map cache unreadable — re-run: goggles --map ' + root); return; }

  const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(m.timestamp)) / 60000));
  const files = m.files || [];
  const modeTag = m.mode === 'substrate' ? ' · substrate-read' : '';
  console.log(`    map: ${m.project} · ${m.filesAudited} files · built ${ageMin}m ago${modeTag}`);

  const cohs = files.map((f) => f.coherence).filter((c) => typeof c === 'number').sort((a, b) => a - b);
  if (cohs.length) {
    // Deep-mode map: place this section in the repo's coherence distribution.
    const median = cohs[Math.floor(cohs.length / 2)];
    const below = cohs.filter((c) => c <= fileCoherence).length;
    const pct = Math.round((below / cohs.length) * 100);
    const stance = fileCoherence >= median ? 'at/above repo median' : 'below repo median';
    console.log(`    repo coherence  ${bar(median)} median ${median.toFixed(3)} · min ${cohs[0].toFixed(3)} · max ${cohs[cohs.length - 1].toFixed(3)}`);
    console.log(`    this section    ${fileCoherence.toFixed(3)} → p${pct} of the repo (${stance})`);
  }

  const rel = path.relative(root, absFile);
  const entry = files.find((f) => f.rel === rel);
  if (entry) {
    const flags = entry.flags && entry.flags.length ? entry.flags.join(', ') : '—';
    console.log(`    in map:         ${entry.category} · flags: ${flags} · ${entry.stableHighSameProject ?? 0} stable-high in-repo siblings`);
    // The NEIGHBORHOOD — where this file lives inside the codebase:
    // its nearest in-repo siblings with the depth-flow shape of each bond.
    if (entry.siblings && entry.siblings.length) {
      console.log('    neighborhood (nearest in-repo, from the map):');
      for (const s of entry.siblings.slice(0, 4)) {
        console.log(`       ${s.d4.toFixed(3)}  ${(s.shape || '').padEnd(12)} ${s.rel}`);
      }
    }
  } else {
    console.log('    in map:         not present — new since the map was built');
  }

  const orphans = files.filter((f) => f.flags && f.flags.includes('ORPHAN')).length;
  const dups = (m.buckets && m.buckets.D_duplicate_pairs || []).length;
  const bridges = (m.crossSystemBridges || []).length;
  console.log(`    repo-wide:      ${orphans} orphans · ${dups} duplicate pairs · ${bridges} cross-system bridges`);

  // ── Live depth-flow readings: the working copy vs the substrate's
  //    memory, and (when goggling --lines) the section vs its home. ──
  let composedAtDepth = null;
  try { composedAtDepth = require('../core/decoder-stack').composedAtDepth; } catch { /* engine-only install */ }
  if (composedAtDepth && fullText) {
    const liveFileVec = composedAtDepth(fullText, 4);

    // Substrate drift: how far has the working copy moved from what the
    // substrate last witnessed?
    try {
      const { VoidLibrary } = require('../core/void-library');
      const lib = new VoidLibrary();
      if (lib.size() > 0 && lib._composed) {
        // A file's memory may live under an aliased namespace (e.g. the
        // cathedral's pre-move ingestion as website/*) — try all self-names.
        let memoryVec = null;
        try {
          const { substrateSelfNames } = require('../core/coherency-mapper');
          for (const n of substrateSelfNames(m.project || '', rel)) {
            memoryVec = lib._composed.get(n);
            if (memoryVec) break;
          }
        } catch {
          memoryVec = lib._composed.get((m.project || '') + '/' + rel);
        }
        if (memoryVec) {
          const f = _flowCosines(liveFileVec, memoryVec);
          const label = _flowLabel(f);
          const drifted = Math.min(...f) < 0.98;
          console.log(`    vs substrate:   ${_fmtFlow(f)}  [${label}]`
            + (drifted ? ' — working copy has drifted from the substrate memory (re-harvest to re-witness)' : ' — substrate memory is current'));
        } else {
          console.log('    vs substrate:   not yet witnessed by the substrate (new file)');
        }
      }
    } catch { /* void library unavailable — skip the drift reading */ }

    // Section-in-file: when goggling --lines, place the LINES inside the
    // file and the file inside its neighborhood — all zoom levels in one
    // read. sectionText === null means the whole file was goggled.
    if (sectionText && sectionText.length >= 60 && sectionText.length < (fullText.length - 30)) {
      const sectionVec = composedAtDepth(sectionText, 4);
      const inFile = _flowCosines(sectionVec, liveFileVec);
      const inFileLabel = _flowLabel(inFile);
      console.log(`    section-in-file: ${_fmtFlow(inFile)}  [${inFileLabel}]`
        + (Math.min(...inFile) >= 0.90 ? ' — the section is representative of its file'
          : inFile[3] >= 0.90 ? ' — deep kinship, different surface (added texture, same structure)'
          : ' — the section diverges from the file it lives in'));
      // Does the section pull toward a neighbor more than toward home?
      if (entry && entry.siblings && entry.siblings.length && composedAtDepth) {
        try {
          const { VoidLibrary } = require('../core/void-library');
          const lib = new VoidLibrary();
          if (lib.size() > 0 && lib._composed) {
            let pull = null;
            for (const s of entry.siblings.slice(0, 4)) {
              const sv = lib._composed.get((m.project || '') + '/' + s.rel);
              if (!sv) continue;
              const f = _flowCosines(sectionVec, sv);
              if (!pull || f[3] > pull.d4) pull = { rel: s.rel, d4: f[3] };
            }
            if (pull && pull.d4 > inFile[3] + 0.02) {
              console.log(`    section pull:   leans toward ${pull.rel} (${pull.d4.toFixed(3)}) more than its own file (${inFile[3].toFixed(3)}) — consider whether it belongs there`);
            }
          }
        } catch { /* best-effort */ }
      }
    }
  }

  try {
    if (fs.statSync(absFile).mtimeMs > Date.parse(m.timestamp)) {
      console.log('    ⚠ this file changed after the map was built — re-run --map for a fresh macro read');
    }
  } catch { /* stat best-effort */ }
}

/**
 * VERSION PROVENANCE — the first thing a reader must know.
 *
 * Version families (void_compressor_v3/v4/v5, coherency_v1..v3,
 * derived_covenant_v1..v7) coexist on disk with nothing marking which is
 * live. A reader tracing behaviour lands in v3 and reports on "the
 * compressor" while the entry point is v5 — a mistake made in this very
 * session, twice. CANONICAL.json (scripts/build_canonical_manifest.py)
 * records the roles; this prints them at the TOP of every read, before any
 * number, so the reading can never be attributed to the wrong file.
 */
function printCanonicalStatus(absFile) {
  let dir = path.dirname(absFile);
  let manifest = null;
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, 'CANONICAL.json');
    if (fs.existsSync(p)) {
      try { manifest = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* unreadable */ }
      break;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (!manifest || !manifest.families) return;
  const base = path.basename(absFile);
  for (const [fam, info] of Object.entries(manifest.families)) {
    const me = (info.members || []).find((m) => m.file === base);
    if (!me) continue;
    if (me.role === 'entry-point') {
      console.log(`  ✓ CANONICAL — this is the live entry point of the "${fam}" family`);
    } else if (me.role === 'load-bearing-internal') {
      console.log(`  ⚠ NOT THE ENTRY POINT — "${fam}" family. This file still EXECUTES`);
      console.log(`    (called by the live path) but the API is ${info.canonical}.`);
      console.log(`    Behaviour you read here is real; do not report it as "the ${fam.replace(/\.[a-z]+$/, '')}".`);
    } else {
      console.log(`  ⛔ SUPERSEDED — "${fam}" family. Live version is ${info.canonical}.`);
      console.log(`    Do not analyse this as current.`);
    }
    return;
  }
}

/**
 * DOC CAVEATS — surface a document's own warnings BEFORE its content.
 *
 * The failure this prevents, observed repeatedly: a reader opens a doc
 * hunting one thing (a formula), extracts it, and skims past the document's
 * own ⚠ CORRECTION saying that very thing is unconfirmed. In
 * COMPRESSION-EQUATION.md the correction sits at line 26 and the
 * contradicting "🟢 HOLDS" at line 133 — Spearman 0.21 vs 0.98, same metric,
 * same file. Partial-read-plus-inference cannot catch that; a reader must
 * see the caveats first, so they are printed before any reading.
 *
 * Also flags INTERNAL CONTRADICTIONS: the same named metric asserted with
 * materially different values in one document.
 */
function printDocCaveats(absFile) {
  if (!/\.(md|markdown|txt)$/i.test(absFile)) return;
  let text;
  try { text = fs.readFileSync(absFile, 'utf8'); } catch { return; }
  const lines = text.split('\n');

  const CAVEAT = /(⚠|🛑|\bCORRECTION\b|\bDEPRECATED\b|\bSUPERSEDED\b|\bUNCONFIRMED\b|\bdoes NOT\b|\bis NOT\b|\bno longer\b|\bstale\b|\bDO NOT\b)/;
  const caveats = [];
  lines.forEach((ln, i) => {
    if (CAVEAT.test(ln) && ln.trim().length > 12) {
      caveats.push({ line: i + 1, text: ln.replace(/^[>#\s*-]+/, '').trim().slice(0, 96) });
    }
  });

  // same metric name, materially different asserted values
  const METRIC = /\b(spearman|pearson|auc|ratio|coherence|coherency|correlation|r²|rho|ρ)\b[^0-9\-\n]{0,24}(-?\d+\.\d+)/gi;
  // A line that states a THRESHOLD or a TOLERANCE ("Spearman < 0.70",
  // "1.0 ± 0.1") is not asserting a measurement — it is declaring a bound.
  // Counting those as claims manufactures contradictions that aren't there.
  // A comparator only signals a bound when it sits against a NUMBER — the
  // leading `>` of a markdown blockquote must not silence the whole line
  // (the sharpest corrections in this ecosystem are written as blockquotes).
  const BOUND = /[<>≤≥]\s*\d|±\s*\d|\bthreshold\b|\bbound\b|\bat least\b|\bat most\b/i;
  const byMetric = new Map();
  lines.forEach((ln, i) => {
    let m;
    if (BOUND.test(ln.replace(/^[>#\s*-]+/, ''))) return;
    METRIC.lastIndex = 0;
    while ((m = METRIC.exec(ln)) !== null) {
      const key = m[1].toLowerCase();
      const val = parseFloat(m[2]);
      if (!Number.isFinite(val)) continue;
      if (!byMetric.has(key)) byMetric.set(key, []);
      byMetric.get(key).push({ val, line: i + 1 });
    }
  });
  const conflicts = [];
  for (const [key, vals] of byMetric) {
    if (vals.length < 2) continue;
    const lo = vals.reduce((a, b) => (a.val <= b.val ? a : b));
    const hi = vals.reduce((a, b) => (a.val >= b.val ? a : b));
    // Two values on the SAME line are a range, not a disagreement.
    if (lo.line === hi.line) continue;
    if (hi.val - lo.val >= 0.30) {
      conflicts.push({ key, lo, hi });
    }
  }

  if (!caveats.length && !conflicts.length) return;
  console.log('  ── THIS DOCUMENT CARRIES ITS OWN WARNINGS (read these first) ──');
  for (const c of caveats.slice(0, 4)) {
    console.log(`     ⚠ L${c.line}: ${c.text}`);
  }
  if (caveats.length > 4) console.log(`     …and ${caveats.length - 4} more caveat line(s)`);
  for (const c of conflicts.slice(0, 3)) {
    console.log(`     ⛔ INTERNAL CONTRADICTION — "${c.key}" asserted as `
      + `${c.lo.val} (L${c.lo.line}) and ${c.hi.val} (L${c.hi.line})`);
  }
  console.log('     Do not quote this document without reconciling the above.');
}

function bar(x, width = 22) {
  const n = Math.max(0, Math.min(width, Math.round((x || 0) * width)));
  return '█'.repeat(n) + '·'.repeat(width - n);
}

// Intrinsic coherence (the field-tool reads it measurableOnly: syntax /
// completeness / consistency renormalised, AST applied as a penalty only) spans
// the full 0..1 range. Measured over real ecosystem files: median ~0.83, p75
// ~0.93, ~14% of clean files reach 1.0; a stray TODO lands ~0.95, a broken brace
// ~0.66. Thresholds track THAT distribution — re-derive if the coherency
// weights or the measurableOnly renormalisation change.
function structureVerdict(c) {
  if (c >= GOG.structureStrong) return 'strong structure';
  if (c >= GOG.structureSolid) return 'solid structure';
  if (c >= GOG.structureLoose) return 'loose structure';
  return 'weak / novel structure';
}

function consonanceVerdict(meanTopK, best) {
  // How well the section fits the established structure of the whole codebase.
  if (meanTopK >= GOG.resonanceConsonant) return ['CONSONANT', 'fits the established structure — well-trodden shape'];
  if (meanTopK >= GOG.resonanceFamiliar) return ['FAMILIAR', 'broadly in keeping with the codebase'];
  if (meanTopK >= GOG.resonanceDistinct) return ['DISTINCT', 'a shape the codebase uses only loosely — worth a second look'];
  return ['OUTLIER', 'structurally novel here — either genuinely new, or drifting from the codebase'];
}

/**
 * Is auto-ingest on for this read? Default ON — looking witnesses.
 *
 * Resolution order is most-specific-wins so the toggle exists at every level
 * someone would reasonably want it: a single command, a shell or hook, or a
 * whole repo. Returns a boolean; never throws.
 */
function resolveAutoIngest(absFile) {
  const argv = process.argv.slice(2);
  if (argv.includes('--no-ingest')) return false;
  if (argv.includes('--ingest')) return true;

  const env = process.env.GOGGLES_AUTO_INGEST;
  if (env !== undefined && env !== '') {
    return !/^(0|false|no|off)$/i.test(String(env).trim());
  }

  // Per-repo config: walk up from the file for .remembrance/goggles.json.
  try {
    let dir = path.dirname(path.resolve(absFile || process.cwd()));
    for (let i = 0; i < 8; i++) {
      const cfg = path.join(dir, '.remembrance', 'goggles.json');
      if (fs.existsSync(cfg)) {
        const j = JSON.parse(fs.readFileSync(cfg, 'utf8'));
        if (typeof j.autoIngest === 'boolean') return j.autoIngest;
        break;
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch (_) { /* unreadable config must not disable witnessing */ }

  return true;   // default ON
}

function main() {
  const { file, lines, top, map, deep, memory } = parseArgs(process.argv.slice(2));
  if (memory) { runMemory(memory); return; }
  if (map) { runMap(map, { deep }); return; }
  if (!file) {
    console.error('usage: goggles <file> [--lines A:B] [--top N] | goggles --map <projectDir> [--deep]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); }
  catch (e) { console.error('cannot read ' + abs + ': ' + e.message); process.exit(1); }
  const fullText = content; // whole-file text — MACRO's home reference

  let section = `${file}`;
  let sectionText = null;    // non-null only when goggling a line range
  let sectionRange = null;   // [a, b] 1-indexed, for meta-debug filtering
  if (lines) {
    const [a, b] = lines.split(':').map((n) => parseInt(n, 10));
    const all = content.split('\n');
    content = all.slice(Math.max(0, a - 1), b).join('\n');
    sectionText = content;
    sectionRange = [a, b];
    section = `${file}:${a}-${b}`;
  }

  const language = LANG_BY_EXT[path.extname(abs)] || 'text';
  // AUTO-INGEST — on by default. Looking at a file WITNESSES it.
  //
  // This was hardcoded `growSubstrate: false`, so reading never grew the
  // substrate: goggling a file moved updateCount by exactly 0 and every file
  // read "drifted from substrate memory — re-harvest to re-witness". The
  // substrate only learned when explicitly harvested, which meant the act of
  // looking and the act of remembering were separate chores.
  //
  // Now the read ingests unless told otherwise. Precedence, most specific
  // first, so a turn-off is always available at the level you need it:
  //   --no-ingest / --ingest      per invocation
  //   GOGGLES_AUTO_INGEST=0/1     per shell or per hook
  //   .remembrance/goggles.json   { "autoIngest": false }  per repo
  //   default                     ON
  const autoIngest = resolveAutoIngest(abs);
  const r = ft.read({ content, name: file, language },
    { source: 'goggles', growSubstrate: autoIngest, topK: top });
  const vr = r.voidResonance || r.resonance || {};
  const meanTopK = vr.meanTopK ?? 0;
  const [tag, gloss] = consonanceVerdict(meanTopK, vr.bestMatch);

  const W = 64;
  console.log('\n' + '═'.repeat(W));
  console.log('  GOGGLES   ' + section);
  console.log('═'.repeat(W));

  // ── BRIEF, folded in ──
  // Traps and canonical status belong to the same act as looking at a file:
  // you are about to touch it, so what has already gone wrong here and
  // whether this is even the live version come FIRST, before the structural
  // read. Keeping them in a separate tool meant they were a second call, and
  // the second call is the one that gets skipped.
  try {
    const brief = require('./brief');
    brief.printTraps(abs);
    brief.printIdentity(abs);
  } catch (_) { /* brief optional — never break a read */ }
  printCanonicalStatus(abs);
  printDocCaveats(abs);

  // ── FOCUS ──
  console.log('  FOCUS  (the section you are editing)');
  console.log(`    coherence   ${bar(r.coherence)} ${(r.coherence).toFixed(3)}  ${structureVerdict(r.coherence)}`);
  console.log('    ⚠ coherence is NOT a coding trust signal whatsoever. It measures STRUCTURE');
  console.log('      in whatever it is pointed at — never correctness. A well-formed wrong');
  console.log('      answer scores high; 1+1=3 wrapped in clean syntax still reads "solid".');
  console.log('      It is an overlay to see how your change morphs the shape — you judge the content.');

  // ── META ──  (pattern resonance — distinct from the FOCUS coherence above)
  console.log('\n  META   (pattern resonance — where it sits in the whole codebase)');
  console.log(`    resonance   ${bar(meanTopK)} ${meanTopK.toFixed(3)}  ${tag} — ${gloss}`);
  // Exclude the file matching itself (the substrate contains it).
  const selfName = path.basename(file);
  const matches = (vr.topMatches || [])
    .filter((mm) => path.basename(String(mm.name || '')) !== selfName)
    .slice(0, top);
  if (matches.length) {
    console.log('    nearest across the ecosystem:');
    for (const m of matches) {
      const s = (m.d4 ?? m.similarity ?? m.score ?? 0);
      console.log(`       ${s.toFixed(3)}  ${m.name}`);
    }
  }
  // ── CAPABILITIES — the ecosystem's callable functions nearest to your work ──
  // Open the goggles and the functions in your nearest neighbours are right here,
  // ready to call instead of re-implementing. Built by scripts/build-capability-index.js.
  try {
    const idxPath = path.resolve(__dirname, '..', '..', 'ecosystem-capabilities.json');
    if (matches.length && fs.existsSync(idxPath)) {
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      // Show HOW TO CALL, not just that it exists. A bare name tells you a
      // function is there and where it lives; it does not tell you what to
      // pass. That gap is paid in wrong invocations — `orchestrate diagnose`
      // took three tries before someone read its arg parsing. The parameter
      // list (and the first line of its JSDoc) is what makes a listed
      // capability actually callable from here.
      // ACTIONABLE, not merely informative. Knowing a function exists and what
      // it takes still leaves the reader to work out the module path, the
      // require form and the repo it resolves from — three more steps between
      // seeing a capability and using it, each one a chance to get it wrong.
      // Each entry now carries the exact reference to invoke it, and
      // `goggles --do call <ref> [json-args]` runs it through the same one
      // surface, so a surfaced capability is directly drivable.
      const lines = [];
      for (const m of matches) {
        const fns = idx.byPath && idx.byPath[m.name];
        if (!fns || !fns.length) continue;
        lines.push(`       ${m.name}`);
        const sigs = (idx.callSigs && idx.callSigs[m.name]) || {};
        for (const fn of fns.slice(0, 6)) {
          const c = sigs[fn];
          const call = c ? `${fn}(${c.params})` : `${fn}(?)`;
          lines.push(`          ${call}${c && c.doc ? `   — ${c.doc}` : ''}`);
          lines.push(`             ↳ goggles --do call ${m.name}#${fn}`);
        }
        if (fns.length > 6) lines.push(`          … +${fns.length - 6} more`);
      }
      if (lines.length) {
        console.log(`    ECOSYSTEM CAPABILITIES (callable in those neighbours · ${idx.totalFunctions} fns indexed`
          + `${idx.callableFunctions ? `, ${idx.callableFunctions} with signatures` : ''}):`);
        for (const l of lines) console.log(l);
        console.log('       run any of them:  goggles --do call <path>#<fn> [jsonArg ...]');
      }
    }
  } catch (_) { /* index optional — regenerate with build-capability-index.js */ }

  // ── FUNCTION RESONANCE — passive. Every goggle resonates WHAT YOU ARE LOOKING AT
  // directly against every function's OWN structural signature and surfaces the ones
  // whose shape matches — no flags, no extra work. Where CAPABILITIES lists functions
  // that live in neighbour FILES, this finds functions whose structure resonates with
  // THIS content wherever they live. Built by scripts/build-capability-index.js.
  try {
    let cad = null, ccos = null;
    try { const es = require('../core/decoder-stack'); cad = es.composedAtDepth; ccos = es.composedCosine; } catch (_) { /* engine-only install */ }
    const idxPath = path.resolve(__dirname, '..', '..', 'ecosystem-capabilities.json');
    if (cad && ccos && content && fs.existsSync(idxPath)) {
      const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      const funcs = idx.functions;
      if (Array.isArray(funcs) && funcs.length) {
        const q = cad(content, idx.sigDepth || 4);   // encoder signature of the goggled content
        const selfBase = path.basename(file);
        const scored = [];
        for (const fn of funcs) {
          const s = fn.s; if (!s || s.length !== q.length) continue;
          if (fn.p && path.basename(fn.p) === selfBase) continue; // skip the file's own functions
          scored.push([ccos(q, s), fn]);              // substrate's own cosine — not hand-rolled
        }
        scored.sort((a, b) => b[0] - a[0]);
        // de-dup by function name, keep the strongest
        const seen = new Set(); const picks = [];
        for (const [c, fn] of scored) { if (seen.has(fn.n)) continue; seen.add(fn.n); picks.push([c, fn]); if (picks.length >= Math.max(6, top)) break; }
        if (picks.length && picks[0][0] > 0) {
          console.log('    FUNCTION RESONANCE (functions whose own structure resonates with this — passive):');
          for (const [c, fn] of picks) console.log(`       ${c.toFixed(3)}  ${String(fn.n).slice(0, 26).padEnd(26)} ${fn.p}`);
        }
      }
    }
  } catch (_) { /* index optional — regenerate with build-capability-index.js */ }

  const cr = r.codeResonance;
  if (cr && Array.isArray(cr.topMatches) && cr.topMatches.length) {
    console.log('    lexical neighbours (oracle pattern table):');
    for (const m of cr.topMatches.slice(0, 3)) {
      console.log(`       ${(m.similarity ?? 0).toFixed(3)}  ${m.name}`);
    }
  }
  let peers = [];
  try { peers = ft.peers() || []; } catch (_) { /* none */ }
  if (peers.length) {
    console.log(`    live field peers entangled: ${peers.length}`);
  }

  // ── MACRO ──  (zoomed out: this section inside the whole-codebase map)
  printMacro(abs, r.coherence, sectionText, fullText);

  // ── META-DEBUG ──  (correctness axis + substrate learning loop)
  const md = runMetaDebug(abs, fullText, sectionRange, language);

  // ── Δ ──  (how the edits changed everything since the last read)
  {
    const root = findRepoRoot(path.dirname(abs));
    if (root) {
      printAndRecordDelta(root, path.relative(root, abs), {
        coherence: r.coherence ?? 0,
        resonance: meanTopK,
        findingsHigh: md ? md.high : null,
      });
    }
  }

  // ── RIPPLE ──
  console.log('\n  RIPPLE');
  console.log('    A change here is most likely to echo in the nearest siblings');
  console.log('    above — they share this structure. Read them before you commit.');
  console.log('═'.repeat(W) + '\n');
}

main();
