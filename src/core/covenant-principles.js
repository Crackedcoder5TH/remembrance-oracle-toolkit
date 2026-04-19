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

function stripNonExecutableContent(code) {
  let stripped = code;
  stripped = stripped.replace(/\/\/.*$/gm, '');
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Template literals: strip static body, preserve interpolation markers.
  // Put the interpolation FIRST so downstream regexes that expect
  // `${` right after a `=` (like innerHTML, SQL) still see it. If no
  // interpolations, fall back to empty template quotes to preserve
  // position for regexes that count syntactic structure.
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
