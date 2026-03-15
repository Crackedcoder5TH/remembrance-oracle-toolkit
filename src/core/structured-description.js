'use strict';

/**
 * Structured Description Layer — replaces freeform text descriptions
 * with a lightweight schema: inputs → transform → outputs, with constraint tags.
 *
 * This improves cross-domain matching by allowing structural comparison
 * rather than relying solely on text similarity.
 *
 * A structured description looks like:
 * {
 *   inputs: ['array<number>'],
 *   transform: 'sort-ascending',
 *   outputs: ['array<number>'],
 *   constraints: ['stable', 'in-place'],
 *   domain: 'algorithm',
 *   freeform: 'Sorts an array of numbers in ascending order'
 * }
 */

/**
 * Parse a freeform description into a structured description object.
 * Uses heuristic extraction of inputs, outputs, transforms, and constraints.
 * @param {string} description - Freeform text description
 * @param {object} [context] - Optional context (code, tags, language)
 * @returns {object} Structured description
 */
function parseStructuredDescription(description, context = {}) {
  if (!description || typeof description !== 'string') {
    return createEmptyStructured(description);
  }

  const lower = description.toLowerCase();
  const inputs = extractInputs(lower, context);
  const outputs = extractOutputs(lower, context);
  const transform = extractTransform(lower);
  const constraints = extractConstraints(lower);
  const domain = inferDomain(lower, context.tags || []);

  return {
    inputs,
    transform,
    outputs,
    constraints,
    domain,
    freeform: description,
  };
}

/**
 * Create an empty structured description as a fallback.
 */
function createEmptyStructured(freeform) {
  return {
    inputs: [],
    transform: '',
    outputs: [],
    constraints: [],
    domain: 'general',
    freeform: freeform || '',
  };
}

/**
 * Validate that a structured description object has the correct shape.
 * @param {object} desc - Structured description to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStructuredDescription(desc) {
  const errors = [];
  if (!desc || typeof desc !== 'object') {
    return { valid: false, errors: ['Description must be an object'] };
  }
  if (!Array.isArray(desc.inputs)) errors.push('inputs must be an array');
  if (typeof desc.transform !== 'string') errors.push('transform must be a string');
  if (!Array.isArray(desc.outputs)) errors.push('outputs must be an array');
  if (!Array.isArray(desc.constraints)) errors.push('constraints must be an array');
  if (typeof desc.domain !== 'string') errors.push('domain must be a string');

  return { valid: errors.length === 0, errors };
}

/**
 * Compute structural similarity between two structured descriptions.
 * Returns 0-1 where 1 is structurally identical.
 * @param {object} a - First structured description
 * @param {object} b - Second structured description
 * @returns {number} Similarity score 0-1
 */
function structuralSimilarity(a, b) {
  if (!a || !b) return 0;

  const inputSim = setOverlap(a.inputs || [], b.inputs || []);
  const outputSim = setOverlap(a.outputs || [], b.outputs || []);
  const transformSim = tokenSimilarity(a.transform || '', b.transform || '');
  const constraintSim = setOverlap(a.constraints || [], b.constraints || []);
  const domainMatch = (a.domain || '') === (b.domain || '') ? 1.0 : 0.0;

  // Weighted composite — transform and I/O matter most
  return (
    inputSim * 0.25 +
    outputSim * 0.25 +
    transformSim * 0.30 +
    constraintSim * 0.10 +
    domainMatch * 0.10
  );
}

// ─── Internal Extraction Helpers ─────────────────────────────────────────

const INPUT_PATTERNS = [
  /(?:takes?|accepts?|receives?|given|from)\s+(?:an?\s+)?(\w[\w<>,\s]*)/g,
  /input[s]?[:\s]+(\w[\w<>,\s]*)/g,
  /\((\w+(?:\s*,\s*\w+)*)\)\s*(?:=>|->)/g,
];

const OUTPUT_PATTERNS = [
  /(?:returns?|produces?|outputs?|yields?|gives?)\s+(?:an?\s+)?(\w[\w<>,\s]*)/g,
  /output[s]?[:\s]+(\w[\w<>,\s]*)/g,
  /(?:=>|->)\s+(\w[\w<>,\s]*)/g,
];

const TRANSFORM_KEYWORDS = [
  'sort', 'filter', 'map', 'reduce', 'merge', 'split', 'join', 'parse',
  'format', 'convert', 'transform', 'validate', 'sanitize', 'encode', 'decode',
  'hash', 'encrypt', 'decrypt', 'compress', 'decompress', 'serialize', 'deserialize',
  'debounce', 'throttle', 'cache', 'memoize', 'retry', 'batch', 'chunk',
  'flatten', 'group', 'aggregate', 'normalize', 'denormalize',
  'search', 'find', 'match', 'replace', 'extract', 'traverse', 'iterate',
  'create', 'build', 'compose', 'wrap', 'unwrap', 'bind',
];

const CONSTRAINT_KEYWORDS = [
  'stable', 'in-place', 'immutable', 'pure', 'async', 'sync', 'recursive',
  'iterative', 'lazy', 'eager', 'thread-safe', 'concurrent', 'idempotent',
  'deterministic', 'ordered', 'unordered', 'unique', 'sorted',
  'case-insensitive', 'case-sensitive', 'null-safe', 'type-safe',
  'constant-time', 'linear-time', 'logarithmic', 'quadratic',
];

const DOMAIN_MAP = {
  'algorithm': ['sort', 'search', 'traverse', 'graph', 'tree', 'path', 'dynamic programming', 'recursion', 'binary'],
  'data-structure': ['array', 'list', 'map', 'set', 'queue', 'stack', 'tree', 'graph', 'heap', 'trie'],
  'string-processing': ['string', 'text', 'regex', 'parse', 'format', 'template', 'encode', 'decode'],
  'io': ['file', 'read', 'write', 'stream', 'buffer', 'pipe', 'stdin', 'stdout'],
  'network': ['http', 'request', 'fetch', 'api', 'url', 'socket', 'websocket'],
  'security': ['encrypt', 'decrypt', 'hash', 'auth', 'token', 'csrf', 'sanitize', 'escape'],
  'async': ['async', 'await', 'promise', 'callback', 'event', 'observable', 'debounce', 'throttle'],
  'validation': ['validate', 'check', 'assert', 'verify', 'schema', 'constraint'],
  'utility': ['helper', 'util', 'tool', 'convert', 'transform', 'wrap'],
};

function extractInputs(text, context) {
  const found = new Set();
  for (const pattern of INPUT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const tokens = match[1].split(/[,\s]+/).filter(t => t.length > 1);
      tokens.forEach(t => found.add(normalizeType(t)));
    }
  }

  // Also extract from code parameter names if available
  if (context.code) {
    const paramMatch = context.code.match(/function\s+\w+\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1]) {
      paramMatch[1].split(',').forEach(p => {
        const name = p.trim().split(/[=:]/).shift().trim();
        if (name && name.length > 1) found.add(normalizeType(name));
      });
    }
  }

  return [...found];
}

function extractOutputs(text, context) {
  const found = new Set();
  for (const pattern of OUTPUT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const tokens = match[1].split(/[,\s]+/).filter(t => t.length > 1);
      tokens.forEach(t => found.add(normalizeType(t)));
    }
  }
  return [...found];
}

function extractTransform(text) {
  const found = [];
  for (const kw of TRANSFORM_KEYWORDS) {
    if (text.includes(kw)) found.push(kw);
  }
  return found.join('-') || 'transform';
}

function extractConstraints(text) {
  const found = [];
  for (const c of CONSTRAINT_KEYWORDS) {
    // For multi-word constraints, check directly
    if (c.includes('-')) {
      if (text.includes(c.replace(/-/g, ' ')) || text.includes(c)) found.push(c);
    } else {
      // Word-boundary match for single words
      const re = new RegExp('\\b' + c + '\\b');
      if (re.test(text)) found.push(c);
    }
  }
  return found;
}

function inferDomain(text, tags) {
  const combined = text + ' ' + tags.join(' ');
  let bestDomain = 'general';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_MAP)) {
    let score = 0;
    for (const kw of keywords) {
      if (combined.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

function normalizeType(raw) {
  return raw.toLowerCase().replace(/[^a-z0-9<>,]/g, '').trim();
}

function setOverlap(a, b) {
  if (a.length === 0 && b.length === 0) return 0.5; // Unknown — neutral, not perfect match
  if (a.length === 0 || b.length === 0) return 0.0;
  const setA = new Set(a.map(x => String(x).toLowerCase()));
  const setB = new Set(b.map(x => String(x).toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function tokenSimilarity(a, b) {
  if (!a && !b) return 0.0;
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const tokensA = new Set(a.split(/[-_\s]+/).filter(Boolean));
  const tokensB = new Set(b.split(/[-_\s]+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 0.0;
  return setOverlap([...tokensA], [...tokensB]);
}

module.exports = {
  parseStructuredDescription,
  validateStructuredDescription,
  structuralSimilarity,
  createEmptyStructured,
  extractInputs,
  extractOutputs,
  extractTransform,
  extractConstraints,
  inferDomain,
  setOverlap,
  tokenSimilarity,
  DOMAIN_MAP,
  TRANSFORM_KEYWORDS,
  CONSTRAINT_KEYWORDS,
};
