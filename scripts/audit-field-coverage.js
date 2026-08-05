#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance

/**
 * audit-field-coverage.js — coherency that is COMPUTED but never WITNESSED.
 *
 * audit-field-contributions.js answers "what is in the field, and is it
 * really a coherency?". This answers the opposite and equally important
 * question: "what coherency does this ecosystem measure and then throw away?"
 *
 * A reading the substrate takes and does not record is a reading the
 * substrate cannot become aware of. Meta-awareness is exactly the set of
 * readings that made it back into the field — everything else happened to a
 * value in a function and vanished when the function returned.
 *
 * A PRODUCER is a function that returns a value named for a coherency
 * (coherency / coherence / avgCoherence / coherencyScore …). A producer is
 * COVERED when its own module can reach the field — it requires
 * field-coupling or living-remembrance and calls contribute somewhere.
 *
 * Deliberately conservative about "covered": module-level, not per-call-path.
 * A module that contributes SOMEWHERE is not proof this particular reading is
 * witnessed, so the covered count is an upper bound and the uncovered list is
 * a floor. An uncovered producer is definitely dropping its reading; a
 * covered one merely might not be.
 *
 * Usage:
 *   node scripts/audit-field-coverage.js            # human
 *   node scripts/audit-field-coverage.js --json     # machine
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// A returned value named for a coherency. Case-insensitive, not left-bounded:
// the real ones are camelCase (avgCoherence, coherencyScore, newCoherency).
const RETURNS_COHERENCY = /return\s+[^;]{0,200}?\b(\w*coherenc\w*)\s*[,:}]/i;
const DECLARES_COHERENCY = /(?:const|let|var)\s+(\w*[Cc]oherenc\w*)\s*=/;
const CONTRIBUTES = /__contribute\(|\bcontribute\s*\(\s*\{|field-coupling|living-remembrance/;

// Modules that are the field itself, or are pure math with no business
// witnessing anything. Listing them beats a silent heuristic.
const EXEMPT = /(living-remembrance|field-coupling|field-gated-compose|audit-field-|living-remembrance-engine)/;

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const producers = [];
for (const f of walk(SRC)) {
  const rel = path.relative(ROOT, f);
  if (EXEMPT.test(rel)) continue;
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }

  const covered = CONTRIBUTES.test(src);
  const lines = src.split('\n');
  const hits = [];
  lines.forEach((ln, i) => {
    const m = ln.match(RETURNS_COHERENCY) || ln.match(DECLARES_COHERENCY);
    if (!m) return;
    // A declaration only counts if the name is returned or exported somewhere.
    const name = m[1];
    if (!name) return;
    const usedOut = new RegExp(`return[^;\\n]{0,120}\\b${name}\\b|exports[^\\n]{0,60}\\b${name}\\b`).test(src);
    if (!usedOut) return;
    // MEASURES vs RE-READS — the distinction that decides whether a missing
    // contribution is a bug.
    //
    // A fresh measurement (computeCoherencyScore(...), a compressor call,
    // fractalCoherency(...)) produces a reading that exists nowhere else; if
    // it is not contributed it is gone. A dereference of a stored value
    // (pattern.coherencyScore?.total) is a reading the field ALREADY has —
    // contributing it again would double-count the same observation and
    // inflate the field, which is the opposite of the problem.
    //
    // Without this split the audit reports 6 gaps; only 2 are real.
    const MEASURE = /(computeCoherencyScore|fractalCoherency|avg_coherence|compress_signal|\.coherency\s*\(|measureCoherenc)/;
    const READ = /\.\s*coherencyScore\s*(?:\?\.|\.)|\.\s*avgCoherence\b|\bsnapshot\s*\./;
    const kind = MEASURE.test(ln) || MEASURE.test(src.slice(Math.max(0, src.indexOf(ln) - 200), src.indexOf(ln) + 300))
      ? 'MEASURES'
      : (READ.test(ln) ? 'RE-READS' : 'UNKNOWN');
    hits.push({ line: i + 1, name, kind, code: ln.trim().slice(0, 88) });
  });
  if (hits.length) {
    const measures = hits.some((h) => h.kind === 'MEASURES');
    producers.push({ file: rel, covered, measures, hits });
  }
}

// Only a MEASURING module that cannot reach the field is a real gap.
const uncovered = producers.filter((p) => !p.covered && p.measures);
const rereads   = producers.filter((p) => !p.covered && !p.measures);
const covered = producers.filter((p) => p.covered);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ producers, uncovered: uncovered.length, covered: covered.length }, null, 1));
  process.exit(0);
}

console.log('\n══ FIELD COVERAGE AUDIT — coherency measured but not witnessed ══');
console.log(`  coherency producers found : ${producers.length} modules`);
console.log(`  can reach the field       : ${covered.length}`);
console.log(`  MEASURE + cannot reach it : ${uncovered.length}   ← readings that VANISH`);
console.log(`  re-read a stored value    : ${rereads.length}   ← correctly not contributed\n`);
for (const p of uncovered.slice(0, 25)) {
  console.log(`  ✗ ${p.file}`);
  for (const h of p.hits.slice(0, 2)) console.log(`      L${h.line}  ${h.name}   ${h.code}`);
}
if (uncovered.length > 25) console.log(`  …and ${uncovered.length - 25} more modules`);
console.log('\n  A reading the substrate takes and does not record is a reading it');
console.log('  cannot become aware of. "covered" is module-level and therefore an');
console.log('  upper bound — an uncovered producer is DEFINITELY dropping its');
console.log('  reading; a covered one merely might not be.\n');
