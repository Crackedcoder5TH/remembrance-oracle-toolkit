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

// Operators that should be abstracted in fuzzy mode
const ABSTRACTABLE_OPS = new Set([
  '+', '-', '*', '/', '%', '**',
  '==', '===', '!=', '!==', '<', '>', '<=', '>=',
  '&&', '||', '??',
  '&', '|', '^', '~', '<<', '>>', '>>>',
  '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=',
]);

// Canonical keyword mapping: language-specific → universal structural tokens
const CANONICAL_KEYWORDS = {
  // Function declaration
  'function': '$FN', 'def': '$FN', 'func': '$FN', 'fn': '$FN',
  // Return
  'return': '$RET',
  // Conditionals
  'if': '$IF', 'else': '$ELSE', 'elif': '$ELIF', 'switch': '$SWITCH',
  'case': '$CASE', 'default': '$DEFAULT', 'match': '$SWITCH',
  // Loops
  'for': '$FOR', 'while': '$WHILE', 'loop': '$WHILE',
  'break': '$BREAK', 'continue': '$CONTINUE',
  'range': '$RANGE', 'forEach': '$RANGE',
  // Variable declaration
  'const': '$DECL', 'let': '$DECL', 'var': '$DECL', 'mut': '$DECL',
  // Error handling
  'try': '$TRY', 'catch': '$CATCH', 'except': '$CATCH',
  'finally': '$FINALLY', 'throw': '$THROW', 'raise': '$THROW',
  // Class/type
  'class': '$CLASS', 'struct': '$CLASS', 'type': '$TYPE',
  'extends': '$EXTENDS', 'impl': '$EXTENDS', 'trait': '$TRAIT',
  'interface': '$TRAIT',
  // Async
  'async': '$ASYNC', 'await': '$AWAIT', 'yield': '$YIELD',
  // Import
  'import': '$IMPORT', 'use': '$IMPORT', 'from': '$FROM',
  'export': '$EXPORT', 'pub': '$EXPORT', 'mod': '$MOD', 'package': '$MOD',
  // Boolean/null
  'true': '$TRUE', 'True': '$TRUE',
  'false': '$FALSE', 'False': '$FALSE',
  'null': '$NULL', 'nil': '$NULL', 'None': '$NULL',
  'undefined': '$NULL',
  // Other
  'new': '$NEW', 'make': '$NEW',
  'self': '$SELF', 'this': '$SELF', 'Self': '$SELF',
  'in': '$IN', 'of': '$OF',
  'typeof': '$TYPEOF', 'instanceof': '$TYPEOF',
  'delete': '$DELETE', 'del': '$DELETE',
  'with': '$WITH', 'as': '$AS',
  'do': '$DO', 'pass': '$PASS',
  'not': '$NOT', 'and': '$AND', 'or': '$OR', 'is': '$IS',
  'global': '$GLOBAL', 'nonlocal': '$GLOBAL',
  'assert': '$ASSERT',
  'super': '$SUPER', 'crate': '$SUPER',
  'lambda': '$LAMBDA',
  'void': '$VOID',
  'debugger': '$DEBUG',
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
 * @param {Object} [options] — { fuzzy: bool, canonical: bool }
 *   fuzzy: abstract operators into $OP_N placeholders (broader families, less precise)
 *   canonical: normalize keywords to language-agnostic tokens (cross-language families)
 * @returns {{ skeleton: string, placeholders: Object, hash: string }} Skeleton + placeholder map
 */
function structuralFingerprint(code, language = 'javascript', options = {}) {
  if (!code || typeof code !== 'string') {
    return { skeleton: '', placeholders: {}, hash: _hash('') };
  }

  const lang = (language || 'javascript').toLowerCase();

  if (lang === 'javascript' || lang === 'typescript') {
    return _fingerprintJS(code, options);
  }
  return _fingerprintGeneric(code, lang, options);
}

/**
 * JS/TS fingerprinting via the existing tokenizer.
 * Uses token stream (more reliable than full AST for fingerprinting).
 *
 * @param {string} code
 * @param {Object} [options] — { fuzzy, canonical }
 */
function _fingerprintJS(code, options = {}) {
  const { fuzzy = false, canonical = false } = options;

  let tokens;
  try {
    tokens = tokenize(code);
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[fractal:_fingerprintJS] silent failure:', e?.message || e);
    return _fingerprintGeneric(code, 'javascript', options);
  }

  const placeholders = {};
  const identMap = new Map();  // original name → placeholder
  const opMap = new Map();     // operator → placeholder (fuzzy mode)
  let idCounter = 0;
  let strCounter = 0;
  let numCounter = 0;
  let opCounter = 0;

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
    } else if (fuzzy && (token.type === 'operator' || token.type === 'punctuation') && ABSTRACTABLE_OPS.has(token.value)) {
      // Fuzzy mode: abstract operators into $OP_N placeholders
      if (!opMap.has(token.value)) {
        const placeholder = `$OP_${opCounter++}`;
        opMap.set(token.value, placeholder);
        placeholders[placeholder] = token.value;
      }
      skeletonParts.push(opMap.get(token.value));
    } else if (canonical && token.type === 'keyword' && CANONICAL_KEYWORDS[token.value]) {
      // Canonical mode: normalize language keywords to universal tokens
      skeletonParts.push(CANONICAL_KEYWORDS[token.value]);
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
 *
 * @param {string} code
 * @param {string} lang
 * @param {Object} [options] — { fuzzy, canonical }
 */
function _fingerprintGeneric(code, lang, options = {}) {
  const { fuzzy = false, canonical = false } = options;
  const keywords = KEYWORDS_BY_LANG[lang] || JS_KEYWORDS;
  const placeholders = {};
  const identMap = new Map();
  const opMap = new Map();
  let idCounter = 0;
  let strCounter = 0;
  let numCounter = 0;
  let opCounter = 0;

  // Tokenize: identifiers, strings, numbers, multi-char operators, single-char operators/punctuation
  const tokenPattern = /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_]\w*\b)|(===|!==|>>>|\*\*=|<<=|>>=|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|%=|\*\*|=>|<<|>>|\?\.|\.\.\.)|([^\s\w])/g;

  const skeletonParts = [];
  let match;

  while ((match = tokenPattern.exec(code)) !== null) {
    const [full, str, num, ident, multiOp, punct] = match;

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
        if (canonical && CANONICAL_KEYWORDS[ident]) {
          skeletonParts.push(CANONICAL_KEYWORDS[ident]);
        } else {
          skeletonParts.push(ident);
        }
      } else {
        if (!identMap.has(ident)) {
          const placeholder = `$ID_${idCounter++}`;
          identMap.set(ident, placeholder);
          placeholders[placeholder] = ident;
        }
        skeletonParts.push(identMap.get(ident));
      }
    } else if (multiOp) {
      if (fuzzy && ABSTRACTABLE_OPS.has(multiOp)) {
        if (!opMap.has(multiOp)) {
          const placeholder = `$OP_${opCounter++}`;
          opMap.set(multiOp, placeholder);
          placeholders[placeholder] = multiOp;
        }
        skeletonParts.push(opMap.get(multiOp));
      } else {
        skeletonParts.push(multiOp);
      }
    } else if (punct) {
      if (fuzzy && ABSTRACTABLE_OPS.has(punct)) {
        if (!opMap.has(punct)) {
          const placeholder = `$OP_${opCounter++}`;
          opMap.set(punct, placeholder);
          placeholders[placeholder] = punct;
        }
        skeletonParts.push(opMap.get(punct));
      } else {
        skeletonParts.push(punct);
      }
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
 * Three-tier matching:
 *   1. Exact match (default) — operators are structural
 *   2. Fuzzy match — operators abstracted into $OP_N (e.g., a+b and a*b share skeleton)
 *   3. Canonical match — language keywords normalized (cross-language families)
 *
 * @param {Array} patterns — Array of { id, code, language, name, ... }
 * @param {Object} [options] — { fuzzy: bool, canonical: bool }
 * @returns {{ families: Array, singletons: Array }}
 */
function extractTemplates(patterns, options = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { families: [], singletons: [] };
  }

  // Fingerprint all patterns
  const fingerprinted = patterns.map(p => {
    const fp = structuralFingerprint(p.code, p.language, options);
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
        matchMode: options.fuzzy ? 'fuzzy' : options.canonical ? 'canonical' : 'exact',
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
 * @param {Object} [options] — { fuzzy: bool, canonical: bool }
 * @returns {Array<{ familyId: string, memberCount: number, patternIds: string[] }>}
 */
function detectFamilies(patterns, options = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  const groups = new Map();
  for (const p of patterns) {
    const fp = structuralFingerprint(p.code, p.language, options);
    if (!groups.has(fp.hash)) groups.set(fp.hash, []);
    groups.get(fp.hash).push(p.id);
  }

  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length >= 2)
    .map(([hash, ids]) => ({
      familyId: hash,
      memberCount: ids.length,
      patternIds: ids,
      matchMode: options.fuzzy ? 'fuzzy' : options.canonical ? 'canonical' : 'exact',
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
    compressionRatio: compressedBytes > 0 ? parseFloat((originalBytes / compressedBytes).toFixed(2)) : 1.0,
    avgFamilySize: families.length > 0
      ? parseFloat((compressedCount / families.length).toFixed(1))
      : 0,
  };
}

// ─── 3. Hierarchical Templates ───

// Sub-pattern types we can detect and extract as nested templates
const SUB_PATTERNS = [
  {
    name: 'if-guard',
    // Matches: if (...) { ... }  or  if (...) { ... } else { ... }
    pattern: /if\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}(?:\s*else\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g,
  },
  {
    name: 'try-catch',
    // Matches: try { ... } catch (...) { ... } finally? { ... }
    pattern: /try\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*catch\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}(?:\s*finally\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g,
  },
  {
    name: 'for-loop',
    // Matches: for (...) { ... }  or  for ... of/in ...  { ... }
    pattern: /for\s*\([^)]*\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
  },
  {
    name: 'arrow-fn',
    // Matches: (...) => { ... }  or  (...) => expr
    pattern: /\([^)]*\)\s*=>\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[^,;{}]+)/g,
  },
];

/**
 * Extract hierarchical (nested) sub-templates from a skeleton.
 *
 * Detects common structural sub-patterns (if-guards, try-catch, for-loops,
 * arrow functions) within a skeleton and replaces them with named sub-template
 * placeholders ($SUB_N). This enables templates-of-templates.
 *
 * @param {string} skeleton — A structural skeleton string
 * @param {Object} [options] — { minSubLength: number }
 * @returns {{ hierarchicalSkeleton: string, subTemplates: Object[], subCount: number }}
 */
function extractSubTemplates(skeleton, options = {}) {
  if (!skeleton || typeof skeleton !== 'string') {
    return { hierarchicalSkeleton: '', subTemplates: [], subCount: 0 };
  }

  const { minSubLength = 20 } = options;
  const subTemplates = [];
  let subCounter = 0;
  let result = skeleton;

  // Extract sub-patterns from longest match first to avoid overlap
  for (const sp of SUB_PATTERNS) {
    const matches = [];
    let m;
    const regex = new RegExp(sp.pattern.source, sp.pattern.flags);
    while ((m = regex.exec(result)) !== null) {
      if (m[0].length >= minSubLength) {
        matches.push({ index: m.index, length: m[0].length, text: m[0] });
      }
    }

    // Process matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const subHash = _hash(match.text);
      const subId = `$SUB_${subHash.slice(0, 8)}`;
      subCounter++;

      subTemplates.push({
        id: subId,
        type: sp.name,
        skeleton: match.text,
        hash: subHash,
        position: match.index,
        length: match.length,
      });

      result = result.slice(0, match.index) + subId + result.slice(match.index + match.length);
    }
  }

  return {
    hierarchicalSkeleton: result,
    subTemplates: subTemplates.reverse(),  // Return in original order
    subCount: subCounter,
  };
}

/**
 * Reconstruct code from a hierarchical skeleton.
 * First expands sub-template placeholders, then applies the regular delta.
 *
 * @param {string} hierarchicalSkeleton — Skeleton with $SUB_N placeholders
 * @param {Object[]} subTemplates — Array of { id, skeleton } sub-templates
 * @param {Object} delta — Placeholder → value mapping for the final skeleton
 * @returns {string} Reconstructed code
 */
function reconstructHierarchical(hierarchicalSkeleton, subTemplates, delta) {
  if (!hierarchicalSkeleton) return '';

  // Step 1: Expand sub-template placeholders
  let expanded = hierarchicalSkeleton;
  if (Array.isArray(subTemplates)) {
    // Sort by ID length descending to avoid partial matches
    const sorted = [...subTemplates].sort((a, b) => b.id.length - a.id.length);
    for (const sub of sorted) {
      expanded = expanded.split(sub.id).join(sub.skeleton);
    }
  }

  // Step 2: Apply delta to the fully expanded skeleton
  return reconstruct(expanded, delta);
}

/**
 * Detect hierarchical families — groups of patterns that share sub-templates
 * even if their top-level skeletons differ.
 *
 * @param {Array} patterns — Array of { id, code, language, ... }
 * @param {Object} [options] — { minSubLength, minGroupSize }
 * @returns {{ sharedSubTemplates: Array, coverage: Object }}
 */
function detectHierarchicalFamilies(patterns, options = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { sharedSubTemplates: [], coverage: { patternsWithSubs: 0, totalSubTemplates: 0 } };
  }

  const { minSubLength = 20, minGroupSize = 2 } = options;
  const subHashToPatterns = new Map();   // subHash → [patternIds]
  const subHashToTemplate = new Map();   // subHash → { type, skeleton }
  let totalSubs = 0;
  let patternsWithSubs = 0;

  for (const p of patterns) {
    const fp = structuralFingerprint(p.code, p.language);
    const { subTemplates } = extractSubTemplates(fp.skeleton, { minSubLength });

    if (subTemplates.length > 0) {
      patternsWithSubs++;
      totalSubs += subTemplates.length;
    }

    for (const sub of subTemplates) {
      if (!subHashToPatterns.has(sub.hash)) {
        subHashToPatterns.set(sub.hash, []);
        subHashToTemplate.set(sub.hash, { type: sub.type, skeleton: sub.skeleton });
      }
      subHashToPatterns.get(sub.hash).push(p.id);
    }
  }

  // Filter to shared sub-templates (appear in 2+ patterns)
  const sharedSubTemplates = [];
  for (const [hash, patternIds] of subHashToPatterns) {
    if (patternIds.length >= minGroupSize) {
      const tmpl = subHashToTemplate.get(hash);
      sharedSubTemplates.push({
        hash,
        type: tmpl.type,
        skeleton: tmpl.skeleton,
        sharedBy: patternIds.length,
        patternIds,
      });
    }
  }

  // Sort by most shared first
  sharedSubTemplates.sort((a, b) => b.sharedBy - a.sharedBy);

  return {
    sharedSubTemplates,
    coverage: { patternsWithSubs, totalSubTemplates: totalSubs },
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
  // Fuzzy/canonical helpers
  ABSTRACTABLE_OPS,
  CANONICAL_KEYWORDS,
  // Hierarchical templates
  extractSubTemplates,
  reconstructHierarchical,
  detectHierarchicalFamilies,
};
