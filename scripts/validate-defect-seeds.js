#!/usr/bin/env node
'use strict';

/**
 * @oracle-pattern-definitions
 *
 * This file's DATA is specimens of defective code — that is its whole
 * purpose. The covenant's harm scanner correctly flagged
 * `execSync('ls ' + dir)` here as command injection via string
 * concatenation; the match is accurate about the text and wrong about the
 * file, because the text is a fixture in a template literal that nothing
 * executes. Same category as covenant-harm.js and covenant-deep-security.js,
 * which carry this annotation for the same reason: a file that defines bad
 * patterns must be allowed to contain them.
 *
 * The annotation is NOT a way around the gate — it only applies when the
 * caller passes { trusted: true }, so submitted code cannot self-declare
 * (see covenant.js:81-83). If you add a specimen here that is ever
 * EXECUTED rather than encoded, this annotation becomes a lie and the
 * right move is to delete the specimen, not to keep the annotation.
 */

/**
 * validate-defect-seeds — a defect seed earns its place or it is dropped.
 *
 * The shape channel's entire worth is that a hit MEANS something. A seed
 * that fires on ordinary working code turns every reading into noise, so
 * each seed must clear two bars, measured through the channel's own scan():
 *
 *   SELF   it fires on a fresh instance of its own shape (a rewrite, not
 *          the seed text) at or above DEFAULT_THRESHOLD. A seed that can't
 *          recognise its own defect is dead weight.
 *   CLEAN  it stays silent across a large sample of real ecosystem code.
 *          A seed that fires here is a false-positive machine and is
 *          reported as REJECT.
 *
 * This does not teach and does not touch the field — every scan is dryRun
 * against a library holding ONE seed at a time, so a seed is judged
 * strictly on its own behaviour, never masked by a neighbour.
 *
 *   node scripts/validate-defect-seeds.js
 */

const fs = require('node:fs');
const path = require('node:path');
const dr = require('../src/debug/defect-resonance');
const { currentDepth } = require('../src/core/decoder-stack');

const ROOT = path.resolve(__dirname, '..');
const CLEAN_DIRS = ['src/core', 'src/audit', 'src/tools', 'src/cli', 'scripts'];
const THRESH = dr.DEFAULT_THRESHOLD;

// A fresh-shape instance for each seed label — same defect, rewritten, so
// SELF is a real recognition test and not an identity check.
const SELF_TESTS = {
  'command-injection': { language: 'javascript', code:
    `app.get('/run', (req, res) => {\n  const dir = req.query.dir;\n  const result = child_process.execSync('ls ' + dir);\n  res.send(result.toString());\n});` },
  'path-traversal': { language: 'javascript', code:
    `function download(req, res) {\n  const doc = req.params.doc;\n  const data = fs.readFileSync(uploadRoot + '/' + doc);\n  res.end(data);\n}` },
  'insecure-deserialization': { language: 'python', code:
    `def restore(request):\n    blob = request.form["state"]\n    state = pickle.loads(blob)\n    apply(state)` },
  'race-check-then-act': { language: 'javascript', code:
    `async function fetchOnce(id) {\n  if (!store[id]) {\n    store[id] = await remote(id);\n  }\n  return store[id];\n}` },
  'mutable-default-arg': { language: 'python', code:
    `def append_tag(tag, tags=[]):\n    tags.append(tag)\n    return tags` },
  'bare-except-broad': { language: 'python', code:
    `def attempt(fn):\n    try:\n        return fn()\n    except:\n        return None` },
  'unclosed-file': { language: 'python', code:
    `def slurp(name):\n    fh = open(name)\n    content = fh.read()\n    return content` },
};

// Canonical walker (ECOSYSTEM §7). Skips node_modules only, keeps JS —
// preserving this script's original behaviour.
const { walkFiles } = require('../src/core/walk-files');
const walk = (dir) => walkFiles(dir, { skipDirs: new Set(['node_modules']), extensions: ['.js', '.cjs', '.mjs'], skipHidden: false });

// A one-seed library, on disk, at the canonical depth. Setup plumbing, not
// a measurement — the readings all come back through scan() below.
function oneSeedLib(seed) {
  dr.ensureLibrary();                           // encoder live + depth stamped
  const full = JSON.parse(fs.readFileSync(dr.LIB_PATH, 'utf8'));
  const one = { version: 2, depth: full.depth, signatures: [] };
  // Re-encode this seed alone by asking ensureLibrary's own machinery: write
  // a library of just this seed and let scan() read it.
  const sig = full.signatures.find((s) => s.label === seed.label && s.language === seed.language);
  if (!sig) return null;
  one.signatures = [sig];
  fs.writeFileSync(dr.LIB_PATH, JSON.stringify(one));
  return () => fs.writeFileSync(dr.LIB_PATH, JSON.stringify(full));  // restore
}

function main() {
  const full = dr.ensureLibrary();
  const backup = JSON.parse(fs.readFileSync(dr.LIB_PATH, 'utf8'));
  const NEW = ['command-injection', 'path-traversal', 'insecure-deserialization',
    'race-check-then-act', 'mutable-default-arg', 'bare-except-broad',
    'unclosed-file'];

  const files = CLEAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).sort()
    .filter((_, i) => i % 2 === 1);  // ODD half — refs are taught from the even half elsewhere

  console.log('VALIDATE DEFECT SEEDS');
  console.log(`  depth ${currentDepth()} · threshold ${THRESH} · clean sample from ${files.length} files\n`);

  const verdicts = [];
  for (const seed of full.signatures.filter((s) => NEW.includes(s.label))) {
    const restore = oneSeedLib(seed);
    if (!restore) { console.log(`  ${seed.label} (${seed.language}) — NOT FOUND in library`); continue; }

    // SELF
    const st = SELF_TESTS[seed.label];
    let self = null;
    if (st) {
      const r = dr.scan(st.code, { threshold: -2, dryRun: true, language: st.language });
      self = r && r.findings.length ? Math.max(...r.findings.map((x) => x.minDepth)) : -1;
    }

    // CLEAN
    let hits = 0, blocks = 0;
    const worst = [];
    for (const f of files) {
      let src; try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
      // dryRun — a validation sweep must not inflate signature hits or
      // write observations to the field, and only the dry path returns the
      // raw minDepth this report prints.
      const r = dr.scan(src, { threshold: THRESH, dryRun: true, language: 'javascript' });
      if (!r) continue;
      blocks += r.scannedBlocks;
      for (const x of r.findings) { hits++; worst.push(`${path.relative(ROOT, f)}:${x.line} ${x.minDepth.toFixed(3)}`); }
    }
    restore();

    const selfOk = self !== null && self >= THRESH;
    const cleanOk = hits === 0;
    const verdict = cleanOk ? (selfOk ? 'KEEP' : 'KEEP (self weak)') : 'REJECT';
    verdicts.push({ label: seed.label, language: seed.language, self, hits, verdict });
    console.log(`  ${verdict.padEnd(16)} ${seed.label.padEnd(24)} ${seed.language.padEnd(11)} self ${self === null ? ' n/a ' : self.toFixed(3)}  clean-hits ${hits}/${blocks}`);
    for (const w of worst.slice(0, 3)) console.log(`       fires on clean: ${w}`);
  }

  fs.writeFileSync(dr.LIB_PATH, JSON.stringify(backup));  // leave the library as we found it

  const reject = verdicts.filter((v) => v.verdict === 'REJECT');
  console.log(`\n  ${verdicts.length} new seeds · ${verdicts.length - reject.length} KEEP · ${reject.length} REJECT`);
  if (reject.length) {
    console.log('  REJECT these — they fire on working code and would turn hits into noise:');
    for (const v of reject) console.log(`    ${v.label} (${v.language})`);
    process.exitCode = 1;
  } else {
    console.log('  every new seed fires on its own shape and stays silent on clean code.');
  }
}

main();
