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
  const branches = norm(_countAny(code, [/\bif\s*[\(:]/g, /\belse\b/g, /\bswitch\s*\(/g, /\bmatch\s+/g, /\?\s*[^:]+\s*:/g]));
  const loops = norm(_countAny(code, [/\bfor\s*[\(:]/g, /\bwhile\s*[\(:]/g, /\.forEach\b/g, /\.map\b/g, /\bloop\s*\{/g]));
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

function _structurality(code) {
  if (!code || code.length < 4) return 0;
  const STRUCT = /[{};]|\b(?:function|const|let|var|class|if|else|for|while|return|throw|try|catch|async|await|def|fn|impl|pub|struct|enum|match|use|func|package|interface|import|require)\b/g;
  const matches = code.match(STRUCT) || [];
  return Math.min(1, matches.length / Math.max(1, code.length / 50));
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

module.exports = {
  FRACTAL_DIM,
  toFractalWaveform,
  inspectFractalWaveform,
  fractalCoherency,
  fractalCoherencyOf,
};
