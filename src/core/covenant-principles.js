/**
 * Covenant Principles — the 15 laws of the oracle.
 * Plus preprocessing to strip non-executable content before scanning.
 */

const COVENANT_PRINCIPLES = [
  { id: 1, name: 'I AM', seal: 'Purpose must be declared, not hidden.' },
  { id: 2, name: 'The Eternal Spiral', seal: 'Recursion must terminate. No infinite harm loops.' },
  { id: 3, name: 'Ultimate Good', seal: 'No harm allowed. Only the healed path survives.' },
  { id: 4, name: 'Memory of the Deep', seal: 'Stored data must remain whole and uncorrupted.' },
  { id: 5, name: 'The Loom', seal: 'Concurrency must strengthen, not exploit.' },
  { id: 6, name: 'The Flame', seal: 'Processing must serve, not destroy resources.' },
  { id: 7, name: 'Voice of the Still Small', seal: 'No social engineering or phishing.' },
  { id: 8, name: 'The Watchman\'s Wall', seal: 'Security boundaries must be respected.' },
  { id: 9, name: 'Seed and Harvest', seal: 'No amplification attacks.' },
  { id: 10, name: 'The Table of Nations', seal: 'No unauthorized access to external systems.' },
  { id: 11, name: 'The Living Water', seal: 'Data must flow clean. No injection attacks.' },
  { id: 12, name: 'The Cornerstone', seal: 'No supply chain attacks or dependency confusion.' },
  { id: 13, name: 'The Sabbath Rest', seal: 'No denial of service patterns.' },
  { id: 14, name: 'The Mantle of Elijah', seal: 'No trojans, backdoors, or hidden payloads.' },
  { id: 15, name: 'The New Song', seal: 'Creation, not destruction. Build up, not tear down.' },
];

/**
 * Strip non-executable content (comments, string/regex literal bodies) from code
 * before harm pattern scanning. Prevents false positives from keywords appearing
 * in comments, string definitions, or regex pattern bodies.
 *
 * Template literals are a special case: we strip the static text between
 * interpolations but PRESERVE the `${...}` markers so downstream rules that
 * detect unsafe interpolation (SQL injection, innerHTML XSS, command injection)
 * can still see them. Earlier versions of this function collapsed `${x}` to
 * bare `x`, which silently broke every regex that looked for `${`.
 */
//
// stripComments — strip ONLY line and block comments, preserving
// string/regex/template literal contents. Used by rawOnly covenant
// rules that need to see string literal contents (SQL keywords inside
// queries, passwords in env assignments, base64 blobs) but still want
// comment false-positives filtered out.
//
// Must respect string boundaries: a naive regex that matches `//.*$`
// would strip the `//` inside `"http://example.com"` and break URLs
// inside strings. This is a tiny tokenizer that tracks string state
// so line and block comment markers only match at code level.
//
// (This is deliberately a line-comment doc block instead of a
// JSDoc `/** ... */` — the doc describes block-comment markers, and
// putting the literal block-comment end sequence inside a JSDoc block
// closes the JSDoc block prematurely. Bit me once; never again.)
//
// Without this intermediate strip level, a docstring that describes a
// rule (e.g. 'do not write "SELECT * " + userInput') triggers the rule
// it documents. See the covenant-mismatch regression in
// tests/covenant.test.js.
function stripComments(code) {
  const toks = _tokensOf(code);
  if (!toks) return _stripCommentsLegacy(code);
  const chars = code.split('');
  for (const t of toks) {
    if (t.type === 'comment') _blankSpan(chars, t.start, t.end);
  }
  return chars.join('');
}

function _stripCommentsLegacy(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    // Line comment — skip to end of line
    if (ch === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    // Block comment — skip until */
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      if (i < n) i += 2;
      continue;
    }
    // String literal (single, double, or template) — preserve as-is
    // but track state so `//` and `/*` inside strings don't match.
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        if (code[i] === '\\') {
          out += code[i];
          if (i + 1 < n) out += code[i + 1];
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          out += quote;
          i++;
          break;
        }
        out += code[i];
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// ── Tokenizer-backed stripping (2026-08-08 upgrade, operator-approved) ──
// The regex/hand-tokenizer strips above and below are BLIND to regex
// literals: a quote or backtick inside /['\"]/ opened a phantom string and
// everything after scanned wrong — a comment demonstrating a vulnerability
// could flag (catch #6), a URL's // could vanish mid-string. The audit
// parser's tokenizer does true regex-vs-division disambiguation, so the
// covenant now reads code the way the engine does. Spans are BLANKED, not
// deleted — line numbers survive for findings. The legacy implementations
// remain as the fallback when tokenize throws (non-JS submissions keep
// their historical behavior exactly).
function _tokensOf(code) {
  try { return require('../audit/parser').tokenize(code); }
  catch (_) { return null; }
}
function _blankSpan(chars, start, end) {
  for (let i = start; i <= end && i < chars.length; i++) {
    if (chars[i] !== '\n') chars[i] = ' ';
  }
}
// Collapse a template token to its ${expr} pieces, interpolation FIRST —
// the documented contract downstream rules depend on (innerHTML/SQL rules
// expect `${` right after `=`). Padded with spaces and trailing newlines
// so total length and the line count after the token are preserved.
function _collapseTemplate(chars, tok) {
  const start = tok.start;
  const end = Math.min(tok.end, chars.length - 1);
  const raw = chars.slice(start, end + 1).join('');
  const pieces = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      let j = i + 1, depth = 0;
      for (; j < raw.length; j++) {
        if (raw[j] === '{') depth++;
        else if (raw[j] === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      pieces.push(raw.slice(i, j));
      i = j;
    } else i++;
  }
  const core = pieces.length ? pieces.join('') : '``';
  const nl = (raw.match(/\n/g) || []).length - (core.match(/\n/g) || []).length;
  const pad = Math.max(0, raw.length - core.length - Math.max(0, nl));
  const repl = core + ' '.repeat(pad) + '\n'.repeat(Math.max(0, nl));
  for (let k = 0; k <= end - start; k++) chars[start + k] = repl[k] !== undefined ? repl[k] : ' ';
}

function stripNonExecutableContent(code) {
  const toks = _tokensOf(code);
  if (!toks) return _stripNonExecutableLegacy(code);
  const chars = code.split('');
  for (const t of toks) {
    if (t.type === 'comment') _blankSpan(chars, t.start, t.end);
    else if (t.type === 'string') _blankSpan(chars, t.start + 1, t.end - 1);
    else if (t.type === 'template') _collapseTemplate(chars, t);
    // regex literals stay — they are executable content
  }
  return chars.join('');
}

function _stripNonExecutableLegacy(code) {
  let stripped = code;
  stripped = stripped.replace(/\/\/.*$/gm, '');
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Template literals: strip static body, preserve interpolation markers.
  stripped = stripped.replace(/`(?:[^`\\]|\\.)*`/g, (match) => {
    const pieces = [];
    match.replace(/\$\{([^}]*)\}/g, (_, expr) => { pieces.push('${' + expr + '}'); });
    if (pieces.length === 0) return '``';
    return pieces.join('');
  });
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return stripped;
}

module.exports = { COVENANT_PRINCIPLES, stripNonExecutableContent, stripComments };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
stripComments.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
stripNonExecutableContent.atomicProperties = { charge: -1, valence: 0, mass: "heavy", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 3, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };
