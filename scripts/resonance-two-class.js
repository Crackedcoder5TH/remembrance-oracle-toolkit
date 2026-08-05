#!/usr/bin/env node
'use strict';

/**
 * resonance-two-class — ask the substrate the COMPARATIVE question.
 *
 * The previous calibration asked a ONE-CLASS question — "how strongly does
 * this block resonate with a defect shape?" — and gated on an absolute
 * floor. Working code answered ~0.95, because code resembles code, and the
 * gap inverted. The operator's correction: that conclusion was drawn from
 * one number while the rest of the field was ignored. Resonance is the
 * search engine; NEAR is only meaningful relative to the alternatives. So
 * ask both:
 *
 *   defect(b)  = best resonance to the defect library
 *   working(b) = best resonance to a WORKING-CODE reference library,
 *                taught through the channel's own teach() path
 *   margin(b)  = defect(b) - working(b)
 *
 * positive margin = the block sits closer to the buggy class than to the
 * working class: it carries the defect's shape SPECIFICALLY, not just
 * code's shape.
 *
 * CONTROL FOR THE CONFOUND. Eval variants are foreign snippets while the
 * working refs are this repo's code, so "far from working" could just mean
 * "not this repo's style". Each buggy variant therefore has a FIXED TWIN —
 * the same snippet, same style, bug removed. The pairwise question
 * margin(buggy) − margin(fixed) cancels style entirely: whatever separates
 * a variant from its own twin is the bug's shape and nothing else.
 *
 * DISCIPLINE
 *   - Both classes measured through scan() in dryRun — one path, two
 *     libraries, no hand-rolled math, nothing written to hits or the field.
 *   - Reference blocks taught from EVEN-indexed files; eval blocks read
 *     from ODD-indexed files. Nothing scores against its own source.
 *   - Blocks split by the channel's own blocksOf, so teach and scan see
 *     the same units.
 *
 *   node scripts/resonance-two-class.js [--refs N] [--blocks M]
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const { VARIANTS } = require('./calibrate-defect-resonance');

// Fixed twins, aligned by index with VARIANTS: identical structure and
// style, defect removed. The pair is the experiment.
const FIXED_TWINS = [
  { label: 'eval-of-input', language: 'javascript', code:
    `router.post('/calc', (req, res) => {\n  const input = req.query.q;\n  const answer = Number(input);\n  res.send(String(answer));\n});` },
  { label: 'eval-of-input', language: 'python', code:
    `@app.route("/calc")\ndef calc():\n    q = request.args.get("q")\n    answer = float(q)\n    return str(answer)` },
  { label: 'sql-by-concat', language: 'javascript', code:
    `async function findOrders(db, customer) {\n  const sql = 'SELECT * FROM orders WHERE customer = ?';\n  const rows = await db.query(sql, [customer]);\n  return rows;\n}` },
  { label: 'sql-by-concat', language: 'python', code:
    `def find_orders(cur, customer):\n    sql = "SELECT * FROM orders WHERE customer = %s"\n    cur.execute(sql, (customer,))\n    return cur.fetchall()` },
  { label: 'off-by-one-length', language: 'javascript', code:
    `function maxOf(values) {\n  let best = values[0];\n  for (let i = 1; i < values.length; i++) {\n    if (values[i] > best) best = values[i];\n  }\n  return best;\n}` },
  { label: 'swallowed-error', language: 'javascript', code:
    `async function flush(queue) {\n  try {\n    await queue.drain();\n  } catch (err) {\n    console.error('flush failed', err);\n    throw err;\n  }\n  return queue.size;\n}` },
  { label: 'swallowed-error', language: 'python', code:
    `def flush(queue):\n    try:\n        queue.drain()\n    except Exception as e:\n        log.warning("flush failed: %s", e)\n        raise\n    return queue.size` },
];

const CLEAN_DIRS = ['src/core', 'src/audit', 'src/tools', 'src/cli', 'scripts'];

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

function corpusSplit() {
  const files = CLEAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort();
  return {
    refFiles: files.filter((_, i) => i % 2 === 0),
    evalFiles: files.filter((_, i) => i % 2 === 1),
  };
}

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};

// ── worker: build the working-code reference library ────────────────
if (argv.includes('--build-ref')) {
  const dr = require('../src/debug/defect-resonance');
  const want = parseInt(arg('--refs', '80'), 10);
  const { refFiles } = corpusSplit();
  dr.ensureLibrary();
  let taught = 0;
  for (const f of refFiles) {
    if (taught >= want) break;
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const rel = path.relative(ROOT, f);
    for (const b of dr.blocksOf(src)) {
      if (taught >= want) break;
      if (dr.teach({ label: `working:${rel}:${b.startLine}`, bugClass: 'working-code', language: 'javascript', code: b.text })) taught++;
    }
  }
  // ensureLibrary seeded the defect shapes in; the reference library must
  // hold ONLY the working class or it answers both questions at once.
  // Setup plumbing over the stored JSON, not a measurement.
  const raw = JSON.parse(fs.readFileSync(dr.LIB_PATH, 'utf8'));
  raw.signatures = raw.signatures.filter((s) => s.bugClass === 'working-code');
  fs.writeFileSync(dr.LIB_PATH, JSON.stringify(raw));
  console.log(`  reference library: ${raw.signatures.length} working-code signatures`);
  process.exit(0);
}

// ── worker: one pass of the eval set against whatever library the env
//    points at (defect root or working-reference root) ────────────────
if (argv.includes('--pass')) {
  const dr = require('../src/debug/defect-resonance');
  const outPath = arg('--out', null);
  const want = parseInt(arg('--blocks', '300'), 10);
  const { evalFiles } = corpusSplit();
  const out = [];
  let blocks = 0;
  for (const f of evalFiles) {
    if (blocks >= want) break;
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const r = dr.scan(src, { threshold: -2, dryRun: true, language: 'javascript' });
    if (!r) continue;
    const rel = path.relative(ROOT, f);
    for (const x of r.findings) out.push({ id: `${rel}:${x.line}`, kind: 'clean', v: x.minDepth });
    blocks += r.findings.length;
  }
  const snippets = [
    ...VARIANTS.map((v, i) => ({ ...v, kind: 'defect', id: `variant:${i}:${v.label}:${v.language}` })),
    ...FIXED_TWINS.map((v, i) => ({ ...v, kind: 'control', id: `twin:${i}:${v.label}:${v.language}` })),
  ];
  for (const s of snippets) {
    const r = dr.scan(s.code, { threshold: -2, dryRun: true, language: s.language });
    const best = r && r.findings.length ? Math.max(...r.findings.map((x) => x.minDepth)) : -1;
    out.push({ id: s.id, kind: s.kind, label: s.label, language: s.language, v: best });
  }
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`  pass complete: ${out.length} readings -> ${path.basename(outPath)}`);
  process.exit(0);
}

// ── orchestrator ────────────────────────────────────────────────────
const XROOT = path.join(ROOT, '.remembrance', 'two-class-experiment');
const defRoot = path.join(XROOT, 'defect');
const refRoot = path.join(XROOT, 'working');
for (const r of [defRoot, refRoot]) {
  fs.mkdirSync(path.join(r, '.remembrance'), { recursive: true });
  // Fresh libraries every run — a stale one would carry an old split.
  try { fs.unlinkSync(path.join(r, '.remembrance', 'defect-signatures.json')); } catch { /* first run */ }
}
const run = (extra, root) => execFileSync('node', [__filename, ...extra], {
  env: { ...process.env, GOGGLES_LEARNING_ROOT: root }, stdio: 'inherit',
});

console.log('TWO-CLASS RESONANCE — the comparative question, through the channel\'s own path');
run(['--build-ref', '--refs', arg('--refs', '80')], refRoot);
run(['--pass', '--out', path.join(XROOT, 'def.json'), '--blocks', arg('--blocks', '300')], defRoot);
run(['--pass', '--out', path.join(XROOT, 'ref.json'), '--blocks', arg('--blocks', '300')], refRoot);

const A = JSON.parse(fs.readFileSync(path.join(XROOT, 'def.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(XROOT, 'ref.json'), 'utf8'));
const bById = new Map(B.map((x) => [x.id, x]));
const rows = [];
for (const a of A) {
  const b = bById.get(a.id);
  if (!b || a.v < -1 || b.v < -1) continue;
  rows.push({ ...a, defect: a.v, working: b.v, margin: a.v - b.v });
}
const clean = rows.filter((r) => r.kind === 'clean');
const defect = rows.filter((r) => r.kind === 'defect');
const control = rows.filter((r) => r.kind === 'control');

function auc(pos, neg) {
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : (p === n ? 0.5 : 0);
  return pos.length && neg.length ? w / (pos.length * neg.length) : 0;
}

console.log(`\n  eval blocks: ${clean.length} clean · ${defect.length} buggy variants · ${control.length} fixed twins`);

const aucAbs = auc(defect.map((r) => r.defect), clean.map((r) => r.defect));
const aucMargin = auc(defect.map((r) => r.margin), clean.map((r) => r.margin));
console.log('\n  DISCRIMINATION, buggy variants vs real clean blocks (AUC, 1.0 = perfect, 0.5 = coin flip):');
console.log(`    one-class  (absolute defect resonance):  ${aucAbs.toFixed(4)}   <- the previous calibration's question`);
console.log(`    two-class  (margin = defect - working):  ${aucMargin.toFixed(4)}   <- the operator's question`);

console.log('\n  MARGINS (positive = closer to the buggy class than the working class):');
const mstats = (xs) => `min ${Math.min(...xs).toFixed(4)}  max ${Math.max(...xs).toFixed(4)}`;
console.log(`    clean blocks:   ${mstats(clean.map((r) => r.margin))}   above zero: ${clean.filter((r) => r.margin > 0).length} of ${clean.length}`);
console.log(`    buggy variants: ${mstats(defect.map((r) => r.margin))}   above zero: ${defect.filter((r) => r.margin > 0).length} of ${defect.length}`);

console.log('\n  THE STYLE-CONTROLLED PAIRS — same snippet, bug in vs bug out:');
console.log('    (margin_buggy - margin_fixed: positive = the substrate ranks the buggy');
console.log('     twin closer to the defect class than its own fixed twin)');
let pairsUp = 0;
for (let i = 0; i < defect.length; i++) {
  const d = defect.find((r) => r.id === `variant:${i}:${VARIANTS[i].label}:${VARIANTS[i].language}`);
  const c = control.find((r) => r.id === `twin:${i}:${FIXED_TWINS[i].label}:${FIXED_TWINS[i].language}`);
  if (!d || !c) continue;
  const delta = d.margin - c.margin;
  if (delta > 0) pairsUp++;
  console.log(`    ${delta > 0 ? 'BUG READS BUGGIER ' : 'inverted          '} Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}   ${d.label} (${d.language})   buggy ${d.margin.toFixed(4)} vs fixed ${c.margin.toFixed(4)}`);
}
console.log(`\n    pairs where the bug reads buggier than its own fixed twin: ${pairsUp} of ${Math.min(defect.length, control.length)}`);

console.log('\n  The reference class is ' + arg('--refs', '80') + ' taught blocks. The operator\'s claim is that');
console.log('  separation grows with ingestion — more working AND more buggy shapes. This run');
console.log('  is the mechanism test at today\'s library size, not the ceiling.');
console.log('  Interpretation is the operator\'s.');
