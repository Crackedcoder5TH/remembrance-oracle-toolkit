'use strict';

/**
 * lexical-waveform.js — L2 encoder, complement to the structural L1.
 *
 * The 29-D structural fractal (toFractalWaveform) captures shape:
 * counts and densities of constructs, depth, structurality. It
 * deliberately collapses lexical detail to robust structural signal.
 *
 * This L2 encoder picks up what L1 missed by design:
 *   - Specific naming conventions (snake/camel/pascal/upper)
 *   - Token diversity (vocabulary entropy)
 *   - Identifier length characteristics
 *   - Formatting style (indent, line length, whitespace)
 *   - Stylistic markers (arrow vs function keyword, const vs let,
 *     async density, ternary density)
 *   - Content character (string/number/template literal densities)
 *   - Code-vs-test-vs-prose markers
 *
 * Architecturally per the user's framing:
 *   "we don't change the original whatsoever we use another encoder
 *    on top that picks up what the first missed — that's what i
 *    mean by fractal"
 *
 * L1 and L2 are concatenated by the composer (toComposedWaveform)
 * to produce a 58-D signature that resolves nuance L1 alone misses
 * without disturbing L1's structurality gate.
 *
 * Output: 29-D Float64Array, values bounded in [0, 1].
 * Deterministic. Pure function. No external dependencies.
 */

const LEXICAL_DIM = 29;

// ── Tokenization ────────────────────────────────────────────────
const _ID_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const _STR_RE = /(['"`])(?:\\.|[^\\])*?\1/g;
const _NUM_RE = /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
const _ARROW_RE = /=>/g;
const _FN_KW_RE = /\bfunction\b/g;
const _CONST_RE = /\bconst\b/g;
const _LET_VAR_RE = /\b(?:let|var)\b/g;
const _ASYNC_RE = /\b(?:async|await)\b/g;
const _TERNARY_RE = /\?[^?]*?:/g;
const _IMPORT_RE = /^(?:import|from|require)\b/gm;
const _COMMENT_LINE_RE = /^\s*(?:\/\/|#)/gm;
const _DOC_BLOCK_RE = /\/\*[\s\S]*?\*\//g;
const _TEMPLATE_RE = /`[^`]*`/g;
const _TEST_KW_RE = /\b(?:test|describe|it|expect|beforeEach|afterEach|beforeAll|afterAll)\b/g;
const _CONSOLE_RE = /\bconsole\.(?:log|warn|error|info|debug)\b/g;

function _identifiers(text) {
  const out = [];
  let m;
  _ID_RE.lastIndex = 0;
  while ((m = _ID_RE.exec(text)) !== null) out.push(m[0]);
  return out;
}

function _shannon(counts, total) {
  if (total === 0) return 0;
  let h = 0;
  for (const n of counts.values()) {
    if (n === 0) continue;
    const p = n / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function _clip(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function _ratio(num, denom) {
  return denom > 0 ? num / denom : 0;
}

// ── Encoder ─────────────────────────────────────────────────────

function toLexicalWaveform(text) {
  const out = new Float64Array(LEXICAL_DIM);
  if (typeof text !== 'string' || text.length === 0) return out;

  const ids = _identifiers(text);
  const totalIds = ids.length;
  const lines = text.split('\n');
  const totalLines = lines.length;
  const totalChars = text.length;

  // ── Naming conventions (dims 0..3) ───────────────────────────
  let snake = 0, camel = 0, pascal = 0, upper = 0;
  let idLenSum = 0, idLenSqSum = 0;
  const idFreq = new Map();
  for (const id of ids) {
    idLenSum += id.length;
    idLenSqSum += id.length * id.length;
    idFreq.set(id, (idFreq.get(id) || 0) + 1);

    if (/^[A-Z_][A-Z0-9_]*$/.test(id) && id.length > 1) upper++;
    else if (/^[A-Z][A-Za-z0-9]*$/.test(id)) pascal++;
    else if (id.includes('_') && /^[a-z]/.test(id)) snake++;
    else if (/[a-z][A-Z]/.test(id)) camel++;
  }
  out[0] = _clip(_ratio(snake, totalIds));
  out[1] = _clip(_ratio(camel, totalIds));
  out[2] = _clip(_ratio(pascal, totalIds));
  out[3] = _clip(_ratio(upper, totalIds));

  // ── Vocabulary character (dims 4..7) ─────────────────────────
  const meanIdLen = totalIds > 0 ? idLenSum / totalIds : 0;
  const varIdLen = totalIds > 0 ? idLenSqSum / totalIds - meanIdLen * meanIdLen : 0;
  const uniqueRatio = totalIds > 0 ? idFreq.size / totalIds : 0;
  const entropy = _shannon(idFreq, totalIds);
  out[4] = _clip(meanIdLen / 20);             // normalize to typical 0-20 range
  out[5] = _clip(Math.sqrt(Math.max(0, varIdLen)) / 10);
  out[6] = _clip(uniqueRatio);
  out[7] = _clip(entropy / 8);                // entropy normalized to ~0-1 range

  // ── Formatting (dims 8..12) ──────────────────────────────────
  let blankLines = 0, commentLines = 0;
  let lineLenSum = 0, lineLenSqSum = 0;
  let indentSum = 0, indentLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) blankLines++;
    if (/^\s*(?:\/\/|#)/.test(line)) commentLines++;
    lineLenSum += line.length;
    lineLenSqSum += line.length * line.length;
    const indent = line.match(/^[ \t]*/)[0];
    if (trimmed.length > 0) {
      indentSum += indent.replace(/\t/g, '    ').length;
      indentLines++;
    }
  }
  const meanLineLen = totalLines > 0 ? lineLenSum / totalLines : 0;
  const varLineLen = totalLines > 0 ? lineLenSqSum / totalLines - meanLineLen * meanLineLen : 0;
  out[8] = _clip(_ratio(blankLines, totalLines));
  out[9] = _clip(_ratio(commentLines, totalLines));
  out[10] = _clip(meanLineLen / 80);
  out[11] = _clip(Math.sqrt(Math.max(0, varLineLen)) / 80);
  out[12] = _clip(indentLines > 0 ? (indentSum / indentLines) / 16 : 0);

  // ── Stylistic markers (dims 13..18) ──────────────────────────
  const arrowCount = (text.match(_ARROW_RE) || []).length;
  const fnKwCount = (text.match(_FN_KW_RE) || []).length;
  const constCount = (text.match(_CONST_RE) || []).length;
  const letVarCount = (text.match(_LET_VAR_RE) || []).length;
  const asyncCount = (text.match(_ASYNC_RE) || []).length;
  const ternaryCount = (text.match(_TERNARY_RE) || []).length;
  const importCount = (text.match(_IMPORT_RE) || []).length;

  out[13] = _clip(_ratio(arrowCount, arrowCount + fnKwCount));
  out[14] = _clip(_ratio(constCount, constCount + letVarCount));
  out[15] = _clip(asyncCount / Math.max(1, totalLines / 100));   // per 100 lines
  out[16] = _clip(ternaryCount / Math.max(1, totalLines / 100));
  out[17] = _clip(_ratio(importCount, totalLines));
  // Semicolon-at-EOL fraction — distinguishes ASI-style from explicit
  let semiEolLines = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && /;[ \t]*(?:\/\/.*)?$/.test(t)) semiEolLines++;
  }
  out[18] = _clip(_ratio(semiEolLines, totalLines));

  // ── Content character (dims 19..23) ──────────────────────────
  const strings = text.match(_STR_RE) || [];
  const numbers = text.match(_NUM_RE) || [];
  const templates = text.match(_TEMPLATE_RE) || [];
  const docBlocks = text.match(_DOC_BLOCK_RE) || [];

  const totalStrChars = strings.reduce((s, t) => s + t.length, 0);
  const meanStrLen = strings.length > 0 ? totalStrChars / strings.length : 0;
  const magicNums = numbers.filter(n => {
    const v = parseFloat(n);
    return Math.abs(v) > 2 && v !== 10 && v !== 100 && v !== 1000;
  }).length;

  out[19] = _clip(_ratio(totalStrChars, totalChars));
  out[20] = _clip(_ratio(numbers.length, totalLines));   // per line
  out[21] = _clip(_ratio(templates.length, totalLines));
  out[22] = _clip(meanStrLen / 50);
  out[23] = _clip(_ratio(magicNums, numbers.length));

  // ── Content type markers (dims 24..28) ───────────────────────
  const testKw = (text.match(_TEST_KW_RE) || []).length;
  const consoleKw = (text.match(_CONSOLE_RE) || []).length;
  const docBlockChars = docBlocks.reduce((s, t) => s + t.length, 0);

  out[24] = _clip(testKw / Math.max(1, totalLines / 50));   // per 50 lines
  out[25] = _clip(consoleKw / Math.max(1, totalLines / 50));
  out[26] = _clip(_ratio(docBlockChars, totalChars));
  // JSON-ish density: count of `key:` patterns vs total
  const jsonKey = (text.match(/[\"\']\w+[\"\']\s*:/g) || []).length;
  out[27] = _clip(jsonKey / Math.max(1, totalLines));
  // Shebang/prelude marker (binary)
  out[28] = lines[0] && lines[0].startsWith('#!') ? 1 : 0;

  return out;
}

/**
 * Cosine between two patterns at the L2 lexical layer.
 */
function lexicalCoherency(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function lexicalCoherencyOf(textA, textB) {
  return lexicalCoherency(toLexicalWaveform(textA), toLexicalWaveform(textB));
}

/**
 * Diagnostic — return the 29-D vector with dim names.
 */
function inspectLexicalWaveform(text) {
  const v = toLexicalWaveform(text);
  return {
    naming: {
      snake_case: v[0], camel_case: v[1], pascal_case: v[2], upper_case: v[3],
    },
    vocabulary: {
      mean_id_length: v[4], id_length_std: v[5], unique_ratio: v[6], entropy: v[7],
    },
    formatting: {
      blank_lines: v[8], comment_lines: v[9], mean_line_len: v[10],
      line_len_std: v[11], indent_depth: v[12],
    },
    style: {
      arrow_fraction: v[13], const_fraction: v[14], async_density: v[15],
      ternary_density: v[16], import_density: v[17], semi_eol: v[18],
    },
    content: {
      string_chars: v[19], numbers: v[20], templates: v[21],
      mean_str_len: v[22], magic_num_fraction: v[23],
    },
    markers: {
      test_density: v[24], console_density: v[25], doc_block: v[26],
      jsonish: v[27], shebang: v[28],
    },
  };
}

module.exports = {
  LEXICAL_DIM,
  toLexicalWaveform,
  lexicalCoherency,
  lexicalCoherencyOf,
  inspectLexicalWaveform,
};
