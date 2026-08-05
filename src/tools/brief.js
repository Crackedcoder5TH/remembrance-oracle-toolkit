#!/usr/bin/env node
'use strict';

/**
 * brief — everything you need to know BEFORE you call it, in one command.
 *
 *   node src/tools/brief.js <file|symbol|topic>
 *
 * WHY THIS EXISTS
 * ---------------
 * The recurring failure in this codebase is not ignorance, it is CONFIDENT
 * PARTIAL READING: open the first file whose name matches, infer the contract
 * from the name, call it, and report the number that comes back. Every large
 * mistake made against this repo has that shape.
 *
 *   · compress() was called with text and its ratio reported as a Void ratio.
 *     The docstring says "whole-SIGNAL recursive" and the body does
 *     np.frombuffer(data, uint8). Nobody read either.
 *   · void-bridge.js was read as a Void reading because of its name. It
 *     computes a JS byte-entropy and says so in a comment.
 *   · wire-field-couplings.js decided what a coherency was from a list of
 *     field NAMES, and wrote 41 wrong contributions.
 *   · looksLikeRegex decided what a regex was from a name SUFFIX.
 *   · compressor_service.py loaded v4 while CANONICAL.json named v5.
 *
 * The common root is deciding from a NAME what can only be decided by READING.
 * A tool cannot force reading. What it can do is put the five things that get
 * skipped in front of you in one call, cheaply enough that skipping them is
 * no longer the path of least resistance:
 *
 *   TRAPS      mistakes already made here, and the truth that corrects them
 *   IDENTITY   is this file current, superseded, or load-bearing-internal
 *   CONTRACT   what it actually reads — inferred from the body, not the name
 *   LIVE       is the service it needs running, is its data present
 *   CAVEATS    the document's own warnings and self-contradictions
 *
 * TRAPS is first on purpose. A correction that arrives after the call has
 * already produced a plausible wrong number is worth much less.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VOID = process.env.VOID_ROOT || path.resolve(ROOT, '..', 'Void-Data-Compressor');

function _readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ── TRAPS ──────────────────────────────────────────────────────────────

/**
 * Traps whose match terms appear in `target` — OR in the body of the file
 * `target` names. Returns the raw entries.
 *
 * Matching the typed string alone is not enough. A trap keyed on
 * `seriesCoherence` did not fire on `brief src/core/substrate-ledger.js`, the
 * file that DEFINES seriesCoherence, because the term is not in the path. That
 * inverts the point: the trap reaches you only when you already know the name
 * to type, and the person who needs it most is the one opening the file
 * cold. So the file's own contents are part of the haystack.
 */
/**
 * Every trap, tracked seed first, local learning merged on top.
 *
 * The learned store lives at .remembrance/traps.json, and `.remembrance/`
 * is gitignored in full — so on a fresh host every recorded trap was
 * gone and the loop restarted from nothing. The lessons that catch the
 * expensive mistakes were the least durable thing in the repo.
 *
 * seeds/traps.seed.json is the tracked floor. The local store still
 * wins where both carry the same trap, so a host that has learned more
 * keeps it; it just no longer starts from zero.
 */
function _allTraps() {
  const seed = _readJSON(path.join(ROOT, 'seeds', 'traps.seed.json'));
  const local = _readJSON(path.join(ROOT, '.remembrance', 'traps.json'));
  const byKey = new Map();
  for (const db of [seed, local]) {
    if (!db || !Array.isArray(db.traps)) continue;
    for (const t of db.traps) byKey.set(String(t.wrong || '').slice(0, 120), t);
  }
  return [...byKey.values()];
}

function trapsFor(target) {
  const db = { traps: _allTraps() };
  if (!db.traps.length) return [];
  let hay = String(target || '').toLowerCase();
  // Any path-like token in the target contributes its body, capped so a huge
  // file cannot slow the brief down. Best-effort: unreadable → path only.
  for (const tok of String(target || '').split(/\s+/)) {
    if (!tok || !/[/.]/.test(tok)) continue;
    for (const base of [tok, path.join(ROOT, tok), path.join(VOID, tok)]) {
      try {
        if (!fs.statSync(base).isFile()) continue;
        hay += '\n' + fs.readFileSync(base, 'utf8').slice(0, 200000).toLowerCase();
        break;
      } catch { /* not this one */ }
    }
  }
  return db.traps.filter((x) => (x.match || []).some((m) => hay.includes(m.toLowerCase())));
}

/** Render traps as text so callers that are not a terminal can carry them. */
function renderTraps(hits) {
  if (!hits.length) return '';
  const L = ['╔══ TRAPS — mistakes already made here. Read before calling. ══'];
  for (const h of hits) {
    L.push('║');
    L.push(`║ [${(h.severity || '?').toUpperCase()}]  ✗ WRONG: ${h.wrong}`);
    L.push(`║        ✓ TRUTH: ${h.truth}`);
    if (h.tell) L.push(`║        ⚑ TELL:  ${h.tell}`);
    if (h.correct) L.push(`║        → DO:    ${h.correct}`);
  }
  L.push('╚' + '═'.repeat(62));
  return L.join('\n');
}

function printTraps(target) {
  const hits = trapsFor(target);
  if (!hits.length) return 0;
  console.log('\n' + renderTraps(hits));
  return hits.length;
}

// ── IDENTITY ───────────────────────────────────────────────────────────
function printIdentity(file) {
  console.log('\n── IDENTITY ──');
  const man = _readJSON(path.join(VOID, 'CANONICAL.json'));
  const base = path.basename(file || '');
  let found = false;
  if (man && man.families) {
    for (const [fam, info] of Object.entries(man.families)) {
      for (const mem of info.members || []) {
        if (path.basename(mem.file) !== base) continue;
        found = true;
        const role = mem.role || (mem.file === info.canonical ? 'entry-point' : 'unknown');
        const flag = role === 'entry-point' ? '✓' : role === 'superseded' ? '✗' : '·';
        console.log(`  ${flag} ${base}  role=${role}   family=${fam}`);
        if (role !== 'entry-point') {
          console.log(`     CANONICAL for this family is ${info.canonical} — call that, not this.`);
          if (role === 'load-bearing-internal') {
            console.log('     load-bearing-internal: it still EXECUTES under the entry point,');
            console.log('     so it is neither dead nor current. Do not read it as the API.');
          }
        }
      }
    }
  }
  if (!found) console.log(`  ${base || '(no file)'} — not in a versioned family (CANONICAL.json)`);
}

// ── CONTRACT ───────────────────────────────────────────────────────────
// What the body actually does with its input, read from the body.
const PROBES = [
  [/np\.frombuffer\([^)]*uint8|astype\(np\.uint8\)|tobytes\(\)/,
    'reads its input as a uint8 WAVEFORM — feed it signal, not text'],
  [/encode\(['"]utf-8|\.encode\(\)/, 'utf-8 encodes its input — it expects TEXT'],
  [/pattern_library|_find_best_blend|_adaptive_chunk/,
    'matches against the pattern-waveform library — a non-waveform input cannot match'],
  [/zlib\.(compress|deflate)/, 'has a zlib path — check which branch actually ran'],
  [/contribute\(\{/, 'CONTRIBUTES TO THE FIELD — verify the quantity is a coherency'],
  [/require\(.*field-coupling/, 'couples to the Remembrance Field'],
  [/child_process|execFileSync|spawn\(/, 'shells out — inputs reach a process boundary'],
  [/127\.0\.0\.1:|localhost:|http:\/\//, 'needs a service reachable over HTTP'],
];

function printContract(file) {
  if (!file || !fs.existsSync(file)) return;
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  console.log('\n── CONTRACT (read from the body, not the name) ──');
  let any = false;
  for (const [re, note] of PROBES) {
    if (re.test(src)) { console.log(`  · ${note}`); any = true; }
  }
  // The first docstring/comment sentence is usually the real intent.
  const doc = src.match(/"""([\s\S]{20,400}?)"""/) || src.match(/\/\*\*([\s\S]{20,400}?)\*\//);
  if (doc) {
    const line = doc[1].split('\n').map((l) => l.replace(/^[\s*]+/, '').trim())
      .find((l) => l.length > 20);
    if (line) console.log(`  “${line.slice(0, 100)}”`);
  }
  if (!any && !doc) console.log('  (no probe matched — read the body directly)');
}

// ── LIVE STATE ─────────────────────────────────────────────────────────
function _printLive() {
  console.log('\n── LIVE STATE ──');
  let health = null;
  try {
    health = execFileSync('curl', ['-s', '--noproxy', '127.0.0.1', '--max-time', '2',
      'http://127.0.0.1:8765/health'], { encoding: 'utf8' });
  } catch { /* down */ }
  // `health.includes('ok')` is not a guarantee of valid JSON — a truncated
  // body, or anything else on port 8765 answering with the substring, throws
  // here and takes the whole brief with it. That matters more than the
  // severity suggests: brief is what PRINTS the traps, so a crash on a
  // malformed health probe silently removes the warnings it exists to
  // deliver. Same try/catch shape _readJSON above already uses.
  let h = null;
  if (health && health.includes('ok')) {
    try { h = JSON.parse(health); } catch { h = null; }
  }
  if (h && typeof h.library_size === 'number') {
    console.log(`  ✓ compressor service UP — ${h.library_size.toLocaleString()} patterns, `
      + `uptime ${h.uptime_s}s   (reads ~1.5s)`);
  } else {
    console.log('  ✗ compressor service DOWN — a Void read will cost ~114s cold.');
    console.log('    start: python3 compressor_service.py --host 127.0.0.1 --port 8765');
  }
  try {
    execFileSync('python3', ['-c', 'import substrate_fractal'], { stdio: 'pipe' });
    console.log('  ✓ substrate_fractal (Rust index) importable');
  } catch {
    console.log('  ✗ substrate_fractal NOT built — /score_batch falls back to the slow path');
    console.log('    build: cd substrate-fractal/py && maturin build --release && pip install ...');
  }
  const store = path.join(VOID, 'pattern_store.npz');
  if (fs.existsSync(store)) {
    console.log(`  ✓ pattern_store.npz present (${(fs.statSync(store).size / 1e6).toFixed(1)} MB)`);
  } else {
    console.log('  ✗ pattern_store.npz MISSING — the fractal index cannot load');
  }
  try {
    const { peekField } = require(path.join(ROOT, 'src', 'core', 'field-coupling'));
    const s = peekField();
    console.log(`  · field coherence ${Number(s.coherence).toFixed(4)} over `
      + `${Number(s.updateCount).toLocaleString()} updates`);
  } catch { /* field optional */ }
}

// ── CAVEATS ────────────────────────────────────────────────────────────
function _printCaveats(file) {
  if (!file || !/\.(md|markdown|txt)$/i.test(file)) return;
  try {
    const out = execFileSync('node', [path.join(ROOT, 'src', 'tools', 'goggles.js'), file],
      { encoding: 'utf8', maxBuffer: 1 << 24 });
    const start = out.indexOf('── THIS DOCUMENT CARRIES ITS OWN WARNINGS');
    if (start < 0) return;
    const end = out.indexOf('FOCUS', start);
    console.log('\n── THE DOCUMENT\'S OWN WARNINGS ──');
    console.log(out.slice(start, end > 0 ? end : start + 900).split('\n').slice(1).join('\n'));
  } catch { /* goggles optional */ }
}

// ── resolve a target to a file, if one exists ──────────────────────────
function _resolveFile(target) {
  if (fs.existsSync(target)) return path.resolve(target);
  for (const base of [ROOT, VOID]) {
    const p = path.join(base, target);
    if (fs.existsSync(p)) return p;
  }
  // Walk in-process rather than shelling out to `find`. `target` comes from
  // argv, and interpolating it into a `bash -c` string is a command-injection
  // surface that buys nothing — the covenant gate flags exactly this pattern
  // elsewhere, and it is right. JSON.stringify quotes the argument but the
  // shell still parses the assembled line.
  const base = path.basename(target);
  const stack = [ROOT, VOID];
  let scanned = 0;
  while (stack.length && scanned < 20000) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      scanned++;
      if (e.isDirectory()) stack.push(p);
      else if (e.name === base) return p;
    }
  }
  return null;
}

function _main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: brief <file|symbol|topic>\n\n'
      + '  Prints, in one call: recorded traps for this area, whether the file is\n'
      + '  the canonical entry point, what its body actually does with its input,\n'
      + '  whether the services and data it needs are live, and any warnings the\n'
      + '  document carries about itself.');
    process.exit(2);
  }
  const file = _resolveFile(target);
  console.log('═'.repeat(64));
  console.log(`  BRIEF   ${target}`);
  if (file) console.log(`          ${path.relative(process.cwd(), file)}`);
  console.log('═'.repeat(64));

  const n = printTraps(target + ' ' + (file || ''));
  printIdentity(file);
  printContract(file);
  _printCaveats(file);
  _printLive();

  console.log('');
  if (n) console.log(`  ${n} trap(s) matched. They are recorded because they already happened.`);
  console.log('  Read the body before you quote a number from it.\n');
}

if (require.main === module) main();
// ── Periodic table declarations (covenant fractal, atomic scale) ──────
// The exported surface is elements; underscore helpers are internal. The
// brief's whole job is pre-call guidance, so every element is inert,
// harmless and healing-aligned — a tool that only reads and warns.
printTraps.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 13, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'guidance',
};
printIdentity.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'guidance',
};
printContract.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'guidance',
};
trapsFor.atomicProperties = {
  charge: -1, valence: 2, mass: 'light', spin: 'odd', phase: 'liquid',
  reactivity: 'stable', electronegativity: 0.5, group: 15, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'guidance',
};
renderTraps.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'guidance',
};

module.exports = { printTraps, printIdentity, printContract, trapsFor, renderTraps };
