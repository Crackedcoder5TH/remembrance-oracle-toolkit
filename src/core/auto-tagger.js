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
 */

const { identifyConcepts, CONCEPT_CLUSTERS } = require('../search/embeddings');

// ─── Domain Detectors ───
// Each detector scans code for domain-specific signals.

const DOMAIN_DETECTORS = [
  {
    tag: 'auth',
    patterns: [/\b(auth|login|logout|signin|signup|session|token|jwt|oauth|password|credential|permission|role|acl|rbac)\b/i],
  },
  {
    tag: 'crypto',
    patterns: [/\b(crypto|hash|encrypt|decrypt|cipher|hmac|sha|md5|aes|rsa|bcrypt|scrypt|argon|pbkdf|salt|digest)\b/i],
  },
  {
    tag: 'database',
    patterns: [/\b(sql|sqlite|postgres|mysql|mongo|redis|query|insert|update|delete|schema|migration|orm|sequelize|prisma|knex|drizzle|SELECT|FROM\s+\w+|WHERE|JOIN|CREATE\s+TABLE|DROP\s+TABLE|db\.prepare|\.execute\()\b/i],
  },
  {
    tag: 'network',
    patterns: [/\b(http|https|fetch|axios|request|response|endpoint|api|rest|graphql|websocket|socket|cors|proxy|url|dns|tcp|udp)\b/i],
  },
  {
    tag: 'ui',
    patterns: [/\b(component|render|dom|css|style|layout|button|input|form|modal|toast|dropdown|menu|nav|sidebar|html|jsx|tsx|template)\b/i],
  },
  {
    tag: 'react',
    patterns: [/\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|React\.|createContext|forwardRef|memo\(|StrictMode)\b/],
  },
  {
    tag: 'testing',
    patterns: [/\b(describe|it\(|test\(|expect\(|assert|mock|stub|spy|jest|mocha|vitest|beforeEach|afterEach|beforeAll|afterAll)\b/],
  },
  {
    tag: 'cli',
    patterns: [/\b(argv|process\.argv|commander|yargs|inquirer|readline|stdin|stdout|prompt|parseArgs|minimist)\b/],
  },
  {
    tag: 'file-io',
    patterns: [/\b(readFile|writeFile|readFileSync|writeFileSync|createReadStream|createWriteStream|fs\.|path\.|dirname|basename|glob)\b/],
  },
  {
    tag: 'async',
    patterns: [/\b(async|await|Promise|\.then\(|\.catch\(|Promise\.all|Promise\.race|Promise\.allSettled|callback|EventEmitter|on\()\b/],
  },
  {
    tag: 'stream',
    patterns: [/\b(stream|pipe|Transform|Readable|Writable|Duplex|PassThrough|pipeline|createReadStream|createWriteStream)\b/],
  },
  {
    tag: 'validation',
    patterns: [/\b(validate|sanitize|isValid|schema|zod|joi|yup|ajv|assert|check|verify|constraint|rule)\b/i],
  },
  {
    tag: 'security',
    patterns: [/\b(xss|csrf|injection|sanitize|escape|helmet|cors|rate-?limit|brute|firewall|whitelist|blacklist|allowlist|blocklist)\b/i],
  },
  {
    tag: 'error-handling',
    patterns: [/\btry\s*\{[\s\S]*?\bcatch\b/, /\b(Error|throw|reject|fail|fallback|recover|retry)\b/],
  },
  {
    tag: 'data-structure',
    patterns: [/\b(stack|queue|heap|trie|linked-?list|tree|graph|set|map|hashmap|hashtable|deque|priority)\b/i],
  },
  {
    tag: 'algorithm',
    patterns: [/\b(sort|search|traverse|bfs|dfs|dijkstra|dynamic-?programming|greedy|divide|conquer|backtrack|recursion|recursive)\b/i],
  },
  {
    tag: 'string',
    patterns: [/\b(string|text|parse|regex|replace|match|split|join|trim|substring|charAt|indexOf|toLowerCase|toUpperCase|template|interpolat)\b/i],
  },
  {
    tag: 'array',
    patterns: [/\b(array|list|slice|splice|push|pop|shift|unshift|map|filter|reduce|forEach|find|findIndex|some|every|flat|flatMap)\b/i],
  },
  {
    tag: 'math',
    patterns: [/\b(Math\.|floor|ceil|round|random|sqrt|pow|abs|min|max|log|sin|cos|tan|PI|factorial|fibonacci|prime)\b/],
  },
  {
    tag: 'date-time',
    patterns: [/\b(Date|timestamp|moment|dayjs|luxon|Intl\.DateTimeFormat|toISOString|getTime|setTimeout|setInterval|cron|schedule)\b/],
  },
  {
    tag: 'functional',
    patterns: [/\b(compose|pipe|curry|partial|memoize|pure|immutable|monad|functor|applicative|fold|unfold|transducer)\b/i],
  },
  {
    tag: 'concurrency',
    patterns: [/\b(worker|thread|mutex|semaphore|lock|atomic|pool|parallel|concurrent|SharedArrayBuffer|Atomics|cluster)\b/i],
  },
  {
    tag: 'serialization',
    patterns: [/\b(JSON\.|serialize|deserialize|marshal|unmarshal|encode|decode|protobuf|msgpack|yaml|toml|xml|csv)\b/],
  },
  {
    tag: 'cache',
    patterns: [/\b(cache|memoize|lru|ttl|invalidate|expire|stale|fresh|hit|miss|evict|WeakMap|WeakRef)\b/i],
  },
  {
    tag: 'logging',
    patterns: [/\b(log|logger|winston|pino|bunyan|debug|trace|info|warn|error|fatal|console\.log|console\.error)\b/],
  },
  {
    tag: 'config',
    patterns: [/\b(config|env|dotenv|process\.env|settings|options|defaults|override|merge|deep-?merge)\b/i],
  },
  {
    tag: 'middleware',
    patterns: [/\b(middleware|express|koa|hapi|fastify|router|route|handler|next\(\)|app\.use|app\.get|app\.post)\b/],
  },
  {
    tag: 'state-management',
    patterns: [/\b(store|reducer|dispatch|action|selector|state|zustand|redux|mobx|recoil|jotai|signal|observable)\b/i],
  },
  {
    tag: 'typescript',
    patterns: [/\b(interface\s+\w|type\s+\w.*=|generic|<T>|<T,|extends\s|implements\s|keyof|typeof|as\s|readonly\s|enum\s)\b/],
  },
  {
    tag: 'solana',
    patterns: [/\b(solana|anchor|program|instruction|account|lamport|pubkey|keypair|SystemProgram|TokenProgram|SPL|wallet|phantom|metaplex)\b/i],
  },
  {
    tag: 'blockchain',
    patterns: [/\b(blockchain|ethereum|web3|ethers|contract|abi|transaction|block|wallet|gas|nonce|wei|gwei|erc20|erc721|nft|defi)\b/i],
  },
  {
    tag: 'ai',
    patterns: [/\b(openai|anthropic|claude|gpt|llm|embedding|vector|neural|model|inference|prompt|completion|token|transformer|langchain)\b/i],
  },
  {
    tag: 'whisper',
    patterns: [/\b(whisper|transcri|speech|audio|voice|recognition|stt|tts|wav|mp3|ffmpeg|microphone)\b/i],
  },
  {
    tag: 'image',
    patterns: [/\b(image|canvas|svg|png|jpg|jpeg|gif|webp|resize|crop|thumbnail|sharp|jimp|pixel|bitmap|draw)\b/i],
  },
  {
    tag: 'parser',
    patterns: [/\b(parse|parser|lexer|tokenize|ast|syntax|grammar|visitor|walk|compile|transpile)\b/i],
  },
  {
    tag: 'generator',
    patterns: [/\bfunction\s*\*|yield\b|\[Symbol\.iterator\]|\[Symbol\.asyncIterator\]/],
  },
  {
    tag: 'class',
    patterns: [/\bclass\s+\w+/],
  },
  {
    tag: 'decorator',
    patterns: [/@\w+\s*(\(|class|function|const|let|var)/, /\bdecorat/i],
  },
  {
    tag: 'proxy',
    patterns: [/\bnew\s+Proxy\b|\bReflect\.\w+/],
  },
  {
    tag: 'event',
    patterns: [/\b(EventEmitter|addEventListener|removeEventListener|emit|on\(|once\(|off\(|dispatchEvent)\b/],
  },
  {
    tag: 'observable',
    patterns: [/\b(Observable|Subject|BehaviorSubject|ReplaySubject|subscribe|pipe\(|rxjs|switchMap|mergeMap|combineLatest)\b/],
  },
];

// ─── Code Construct Detectors ───
// Detect common code constructs and patterns.

const CONSTRUCT_DETECTORS = [
  { tag: 'recursive', test: (code) => /\bfunction\s+(\w+)[^]*?\b\1\s*\(/.test(code) || code.includes('recursive') },
  { tag: 'closure', test: (code) => /return\s+function\b/.test(code) || /=>\s*\(?\s*\w*\s*\)?\s*=>/.test(code) },
  { tag: 'singleton', test: (code) => /\binstance\b.*\bnew\b|\bgetInstance\b/i.test(code) },
  { tag: 'factory', test: (code) => /\bcreate\w+\s*\(/.test(code) || /factory/i.test(code) },
  { tag: 'builder', test: (code) => /\.build\(\)/.test(code) || /\bBuilder\b/.test(code) },
  { tag: 'iterator', test: (code) => /\[Symbol\.(async)?Iterator\]|\bnext\(\)/.test(code) },
  { tag: 'generic', test: (code) => /<T[\s,>]|<T\s+extends/.test(code) },
  { tag: 'higher-order', test: (code) => /\bfunction\s*\w*\s*\([^)]*\bfunction\b|\(.*=>\s*\(.*=>/.test(code) },
];

// ─── Description Keyword Extraction ───
// Stop words to filter out from descriptions.

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'but', 'not', 'no', 'with', 'from', 'by', 'as', 'be', 'was', 'were', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than', 'too',
  'very', 'just', 'about', 'above', 'below', 'between', 'into', 'through', 'during',
  'before', 'after', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'then',
  'once', 'here', 'there', 'any', 'also', 'its', 'only', 'own', 'same', 'so', 'if',
  'code', 'function', 'returns', 'return', 'takes', 'given', 'using', 'used', 'use',
  'new', 'get', 'set', 'make', 'like', 'via', 'etc', 'implements', 'implementation',
]);

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

  // Deduplicate
  return [...new Set(words)];
}

/**
 * Extract tags from code by scanning for domain patterns.
 * Returns an array of detected domain tags.
 */
function extractCodeTags(code) {
  if (!code || typeof code !== 'string') return [];

  const detected = [];

  // Domain detectors
  for (const detector of DOMAIN_DETECTORS) {
    for (const pattern of detector.patterns) {
      if (pattern.test(code)) {
        detected.push(detector.tag);
        break; // One match per domain is enough
      }
    }
  }

  // Construct detectors
  for (const detector of CONSTRUCT_DETECTORS) {
    try {
      if (detector.test(code)) {
        detected.push(detector.tag);
      }
    } catch {
      // Pattern test failure — skip
    }
  }

  return [...new Set(detected)];
}

/**
 * Extract concept-level tags using the embeddings concept clusters.
 * Maps code+description to high-level category tags.
 */
function extractConceptTags(code, description) {
  const text = `${description || ''} ${code || ''}`;
  const concepts = identifyConcepts(text);

  // Only keep concepts with sufficient activation score
  return concepts
    .filter(c => c.score >= 0.05)
    .map(c => c.id)
    .slice(0, 5); // Cap at 5 concept tags
}

/**
 * Detect the language from code if not provided.
 * Returns a language tag string or null.
 */
function detectLanguageTag(code, language) {
  if (language) return language.toLowerCase();

  if (!code) return null;

  // Quick heuristics
  if (/\binterface\s+\w+\s*\{|:\s*(string|number|boolean|void)\b|<T[\s,>]/.test(code)) return 'typescript';
  if (/\bdef\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import\b/.test(code)) return 'python';
  if (/\bfunc\s+\w+\s*\(|package\s+\w+|:=\s/.test(code)) return 'go';
  if (/\bfn\s+\w+\s*\(|let\s+mut\s|impl\s+\w+|pub\s+fn\b/.test(code)) return 'rust';
  if (/\bfunction\s+\w+\s*\(|const\s+\w+\s*=|=>\s*\{/.test(code)) return 'javascript';

  return null;
}

/**
 * Extract function/class names from code as potential tags.
 * Only includes names that look like meaningful identifiers.
 */
function extractNameTags(code) {
  if (!code || typeof code !== 'string') return [];

  const names = new Set();

  // Named functions
  const fnMatches = code.matchAll(/\bfunction\s+([a-zA-Z_]\w{2,})\s*\(/g);
  for (const m of fnMatches) names.add(camelToKebab(m[1]));

  // Arrow/const functions
  const constMatches = code.matchAll(/\b(?:const|let|var)\s+([a-zA-Z_]\w{2,})\s*=/g);
  for (const m of constMatches) {
    // Only add if the value looks like a function
    const afterEquals = code.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (/^\s*(?:\(|async\s|function|\w+\s*=>)/.test(afterEquals)) {
      names.add(camelToKebab(m[1]));
    }
  }

  // Class names
  const classMatches = code.matchAll(/\bclass\s+([A-Z]\w{2,})/g);
  for (const m of classMatches) names.add(camelToKebab(m[1]));

  // Exported names
  const exportMatches = code.matchAll(/\bmodule\.exports\s*=\s*\{\s*([^}]+)\}/g);
  for (const m of exportMatches) {
    const exported = m[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(s => s.length > 2);
    for (const e of exported) names.add(camelToKebab(e));
  }

  // Filter out generic names
  const GENERIC = new Set(['index', 'main', 'default', 'module', 'exports', 'require', 'handler', 'result', 'data', 'value', 'item', 'temp', 'args']);
  return [...names].filter(n => n.length > 2 && !GENERIC.has(n)).slice(0, 5);
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

  // Start with user-provided tags (always preserved)
  // Preserve case of structured tag values (license:MIT, source:MyRepo)
  const STRUCTURED_PREFIXES = ['license:', 'source:'];
  const tagSet = new Set((userTags || []).map(t => {
    const trimmed = t.trim();
    const lower = trimmed.toLowerCase();
    for (const prefix of STRUCTURED_PREFIXES) {
      if (lower.startsWith(prefix)) {
        return prefix + trimmed.slice(prefix.length);
      }
    }
    return lower;
  }).filter(Boolean));

  // 1. Code structure tags
  const codeTags = extractCodeTags(code);
  for (const t of codeTags) tagSet.add(t);

  // 2. Description keywords (limit to top 3 to prevent tag explosion)
  const descKeywords = extractDescriptionKeywords(description);
  for (const k of descKeywords.slice(0, 3)) tagSet.add(k);

  // 3. Concept cluster tags (limit to top 3)
  const conceptTags = extractConceptTags(code, description);
  for (const t of conceptTags.slice(0, 3)) tagSet.add(t);

  // 4. Language tag
  const lang = detectLanguageTag(code, language);
  if (lang) tagSet.add(lang);

  // 5. Name-derived tags (limit to top 2 to avoid unique noise)
  const nameTags = extractNameTags(code);
  for (const t of nameTags.slice(0, 2)) tagSet.add(t);

  // 6. Pattern name as tag (only if short and meaningful)
  if (name && name.length > 2 && name.length <= 30) {
    tagSet.add(camelToKebab(name));
  }

  // Remove empty/single-char tags and meta-noise
  const NOISE = new Set(['auto-generated', 'variant', 'auto-refined', 'pattern', 'needs-test', 'needs-review']);
  const result = [...tagSet]
    .filter(t => t.length > 1 && !NOISE.has(t))
    .sort();

  // Cap total tags per pattern at 12 to prevent bloat
  return result.slice(0, 12);
}

/**
 * Re-tag an existing pattern by analyzing its code and metadata.
 * Returns the enriched tag set.
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
 * Useful for preview/dry-run.
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
