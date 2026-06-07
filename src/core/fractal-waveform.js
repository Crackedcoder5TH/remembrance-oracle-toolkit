'use strict';

/**
 * fractal-waveform.js — oracle's structural encoder.
 *
 * Canonical mirror of packages/field-tool/src/fractal-waveform.js. They
 * implement the same algorithm and produce byte-identical vectors for
 * the same input; the spec is docs/FRACTAL_WAVEFORM_SPEC.md. Keep these
 * two files in sync; the spec is the source of truth.
 *
 * Why two copies: the field-tool package is published standalone, so it
 * cannot reach into the oracle's tree; the oracle cannot pull from the
 * package's internals either. The duplication is intentional — two
 * trusted reference implementations of the same spec.
 *
 * Replaces the byte-stretch in src/core/code-to-waveform.js as the
 * canonical encoder. Byte-stretch remains available under explicit
 * `byte*` names for binary / non-text inputs.
 */

const FRACTAL_DIM = 29;

function _countAny(code, patterns) {
  let total = 0;
  for (const p of patterns) { const m = code.match(p); if (m) total += m.length; }
  return total;
}

function _atomicProps(code) {
  const expansions = _countAny(code, [
    /\bnew\s+\w/g, /\.push\b/g, /\.append\b/g, /\.extend\b/g, /\.concat\b/g,
    /\.map\b/g, /\.flatMap\b/g, /yield\s+/g,
  ]);
  const contractions = _countAny(code, [
    /\.filter\b/g, /\.reduce\b/g, /\.slice\b/g, /\.pop\b/g, /\.shift\b/g,
    /\bdel\b/g, /\bdelete\s/g, /\.trim\b/g, /\.strip\b/g,
  ]);
  const charge = expansions > contractions + 2 ? 1 : contractions > expansions + 2 ? -1 : 0;

  const imports = _countAny(code, [
    /\brequire\s*\(/g, /\bimport\s+[\w*{]/g, /\bfrom\s+\w[\w.]*\s+import/g,
    /\buse\s+\w[\w:]*/g, /^#include\s*[<"]/gm,
  ]);
  const valence = Math.min(8, imports);

  let maxDepth = 0, cur = 0;
  for (const ch of code) {
    if (ch === '{' || ch === '(' || ch === '[') cur++;
    else if (ch === '}' || ch === ')' || ch === ']') cur--;
    if (cur > maxDepth) maxDepth = cur;
  }
  const indentDepths = (code.match(/^( {4}|\t)+/gm) || []).map(s => s.length);
  const maxIndent = indentDepths.length ? Math.max(...indentDepths) / 4 : 0;
  const depth = Math.max(maxDepth, Math.floor(maxIndent));
  const lineCount = code.split('\n').length;
  const loops = _countAny(code, [/\bfor\s*[\(:]/g, /\bwhile\s*[\(:]/g, /\.forEach\b/g]);
  const mass = (lineCount < 20 && depth < 4 && loops <= 1) ? 'light'
             : (depth > 5 || loops > 3 || lineCount > 100) ? 'heavy' : 'medium';

  const sideEffects = _countAny(code, [
    /console\.\w/g, /\bprint\s*\(/g, /\bprintln!/g, /\bfmt\.Print/g,
    /\.write\b/g, /\.send\b/g, /\.emit\b/g, /\bthrow\s/g, /\braise\s/g,
    /Math\.random/g, /Date\.now/g, /time\.now/g,
  ]);
  const spin = sideEffects > 0 ? 'odd' : 'even';

  const cacheLike = _countAny(code, [/\bcache\b/gi, /\bmemo\b/gi, /WeakMap|WeakSet/g, /Map\(\)/g]);
  const lazy = _countAny(code, [/get\s+\w+\s*\(/g, /Object\.defineProperty/g, /=>.*=>/g]);
  const mutating = _countAny(code, [/\blet\s+/g, /\bvar\s+/g, /\+\+|\-\-/g, /\+=|\-=|\*=|\/=/g]);
  const phase = cacheLike > 0 ? 'solid' : lazy > 0 ? 'gas' : mutating > 2 ? 'liquid' : 'gas';

  const io = _countAny(code, [
    /fetch\b/g, /axios\b/g, /\.request\b/g, /child_process/g, /\bexec\s*\(/g,
    /\bspawn\s*\(/g, /\.listen\b/g, /\.on\s*\(/g, /fs\.\w/g, /readFile|writeFile/g,
    /stdin|stdout|stderr/g, /process\.env/g, /os\.environ/g, /open\s*\(/g,
  ]);
  const reactivity = io === 0 ? 'inert' : io <= 2 ? 'low' : io <= 5 ? 'medium' : 'high';

  const exportsCt = _countAny(code, [
    /\bexports\.\w/g, /\bmodule\.exports/g, /\bexport\s+/g, /\bpub\s+fn/g,
    /^def\s+\w/gm,
  ]);
  const electronegativity = (imports + exportsCt) === 0 ? 0 : imports / (imports + exportsCt);

  const group = 11;
  const period = lineCount <= 5 ? 1 : lineCount <= 15 ? 2 : lineCount <= 50 ? 3
               : lineCount <= 150 ? 4 : lineCount <= 500 ? 5 : lineCount <= 1500 ? 6 : 7;

  const dangerous = _countAny(code, [
    /\beval\s*\(/g, /\bexec\s*\(/g, /child_process/g, /rm\s+-rf/g,
    /DROP\s+TABLE/gi, /process\.exit/g, /process\.kill/g,
  ]);
  const harmPotential = dangerous > 0 ? 'dangerous' : io > 3 ? 'moderate' : io > 0 ? 'minimal' : 'none';

  const healing = _countAny(code, [/heal\b/gi, /repair\b/gi, /fix\b/gi, /improve\b/gi, /coherenc/gi, /align\b/gi, /validate\b/gi]);
  const degrading = _countAny(code, [/corrupt\b/gi, /break\b/gi, /destroy\b/gi, /pollut/gi, /leak\b/gi, /inject\b/gi]);
  const alignment = healing > degrading + 2 ? 'healing' : degrading > healing + 1 ? 'degrading' : 'neutral';

  const benevolent = _countAny(code, [/help\b/gi, /assist\b/gi, /protect\b/gi, /safe\b/gi, /sanitize\b/gi, /verify\b/gi]);
  const malevolent = _countAny(code, [/exploit\b/gi, /attack\b/gi, /bypass\b/gi, /escalat\b/gi, /payload\b/gi]);
  const intention = benevolent > malevolent + 1 ? 'benevolent' : malevolent > benevolent ? 'malevolent' : 'neutral';

  const taint = dangerous > 0 ? 'hot' : 'none';

  return { charge, valence, mass, spin, phase, reactivity, electronegativity,
           group, period, harmPotential, alignment, intention, taint };
}

const _MASS = { light: 0.25, medium: 0.5, heavy: 0.75 };
const _SPIN = { even: 0, odd: 1 };
const _PHASE = { solid: 0.2, liquid: 0.45, gas: 0.7, plasma: 0.95 };
const _REACT = { inert: 0, low: 0.33, medium: 0.67, high: 1 };
const _SAFETY = { none: 1, minimal: 0.75, moderate: 0.4, dangerous: 0 };
const _ALIGN = { healing: 1, neutral: 0.5, degrading: 0 };
const _INTENT = { benevolent: 1, neutral: 0.5, malevolent: 0 };

function _atomicDims(p) {
  return [
    (p.charge + 1) / 2,
    p.valence / 8,
    _MASS[p.mass] ?? 0.5,
    _SPIN[p.spin] ?? 0,
    _PHASE[p.phase] ?? 0.7,
    _REACT[p.reactivity] ?? 0,
    Math.max(0, Math.min(1, Number(p.electronegativity) || 0)),
    p.group / 18,
    p.period / 7,
    _SAFETY[p.harmPotential] ?? 1,
    _ALIGN[p.alignment] ?? 0.5,
    _INTENT[p.intention] ?? 0.5,
  ];
}

function _structuralDims(code) {
  if (!code) return new Array(16).fill(0);
  const lines = code.split('\n');
  const lineCount = Math.max(1, lines.length);

  const bins = [0, 0, 0, 0, 0];
  for (const ln of lines) {
    const m = ln.match(/^( {0,32}|\t{0,8})/);
    const lead = m ? m[0] : '';
    const tabs = (lead.match(/\t/g) || []).length;
    const spaces = lead.length - tabs;
    const depth = tabs + Math.floor(spaces / 2);
    if (depth >= 4) bins[4]++;
    else bins[depth]++;
  }
  const depthFrac = bins.map(b => b / lineCount);

  const KW = /\b(?:function|const|let|var|class|if|else|for|while|return|throw|try|catch|async|await|def|class|import|from|fn|let|mut|impl|pub|struct|enum|match|use|func|package|interface|public|private|protected)\b/g;
  const STR = /(['"`])(?:\\.|(?!\1).)*\1/g;
  const NUM = /\b\d+(?:\.\d+)?\b/g;
  const OP = /[=+\-*/%<>!&|^~?:]+/g;
  const IDENT = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;
  const total = code.length || 1;
  const kwFrac = (code.match(KW) || []).reduce((s, t) => s + t.length, 0) / total;
  const strFrac = (code.match(STR) || []).reduce((s, t) => s + t.length, 0) / total;
  const numFrac = (code.match(NUM) || []).reduce((s, t) => s + t.length, 0) / total;
  const opFrac = (code.match(OP) || []).reduce((s, t) => s + t.length, 0) / total;
  const identFrac = (code.match(IDENT) || []).reduce((s, t) => s + t.length, 0) / total;

  const norm = (n) => Math.min(1, n / lineCount * 10);
  // Branches & loops match BOTH the JS form (`if (...)`, `while (...)`) and
  // the Python form (`if not x:`, `for x in items:`) by also accepting
  // line-anchored keywords. The earlier `\bif\s*[\(:]` form missed Python
  // entirely because Python `if x:` has neither `(` nor `:` directly after
  // `if`. Line-anchoring avoids matching the English word "if" in prose.
  const branches = norm(_countAny(code, [
    /\bif\s*\(/g, /^[ \t]*if\b/gm, /^[ \t]*elif\b/gm, /\belse\b/g,
    /\bswitch\s*\(/g, /\bmatch\s+/g, /\?\s*[^:]+\s*:/g,
  ]));
  const loops = norm(_countAny(code, [
    /\bfor\s*\(/g, /^[ \t]*for\b/gm, /\bwhile\s*\(/g, /^[ \t]*while\b/gm,
    /\.forEach\b/g, /\.map\b/g, /\bloop\s*\{/g,
  ]));
  const functions = norm(_countAny(code, [/\bfunction\s+\w|\bfunction\s*\(/g, /=>/g, /\bdef\s+\w/g, /\bfn\s+\w/g, /\bfunc\s+\w/g]));
  const returns = norm(_countAny(code, [/\breturn\b/g, /\byield\b/g]));
  const errs = norm(_countAny(code, [/\btry\s*\{/g, /\bcatch\b/g, /\bthrow\b/g, /\braise\b/g, /\bexcept\b/g]));

  const commentChars = _countAny(code, [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /#[^\n]*/gm])
    + (code.match(/\/\/[^\n]*|#[^\n]*/g) || []).reduce((s, t) => s + t.length, 0);
  const commentFrac = Math.min(1, commentChars / total);

  return [
    ...depthFrac, kwFrac, identFrac, strFrac, numFrac, opFrac,
    branches, loops, functions, returns, errs, commentFrac,
  ];
}

// Density-based, with brace/semi tokens weighted heavily and keyword
// loanwords weighted lightly. Technical prose CAN say "function" or "for"
// without being code; it CANNOT contain `{`, `}`, or `;` outside quoted
// samples. Brace/semi density alone separates code from prose; keyword
// density acts as a secondary signal for brace-light languages.
//   structurality = clamp(braceDensity * 1.0 + keywordDensity * 0.25, 0, 1)
function _structurality(code) {
  if (!code || code.length < 4) return 0;
  const BRACES = /[{};]/g;
  const KEYWORDS = /\b(?:function|const|let|var|class|if|else|for|while|return|throw|try|catch|async|await|def|fn|impl|pub|struct|enum|match|use|func|package|interface|import|require)\b/g;
  const braceCount = (code.match(BRACES) || []).length;
  const kwCount = (code.match(KEYWORDS) || []).length;
  const windows = Math.max(1, code.length / 50);
  return Math.min(1, (braceCount / windows) + (kwCount / windows) * 0.25);
}

function toFractalWaveform(text, _opts = {}) {
  const out = new Float64Array(FRACTAL_DIM);
  if (typeof text !== 'string' || text.length === 0) return out;
  const p = _atomicProps(text);
  const adims = _atomicDims(p);
  const sdims = _structuralDims(text);
  const sig = _structurality(text);
  for (let i = 0; i < 12; i++) out[i] = adims[i];
  for (let i = 0; i < 16; i++) out[12 + i] = sdims[i];
  out[28] = sig;
  return out;
}

function inspectFractalWaveform(text, opts = {}) {
  const v = toFractalWaveform(text, opts);
  return {
    atomic: {
      charge: v[0], valence: v[1], mass: v[2], spin: v[3], phase: v[4],
      reactivity: v[5], electronegativity: v[6], group: v[7], period: v[8],
      safety: v[9], alignment: v[10], intention: v[11],
    },
    structural: {
      depth_l0: v[12], depth_l1: v[13], depth_l2: v[14], depth_l3: v[15], depth_l4plus: v[16],
      keywords: v[17], identifiers: v[18], strings: v[19], numbers: v[20], operators: v[21],
      branches: v[22], loops: v[23], functions: v[24], returns: v[25], errors: v[26],
      comments: v[27],
    },
    structurality: v[28],
  };
}

/** Cosine over the 29-D fractal vector, gated by structurality agreement.
 * Length-mismatch returns 0 — never silently compare across encoders. */
function fractalCoherency(a, b) {
  if (!a || !b) return 0;
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const da = Math.sqrt(na), db = Math.sqrt(nb);
  if (da < 1e-12 || db < 1e-12) return 0;
  const cos = dot / (da * db);
  const sa = a.length > 28 ? a[28] : 0;
  const sb = b.length > 28 ? b[28] : 0;
  const gate = 1 - Math.abs(sa - sb);
  return cos * gate;
}

function fractalCoherencyOf(textA, textB) {
  return fractalCoherency(toFractalWaveform(textA), toFractalWaveform(textB));
}

// ── Fractal recursion ────────────────────────────────────────────────
//
// The encoder applied to its own output. Same 29-D function at every
// level; each level resolves the structure of the previous level's
// vector. Mirrors the cascade architecture: when one layer's
// resolution is exhausted, recurse to the next zoom.
//
//   F^0(text) = toFractalWaveform(text)                    — 29-D shape
//   F^1(text) = F(stringify(F^0(text)))                    — shape of shape
//   F^k(text) = F^1 applied k times                        — structure at depth k
//
// Cost: linear in k (each level is one fractal encode of ~250-char
// JSON serialization). Resolution: compounds across levels because
// each level's input is itself a structured representation.
//
// Use case: hard-to-discriminate patterns where F^0 returns near-equal
// signatures for distinct inputs. F^k surfaces the fine-grained
// structural differences that F^0 collapses.

// Dim names track the encoder's atomic + structural dimensions.
// Used by _structuredFractalString to emit code-like tokens whose
// density mirrors each dim's value, so the next-level encoder reads
// structural variation rather than a flat number list.
const _DIM_NAMES = [
  'charge', 'valence', 'mass', 'spin', 'phase', 'reactivity', 'electronegativity',
  'group', 'period', 'safety', 'alignment', 'intention',
  'd0', 'd1', 'd2', 'd3', 'd4', 'keywords', 'identifiers', 'strings', 'numbers', 'operators',
  'branches', 'loops', 'functions', 'returns', 'errors', 'comments', 'structurality',
];

function _stringifyFractal(v) {
  // Emit code-like tokens whose density per-dim reflects each dim's
  // value. The naïve `JSON.stringify(v)` collapses — the encoder
  // counts `function`, `return`, branches, etc., which a flat number
  // list does not contain. This serialization emits those constructs
  // in counts proportional to the dim values, so the next recursion
  // discriminates rather than smooths.
  const parts = [];
  for (let i = 0; i < v.length; i++) {
    const val = Math.max(0, Math.min(1, Number(v[i]) || 0));
    const count = Math.round(val * 10);   // 0..10 emissions per dim
    if (count === 0) continue;
    const name = _DIM_NAMES[i] || ('d' + i);
    for (let j = 0; j < count; j++) {
      // Vary the emitted construct per index so the encoder reads
      // different dims via different circuits:
      //   keyword dims  → function declarations + returns
      //   branch dims   → if/else blocks
      //   loop dims     → for/while constructs
      //   error dims    → try/catch + throw
      //   side dims     → console.log / push
      const idxKind = i % 6;
      if (idxKind === 0) parts.push(`function ${name}_${j}() { return ${val.toFixed(3)}; }`);
      else if (idxKind === 1) parts.push(`const ${name}_${j} = require('./${name}');`);
      else if (idxKind === 2) parts.push(`if (${name} > ${val.toFixed(3)}) { return ${name}.push(${j}); }`);
      else if (idxKind === 3) parts.push(`for (let ${name}_${j} = 0; ${name}_${j} < ${count}; ${name}_${j}++) { ${name}.map(x => x + ${val.toFixed(3)}); }`);
      else if (idxKind === 4) parts.push(`try { throw new Error('${name}_${j}'); } catch (e) { console.log(e); }`);
      else                   parts.push(`class ${name}_${j} { constructor() { this.value = ${val.toFixed(3)}; } }`);
    }
  }
  return parts.join('\n');
}

/**
 * Encode `text` through `depth` recursive applications of
 * toFractalWaveform. depth=0 returns the standard fractal vector;
 * depth=k applies the encoder k+1 times total.
 *
 * @param {string} text
 * @param {number} [depth=0]   — recursion depth (0 = standard encoder)
 * @returns {Float64Array}     — 29-D vector at the requested depth
 */
function toFractalWaveformRecursive(text, depth = 0) {
  let v = toFractalWaveform(text);
  for (let i = 0; i < depth; i++) {
    v = toFractalWaveform(_stringifyFractal(v));
  }
  return v;
}

/**
 * Cosine between two patterns at fractal depth `depth`. Both inputs
 * encoded through the same number of recursions, then compared.
 */
function fractalCoherencyOfRecursive(textA, textB, depth = 0) {
  return fractalCoherency(
    toFractalWaveformRecursive(textA, depth),
    toFractalWaveformRecursive(textB, depth),
  );
}

/**
 * Encode through depths 0..maxDepth, returning the full ladder.
 * Useful for diagnostic queries where you want to see how a pattern's
 * signature evolves across recursion levels.
 *
 * Note: pure recursion of the encoder against its own output saturates
 * quickly because the encoder's 29-D output space projects re-encoded
 * inputs into a smaller subspace at each level. The honestly-useful
 * fractal property is `toFractalMultiScale` below.
 */
function toFractalLadder(text, maxDepth = 3) {
  const out = [];
  let v = toFractalWaveform(text);
  out.push(v);
  for (let i = 0; i < maxDepth; i++) {
    v = toFractalWaveform(_stringifyFractal(v));
    out.push(v);
  }
  return out;
}

// ── Multi-scale fractal encoding ─────────────────────────────────
//
// The structurally-honest "fractal" property of the encoder: apply it
// at different scales (chunk sizes) of the input, not recursively
// against its own output. Each scale captures nuance the others miss.
// Whole-text encoding sees overall shape; line-level sees local
// structure; token-level sees micro-grammar. Concatenated vectors
// preserve all scales' signatures.
//
// This is the fractal recursion the framework's "self-similar at every
// scale" principle implies: same function applied at multiple zooms of
// the same artifact, not the same function iterated against its own
// output.

/**
 * Encode `text` at multiple scales and concatenate into a single
 * vector. Default scales: `[whole, halves, quarters, lines]`. Each
 * scale contributes 29 dims, so default output is 4 * 29 = 116-D.
 *
 * @param {string} text
 * @param {object} [opts]
 *   scales?: ('whole'|'halves'|'quarters'|'lines'|'sentences')[]
 *            default ['whole', 'halves', 'quarters', 'lines']
 * @returns {Float64Array}     — 29 * scales.length dimensions
 */
function toFractalMultiScale(text, opts = {}) {
  const scales = opts.scales || ['whole', 'halves', 'quarters', 'lines'];
  const parts = [];
  for (const scale of scales) {
    parts.push(_encodeAtScale(text, scale));
  }
  const out = new Float64Array(parts.length * FRACTAL_DIM);
  for (let i = 0; i < parts.length; i++) {
    for (let j = 0; j < FRACTAL_DIM; j++) {
      out[i * FRACTAL_DIM + j] = parts[i][j];
    }
  }
  return out;
}

function _encodeAtScale(text, scale) {
  if (scale === 'whole') return toFractalWaveform(text);
  if (scale === 'halves') return _meanAcross(_chunks(text, 2));
  if (scale === 'quarters') return _meanAcross(_chunks(text, 4));
  if (scale === 'lines') return _meanAcross(text.split('\n').filter(s => s.trim().length > 0));
  if (scale === 'sentences') return _meanAcross(text.split(/[.!?]\s+/).filter(s => s.trim().length > 0));
  return toFractalWaveform(text);
}

function _chunks(text, n) {
  if (n <= 1) return [text];
  const size = Math.max(1, Math.ceil(text.length / n));
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = i * size;
    if (start >= text.length) break;
    out.push(text.slice(start, start + size));
  }
  return out;
}

function _meanAcross(chunks) {
  if (!chunks.length) return new Float64Array(FRACTAL_DIM);
  const vectors = chunks.map(c => toFractalWaveform(c));
  const out = new Float64Array(FRACTAL_DIM);
  for (const v of vectors) {
    for (let i = 0; i < FRACTAL_DIM; i++) out[i] += v[i];
  }
  for (let i = 0; i < FRACTAL_DIM; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Cosine between two patterns at the multi-scale fractal encoding.
 */
function fractalCoherencyMultiScale(textA, textB, opts) {
  const a = toFractalMultiScale(textA, opts);
  const b = toFractalMultiScale(textB, opts);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Composed L1 + L2 encoding ───────────────────────────────────
//
// Per the architectural principle: don't change the original encoder,
// add another one on top that picks up what the first missed.
//
// L1 (toFractalWaveform, this module) captures structural shape —
// atomic properties, depth, density of constructs.
// L2 (toLexicalWaveform, src/core/lexical-waveform.js) captures
// lexical character — naming conventions, vocabulary entropy,
// formatting, stylistic markers, content type.
//
// The composer concatenates them into a 58-D vector that resolves
// nuance L1 alone misses without disturbing L1's structurality gate.

let _toLexicalWaveform = null;
try {
  _toLexicalWaveform = require('./lexical-waveform').toLexicalWaveform;
} catch (_) { /* L2 unavailable — composed falls back to L1 only */ }

/**
 * Concatenate the L1 structural fractal (29-D) with the L2 lexical
 * fractal (29-D) into a single 58-D signature. If L2 is unreachable,
 * returns just the 29-D L1 vector.
 *
 * @param {string} text
 * @returns {Float64Array}    — 58-D when L2 available, 29-D otherwise
 */
function toComposedWaveform(text) {
  const l1 = toFractalWaveform(text);
  if (!_toLexicalWaveform) return l1;
  const l2 = _toLexicalWaveform(text);
  const out = new Float64Array(l1.length + l2.length);
  for (let i = 0; i < l1.length; i++) out[i] = l1[i];
  for (let i = 0; i < l2.length; i++) out[l1.length + i] = l2[i];
  return out;
}

/**
 * Cosine between two composed (L1 + L2) signatures.
 */
function composedCoherency(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function composedCoherencyOf(textA, textB) {
  return composedCoherency(toComposedWaveform(textA), toComposedWaveform(textB));
}

module.exports = {
  FRACTAL_DIM,
  toFractalWaveform,
  toFractalWaveformRecursive,
  toFractalLadder,
  toFractalMultiScale,
  toComposedWaveform,
  inspectFractalWaveform,
  fractalCoherency,
  fractalCoherencyOf,
  fractalCoherencyOfRecursive,
  fractalCoherencyMultiScale,
  composedCoherency,
  composedCoherencyOf,
};
