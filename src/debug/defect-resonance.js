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

const ENCODE_DEPTH = 5;              // full 145-D composed signature
// Calibrated 2026-07: max clean-block min-depth measured 0.887 across
// 264 blocks of real ecosystem code; close defect variants read
// 0.946-0.948. 0.91 leaves margin on both sides. Distant variants
// (measured: a restructured rust sql-concat at 0.647) are out of a
// single seed's reach — recall grows via teach(), not via threshold.
const DEFAULT_THRESHOLD = 0.91;      // min-depth flow floor for a finding
const MIN_BLOCK_CHARS = 40;          // blocks smaller than this aren't read
const MAX_BLOCK_LINES = 48;          // split larger blocks

let _encode;
function encoder() {
  if (_encode !== undefined) return _encode;
  try { _encode = require('../core/encoder-stack').composedAtDepth; }
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
  {
    label: 'unwrap-chain-panic', bugClass: 'error-handling', language: 'rust',
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
  let lib = _load();
  if (lib && Array.isArray(lib.signatures) && lib.signatures.length) return lib;
  lib = { version: 1, signatures: [] };
  for (const s of SEEDS) {
    try {
      lib.signatures.push({
        id: _sigId(s.label, s.code),
        label: s.label,
        bugClass: s.bugClass,
        language: s.language,
        excerpt: s.code.slice(0, 200),
        vec: Array.from(enc(s.code, ENCODE_DEPTH)),
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
      vec: Array.from(enc(code, ENCODE_DEPTH)),
      taughtBy: 'ast-finding',
      hits: 0,
      resolved: 0,
    });
    _save(lib);
    return true;
  } catch (_) { return false; }
}

// ── Detection ───────────────────────────────────────────────────────

// Depth-flow cosines at the five composed checkpoints (29/58/87/116/145).
function _flow(a, b) {
  const CHECK = [29, 58, 87, 116, 145];
  const out = [];
  let dot = 0, na = 0, nb = 0, c = 0;
  const n = Math.min(145, a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
    if (i + 1 === CHECK[c]) {
      out.push((na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0);
      c++;
    }
  }
  while (out.length < CHECK.length) out.push(out.length ? out[out.length - 1] : 0);
  return out;
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

  const findings = [];
  const blocks = _blocks(source);
  let dirty = false;
  for (const b of blocks) {
    let vec;
    // Trim boundary blank lines before encoding — they shift the
    // indentation/line histograms enough to drop a true match below
    // the gate (measured: an eval variant read 0.946 trimmed, missed
    // untrimmed).
    try { vec = enc(b.text.replace(/^\s*\n+|\n+\s*$/g, ''), ENCODE_DEPTH); } catch (_) { continue; }
    let best = null;
    for (const sig of lib.signatures) {
      const flow = _flow(vec, sig.vec);
      const minDepth = Math.min(...flow);
      if (minDepth >= threshold && (!best || minDepth > best.minDepth)) {
        best = { sig, minDepth, d5: flow[flow.length - 1] };
      }
    }
    if (best) {
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
  if (dirty) _save(lib);

  // Every scan is a field observation: clean = coherent, findings = not.
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

module.exports = { scan, teach, ensureLibrary, SEEDS, DEFAULT_THRESHOLD, LIB_PATH };
