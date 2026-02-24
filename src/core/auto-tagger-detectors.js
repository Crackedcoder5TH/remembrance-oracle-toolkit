/**
 * Auto-Tagger Detectors — domain patterns, construct tests, and stop words.
 *
 * Extracted from auto-tagger.js for simplicity.
 * Data-only module: no logic, just configuration arrays and sets.
 */

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

// ─── Stop Words ───

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

// ─── Noise Tags ───

const NOISE_TAGS = new Set([
  'auto-generated', 'variant', 'auto-refined', 'pattern', 'needs-test', 'needs-review',
]);

// ─── Generic Name Filter ───

const GENERIC_NAMES = new Set([
  'index', 'main', 'default', 'module', 'exports', 'require',
  'handler', 'result', 'data', 'value', 'item', 'temp', 'args',
]);

// ─── Structured Tag Prefixes ───

const STRUCTURED_PREFIXES = ['license:', 'source:'];

module.exports = {
  DOMAIN_DETECTORS,
  CONSTRUCT_DETECTORS,
  STOP_WORDS,
  NOISE_TAGS,
  GENERIC_NAMES,
  STRUCTURED_PREFIXES,
};
