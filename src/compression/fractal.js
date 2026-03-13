/**
 * Fractal Compression — Structural fingerprinting, template extraction, and reconstruction.
 *
 * Exploits self-similarity across patterns: patterns that share the same structural
 * skeleton (AST shape) differ only in their identifiers, literals, and strings.
 * Store one template + N small delta objects instead of N full code strings.
 *
 * Inspired by IFS (Iterated Function Systems) — the "rules" are the AST node types,
 * the "parameters" are the identifier/literal substitutions.
 */

const crypto = require('crypto');
const { parseJS, tokenize } = require('../core/ast-parser');

// Language keywords — tokens that are structural (not placeholders)
const JS_KEYWORDS = new Set([
  'function', 'return', 'if', 'else', 'for', 'while', 'const', 'let', 'var',
  'new', 'true', 'false', 'null', 'undefined', 'typeof', 'of', 'in', 'break', 'continue',
  'switch', 'case', 'default', 'throw', 'try', 'catch', 'finally', 'class', 'extends',
  'async', 'await', 'yield', 'export', 'import', 'do', 'delete', 'void', 'instanceof',
  'this', 'super', 'with', 'debugger', 'from', 'as',
]);

const PY_KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as',
  'class', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'lambda', 'pass',
  'break', 'continue', 'and', 'or', 'not', 'is', 'in', 'True', 'False', 'None',
  'global', 'nonlocal', 'assert', 'del', 'async', 'await', 'self',
]);

const GO_KEYWORDS = new Set([
  'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default',
  'var', 'const', 'type', 'struct', 'interface', 'package', 'import', 'go',
  'chan', 'select', 'defer', 'map', 'make', 'append', 'len', 'cap', 'new',
  'nil', 'true', 'false', 'break', 'continue', 'fallthrough', 'goto',
]);

const RUST_KEYWORDS = new Set([
  'fn', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'let', 'mut',
  'const', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'pub', 'self', 'Self',
  'super', 'crate', 'async', 'await', 'move', 'ref', 'where', 'type', 'as',
  'true', 'false', 'break', 'continue', 'unsafe', 'extern', 'dyn', 'in',
]);

const KEYWORDS_BY_LANG = {
  javascript: JS_KEYWORDS,
  typescript: JS_KEYWORDS,
  python: PY_KEYWORDS,
  go: GO_KEYWORDS,
  rust: RUST_KEYWORDS,
};

/**
 * Compute a structural fingerprint of code.
 *
 * For JavaScript/TypeScript: uses the existing AST parser to walk the tree,
 * replacing all identifiers and literals with numbered placeholders.
 *
 * For other languages: uses a regex tokenizer with language-aware keyword lists.
 *
 * @param {string} code — Source code
 * @param {string} language — Language identifier
 * @returns {{ skeleton: string, placeholders: Object }} Skeleton string + placeholder map
 */
function structuralFingerprint(code, language = 'javascript') {
  if (!code || typeof code !== 'string') {
    return { skeleton: '', placeholders: {}, hash: _hash('') };
  }

  const lang = (language || 'javascript').toLowerCase();

  if (lang === 'javascript' || lang === 'typescript') {
    return _fingerprintJS(code);
  }
  return _fingerprintGeneric(code, lang);
}

/**
 * JS/TS fingerprinting via the existing tokenizer.
 * Uses token stream (more reliable than full AST for fingerprinting).
 */
function _fingerprintJS(code) {
  let tokens;
  try {
    tokens = tokenize(code);
  } catch {
    return _fingerprintGeneric(code, 'javascript');
  }

  const placeholders = {};
  const identMap = new Map();  // original name → placeholder
  let idCounter = 0;
  let strCounter = 0;
  let numCounter = 0;

  const skeletonParts = [];

  for (const token of tokens) {
    if (token.type === 'identifier') {
      if (!identMap.has(token.value)) {
        const placeholder = `$ID_${idCounter++}`;
        identMap.set(token.value, placeholder);
        placeholders[placeholder] = token.value;
      }
      skeletonParts.push(identMap.get(token.value));
    } else if (token.type === 'string' || token.type === 'template') {
      const placeholder = `$STR_${strCounter++}`;
      placeholders[placeholder] = token.value;
      skeletonParts.push(placeholder);
    } else if (token.type === 'number') {
      const placeholder = `$LIT_${numCounter++}`;
      placeholders[placeholder] = token.value;
      skeletonParts.push(placeholder);
    } else {
      // Keywords, operators, punctuation — structural (kept as-is)
      skeletonParts.push(token.value);
    }
  }

  const skeleton = skeletonParts.join(' ');
  return { skeleton, placeholders, hash: _hash(skeleton) };
}

/**
 * Generic fingerprinting for non-JS languages.
 * Uses regex tokenizer with language-specific keyword lists.
 */
function _fingerprintGeneric(code, lang) {
  const keywords = KEYWORDS_BY_LANG[lang] || JS_KEYWORDS;
  const placeholders = {};
  const identMap = new Map();
  let idCounter = 0;
  let strCounter = 0;
  let numCounter = 0;

  // Tokenize: identifiers, strings, numbers, operators/punctuation
  const tokenPattern = /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_]\w*\b)|([^\s\w])/g;

  const skeletonParts = [];
  let match;

  while ((match = tokenPattern.exec(code)) !== null) {
    const [full, str, num, ident, punct] = match;

    if (str) {
      const placeholder = `$STR_${strCounter++}`;
      placeholders[placeholder] = str;
      skeletonParts.push(placeholder);
    } else if (num) {
      const placeholder = `$LIT_${numCounter++}`;
      placeholders[placeholder] = num;
      skeletonParts.push(placeholder);
    } else if (ident) {
      if (keywords.has(ident)) {
        skeletonParts.push(ident);  // Structural — keep as-is
      } else {
        if (!identMap.has(ident)) {
          const placeholder = `$ID_${idCounter++}`;
          identMap.set(ident, placeholder);
          placeholders[placeholder] = ident;
        }
        skeletonParts.push(identMap.get(ident));
      }
    } else if (punct) {
      skeletonParts.push(punct);
    }
  }

  const skeleton = skeletonParts.join(' ');
  return { skeleton, placeholders, hash: _hash(skeleton) };
}

/**
 * Reconstruct code from a skeleton template and a delta (placeholder map).
 * Returns the original code string.
 *
 * @param {string} skeleton — Template with $ID_N, $STR_N, $LIT_N placeholders
 * @param {Object} delta — Map of placeholder → actual value
 * @returns {string} Reconstructed code
 */
function reconstruct(skeleton, delta) {
  if (!skeleton) return '';
  if (!delta || Object.keys(delta).length === 0) return skeleton;

  // Replace placeholders with actual values
  // Sort by longest placeholder first to avoid partial replacements
  const sorted = Object.keys(delta).sort((a, b) => b.length - a.length);

  let result = skeleton;
  for (const placeholder of sorted) {
    // Use split+join for global replacement (no regex escaping needed)
    result = result.split(placeholder).join(delta[placeholder]);
  }
  return result;
}

/**
 * Extract templates from a group of patterns.
 * Groups patterns by structural fingerprint hash, then for each group of 2+,
 * the skeleton becomes the template and each pattern stores only its delta.
 *
 * @param {Array} patterns — Array of { id, code, language, name, ... }
 * @returns {{ families: Array, singletons: Array }}
 */
function extractTemplates(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { families: [], singletons: [] };
  }

  // Fingerprint all patterns
  const fingerprinted = patterns.map(p => {
    const fp = structuralFingerprint(p.code, p.language);
    return { pattern: p, ...fp };
  });

  // Group by skeleton hash
  const groups = new Map();
  for (const fp of fingerprinted) {
    const key = fp.hash;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fp);
  }

  const families = [];
  const singletons = [];

  for (const [hash, members] of groups) {
    if (members.length >= 2) {
      families.push({
        templateId: hash,
        skeleton: members[0].skeleton,
        language: members[0].pattern.language || 'unknown',
        members: members.map(m => ({
          patternId: m.pattern.id,
          name: m.pattern.name,
          delta: m.placeholders,
          originalSize: (m.pattern.code || '').length,
          deltaSize: JSON.stringify(m.placeholders).length,
        })),
      });
    } else {
      singletons.push(members[0].pattern);
    }
  }

  return { families, singletons };
}

/**
 * Detect fractal families across all patterns without extracting templates.
 * Lighter than extractTemplates — just returns grouping info.
 *
 * @param {Array} patterns — Array of { id, code, language, ... }
 * @returns {Array<{ familyId: string, memberCount: number, patternIds: string[] }>}
 */
function detectFamilies(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  const groups = new Map();
  for (const p of patterns) {
    const fp = structuralFingerprint(p.code, p.language);
    if (!groups.has(fp.hash)) groups.set(fp.hash, []);
    groups.get(fp.hash).push(p.id);
  }

  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length >= 2)
    .map(([hash, ids]) => ({
      familyId: hash,
      memberCount: ids.length,
      patternIds: ids,
    }));
}

/**
 * Compute compression statistics for a set of patterns.
 *
 * @param {Array} patterns — Array of { id, code, language, ... }
 * @returns {Object} Stats including ratio, savings, family count
 */
function compressionStats(patterns) {
  const { families, singletons } = extractTemplates(patterns);

  let originalBytes = 0;
  let compressedBytes = 0;
  let compressedCount = 0;

  for (const family of families) {
    const skeletonSize = family.skeleton.length;
    compressedBytes += skeletonSize; // One template per family
    compressedCount += family.members.length;

    for (const member of family.members) {
      originalBytes += member.originalSize;
      compressedBytes += member.deltaSize;
    }
  }

  for (const singleton of singletons) {
    const size = (singleton.code || '').length;
    originalBytes += size;
    compressedBytes += size; // No compression for singletons
  }

  return {
    totalPatterns: (patterns || []).length,
    familyCount: families.length,
    compressedPatterns: compressedCount,
    singletonPatterns: singletons.length,
    originalBytes,
    compressedBytes,
    savedBytes: originalBytes - compressedBytes,
    compressionRatio: compressedBytes > 0 ? (originalBytes / compressedBytes).toFixed(2) : '1.00',
    avgFamilySize: families.length > 0
      ? (compressedCount / families.length).toFixed(1)
      : '0',
  };
}

/** SHA-256 hash, truncated to 16 hex chars (matching store convention). */
function _hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

module.exports = {
  structuralFingerprint,
  reconstruct,
  extractTemplates,
  detectFamilies,
  compressionStats,
};
