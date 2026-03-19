/**
 * Semantic Consistency Checker
 *
 * Verifies that a pattern's name/description aligns with what the code actually does.
 * Uses keyword extraction and behavioral signature matching to detect mismatches
 * like a function named "sort" that actually performs HTTP requests.
 *
 * Returns a consistency score (0-1) and a list of flags.
 */

// Behavioral signatures: maps semantic categories to code patterns that indicate them
const BEHAVIOR_SIGNATURES = {
  sort: {
    keywords: ['sort', 'order', 'rank', 'arrange'],
    codePatterns: [/\.sort\s*\(/i, /compareTo|localeCompare|<=>/, /swap|partition|pivot|merge/i, /\b(a|b)\s*[<>-]\s*\b(a|b)\b/, /sorted|sort_by|order_by/i, /[<>]=?\s*pivot|pivot\s*[<>]=?|filter.*[<>]/i],
  },
  search: {
    keywords: ['search', 'find', 'lookup', 'locate', 'query'],
    codePatterns: [/\.find\s*\(|\.indexOf\s*\(|\.search\s*\(|\.includes\s*\(/i, /binary.?search|linear.?search/i, /\b(lo|hi|mid|left|right)\b.*\b(lo|hi|mid|left|right)\b/],
  },
  debounce: {
    keywords: ['debounce', 'throttle', 'rate.?limit', 'delay'],
    codePatterns: [/setTimeout|clearTimeout|setInterval|clearInterval/i, /timer|timeout|delay|wait/i, /\bms\b|\bmilliseconds?\b|\bduration\b/i],
  },
  hash: {
    keywords: ['hash', 'digest', 'checksum', 'fingerprint'],
    codePatterns: [/createHash|crypto|sha|md5|hmac/i, /hash.*update|\.digest\s*\(/i, /\b0x[0-9a-f]+\b/i, /\bxor\b|>>|<<|>>>/],
  },
  validate: {
    keywords: ['validate', 'verify', 'check', 'assert', 'ensure', 'sanitize'],
    codePatterns: [/throw|Error\s*\(/i, /\bvalid\b|\binvalid\b|\berror\b|\bfail\b/i, /regex|pattern|match|test\s*\(/i, /\btrue\b|\bfalse\b/],
  },
  fetch: {
    keywords: ['fetch', 'request', 'http', 'api', 'get', 'post', 'download'],
    codePatterns: [/fetch\s*\(|axios|http|https|request\s*\(|XMLHttpRequest/i, /\.get\s*\(|\.post\s*\(|\.put\s*\(|\.delete\s*\(/i, /url|endpoint|header|response|status/i],
  },
  parse: {
    keywords: ['parse', 'deserialize', 'decode', 'extract', 'tokenize'],
    codePatterns: [/JSON\.parse|parseInt|parseFloat|DOMParser/i, /token|lexer|scanner|ast|node|tree/i, /\bsplit\s*\(|\bmatch\s*\(|\bexec\s*\(/i],
  },
  encrypt: {
    keywords: ['encrypt', 'decrypt', 'cipher', 'aes', 'rsa', 'crypto'],
    codePatterns: [/createCipher|crypto\.|encrypt|decrypt/i, /\bkey\b.*\biv\b|\biv\b.*\bkey\b/i, /\bcipher\b|\bdecipher\b|\baes\b|\brsa\b/i],
  },
  cache: {
    keywords: ['cache', 'memoize', 'memo', 'lru', 'ttl'],
    codePatterns: [/Map\s*\(|WeakMap|cache|memo/i, /\.has\s*\(.*\.get\s*\(|\.set\s*\(/i, /\bttl\b|\bexpir/i, /lru|evict|capacity|size/i],
  },
  queue: {
    keywords: ['queue', 'stack', 'deque', 'fifo', 'lifo', 'enqueue', 'dequeue', 'push', 'pop'],
    codePatterns: [/enqueue|dequeue|push|pop|shift|unshift/i, /front|rear|head|tail|peek/i, /\b(queue|stack|deque)\b/i],
  },
};

/**
 * Check semantic consistency between a pattern's name/description and its code.
 * @param {string} name - Pattern name (e.g., "debounce", "binary-search")
 * @param {string} description - Pattern description
 * @param {string} code - The actual source code
 * @returns {{ score: number, flags: string[], matchedBehavior: string|null, expectedBehavior: string|null }}
 */
function checkSemanticConsistency(name, description, code) {
  if (!code || (!name && !description)) {
    return { score: 1.0, flags: [], matchedBehavior: null, expectedBehavior: null };
  }

  const combinedText = `${name || ''} ${description || ''}`.toLowerCase().replace(/[-_]/g, ' ');
  const flags = [];

  // Determine expected behavior from name/description
  let expectedBehavior = null;
  let bestKeywordMatch = 0;

  for (const [behavior, sig] of Object.entries(BEHAVIOR_SIGNATURES)) {
    const keywordHits = sig.keywords.filter(kw => combinedText.includes(kw)).length;
    if (keywordHits > bestKeywordMatch) {
      bestKeywordMatch = keywordHits;
      expectedBehavior = behavior;
    }
  }

  if (!expectedBehavior) {
    // No strong semantic signal from name — can't verify, pass with neutral score
    return { score: 0.8, flags: ['no-semantic-signal'], matchedBehavior: null, expectedBehavior: null };
  }

  // Check if code matches expected behavioral signature
  const expectedSig = BEHAVIOR_SIGNATURES[expectedBehavior];
  const codePatternHits = expectedSig.codePatterns.filter(pat => pat.test(code)).length;
  const expectedPatternMatch = codePatternHits / expectedSig.codePatterns.length;

  // Check if code matches a DIFFERENT behavior better (mismatch detection)
  let strongestMismatch = null;
  let strongestMismatchScore = 0;

  for (const [behavior, sig] of Object.entries(BEHAVIOR_SIGNATURES)) {
    if (behavior === expectedBehavior) continue;
    const hits = sig.codePatterns.filter(pat => pat.test(code)).length;
    const ratio = hits / sig.codePatterns.length;
    if (ratio > strongestMismatchScore && ratio > expectedPatternMatch) {
      strongestMismatchScore = ratio;
      strongestMismatch = behavior;
    }
  }

  let score = 1.0;

  if (expectedPatternMatch >= 0.3) {
    // Code matches expected behavior — good
    score = 1.0;
  } else if (expectedPatternMatch > 0) {
    // Weak match
    score = 0.7;
    flags.push(`weak-match: name suggests "${expectedBehavior}" but only ${codePatternHits}/${expectedSig.codePatterns.length} code patterns match`);
  } else {
    // No match at all
    score = 0.4;
    flags.push(`no-match: name suggests "${expectedBehavior}" but code shows no matching patterns`);
  }

  if (strongestMismatch && strongestMismatchScore > 0.3) {
    score = Math.min(score, 0.3);
    flags.push(`mismatch: name says "${expectedBehavior}" but code looks like "${strongestMismatch}" (${(strongestMismatchScore * 100).toFixed(0)}% match)`);
  }

  return {
    score: Math.round(score * 1000) / 1000,
    flags,
    matchedBehavior: strongestMismatch || expectedBehavior,
    expectedBehavior,
  };
}

module.exports = {
  checkSemanticConsistency,
  BEHAVIOR_SIGNATURES,
};
