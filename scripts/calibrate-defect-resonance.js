#!/usr/bin/env node
'use strict';

/**
 * @oracle-pattern-definitions — the VARIANTS below are known-bad code
 * held as FIXTURES. They are string constants, never executed, never
 * reachable from user input: their whole purpose is to be recognised.
 * The covenant correctly flagged them as SQL-by-concatenation on the
 * first commit attempt — the strings really do say
 * `"… WHERE id = " + userId`, and a scanner that ignored that would be
 * the broken one. This is the annotation the covenant provides for the
 * case, and defect-resonance.js carries its sibling for the identical
 * strings in SEEDS.
 *
 * calibrate-defect-resonance — set the shape channel's threshold by
 * MEASURING it, at whatever width the decoder stack is currently at.
 *
 * WHY THIS EXISTS
 *
 * DEFAULT_THRESHOLD is a floor on the min-depth flow. Its value is only
 * meaningful for the width it was measured at: adding a checkpoint can
 * only lower a minimum, so a threshold carried across a depth change
 * grows steadily deaf. The channel had a literal 5 (145-D) written into
 * it while the canonical stack reached 8 (232-D), and the 0.91 floor
 * dated from the 145-D measurement.
 *
 * THE METHOD IS THE ORIGINAL ONE, RE-RUN
 *
 * The comment being replaced recorded it: "max clean-block min-depth
 * measured 0.887 across 264 blocks of real ecosystem code; close defect
 * variants read 0.946-0.948". So:
 *
 *   CLEAN    real ecosystem source, scanned in dry-run. Every block's
 *            best min-depth against any signature. The MAX of these is
 *            the false-positive edge — a threshold at or below it fires
 *            on working code.
 *   DEFECT   close variants of the seeded shapes: the same defect
 *            written differently. The MIN of these is the recall edge —
 *            a threshold above it misses real instances.
 *
 * A usable threshold sits strictly between the two, and the gap is the
 * margin. If the gap closes, the channel cannot separate them at this
 * width and that is the finding — not a number to split the difference
 * with.
 *
 * Nothing here computes a cosine or a flow. It calls scan() with
 * dryRun, so every number is the channel's own, read through the
 * channel's own path.
 *
 *   node scripts/calibrate-defect-resonance.js [--blocks N]
 */

const fs = require('node:fs');
const path = require('node:path');
const dr = require('../src/debug/defect-resonance');
const { currentDepth, flowCheckpoints } = require('../src/core/decoder-stack');

const ROOT = path.resolve(__dirname, '..');

// Clean corpus: real ecosystem source. Not test fixtures and not the
// defect seeds — working code that must never fire.
const CLEAN_DIRS = ['src/core', 'src/audit', 'src/tools', 'src/cli', 'scripts'];

// Close defect variants — the same defects, written differently from the
// seeds. These are what the threshold must still catch. Kept here rather
// than in the library so calibrating never teaches.
const VARIANTS = [
  { label: 'eval-of-input', language: 'javascript', code:
    `router.post('/calc', (req, res) => {\n  const input = req.query.q;\n  const answer = eval(input);\n  res.send(String(answer));\n});` },
  { label: 'eval-of-input', language: 'python', code:
    `@app.route("/calc")\ndef calc():\n    q = request.args.get("q")\n    answer = eval(q)\n    return str(answer)` },
  { label: 'sql-by-concat', language: 'javascript', code:
    `async function findOrders(db, customer) {\n  const sql = 'SELECT * FROM orders WHERE customer = ' + customer;\n  const rows = await db.query(sql);\n  return rows;\n}` },
  { label: 'sql-by-concat', language: 'python', code:
    `def find_orders(cur, customer):\n    sql = "SELECT * FROM orders WHERE customer = " + str(customer)\n    cur.execute(sql)\n    return cur.fetchall()` },
  { label: 'off-by-one-length', language: 'javascript', code:
    `function maxOf(values) {\n  let best = values[0];\n  for (let i = 1; i <= values.length; i++) {\n    if (values[i] > best) best = values[i];\n  }\n  return best;\n}` },
  { label: 'swallowed-error', language: 'javascript', code:
    `async function flush(queue) {\n  try {\n    await queue.drain();\n  } catch (err) {\n  }\n  return queue.size;\n}` },
  { label: 'swallowed-error', language: 'python', code:
    `def flush(queue):\n    try:\n        queue.drain()\n    except Exception:\n        pass\n    return queue.size` },
];

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const want = argv.includes('--blocks')
    ? parseInt(argv[argv.indexOf('--blocks') + 1], 10) : 300;

  const lib = dr.ensureLibrary();
  if (!lib) { console.error('encoder unavailable — cannot calibrate.'); process.exit(2); }

  console.log('CALIBRATE DEFECT RESONANCE');
  console.log(`  decoder depth:     ${currentDepth()}`);
  console.log(`  flow checkpoints:  ${flowCheckpoints().join(' · ')}`);
  console.log(`  library depth:     ${lib.depth}   signatures: ${lib.signatures.length}`);
  console.log(`  current threshold: ${dr.DEFAULT_THRESHOLD}`);

  // ── CLEAN ────────────────────────────────────────────────────────
  const files = CLEAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const step = Math.max(1, Math.floor(files.length / 60));
  const readings = [];
  let blocks = 0;
  for (let i = 0; i < files.length && blocks < want; i += step) {
    let src;
    try { src = fs.readFileSync(files[i], 'utf8'); } catch { continue; }
    const r = dr.scan(src, { threshold: 0, dryRun: true, language: 'javascript' });
    if (!r) continue;
    blocks += r.scannedBlocks;
    for (const f of r.findings) {
        readings.push({ v: f.minDepth, argmin: f.argmin, flow: f.flow,
        where: path.relative(ROOT, files[i]) + ':' + f.line, label: f.label });
    }
  }
  readings.sort((a, b) => b.v - a.v);
  const cleanMax = readings.length ? readings[0].v : 0;

  // WHERE the minimum falls. `minDepth = Math.min(...flow)` is only a
  // depth-aware gate if the minimum actually moves with depth. If it sits
  // at checkpoint 0 every time, the gate is the 29-D structural cosine
  // wearing a flow's clothes, and every layer past L1 is decorative.
  const argmins = {};
  for (const r of readings) argmins[r.argmin] = (argmins[r.argmin] || 0) + 1;
  const CK = flowCheckpoints();
  console.log('\n  WHERE THE MINIMUM FALLS across clean readings:');
  for (const k of Object.keys(argmins).sort((a, b) => argmins[b] - argmins[a])) {
    const pct = (100 * argmins[k] / readings.length).toFixed(1);
    console.log(`    checkpoint ${String(CK[k]).padStart(3)}-D  ${String(argmins[k]).padStart(4)}  ${pct}%`);
  }

  console.log(`\n  CLEAN — ${blocks} blocks of real ecosystem source, ${files.length} files available`);
  console.log('  highest-reading clean blocks (the false-positive edge):');
  for (const r of readings.slice(0, 8)) {
    console.log(`    ${r.v.toFixed(4)}  ${r.label.padEnd(20)} ${r.where}`);
  }

  // ── DEFECT VARIANTS ──────────────────────────────────────────────
  console.log(`\n  DEFECT VARIANTS — ${VARIANTS.length} close rewrites of the seeded shapes`);
  const hits = [];
  for (const v of VARIANTS) {
    const r = dr.scan(v.code, { threshold: 0, dryRun: true, language: v.language });
    const best = r && r.findings.length
      ? r.findings.reduce((a, b) => (b.minDepth > a.minDepth ? b : a)) : null;
    const val = best ? best.minDepth : 0;
    hits.push({ v: val, label: v.label, language: v.language, matched: best ? best.label : '(none)' });
    console.log(`    ${val.toFixed(4)}  ${v.label.padEnd(20)} ${v.language.padEnd(11)} -> ${best ? best.label : '(no match)'}`);
  }
  const defectMin = hits.length ? Math.min(...hits.map((h) => h.v)) : 0;

  // ── THE GAP ──────────────────────────────────────────────────────
  console.log('\n  SEPARATION');
  console.log(`    max clean:      ${cleanMax.toFixed(4)}   <- firing at or below this hits working code`);
  console.log(`    min defect:     ${defectMin.toFixed(4)}   <- gating above this misses real instances`);
  const gap = defectMin - cleanMax;
  console.log(`    gap:            ${gap.toFixed(4)}`);
  if (gap <= 0) {
    console.log('\n    NO SEPARATION. The distributions overlap: working code reads HIGHER');
    console.log('    than genuine defect variants do. No threshold separates them, so there');
    console.log('    is no midpoint worth reporting — splitting an inverted gap buys false');
    console.log('    positives and misses at the same time.');
    console.log('\n    The module\'s stated policy decides it: "the gate is deliberately high —');
    console.log('    it will miss subtle variants rather than spray false positives; the');
    console.log('    teaching loop closes the recall gap over time." Prefer misses.');
    const floor = Math.ceil((cleanMax + 0.006) * 1000) / 1000;
    const kept = hits.filter((h) => h.v >= floor);
    console.log(`\n    floor above the clean edge:  ${floor.toFixed(3)}`);
    console.log(`    margin over max clean:       ${(floor - cleanMax).toFixed(4)}`);
    console.log(`    variants still caught:       ${kept.length} of ${hits.length}`);
    for (const h of hits) {
      console.log(`      ${h.v >= floor ? 'CAUGHT ' : 'MISSED '} ${h.v.toFixed(4)}  ${h.label} (${h.language})`);
    }
    console.log('\n    That recall cost is real and must be published with the number.');
    return;
  }
  // Midpoint of the gap, rounded down to 3dp so the published number is
  // not more precise than the measurement supports.
  const suggested = Math.floor(((cleanMax + defectMin) / 2) * 1000) / 1000;
  console.log(`    midpoint:       ${suggested.toFixed(3)}   <- equal margin on both sides`);
  console.log(`    margin below:   ${(suggested - cleanMax).toFixed(4)}`);
  console.log(`    margin above:   ${(defectMin - suggested).toFixed(4)}`);
  console.log('\n  Set DEFAULT_THRESHOLD to the midpoint and record both edges beside it.');
}

if (require.main === module) main();

// The variant set is the shared ground truth for calibration experiments —
// resonance-two-class.js re-reads these same rewrites so its comparison is
// against the exact blocks this calibration measured, not a re-typing.
module.exports = { VARIANTS };
