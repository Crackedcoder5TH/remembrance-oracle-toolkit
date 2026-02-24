/**
 * Auto-Tagger — Aggressive keyword extraction and categorization.
 *
 * Every time the Oracle approves code, this module extracts tags from:
 *   1. Code structure — APIs, patterns, frameworks, constructs
 *   2. Description text — NLP-lite keyword extraction
 *   3. Concept clusters — maps to semantic categories (from embeddings.js)
 *   4. Domain detection — auth, crypto, UI, data, network, etc.
 *
 * User-provided tags are NEVER removed, only enriched.
 *
 * Detector data lives in auto-tagger-detectors.js for simplicity.
 */

const { identifyConcepts } = require('../search/embeddings');
const {
  DOMAIN_DETECTORS, CONSTRUCT_DETECTORS, STOP_WORDS,
  NOISE_TAGS, GENERIC_NAMES, STRUCTURED_PREFIXES,
} = require('./auto-tagger-detectors');

// ─── Tag Extraction Functions ───

/**
 * Extract meaningful keywords from description text.
 * Returns lowercased keywords with stop words removed.
 */
function extractDescriptionKeywords(description) {
  if (!description || typeof description !== 'string') return [];

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  return [...new Set(words)];
}

/**
 * Extract tags from code by scanning for domain patterns.
 */
function extractCodeTags(code) {
  if (!code || typeof code !== 'string') return [];

  const detected = [];

  for (const detector of DOMAIN_DETECTORS) {
    for (const pattern of detector.patterns) {
      if (pattern.test(code)) {
        detected.push(detector.tag);
        break;
      }
    }
  }

  for (const detector of CONSTRUCT_DETECTORS) {
    try {
      if (detector.test(code)) detected.push(detector.tag);
    } catch { /* pattern test failure — skip */ }
  }

  return [...new Set(detected)];
}

/**
 * Extract concept-level tags using the embeddings concept clusters.
 */
function extractConceptTags(code, description) {
  const text = `${description || ''} ${code || ''}`;
  return identifyConcepts(text)
    .filter(c => c.score >= 0.05)
    .map(c => c.id)
    .slice(0, 5);
}

/**
 * Detect the language from code if not provided.
 */
function detectLanguageTag(code, language) {
  if (language) return language.toLowerCase();
  if (!code) return null;

  if (/\binterface\s+\w+\s*\{|:\s*(string|number|boolean|void)\b|<T[\s,>]/.test(code)) return 'typescript';
  if (/\bdef\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import\b/.test(code)) return 'python';
  if (/\bfunc\s+\w+\s*\(|package\s+\w+|:=\s/.test(code)) return 'go';
  if (/\bfn\s+\w+\s*\(|let\s+mut\s|impl\s+\w+|pub\s+fn\b/.test(code)) return 'rust';
  if (/\bfunction\s+\w+\s*\(|const\s+\w+\s*=|=>\s*\{/.test(code)) return 'javascript';

  return null;
}

/**
 * Extract function/class names from code as potential tags.
 */
function extractNameTags(code) {
  if (!code || typeof code !== 'string') return [];

  const names = new Set();

  for (const m of code.matchAll(/\bfunction\s+([a-zA-Z_]\w{2,})\s*\(/g)) {
    names.add(camelToKebab(m[1]));
  }

  for (const m of code.matchAll(/\b(?:const|let|var)\s+([a-zA-Z_]\w{2,})\s*=/g)) {
    const afterEquals = code.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (/^\s*(?:\(|async\s|function|\w+\s*=>)/.test(afterEquals)) {
      names.add(camelToKebab(m[1]));
    }
  }

  for (const m of code.matchAll(/\bclass\s+([A-Z]\w{2,})/g)) {
    names.add(camelToKebab(m[1]));
  }

  for (const m of code.matchAll(/\bmodule\.exports\s*=\s*\{\s*([^}]+)\}/g)) {
    const exported = m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(s => s.length > 2);
    for (const e of exported) names.add(camelToKebab(e));
  }

  return [...names].filter(n => n.length > 2 && !GENERIC_NAMES.has(n)).slice(0, 5);
}

/**
 * Convert camelCase to kebab-case for tags.
 */
function camelToKebab(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// ─── User Tag Normalization ───

/**
 * Normalize a user-provided tag, preserving case for structured prefixes.
 */
function normalizeUserTag(tag) {
  const trimmed = tag.trim();
  const lower = trimmed.toLowerCase();
  for (const prefix of STRUCTURED_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return prefix + trimmed.slice(prefix.length);
    }
  }
  return lower;
}

// ─── Main Auto-Tag Function ───

/**
 * Generate tags for code automatically.
 *
 * Merges extracted tags with user-provided tags. Never removes user tags.
 * Returns a deduplicated, sorted array of tags.
 *
 * @param {string} code - The code to analyze
 * @param {object} options - { description, language, tags (user-provided), name }
 * @returns {string[]} Enriched tag array
 */
function autoTag(code, options = {}) {
  const { description = '', language, tags: userTags = [], name = '' } = options;

  const tagSet = new Set((userTags || []).map(normalizeUserTag).filter(Boolean));

  for (const t of extractCodeTags(code)) tagSet.add(t);
  for (const k of extractDescriptionKeywords(description).slice(0, 3)) tagSet.add(k);
  for (const t of extractConceptTags(code, description).slice(0, 3)) tagSet.add(t);

  const lang = detectLanguageTag(code, language);
  if (lang) tagSet.add(lang);

  for (const t of extractNameTags(code).slice(0, 2)) tagSet.add(t);

  if (name && name.length > 2 && name.length <= 30) {
    tagSet.add(camelToKebab(name));
  }

  return [...tagSet]
    .filter(t => t.length > 1 && !NOISE_TAGS.has(t))
    .sort()
    .slice(0, 12);
}

/**
 * Re-tag an existing pattern by analyzing its code and metadata.
 */
function retagPattern(pattern) {
  if (!pattern || !pattern.code) return pattern?.tags || [];

  return autoTag(pattern.code, {
    description: pattern.description || pattern.name || '',
    language: pattern.language,
    tags: pattern.tags || [],
    name: pattern.name || '',
  });
}

/**
 * Compute tag diff — show what auto-tagger would add.
 */
function tagDiff(existingTags, newTags) {
  const existing = new Set((existingTags || []).map(t => t.toLowerCase()));
  const added = newTags.filter(t => !existing.has(t.toLowerCase()));
  const kept = newTags.filter(t => existing.has(t.toLowerCase()));
  return { added, kept, total: newTags.length };
}

module.exports = {
  autoTag,
  retagPattern,
  tagDiff,
  extractCodeTags,
  extractDescriptionKeywords,
  extractConceptTags,
  extractNameTags,
  detectLanguageTag,
  camelToKebab,
  DOMAIN_DETECTORS,
  CONSTRUCT_DETECTORS,
};
