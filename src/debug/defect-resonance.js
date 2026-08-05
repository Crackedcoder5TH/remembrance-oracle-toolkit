'use strict';

/**
 * @oracle-infrastructure — substrate-native defect detection; internal,
 * not user-input-driven.
 *
 * defect-resonance — META-DEBUG's language-agnostic channel.
 *
 * The classical audit checkers (audit/ast-checkers) are parse-based and
 * therefore JS/TS-bound. This channel is the substrate-native
 * counterpart: a DEFECT IS A SHAPE. Known-bad code, encoded through the
 * same 5-layer composed encoder as everything else, becomes a defect
 * signature in the same coordinate system the whole substrate lives in.
 * A block of code — in ANY language — that resonates with a defect
 * signature at every depth is a finding.
 *
 * The library grows two ways:
 *   - SEEDS: a small multi-language set of classic defect shapes
 *     (injection, SQL-by-concat, off-by-one, swallowed errors, panic
 *     chains), shipped below.
 *   - TAUGHT: every HIGH finding the AST checkers produce on JS/TS
 *     teaches the library (the offending block is encoded and stored),
 *     so parser precision where we have it continuously sharpens the
 *     shape channel everywhere — cross-language transfer through form.
 *
 * Learning: detections flow through the same goggles-learning loop as
 * AST findings (fixed → reinforced, dismissed → decays and
 * self-suppresses), and every detection contributes to the field.
 *
 * Honest calibration note: shape-resonance trades the parser's
 * precision for universality. The gate is deliberately high
 * (DEFAULT_THRESHOLD on the full composed flow, min across depths) —
 * it will miss subtle variants rather than spray false positives; the
 * teaching loop closes the recall gap over time.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.env.GOGGLES_LEARNING_ROOT || path.join(__dirname, '..', '..');
const LIB_PATH = path.join(ROOT, '.remembrance', 'defect-signatures.json');

// The signature width is the CANONICAL depth, asked for rather than
// written down. It was the literal 5 (145-D) — correct when five layers
// existed, stale from the moment L6-content, L7-dimensional and
// L8-dynamical activated. The channel that is supposed to teach itself
// was signing and matching on 145 of 232 dimensions, blind to exactly
// the layers that separate one shape from a shape that merely looks
// like it.
// DEFECT_RESONANCE_DEPTH overrides the width. It exists for one caller —
// scripts/calibrate-defect-resonance.js, which has to read the channel at
// several widths to find where (if anywhere) it separates defects from
// working code. Nothing in normal operation sets it; the canonical depth
// is the answer everywhere else.
function encodeDepth() {
  const forced = parseInt(process.env.DEFECT_RESONANCE_DEPTH || '', 10);
  if (Number.isFinite(forced) && forced > 0) return forced;
  try { return require('../core/decoder-stack').currentDepth(); }
  catch (_) { return 5; }
}

// Recalibrated 2026-08 by scripts/calibrate-defect-resonance.js, run at
// the canonical width over 1,510 blocks of real ecosystem source.
//
// THE HONEST RESULT: the two distributions do not separate. Working code
// reads HIGHER than genuine defect variants do —
//
//     max clean   0.9486   src/core/fractal-index.js:52 (_compose, a
//                          correctly-bounded double loop, read as
//                          "off-by-one-length")
//     min defect  0.7703   an off-by-one rewritten far enough from the seed
//
// — an inverted gap of -0.178. There is no threshold that avoids both
// false positives and misses, at ANY depth: the calibration was swept at
// 4, 5, 6, 7 and 8 and returned the same edges every time, because
// min(...flow) lands on the 29/58/87-D checkpoints in 95% of readings.
// Widening the encoder does not widen this gate.
//
// At the previous 0.91 the channel was firing HIGH on live core code:
// fractal-index.js:52, blockchain-ingest.js:77 and feedback.js:60 all
// tripped it, the last two on template strings containing no SQL at all.
//
// So the number is set by the module's own stated policy — miss subtle
// variants rather than spray false positives, and close recall through
// teach(), not through the threshold. 0.955 sits 0.0064 above the
// measured clean edge.
//
// PUBLISHED RECALL COST: 2 of 7 close variants still caught. The five
// missed are eval-of-input (js) 0.8783, sql-by-concat (js) 0.8938,
// off-by-one-length (js) 0.7703, swallowed-error (js) 0.9401 and
// swallowed-error (py) 0.9319. This channel is a WIDE NET WITH A HIGH
// BAR, not a detector — the AST checkers remain the precision path on
// JS/TS, and this one earns its keep only where no parser reaches.
const DEFAULT_THRESHOLD = 0.955;     // min-depth flow floor for a finding
const MIN_BLOCK_CHARS = 40;          // blocks smaller than this aren't read
const MAX_BLOCK_LINES = 48;          // split larger blocks

let _encode;
function encoder() {
  if (_encode !== undefined) return _encode;
  try { _encode = require('../core/decoder-stack').composedAtDepth; }
  catch (_) { _encode = null; }
  return _encode;
}

// ── Seeds — classic defect shapes, multi-language ───────────────────
// Each seed is a short, realistic offending block. The encoder reads
// structure + vocabulary, so per-language variants are provided where
// the surface form differs enough to matter.
const SEEDS = [
  {
    label: 'eval-of-input', bugClass: 'security', language: 'javascript',
    code: `function handle(req, res) {\n  const expr = req.body.expression;\n  const result = eval(expr);\n  res.json({ result });\n}`,
  },
  {
    label: 'eval-of-input', bugClass: 'security', language: 'python',
    code: `def handle(request):\n    expr = request.form["expression"]\n    result = eval(expr)\n    return jsonify(result=result)`,
  },
  {
    label: 'sql-by-concat', bugClass: 'security', language: 'javascript',
    code: `function getUser(db, userId) {\n  const q = "SELECT * FROM users WHERE id = " + userId;\n  return db.exec(q);\n}`,
  },
  {
    label: 'sql-by-concat', bugClass: 'security', language: 'python',
    code: `def get_user(cur, user_id):\n    q = "SELECT * FROM users WHERE id = " + str(user_id)\n    cur.execute(q)\n    return cur.fetchone()`,
  },
  {
    label: 'sql-by-concat', bugClass: 'security', language: 'rust',
    code: `fn get_user(conn: &Connection, user_id: &str) -> Result<Row> {\n    let q = format!("SELECT * FROM users WHERE id = {}", user_id);\n    conn.execute(&q, [])\n}`,
  },
  {
    label: 'off-by-one-length', bugClass: 'logic', language: 'javascript',
    code: `function sum(arr) {\n  let total = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}`,
  },
  {
    label: 'swallowed-error', bugClass: 'error-handling', language: 'javascript',
    code: `async function save(data) {\n  try {\n    await db.write(data);\n  } catch (e) {\n  }\n  return true;\n}`,
  },
  {
    label: 'swallowed-error', bugClass: 'error-handling', language: 'python',
    code: `def save(data):\n    try:\n        db.write(data)\n    except Exception:\n        pass\n    return True`,
  },
  // ── Common defect shapes, added 2026-08 ────────────────────────────
  // Each was validated by scripts/validate-defect-seeds.js: it must fire on
  // its own shape AND stay silent on the clean ODD-half of the ecosystem
  // corpus (the EVEN half is where working-code refs are taught, so nothing
  // is judged against its own source). A candidate that fired on clean code
  // was dropped, not softened — the shape channel's whole worth is that a
  // hit means something. Universal concepts carry per-language variants so
  // cross-language transfer stays on; a shape whose MEANING is one
  // language's construct is languageBound, like unwrap-chain below.
  {
    label: 'command-injection', bugClass: 'security', language: 'javascript',
    code: `function ping(req, res) {\n  const host = req.query.host;\n  const out = child_process.execSync('ping -c 1 ' + host);\n  res.send(out.toString());\n}`,
  },
  {
    label: 'command-injection', bugClass: 'security', language: 'python',
    code: `def ping(request):\n    host = request.args.get("host")\n    out = os.system("ping -c 1 " + host)\n    return str(out)`,
  },
  {
    label: 'path-traversal', bugClass: 'security', language: 'javascript',
    code: `function serve(req, res) {\n  const name = req.query.file;\n  const body = fs.readFileSync(baseDir + '/' + name);\n  res.send(body);\n}`,
  },
  {
    label: 'path-traversal', bugClass: 'security', language: 'python',
    code: `def serve(request):\n    name = request.args.get("file")\n    with open(base_dir + "/" + name) as f:\n        return f.read()`,
  },
  {
    label: 'insecure-deserialization', bugClass: 'security', language: 'python',
    code: `def load(request):\n    raw = request.get_data()\n    obj = pickle.loads(raw)\n    return handle(obj)`,
  },
  // REJECTED by validate-defect-seeds.js, kept here as a record so nobody
  // re-adds them from intuition:
  //
  //   unchecked-parse-deref (js)   — recognised its own shape at 0.981 but
  //     fired on src/core/seal-registry.js:30 at 0.968. "Parse then reach
  //     two levels in" is the shape of most config readers, working or not.
  //   assignment-in-condition (js) — self 0.925, fired on FOUR clean blocks
  //     (auto-tagger.js:36 and :91, preflight.js:105). A single `=` vs `==`
  //     is one character; at block granularity the surrounding form
  //     dominates and the typo is invisible.
  //
  // Both are real bug classes. Neither is separable BY SHAPE at this
  // granularity, and the AST checkers already catch them precisely on
  // JS/TS. Softening the threshold to admit them would have bought their
  // recall with everyone else's precision.
  {
    label: 'race-check-then-act', bugClass: 'concurrency', language: 'javascript',
    code: `async function get(key) {\n  if (!cache[key]) {\n    cache[key] = await loadFromDb(key);\n  }\n  return cache[key];\n}`,
  },
  {
    // languageBound: the mutable default argument is a Python-EVALUATION
    // semantic (the default list is created once at def time and shared
    // across calls). The FORM — a parameter with a literal default, mutated
    // in the body — is ordinary everywhere else, so this must not speak
    // outside Python.
    label: 'mutable-default-arg', bugClass: 'logic', language: 'python', languageBound: true,
    code: `def collect(item, acc=[]):\n    acc.append(item)\n    return acc`,
  },
  {
    // languageBound: bare \`except:\` swallowing BaseException (including
    // KeyboardInterrupt/SystemExit) is a Python construct. swallowed-error
    // above already carries the universal "catch and drop" concept; this is
    // the sharper Python-only shape.
    label: 'bare-except-broad', bugClass: 'error-handling', language: 'python', languageBound: true,
    code: `def run(step):\n    try:\n        return step()\n    except:\n        return None`,
  },
  {
    // languageBound: reading a file with no \`with\`/close is a leak whose
    // FIX is Python's context manager. The bare open/read/return form is
    // idiomatic in languages with GC-closed handles, so it is not a defect
    // everywhere.
    label: 'unclosed-file', bugClass: 'resource', language: 'python', languageBound: true,
    code: `def read_all(path):\n    f = open(path)\n    data = f.read()\n    return data`,
  },
  {
    // languageBound: `.unwrap()` panicking on None/Err is a Rust CONSTRUCT,
    // not a universal concept. Its FORM — a short chain of method calls whose
    // results are used unchecked — is most of JavaScript, so this seed matched
    // `this.status(x); this.type('txt'); return this.send(body)` in express at
    // min-depth 0.926-0.936 and reported it HIGH. Three such findings across
    // two express files, every one a false positive.
    //
    // Contrast eval-of-input and sql-by-concat, which carry per-language
    // variants: those name concepts that exist everywhere. Cross-language
    // transfer through form is this channel's design and stays on; a seed
    // whose MEANING is bound to one language must not claim a defect outside
    // it.
    label: 'unwrap-chain-panic', bugClass: 'error-handling', language: 'rust', languageBound: true,
    code: `fn read_config(path: &str) -> Config {\n    let text = std::fs::read_to_string(path).unwrap();\n    let cfg: Config = serde_json::from_str(&text).unwrap();\n    cfg\n}`,
  },
];

// ── Library persistence ─────────────────────────────────────────────

function _load() {
  try { return JSON.parse(fs.readFileSync(LIB_PATH, 'utf8')); } catch (_) { return null; }
}

function _save(lib) {
  try {
    fs.mkdirSync(path.dirname(LIB_PATH), { recursive: true });
    fs.writeFileSync(LIB_PATH, JSON.stringify(lib));
  } catch (_) { /* best-effort */ }
}

function _sigId(label, code) {
  return crypto.createHash('sha256').update(label + '\n' + code).digest('hex').slice(0, 12);
}

/**
 * Load the defect library, building it from seeds on first use.
 * @returns {{signatures: Array}|null} null when the encoder is absent.
 */
function ensureLibrary() {
  const enc = encoder();
  if (!enc) return null;
  const depth = encodeDepth();
  let lib = _load();
  if (lib && Array.isArray(lib.signatures) && lib.signatures.length) {
    // A stored library encoded at a different depth is not a degraded
    // version of this one — it is vectors in a different frame. Re-encode
    // rather than compare across widths, which flowCosines would do
    // silently by repeating the shorter vector's last checkpoint.
    if (lib.depth !== depth) return _reencode(lib, enc, depth);
    return lib;
  }

  // Blank-oracle inheritance: before seeding from scratch, try to pull
  // the collected remembrance from the chain. A fresh host (or one whose
  // learned state was wiped by a restart) inherits every taught shape
  // and every learned amplitude from everyone who came before it —
  // abundance as knowledge first. Best-effort: no chain → seed locally.
  try {
    const mem = require('./goggles-memory');
    const r = mem.restore({ merge: false });
    if (r && r.ok && r.signatureCount > 0) {
      const restored = _load();
      if (restored && restored.signatures && restored.signatures.length) return restored;
    }
  } catch (_) { /* no chain reachable — seed locally */ }

  lib = { version: 2, depth, signatures: [] };
  for (const s of SEEDS) {
    try {
      lib.signatures.push({
        id: _sigId(s.label, s.code),
        label: s.label,
        bugClass: s.bugClass,
        language: s.language,
        languageBound: s.languageBound === true,
        excerpt: s.code.slice(0, 200),
        code: s.code,
        vec: Array.from(enc(s.code, depth)),
        taughtBy: 'seed',
        hits: 0,
        resolved: 0,
      });
    } catch (_) { /* skip a seed the encoder rejects */ }
  }
  _save(lib);
  return lib;
}

/**
 * Re-encode every signature at `depth`, preserving what was TAUGHT.
 *
 * A depth change must not cost the library its learned shapes — that is
 * the whole asset. Signatures carry their full `code` from version 2 on,
 * so they re-encode exactly. Version-1 entries only kept a 200-char
 * `excerpt`; those re-encode from the excerpt and are marked
 * `reencodedFrom: 'excerpt'` so a partial shape is visible rather than
 * passing as whole. Hits and resolutions carry over untouched — the
 * amplitude a signature earned is not a function of the frame.
 */
function _reencode(lib, enc, depth) {
  // Seeded shapes have an authoritative source right here in SEEDS —
  // matched by the same id the seeding path computes — so they re-encode
  // from the real thing rather than from a 200-char excerpt of it.
  const seedById = new Map(SEEDS.map((s) => [_sigId(s.label, s.code), s.code]));
  const out = { version: 2, depth, signatures: [] };
  for (const s of lib.signatures || []) {
    const full = (typeof s.code === 'string' && s.code.length) ? s.code : seedById.get(s.id);
    const src = full || s.excerpt;
    if (!src) continue;
    try {
      out.signatures.push(Object.assign({}, s, {
        code: full || undefined,
        vec: Array.from(enc(src, depth)),
        // Only a TAUGHT signature from a version-1 library can land here:
        // its full block was never stored, so its shape is reconstructed
        // from the first 200 chars. Visible rather than passing as whole.
        reencodedFrom: full ? undefined : 'excerpt',
      }));
    } catch (_) { /* a signature the encoder now rejects is dropped, not kept stale */ }
  }
  _save(out);
  return out;
}

/**
 * Teach the library from a confirmed finding (e.g. an AST-checker HIGH
 * on JS/TS): the offending block's shape becomes a signature the
 * resonance channel can recognise in every language.
 *
 * @param {{label:string, bugClass:string, language:string, code:string}} finding
 * @returns {boolean} true when a new signature was stored
 */
function teach({ label, bugClass, language, code }) {
  const enc = encoder();
  if (!enc || !code || code.length < MIN_BLOCK_CHARS) return false;
  const lib = ensureLibrary();
  if (!lib) return false;
  const id = _sigId(label || bugClass || 'defect', code);
  if (lib.signatures.some((s) => s.id === id)) return false;
  try {
    lib.signatures.push({
      id,
      label: label || bugClass || 'defect',
      bugClass: bugClass || 'unknown',
      language: language || 'unknown',
      excerpt: code.slice(0, 200),
      code,
      vec: Array.from(enc(code, encodeDepth())),
      taughtBy: 'ast-finding',
      hits: 0,
      resolved: 0,
    });
    _save(lib);
    return true;
  } catch (_) { return false; }
}

// ── Detection ───────────────────────────────────────────────────────

// Depth-flow cosines — the CANONICAL sweep, not a local copy. This was a
// private `_flow` with `CHECK = [29,58,87,116,145]` and `Math.min(145, …)`
// baked in, which is the same shape of drift decoder-stack was written to
// end: one decoder, one cosine (ECOSYSTEM §7). A copy cannot follow the
// stack when a layer activates, and this one didn't.
function _flow(a, b) {
  return require('../core/decoder-stack').flowCosines(a, b);
}

/**
 * Split source into readable blocks: blank-line groups, merged up to
 * MAX_BLOCK_LINES, each tracking its 1-indexed line range.
 */
function _blocks(source) {
  const lines = source.split('\n');
  const out = [];
  let start = 0;
  let buf = [];
  const flush = (end) => {
    const text = buf.join('\n');
    if (text.trim().length >= MIN_BLOCK_CHARS) {
      out.push({ text, startLine: start + 1, endLine: end });
    }
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (buf.length === 0) start = i;
    buf.push(lines[i]);
    const blank = lines[i].trim() === '';
    if ((blank && buf.length > 4) || buf.length >= MAX_BLOCK_LINES) flush(i + 1);
  }
  flush(lines.length);
  return out;
}

/**
 * Scan source (any language) for blocks that resonate with known
 * defect shapes. Returns findings in the same shape the AST checkers
 * emit, so the learning loop and the goggles render them identically.
 *
 * @param {string} source
 * @param {object} [opts] — threshold?=0.93, language?
 * @returns {{findings: Array, scannedBlocks: number, librarySize: number}|null}
 */
function scan(source, opts = {}) {
  const enc = encoder();
  const lib = ensureLibrary();
  if (!enc || !lib || !lib.signatures.length) return null;
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  // The scanned file's language, normalised. Passed in by the goggles and
  // previously unused — the reason a Rust-only shape could fire on JS.
  const _L = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'javascript', tsx: 'javascript', typescript: 'javascript', py: 'python', rs: 'rust' };
  const lang = opts.language ? (_L[String(opts.language).toLowerCase()] || String(opts.language).toLowerCase()) : null;

  const findings = [];
  const blocks = _blocks(source);
  let dirty = false;
  for (const b of blocks) {
    let vec;
    // Trim boundary blank lines before encoding — they shift the
    // indentation/line histograms enough to drop a true match below
    // the gate (measured: an eval variant read 0.946 trimmed, missed
    // untrimmed).
    try { vec = enc(b.text.replace(/^\s*\n+|\n+\s*$/g, ''), encodeDepth()); } catch (_) { continue; }
    let best = null;
    for (const sig of lib.signatures) {
      // A language-bound signature only speaks about its own language. See the
      // unwrap-chain-panic seed: cross-language transfer through form is this
      // channel's purpose, but a shape whose meaning is a language construct
      // has nothing to say about a file that has no such construct.
      if (sig.languageBound && sig.language && lang && sig.language !== lang) continue;
      const flow = _flow(vec, sig.vec);
      const minDepth = Math.min(...flow);
      if (minDepth >= threshold && (!best || minDepth > best.minDepth)) {
        best = { sig, minDepth, flow, argmin: flow.indexOf(minDepth), d5: flow[flow.length - 1] };
      }
    }
    if (best && opts.dryRun) {
      // Calibration path: report what the block read without counting it
      // as a hit. Sweeping a threshold over real code would otherwise
      // inflate every signature's amplitude with measurements, and
      // amplitude is what the learning loop decays and reinforces on.
      findings.push({ minDepth: best.minDepth, label: best.sig.label,
        line: b.startLine, flow: best.flow, argmin: best.argmin,
        via: 'resonance:dry' });
    } else if (best) {
      best.sig.hits = (best.sig.hits || 0) + 1;
      dirty = true;
      findings.push({
        severity: 'high',
        bugClass: best.sig.bugClass,
        ruleId: 'resonance:' + best.sig.label,
        line: b.startLine,
        endLine: b.endLine,
        code: b.text.trim().split('\n')[0].slice(0, 80),
        reality: `block resonates with known defect shape "${best.sig.label}" `
          + `(min-depth ${best.minDepth.toFixed(3)}, taught by ${best.sig.taughtBy}`
          + (best.sig.language ? `, ${best.sig.language}` : '') + ')',
        suggestion: `compare with the known-bad form: ${best.sig.excerpt.split('\n')[0]}…`,
        via: 'resonance',
      });
    }
  }
  if (dirty && !opts.dryRun) _save(lib);

  // Every scan is a field observation: clean = coherent, findings = not.
  // A dry run is a measurement OF the instrument, not an observation
  // through it, so it stays out of the field.
  if (opts.dryRun) return { findings, scannedBlocks: blocks.length, librarySize: lib.signatures.length };
  try {
    const fc = require('../core/field-coupling');
    fc.contribute({
      cost: 1,
      coherence: findings.length ? 0.2 : 0.95,
      source: 'goggles:defect-resonance:' + (findings.length ? 'hit' : 'clean'),
    });
  } catch (_) { /* field optional */ }

  return { findings, scannedBlocks: blocks.length, librarySize: lib.signatures.length };
}

module.exports = {
  scan, teach, ensureLibrary, SEEDS, DEFAULT_THRESHOLD, LIB_PATH,
  // The channel's own block splitter, exported so experiments teach and
  // evaluate on the SAME units scan() reads — a different splitter would
  // silently measure different objects.
  blocksOf: _blocks,
};
