/**
 * Pattern Composition Engine
 *
 * Combines multiple oracle patterns into a cohesive output.
 * Supports three composition modes:
 *   - module: wraps composed patterns in a module with exports
 *   - class:  wraps composed patterns in a class that delegates to each
 *   - function: creates a factory function that returns composed functionality
 *
 * Usage:
 *   const composer = new PatternComposer(oracle);
 *   const result = composer.compose({
 *     patterns: ['rate-limiter', 'middleware-chain'],
 *     language: 'javascript',
 *     glue: 'module',
 *   });
 */

// ─── Built-in Composition Templates ───

const BUILT_IN_TEMPLATES = [
  {
    name: 'rest-api',
    description: 'REST API service with rate limiting, middleware chain, request validation, and CORS support',
    patterns: ['rate-limiter', 'middleware-chain', 'request-validator', 'cors-middleware'],
    defaultGlue: 'module',
    keywords: ['rest', 'api', 'http', 'server', 'endpoint', 'route'],
  },
  {
    name: 'auth-service',
    description: 'Authentication service with JWT tokens, request validation, and event notification',
    patterns: ['jwt-auth', 'request-validator', 'event-emitter'],
    defaultGlue: 'class',
    keywords: ['auth', 'authentication', 'jwt', 'token', 'login', 'session'],
  },
  {
    name: 'task-queue',
    description: 'Resilient task queue with promise-based concurrency, retry logic, circuit breaking, and events',
    patterns: ['promise-queue', 'retry-with-backoff', 'circuit-breaker', 'event-emitter'],
    defaultGlue: 'class',
    keywords: ['queue', 'task', 'job', 'worker', 'background', 'async'],
  },
  {
    name: 'data-pipeline',
    description: 'Data processing pipeline with streaming, CSV parsing, and observable data flow',
    patterns: ['stream-pipeline', 'csv-parser', 'observable'],
    defaultGlue: 'module',
    keywords: ['pipeline', 'data', 'stream', 'csv', 'etl', 'transform', 'processing'],
  },
  {
    name: 'resilient-service',
    description: 'Fault-tolerant service wrapper with circuit breaker, retry logic, rate limiting, and event monitoring',
    patterns: ['circuit-breaker', 'retry-with-backoff', 'rate-limiter', 'event-emitter'],
    defaultGlue: 'class',
    keywords: ['resilient', 'fault', 'tolerant', 'reliable', 'failover', 'fallback'],
  },
];

// ─── Keyword index for description parsing ───

/**
 * Maps common keywords/phrases to known pattern names.
 * Used by composeFromDescription to extract pattern references
 * from free-form text.
 */
const KEYWORD_TO_PATTERN = {
  // Rate limiting
  'rate limit': 'rate-limiter',
  'rate-limit': 'rate-limiter',
  'throttle': 'rate-limiter',
  'rate control': 'rate-limiter',

  // Middleware
  'middleware': 'middleware-chain',
  'middleware chain': 'middleware-chain',
  'request pipeline': 'middleware-chain',

  // Validation
  'validation': 'request-validator',
  'request validation': 'request-validator',
  'input validation': 'request-validator',
  'validator': 'request-validator',
  'validate': 'request-validator',
  'schema validation': 'request-validator',

  // CORS
  'cors': 'cors-middleware',
  'cross-origin': 'cors-middleware',
  'cross origin': 'cors-middleware',

  // Auth
  'jwt': 'jwt-auth',
  'jwt auth': 'jwt-auth',
  'authentication': 'jwt-auth',
  'auth middleware': 'jwt-auth',
  'token auth': 'jwt-auth',

  // Events
  'event emitter': 'event-emitter',
  'event-emitter': 'event-emitter',
  'events': 'event-emitter',
  'pub sub': 'event-emitter',
  'pubsub': 'event-emitter',
  'publish subscribe': 'event-emitter',

  // Queue
  'promise queue': 'promise-queue',
  'promise-queue': 'promise-queue',
  'task queue': 'promise-queue',
  'job queue': 'promise-queue',
  'concurrency': 'promise-queue',

  // Retry
  'retry': 'retry-with-backoff',
  'retry with backoff': 'retry-with-backoff',
  'exponential backoff': 'retry-with-backoff',
  'backoff': 'retry-with-backoff',

  // Circuit breaker
  'circuit breaker': 'circuit-breaker',
  'circuit-breaker': 'circuit-breaker',
  'breaker': 'circuit-breaker',
  'fault tolerance': 'circuit-breaker',

  // Streaming / Pipeline
  'stream': 'stream-pipeline',
  'stream pipeline': 'stream-pipeline',
  'streaming': 'stream-pipeline',
  'pipe': 'stream-pipeline',

  // CSV
  'csv': 'csv-parser',
  'csv parser': 'csv-parser',
  'csv parsing': 'csv-parser',

  // Observable
  'observable': 'observable',
  'reactive': 'observable',
  'rxjs': 'observable',

  // Common utilities
  'debounce': 'debounce',
  'throttle': 'throttle',
  'memoize': 'memoize',
  'memoization': 'memoize',
  'cache': 'memoize',
  'deep clone': 'deep-clone',
  'deep-clone': 'deep-clone',
  'deep copy': 'deep-clone',
};

// ─── PatternComposer ───

class PatternComposer {
  /**
   * @param {import('../api/oracle').RemembranceOracle} oracle
   */
  constructor(oracle) {
    if (!oracle) {
      throw new Error('PatternComposer requires a RemembranceOracle instance');
    }
    this.oracle = oracle;
    this._customTemplates = [];
  }

  /**
   * Find and compose patterns matching a recipe.
   *
   * @param {object} recipe
   * @param {string[]} recipe.patterns - Pattern names to compose
   * @param {string}   [recipe.language='javascript'] - Target language
   * @param {string}   [recipe.glue='module'] - Composition mode: 'module' | 'class' | 'function'
   * @param {string}   [recipe.name] - Optional name for the composed output
   * @param {string}   [recipe.description] - Optional description override
   * @returns {{ code: string, patterns: Array, imports: string[], description: string }}
   */
  compose(recipe) {
    const {
      patterns: patternNames = [],
      language = 'javascript',
      glue = 'module',
      name,
      description,
    } = recipe;

    if (!patternNames || patternNames.length === 0) {
      return {
        code: '',
        patterns: [],
        imports: [],
        description: 'No patterns specified',
      };
    }

    // Resolve each pattern name through the oracle
    const resolved = this._resolvePatterns(patternNames, language);

    if (resolved.length === 0) {
      return {
        code: '// No matching patterns found in the oracle',
        patterns: [],
        imports: [],
        description: `No matches found for: ${patternNames.join(', ')}`,
      };
    }

    // Extract imports from resolved patterns
    const imports = this._extractImports(resolved);

    // Generate composed code based on glue mode
    const composedName = name || this._generateName(resolved);
    const composedDescription = description || this._generateDescription(resolved);
    const code = this._composeCode(resolved, {
      glue,
      language,
      name: composedName,
      description: composedDescription,
      imports,
    });

    return {
      code,
      patterns: resolved.map(r => ({
        name: r.name,
        id: r.id,
        language: r.language,
        coherency: r.coherency,
        matchScore: r.matchScore,
        source: r.source,
      })),
      imports,
      description: composedDescription,
    };
  }

  /**
   * Compose from a natural language description.
   * Parses the description for keywords that match known templates or pattern names,
   * extracts pattern names, and composes the found patterns.
   *
   * @param {string} description - Natural language description
   * @param {string} [language='javascript'] - Target language
   * @returns {{ code: string, patterns: Array, imports: string[], description: string }}
   */
  composeFromDescription(description, language = 'javascript') {
    if (!description || typeof description !== 'string') {
      return {
        code: '',
        patterns: [],
        imports: [],
        description: 'No description provided',
      };
    }

    const lower = description.toLowerCase();

    // 1. Check if description matches a known template
    const allTemplates = [...BUILT_IN_TEMPLATES, ...this._customTemplates];
    const matchedTemplate = this._matchTemplate(lower, allTemplates);

    if (matchedTemplate) {
      return this.compose({
        patterns: matchedTemplate.patterns,
        language,
        glue: matchedTemplate.defaultGlue || 'module',
        description: `${matchedTemplate.description} (from template: ${matchedTemplate.name})`,
      });
    }

    // 2. Extract pattern names from the description using keyword matching
    const extractedPatterns = this._extractPatternsFromDescription(lower);

    if (extractedPatterns.length === 0) {
      // 3. Fallback: search the oracle directly with the full description
      const searchResults = this.oracle.search(description, { limit: 5, language });
      if (searchResults.length === 0) {
        return {
          code: '// No matching patterns found for the given description',
          patterns: [],
          imports: [],
          description,
        };
      }

      // Use top search results as the pattern set
      const patternNames = searchResults
        .filter(r => r.matchScore >= 0.2)
        .slice(0, 4)
        .map(r => r.name || r.id);

      return this.compose({
        patterns: patternNames,
        language,
        glue: 'module',
        description,
      });
    }

    // Deduplicate extracted patterns while preserving order
    const uniquePatterns = [...new Set(extractedPatterns)];

    return this.compose({
      patterns: uniquePatterns,
      language,
      glue: this._inferGlue(lower),
      description,
    });
  }

  /**
   * List all available composition templates (built-in + custom).
   *
   * @returns {Array<{ name: string, description: string, patterns: string[] }>}
   */
  templates() {
    return [...BUILT_IN_TEMPLATES, ...this._customTemplates].map(t => ({
      name: t.name,
      description: t.description,
      patterns: [...t.patterns],
    }));
  }

  /**
   * Add a custom composition template.
   *
   * @param {object} template
   * @param {string} template.name - Template name (must be unique)
   * @param {string} template.description - What the template composes
   * @param {string[]} template.patterns - Pattern names to include
   * @param {string} [template.defaultGlue='module'] - Default composition mode
   * @param {string[]} [template.keywords=[]] - Keywords for matching from description
   */
  addTemplate(template) {
    if (!template || !template.name) {
      throw new Error('Template must have a name');
    }
    if (!template.patterns || template.patterns.length === 0) {
      throw new Error('Template must have at least one pattern');
    }

    // Prevent duplicate names
    const allTemplates = [...BUILT_IN_TEMPLATES, ...this._customTemplates];
    if (allTemplates.some(t => t.name === template.name)) {
      throw new Error(`Template "${template.name}" already exists`);
    }

    this._customTemplates.push({
      name: template.name,
      description: template.description || '',
      patterns: [...template.patterns],
      defaultGlue: template.defaultGlue || 'module',
      keywords: template.keywords || [],
    });
  }

  // ─── Internal: Pattern Resolution ───

  /**
   * Resolve an array of pattern names to their code via the oracle.
   * Tries oracle.search() first (for name/keyword match),
   * then falls back to oracle.resolve() for semantic matching.
   */
  _resolvePatterns(patternNames, language) {
    const resolved = [];

    for (const name of patternNames) {
      const pattern = this._resolveOne(name, language);
      if (pattern) {
        resolved.push(pattern);
      }
    }

    return resolved;
  }

  /**
   * Resolve a single pattern name. Strategy:
   * 1. Search by name (exact or fuzzy)
   * 2. Fall back to resolve() for semantic decision
   * 3. Accept PULL or EVOLVE decisions; skip GENERATE
   */
  _resolveOne(name, language) {
    // Strategy 1: Direct search by name
    const searchResults = this.oracle.search(name, { limit: 5, language });

    if (searchResults.length > 0) {
      // Prefer exact name matches, then highest score
      const exact = searchResults.find(r =>
        r.name && r.name.toLowerCase() === name.toLowerCase()
      );
      const best = exact || searchResults[0];

      if (best.matchScore >= 0.15 || exact) {
        return {
          name: best.name || name,
          id: best.id,
          code: best.code,
          language: best.language || language,
          coherency: best.coherency,
          matchScore: best.matchScore || 0,
          description: best.description || '',
          tags: best.tags || [],
          source: best.source || 'search',
        };
      }
    }

    // Strategy 2: Resolve via the oracle decision engine
    const resolution = this.oracle.resolve({
      description: name,
      language,
      tags: [name],
    });

    if (resolution.pattern && (resolution.decision === 'pull' || resolution.decision === 'evolve')) {
      return {
        name: resolution.pattern.name || name,
        id: resolution.pattern.id,
        code: resolution.pattern.code,
        language: resolution.pattern.language || language,
        coherency: resolution.pattern.coherencyScore || resolution.confidence,
        matchScore: resolution.confidence,
        description: resolution.pattern.description || '',
        tags: resolution.pattern.tags || [],
        source: 'resolve',
      };
    }

    // Not found
    return null;
  }

  // ─── Internal: Import Extraction ───

  /**
   * Extract import/require statements from resolved pattern code.
   * Deduplicates and returns a clean list.
   */
  _extractImports(resolvedPatterns) {
    const importSet = new Set();

    for (const pattern of resolvedPatterns) {
      const code = pattern.code || '';
      const lines = code.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        // CommonJS require
        if (/^(?:const|let|var)\s+.*=\s*require\s*\(/.test(trimmed)) {
          importSet.add(trimmed);
        }
        // ES module import
        if (/^import\s+/.test(trimmed)) {
          importSet.add(trimmed);
        }
      }
    }

    return [...importSet];
  }

  // ─── Internal: Code Composition ───

  /**
   * Compose resolved patterns into a single code block.
   * Mode determines the wrapping structure.
   */
  _composeCode(resolvedPatterns, options) {
    const { glue, language, name, description, imports } = options;

    switch (glue) {
      case 'class':
        return this._composeAsClass(resolvedPatterns, { language, name, description, imports });
      case 'function':
        return this._composeAsFunction(resolvedPatterns, { language, name, description, imports });
      case 'module':
      default:
        return this._composeAsModule(resolvedPatterns, { language, name, description, imports });
    }
  }

  /**
   * Compose as a module with imports at top, pattern code in sections,
   * and an exports block at the bottom.
   */
  _composeAsModule(patterns, options) {
    const { name, description, imports } = options;
    const sections = [];

    // Header
    sections.push(`/**`);
    sections.push(` * ${name}`);
    if (description) {
      sections.push(` * ${description}`);
    }
    sections.push(` *`);
    sections.push(` * Composed from: ${patterns.map(p => p.name).join(', ')}`);
    sections.push(` */`);
    sections.push('');

    // Imports (deduplicated, from patterns)
    if (imports.length > 0) {
      for (const imp of imports) {
        sections.push(imp);
      }
      sections.push('');
    }

    // Each pattern's code as a labeled section
    const exportNames = [];
    for (const pattern of patterns) {
      const cleanCode = this._stripImports(pattern.code);
      if (!cleanCode.trim()) continue;

      sections.push(`// ─── ${pattern.name} ───`);
      sections.push('');
      sections.push(cleanCode.trim());
      sections.push('');

      // Collect exported identifiers
      const identifiers = this._extractExportedIdentifiers(cleanCode);
      exportNames.push(...identifiers);
    }

    // Module exports
    if (exportNames.length > 0) {
      const uniqueExports = [...new Set(exportNames)];
      sections.push('// ─── Exports ───');
      sections.push('');
      sections.push(`module.exports = {`);
      for (const exp of uniqueExports) {
        sections.push(`  ${exp},`);
      }
      sections.push(`};`);
    }

    return sections.join('\n');
  }

  /**
   * Compose as a class that delegates to each pattern.
   * Each pattern becomes a component initialized in the constructor.
   */
  _composeAsClass(patterns, options) {
    const { name, description, imports } = options;
    const className = this._toPascalCase(name);
    const sections = [];

    // Header
    sections.push(`/**`);
    sections.push(` * ${className}`);
    if (description) {
      sections.push(` * ${description}`);
    }
    sections.push(` *`);
    sections.push(` * Composed from: ${patterns.map(p => p.name).join(', ')}`);
    sections.push(` */`);
    sections.push('');

    // Imports
    if (imports.length > 0) {
      for (const imp of imports) {
        sections.push(imp);
      }
      sections.push('');
    }

    // Inline pattern code (stripped of imports/exports) as local definitions
    for (const pattern of patterns) {
      const cleanCode = this._stripImportsAndExports(pattern.code);
      if (!cleanCode.trim()) continue;
      sections.push(`// ─── ${pattern.name} (inlined) ───`);
      sections.push(cleanCode.trim());
      sections.push('');
    }

    // Class definition
    sections.push(`class ${className} {`);

    // Constructor: initialize each pattern component
    sections.push(`  constructor(options = {}) {`);
    for (const pattern of patterns) {
      const propName = this._toCamelCase(pattern.name);
      const identifiers = this._extractExportedIdentifiers(pattern.code);
      const factoryName = identifiers[0];
      if (factoryName) {
        sections.push(`    this.${propName} = typeof ${factoryName} === 'function' ? ${factoryName}(options.${propName} || {}) : ${factoryName};`);
      } else {
        sections.push(`    this.${propName} = options.${propName} || null;`);
      }
    }
    sections.push(`  }`);
    sections.push('');

    // Getter for each component
    for (const pattern of patterns) {
      const propName = this._toCamelCase(pattern.name);
      const methodName = `get${this._toPascalCase(pattern.name)}`;
      sections.push(`  ${methodName}() {`);
      sections.push(`    return this.${propName};`);
      sections.push(`  }`);
    }

    sections.push(`}`);
    sections.push('');
    sections.push(`module.exports = { ${className} };`);

    return sections.join('\n');
  }

  /**
   * Compose as a factory function that returns an object
   * with all pattern functionality.
   */
  _composeAsFunction(patterns, options) {
    const { name, description, imports } = options;
    const fnName = this._toCamelCase(name.startsWith('create') ? name : `create-${name}`);
    const sections = [];

    // Header
    sections.push(`/**`);
    sections.push(` * ${fnName}`);
    if (description) {
      sections.push(` * ${description}`);
    }
    sections.push(` *`);
    sections.push(` * Composed from: ${patterns.map(p => p.name).join(', ')}`);
    sections.push(` */`);
    sections.push('');

    // Imports
    if (imports.length > 0) {
      for (const imp of imports) {
        sections.push(imp);
      }
      sections.push('');
    }

    // Inline pattern code
    for (const pattern of patterns) {
      const cleanCode = this._stripImportsAndExports(pattern.code);
      if (!cleanCode.trim()) continue;
      sections.push(`// ─── ${pattern.name} (inlined) ───`);
      sections.push(cleanCode.trim());
      sections.push('');
    }

    // Factory function
    sections.push(`function ${fnName}(options = {}) {`);

    // Initialize each component
    const returnProps = [];
    for (const pattern of patterns) {
      const propName = this._toCamelCase(pattern.name);
      const identifiers = this._extractExportedIdentifiers(pattern.code);
      const factoryName = identifiers[0];
      if (factoryName) {
        sections.push(`  const ${propName} = typeof ${factoryName} === 'function' ? ${factoryName}(options.${propName} || {}) : ${factoryName};`);
      } else {
        sections.push(`  const ${propName} = options.${propName} || null;`);
      }
      returnProps.push(propName);
    }

    sections.push('');
    sections.push(`  return {`);
    for (const prop of returnProps) {
      sections.push(`    ${prop},`);
    }
    sections.push(`  };`);
    sections.push(`}`);
    sections.push('');
    sections.push(`module.exports = { ${fnName} };`);

    return sections.join('\n');
  }

  // ─── Internal: Code Utilities ───

  /**
   * Strip import/require lines from code so they can be hoisted.
   */
  _stripImports(code) {
    return code
      .split('\n')
      .filter(line => {
        const t = line.trim();
        if (/^(?:const|let|var)\s+.*=\s*require\s*\(/.test(t)) return false;
        if (/^import\s+/.test(t)) return false;
        return true;
      })
      .join('\n');
  }

  /**
   * Strip imports AND module.exports from code for inlining.
   */
  _stripImportsAndExports(code) {
    const lines = code.split('\n');
    const filtered = [];
    let inExports = false;

    for (const line of lines) {
      const t = line.trim();
      // Skip require/import
      if (/^(?:const|let|var)\s+.*=\s*require\s*\(/.test(t)) continue;
      if (/^import\s+/.test(t)) continue;

      // Skip module.exports blocks
      if (/^module\.exports\s*=/.test(t)) {
        inExports = true;
        // Single-line export
        if (t.includes(';') || (t.includes('{') && t.includes('}'))) {
          inExports = false;
          continue;
        }
        continue;
      }
      if (inExports) {
        if (t === '};' || t === '}') {
          inExports = false;
        }
        continue;
      }

      // Skip export default / export {}
      if (/^export\s+(default\s+)?/.test(t) && /^export\s+\{/.test(t)) continue;

      filtered.push(line);
    }

    return filtered.join('\n');
  }

  /**
   * Extract the names of functions/classes/constants that are likely
   * exported or serve as the main public API of a code block.
   */
  _extractExportedIdentifiers(code) {
    const identifiers = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const t = line.trim();

      // function declarations: function myFunc(
      const fnMatch = t.match(/^(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
      if (fnMatch) {
        identifiers.push(fnMatch[1]);
        continue;
      }

      // const/let arrow or expression: const myFunc = (
      const constMatch = t.match(/^(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (constMatch && !t.includes('require(')) {
        identifiers.push(constMatch[1]);
        continue;
      }

      // class declarations: class MyClass {
      const classMatch = t.match(/^class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (classMatch) {
        identifiers.push(classMatch[1]);
        continue;
      }
    }

    return identifiers;
  }

  // ─── Internal: Description Parsing ───

  /**
   * Match a lowercased description against template keywords.
   * Returns the best-matching template or null.
   */
  _matchTemplate(lowerDesc, templates) {
    let bestMatch = null;
    let bestScore = 0;

    for (const template of templates) {
      const keywords = template.keywords || [];
      if (keywords.length === 0) continue;

      // Score = fraction of template keywords present in description
      const hits = keywords.filter(kw => lowerDesc.includes(kw)).length;
      const score = hits / keywords.length;

      // Also check template name
      const nameBonus = lowerDesc.includes(template.name) ? 0.5 : 0;
      const total = score + nameBonus;

      if (total > bestScore && total >= 0.4) {
        bestScore = total;
        bestMatch = template;
      }
    }

    return bestMatch;
  }

  /**
   * Extract pattern names from a description by matching known keywords.
   * Sorted by phrase length descending to prefer longer (more specific) matches.
   */
  _extractPatternsFromDescription(lowerDesc) {
    const matched = [];

    // Sort keywords by length descending — match longer phrases first
    const sortedKeywords = Object.keys(KEYWORD_TO_PATTERN)
      .sort((a, b) => b.length - a.length);

    const seen = new Set();
    for (const keyword of sortedKeywords) {
      if (lowerDesc.includes(keyword)) {
        const patternName = KEYWORD_TO_PATTERN[keyword];
        if (!seen.has(patternName)) {
          seen.add(patternName);
          matched.push(patternName);
        }
      }
    }

    return matched;
  }

  /**
   * Infer the best glue mode from a description.
   */
  _inferGlue(lowerDesc) {
    if (/\bclass\b|\bservice\b|\bobject\b|\binstance\b/.test(lowerDesc)) {
      return 'class';
    }
    if (/\bfactory\b|\bcreate\b|\bbuild\b|\bmaker\b/.test(lowerDesc)) {
      return 'function';
    }
    return 'module';
  }

  // ─── Internal: Naming Utilities ───

  /**
   * Generate a name from resolved patterns.
   */
  _generateName(patterns) {
    if (patterns.length === 1) return patterns[0].name;
    if (patterns.length <= 3) {
      return patterns.map(p => p.name).join('-');
    }
    return `composed-${patterns.length}-patterns`;
  }

  /**
   * Generate a description from resolved patterns.
   */
  _generateDescription(patterns) {
    return `Composed module combining: ${patterns.map(p => p.name).join(', ')}`;
  }

  /**
   * Convert a kebab-case or space-separated name to PascalCase.
   */
  _toPascalCase(str) {
    return str
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Convert a kebab-case or space-separated name to camelCase.
   */
  _toCamelCase(str) {
    const pascal = this._toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}

module.exports = { PatternComposer, BUILT_IN_TEMPLATES, KEYWORD_TO_PATTERN };
