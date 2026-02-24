/**
 * Search Intelligence — Data Constants.
 *
 * Extracted from search-intelligence.js for simplicity.
 * Intent patterns, typo corrections, language aliases, and architectural patterns.
 */

// ─── Intent Signals ───

const INTENT_PATTERNS = {
  performance: {
    triggers: /\b(fast|quick|efficient|optimiz|O\(|performance|speed|throughput|latency|benchmark)\b/i,
    boost: { tags: ['algorithm', 'optimization', 'performance'], codeHints: ['cache', 'memo', 'pool', 'batch'] },
    weight: 0.15,
  },
  safety: {
    triggers: /\b(safe|secure|valid|sanitiz|guard|protect|prevent|defensive|robust)\b/i,
    boost: { tags: ['validation', 'security', 'safe'], codeHints: ['try', 'catch', 'throw', 'assert', 'check'] },
    weight: 0.15,
  },
  simplicity: {
    triggers: /\b(simple|easy|basic|minimal|clean|readable|straightforward|concise|tiny)\b/i,
    boost: { tags: ['utility', 'helper', 'simple'], codeHints: [] },
    weight: 0.1,
    penalize: { minLines: 20 },
  },
  async: {
    triggers: /\b(async|await|promise|concurrent|parallel|non-blocking|callback|event)\b/i,
    boost: { tags: ['async', 'promise', 'concurrent'], codeHints: ['async', 'await', 'Promise', 'callback'] },
    weight: 0.12,
  },
  functional: {
    triggers: /\b(functional|immutable|pure|compose|pipe|chain|map|filter|reduce|declarative)\b/i,
    boost: { tags: ['functional', 'composition', 'utility'], codeHints: ['map', 'filter', 'reduce', 'pipe', 'compose'] },
    weight: 0.1,
  },
  testing: {
    triggers: /\b(test|spec|mock|stub|assert|expect|should|coverage|unit|integration)\b/i,
    boost: { tags: ['test', 'testing', 'mock'], codeHints: ['assert', 'expect', 'describe', 'it', 'test'] },
    weight: 0.1,
  },
  architecture: {
    triggers: /\b(split|refactor|modular|barrel|facade|extract|decompos|restructur|reorganiz|decouple|monolith|sub-?module|re-?export|separate concerns|single responsibility)\b/i,
    boost: { tags: ['architecture', 'refactor', 'pattern', 'module'], codeHints: ['module.exports', 'require', 'import', 'export'] },
    weight: 0.2,
    structural: true,
  },
  designPattern: {
    triggers: /\b(factory|singleton|observer|strategy|adapter|decorator|proxy|builder|middleware|plugin|registry|pub-?sub|event-?emitter)\b/i,
    boost: { tags: ['pattern', 'design-pattern', 'architecture'], codeHints: ['class', 'interface', 'extends', 'implements'] },
    weight: 0.15,
    structural: true,
  },
};

// ─── Common Typos & Abbreviations ───

const CORRECTIONS = {
  'debounse': 'debounce',
  'throttel': 'throttle',
  'memoize': 'memoize',
  'memorize': 'memoize',
  'memorise': 'memoize',
  'seach': 'search',
  'serach': 'search',
  'valiate': 'validate',
  'cahe': 'cache',
  'chache': 'cache',
  'queu': 'queue',
  'quere': 'query',
  'sotr': 'sort',
  'algortihm': 'algorithm',
  'algorithim': 'algorithm',
  'recurive': 'recursive',
  'recusive': 'recursive',
  'asyncronous': 'asynchronous',
  'promis': 'promise',
  'flaten': 'flatten',
  'flattern': 'flatten',
  'concurency': 'concurrency',

  'fn': 'function',
  'cb': 'callback',
  'arr': 'array',
  'str': 'string',
  'obj': 'object',
  'num': 'number',
  'len': 'length',
  'idx': 'index',
  'req': 'request',
  'res': 'response',
  'err': 'error',
  'msg': 'message',
  'ctx': 'context',
  'cfg': 'config',
  'opts': 'options',
  'params': 'parameters',
  'args': 'arguments',
  'impl': 'implementation',
  'util': 'utility',
  'utils': 'utilities',
  'regex': 'regular expression',
  'fmt': 'format',
  'iter': 'iterator',
  'gen': 'generator',
};

// ─── Language Aliases ───

const LANGUAGE_ALIASES = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'cpp': 'c++',
  'node': 'javascript',
  'nodejs': 'javascript',
  'deno': 'typescript',
};

const LANGUAGE_FAMILIES = {
  javascript: ['typescript'],
  typescript: ['javascript'],
  python: [],
  go: [],
  rust: [],
};

// ─── Known Language Names ───

const KNOWN_LANGUAGES = new Set([
  'javascript', 'typescript', 'python', 'go', 'rust', 'java', 'ruby',
]);

// ─── Built-In Architectural Patterns ───

const ARCHITECTURAL_PATTERNS = [
  {
    id: 'arch:barrel-reexport',
    name: 'Barrel Re-Export',
    description: 'Split a monolithic module into focused sub-modules with a thin barrel file that re-exports everything. Preserves backward-compatible require() paths.',
    tags: ['architecture', 'refactor', 'module', 'barrel', 'split'],
    language: 'javascript',
    code: `// barrel.js — thin re-export preserving original require path
const subA = require('./module-sub-a');
const subB = require('./module-sub-b');
module.exports = { ...subA, ...subB };`,
    source: 'builtin-architecture',
    coherency: 1.0,
  },
  {
    id: 'arch:facade-pattern',
    name: 'Facade Pattern',
    description: 'Provide a simplified interface to a complex subsystem. The facade delegates to sub-modules but exposes a clean, minimal API.',
    tags: ['architecture', 'pattern', 'facade', 'api'],
    language: 'javascript',
    code: `// facade.js — simplified interface to complex subsystem
const auth = require('./auth');
const db = require('./database');
const cache = require('./cache');

module.exports = {
  async getUser(id) {
    const cached = cache.get('user:' + id);
    if (cached) return cached;
    const user = await db.findUser(id);
    cache.set('user:' + id, user);
    return user;
  },
};`,
    source: 'builtin-architecture',
    coherency: 1.0,
  },
  {
    id: 'arch:strategy-pattern',
    name: 'Strategy Pattern',
    description: 'Define a family of algorithms, encapsulate each one, and make them interchangeable. Strategies let the algorithm vary independently from clients that use it.',
    tags: ['architecture', 'pattern', 'strategy', 'design-pattern'],
    language: 'javascript',
    code: `// strategies.js — interchangeable algorithm implementations
const strategies = {
  json: { serialize: JSON.stringify, deserialize: JSON.parse },
  csv: { serialize: toCsv, deserialize: parseCsv },
};

function process(data, format = 'json') {
  const strategy = strategies[format];
  if (!strategy) throw new Error('Unknown format: ' + format);
  return strategy.serialize(data);
}`,
    source: 'builtin-architecture',
    coherency: 1.0,
  },
  {
    id: 'arch:plugin-registry',
    name: 'Plugin Registry',
    description: 'Extensible plugin system with registration, hooks, and lifecycle management. Plugins register themselves and are invoked at extension points.',
    tags: ['architecture', 'pattern', 'plugin', 'registry', 'extensible'],
    language: 'javascript',
    code: `// registry.js — extensible plugin system
const plugins = new Map();

function register(name, plugin) {
  if (plugins.has(name)) throw new Error('Plugin already registered: ' + name);
  plugins.set(name, plugin);
  if (typeof plugin.init === 'function') plugin.init();
}

function invoke(hook, ...args) {
  for (const [, plugin] of plugins) {
    if (typeof plugin[hook] === 'function') plugin[hook](...args);
  }
}`,
    source: 'builtin-architecture',
    coherency: 1.0,
  },
  {
    id: 'arch:mixin-prototype',
    name: 'Mixin / Prototype Extension',
    description: 'Compose behavior from multiple sources onto a prototype. Each mixin is a plain object of methods that receives context via this.',
    tags: ['architecture', 'pattern', 'mixin', 'composition'],
    language: 'javascript',
    code: `// Compose behavior from focused sub-modules
const searchMethods = require('./search');
const feedbackMethods = require('./feedback');

class Oracle {
  constructor(store) { this.store = store; }
}

Object.assign(Oracle.prototype, searchMethods, feedbackMethods);`,
    source: 'builtin-architecture',
    coherency: 1.0,
  },
];

module.exports = {
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,
  KNOWN_LANGUAGES,
  ARCHITECTURAL_PATTERNS,
};
