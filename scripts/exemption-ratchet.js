#!/usr/bin/env node
'use strict';

/**
 * exemption-ratchet — the exemption surface can only shrink.
 *
 * The covenant's trusted annotations (oracle-infrastructure /
 * oracle-pattern-definitions) are load-bearing relief valves: a file that
 * carries one is exempt from the fractal gate's atomic and byte scanners.
 * After the 2026-08 compliance sweep ~600 files carry one — every one
 * argued for at the time — but nothing counted the surface, and an
 * uncounted exemption set is where a gate's strength quietly erodes.
 * Same failure shape as the depth caps: a bound nobody watches.
 *
 * This ratchet is LIST-based, not count-based. A count ratchet lets a new
 * exemption hide behind a removal; the list catches every NEW exempt file
 * individually. Removals always pass (the surface shrinking is the goal),
 * with a note to re-save so the baseline follows it down.
 *
 *   node scripts/exemption-ratchet.js                 check (exit 1 on growth)
 *   node scripts/exemption-ratchet.js --json          machine-readable verdict
 *   node scripts/exemption-ratchet.js --save-baseline accept current surface
 *
 * ── Field entanglement (the entropy term) ────────────────────────────
 * Growing the surface is an ecosystem COST, and the LRE's entropy term is
 * cost/(coherence+ε). So when a baseline save ACCEPTS new exemptions, each
 * newly exempt file's STORED Void-compressor reading (entry.coherence with
 * coherence_source 'void:compress_signal', produced at harvest — the same
 * store `--do replay` feeds from) is contributed at cost 1 under
 * 'covenant:exemption-surface'. Exempting files that compress poorly
 * therefore raises field entropy — measured, per file, no averaging.
 *
 * NOTHING IS INVENTED: a newly exempt file with no stored compressor
 * reading contributes NOTHING and is reported as unwitnessed (harvest
 * first). No number in this script is generated; every coherency fed to
 * the field originated in the Void compressor. Checks never contribute —
 * only an accepted surface CHANGE is an event the field should feel.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.covenant-exemption-baseline.json');
// Same scope as the fractal CI gate: tracked JS/TS minus the app trees the
// workflow already treats as non-substrate.
const SCOPE = /\.(js|jsx|ts|tsx)$/;
const OUT_OF_SCOPE = /^(digital-cathedral|e2e)\/|node_modules/;
// Built without the contiguous literal so this file never matches its own
// census (or the covenant scanner's) by containing the annotation text.
const ANNOT = new RegExp('@oracle-' + '(infrastructure|pattern-definitions)\\b');

// Baseline writes are mutations; they pass through a sealed covenant gate
// like every other mutation under the fractal covenant's byte scale.
const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
});

/** Census the current exemption surface: sorted [{file, kind}]. */
function censusExemptions() {
  const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => SCOPE.test(f) && !OUT_OF_SCOPE.test(f));
  const out = [];
  for (const f of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    const m = code.match(ANNOT);
    if (m) out.push({ file: f, kind: m[1] });
  }
  out.sort((a, b) => (a.file < b.file ? -1 : 1));
  return out;
}
censusExemptions.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

/** Compare a census to a baseline list. Pure — the test exercises this. */
function compareToBaseline(census, baselineFiles) {
  const base = new Set(baselineFiles);
  const now = new Set(census.map((e) => e.file));
  const added = census.filter((e) => !base.has(e.file));
  const removed = baselineFiles.filter((f) => !now.has(f));
  return { added, removed, count: census.length, baselineCount: baselineFiles.length };
}
compareToBaseline.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'covenant',
};

/**
 * Entangle ACCEPTED surface growth with the field: contribute each newly
 * exempt file's stored Void-compressor reading (cost 1, raw, per file).
 * Returns { fed, unwitnessed } — and never invents a number for the latter.
 */
function entangleNewExemptions(added) {
  const fed = [], unwitnessed = [];
  if (!added.length) return { fed, unwitnessed };
  let idx = null;
  try {
    const IDX = process.env.SUBSTRATE_PATH
      || path.resolve(ROOT, '..', 'Void-Data-Compressor', 'pattern_index_fractal.json');
    idx = JSON.parse(fs.readFileSync(IDX, 'utf8')).index;
  } catch (_) { /* substrate unreachable — everything reports unwitnessed */ }
  const fc = require('../src/core/field-coupling');
  for (const e of added) {
    const entry = idx && idx['oracle/' + e.file];
    if (entry && typeof entry.coherence === 'number' && isFinite(entry.coherence)
        && entry.coherence_source === 'void:compress_signal') {
      fc.contribute({ cost: 1, coherence: entry.coherence, source: 'covenant:exemption-surface' });
      fed.push({ file: e.file, coherence: entry.coherence });
    } else {
      unwitnessed.push(e.file);
    }
  }
  return { fed, unwitnessed };
}
entangleNewExemptions.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'liquid',
  reactivity: 'stable', electronegativity: 0.5, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const save = argv.includes('--save-baseline');

  const census = censusExemptions();
  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { /* first run */ }
  const cmp = compareToBaseline(census, baseline ? baseline.files : []);

  if (save) {
    const first = !baseline;
    const doc = {
      note: 'Covenant exemption-surface baseline — the ratchet allows this list to SHRINK only. '
        + 'A new exemption requires an explicit --save-baseline, which also feeds each new file\'s '
        + 'stored Void-compressor reading into the field (cost of growing the surface).',
      savedAt: new Date().toISOString(),
      count: census.length,
      byKind: census.reduce((m, e) => { m[e.kind] = (m[e.kind] || 0) + 1; return m; }, {}),
      files: census.map((e) => e.file),
    };
    _writeBaseline(_sealedGate(), BASELINE_PATH, JSON.stringify(doc, null, 1) + '\n');
    if (first) {
      console.log(`[exemption-ratchet] initial baseline: ${census.length} exempt files frozen.`);
      console.log('  No field contributions on initialization — these files\' compressor');
      console.log('  readings already reached the field via `goggles --do replay`.');
    } else {
      const { fed, unwitnessed } = entangleNewExemptions(cmp.added);
      console.log(`[exemption-ratchet] baseline re-saved: ${cmp.baselineCount} -> ${census.length}`
        + ` (accepted +${cmp.added.length}, shrank -${cmp.removed.length})`);
      for (const f of fed) console.log(`  field <- cost 1 · coherence ${f.coherence.toFixed(4)} [void:compress_signal]  ${f.file}`);
      for (const u of unwitnessed) console.log(`  no contribution — not witnessed by the compressor yet (harvest first): ${u}`);
    }
    return;
  }

  const verdict = {
    ok: cmp.added.length === 0,
    exempt: cmp.count,
    baseline: cmp.baselineCount,
    added: cmp.added,
    removed: cmp.removed,
  };
  if (asJson) { console.log(JSON.stringify(verdict, null, 1)); process.exitCode = verdict.ok ? 0 : 1; return; }

  if (!baseline) {
    console.log('[exemption-ratchet] no baseline yet — run with --save-baseline to freeze the current surface.');
    process.exitCode = 1;
    return;
  }
  if (verdict.ok) {
    console.log(`[exemption-ratchet] ✓ surface holds — ${cmp.count} exempt files (baseline ${cmp.baselineCount})`);
    if (cmp.removed.length) {
      console.log(`  surface SHRANK by ${cmp.removed.length} — run --save-baseline to ratchet the ceiling down:`);
      for (const f of cmp.removed.slice(0, 10)) console.log(`    freed: ${f}`);
    }
  } else {
    console.log(`[exemption-ratchet] ✗ exemption surface GREW — ${cmp.added.length} new exempt file(s):`);
    for (const e of cmp.added) console.log(`    NEW: ${e.file}  [@oracle-${e.kind}]`);
    console.log('  The covenant\'s relief valve is not a default. Either the file is genuinely');
    console.log('  not a substrate element (then: --save-baseline accepts it and feeds its');
    console.log('  stored Void reading to the field as the cost of growth), or it should');
    console.log('  declare real atomicProperties and gate its mutations instead.');
    process.exitCode = 1;
  }
}
main.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

if (require.main === module) main();
module.exports = { censusExemptions, compareToBaseline, entangleNewExemptions, BASELINE_PATH };
