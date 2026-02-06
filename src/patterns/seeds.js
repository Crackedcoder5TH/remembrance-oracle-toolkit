/**
 * Seed Patterns — proven, tested atomic code patterns.
 *
 * Each pattern includes:
 * - The code itself
 * - A test that proves it works
 * - Metadata (name, description, tags, type)
 *
 * These are the foundation of the pattern library.
 * Every single one has been tested and validated.
 */

const SEEDS = [
  // ─── Algorithms ───
  {
    name: 'binary-search',
    code: `function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`,
    testCode: `if (binarySearch([1,2,3,4,5], 3) !== 2) throw new Error("mid");
if (binarySearch([1,2,3,4,5], 1) !== 0) throw new Error("first");
if (binarySearch([1,2,3,4,5], 5) !== 4) throw new Error("last");
if (binarySearch([1,2,3,4,5], 6) !== -1) throw new Error("missing");
if (binarySearch([], 1) !== -1) throw new Error("empty");`,
    language: 'javascript',
    description: 'Binary search on a sorted array — O(log n)',
    tags: ['search', 'algorithm', 'array', 'sorted', 'binary-search'],
    patternType: 'algorithm',
  },
  {
    name: 'merge-sort',
    code: `function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = arr.length >>> 1;
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    result.push(left[i] <= right[j] ? left[i++] : right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}`,
    testCode: `const r1 = mergeSort([5,3,8,1,9,2]);
if (JSON.stringify(r1) !== '[1,2,3,5,8,9]') throw new Error("sort: " + r1);
if (JSON.stringify(mergeSort([])) !== '[]') throw new Error("empty");
if (JSON.stringify(mergeSort([1])) !== '[1]') throw new Error("single");
if (JSON.stringify(mergeSort([3,1,1,2])) !== '[1,1,2,3]') throw new Error("dups");`,
    language: 'javascript',
    description: 'Merge sort — stable O(n log n) sorting',
    tags: ['sort', 'algorithm', 'array', 'merge-sort', 'stable'],
    patternType: 'algorithm',
  },
  {
    name: 'depth-first-search',
    code: `function dfs(graph, start, visited = new Set()) {
  visited.add(start);
  const result = [start];
  for (const neighbor of (graph[start] || [])) {
    if (!visited.has(neighbor)) {
      result.push(...dfs(graph, neighbor, visited));
    }
  }
  return result;
}`,
    testCode: `const g = { a: ['b','c'], b: ['d'], c: ['d'], d: [] };
const r = dfs(g, 'a');
if (!r.includes('a') || !r.includes('b') || !r.includes('c') || !r.includes('d')) throw new Error("missing nodes");
if (r[0] !== 'a') throw new Error("should start at root");
if (r.length !== 4) throw new Error("should visit all: " + r);`,
    language: 'javascript',
    description: 'Depth-first search on adjacency list graph',
    tags: ['graph', 'search', 'algorithm', 'dfs', 'traversal'],
    patternType: 'algorithm',
  },
  {
    name: 'breadth-first-search',
    code: `function bfs(graph, start) {
  const visited = new Set([start]);
  const queue = [start];
  const result = [];
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);
    for (const neighbor of (graph[node] || [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return result;
}`,
    testCode: `const g = { a: ['b','c'], b: ['d'], c: ['d'], d: [] };
const r = bfs(g, 'a');
if (r[0] !== 'a') throw new Error("start");
if (r.length !== 4) throw new Error("all nodes");
if (r.indexOf('b') > r.indexOf('d') && r.indexOf('c') > r.indexOf('d')) throw new Error("bfs order");`,
    language: 'javascript',
    description: 'Breadth-first search on adjacency list graph',
    tags: ['graph', 'search', 'algorithm', 'bfs', 'traversal'],
    patternType: 'algorithm',
  },

  // ─── Utilities ───
  {
    name: 'debounce',
    code: `function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`,
    testCode: `const d = debounce(() => {}, 100);
if (typeof d !== 'function') throw new Error("should return function");`,
    language: 'javascript',
    description: 'Debounce — delays function execution until pause in calls',
    tags: ['utility', 'async', 'debounce', 'rate-limit', 'timing'],
    patternType: 'utility',
  },
  {
    name: 'throttle',
    code: `function throttle(fn, limit) {
  let lastCall = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return fn.apply(this, args);
    }
  };
}`,
    testCode: `let count = 0;
const t = throttle(() => count++, 50);
t(); t(); t();
if (count !== 1) throw new Error("should throttle: " + count);`,
    language: 'javascript',
    description: 'Throttle — limits function to one call per time window',
    tags: ['utility', 'async', 'throttle', 'rate-limit', 'timing'],
    patternType: 'utility',
  },
  {
    name: 'memoize',
    code: `function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}`,
    testCode: `let calls = 0;
const add = memoize((a, b) => { calls++; return a + b; });
if (add(1, 2) !== 3) throw new Error("first call");
if (add(1, 2) !== 3) throw new Error("cached call");
if (calls !== 1) throw new Error("should cache: " + calls);
if (add(2, 3) !== 5) throw new Error("diff args");
if (calls !== 2) throw new Error("new args: " + calls);`,
    language: 'javascript',
    description: 'Memoize — caches function results by arguments',
    tags: ['utility', 'cache', 'memoize', 'performance', 'optimization'],
    patternType: 'utility',
  },
  {
    name: 'deep-clone',
    code: `function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  const cloned = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone(obj[key]);
  }
  return cloned;
}`,
    testCode: `const orig = { a: 1, b: { c: [1,2,{d:3}] }, e: new Date(0) };
const clone = deepClone(orig);
if (clone === orig) throw new Error("same ref");
if (clone.b === orig.b) throw new Error("shallow copy");
clone.b.c[2].d = 999;
if (orig.b.c[2].d === 999) throw new Error("mutation leaked");
if (clone.e.getTime() !== 0) throw new Error("date clone");
if (deepClone(null) !== null) throw new Error("null");
if (deepClone(42) !== 42) throw new Error("primitive");`,
    language: 'javascript',
    description: 'Deep clone — recursively copies objects, arrays, dates, regexps',
    tags: ['utility', 'clone', 'deep-copy', 'object', 'immutable'],
    patternType: 'utility',
  },
  {
    name: 'retry-async',
    code: `async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}`,
    testCode: `let attempts = 0;
const fn = async () => { attempts++; if (attempts < 3) throw new Error("fail"); return "ok"; };
retry(fn, 3, 1).then(r => {
  if (r !== "ok") throw new Error("result");
  if (attempts !== 3) throw new Error("attempts: " + attempts);
});`,
    language: 'javascript',
    description: 'Retry with exponential backoff for async operations',
    tags: ['utility', 'async', 'retry', 'backoff', 'error-handling', 'resilience'],
    patternType: 'utility',
  },
  {
    name: 'pipe',
    code: `function pipe(...fns) {
  return function(input) {
    return fns.reduce((val, fn) => fn(val), input);
  };
}`,
    testCode: `const double = x => x * 2;
const inc = x => x + 1;
const str = x => String(x);
const transform = pipe(double, inc, str);
if (transform(5) !== "11") throw new Error("pipe: " + transform(5));
if (pipe()(42) !== 42) throw new Error("empty pipe");`,
    language: 'javascript',
    description: 'Function pipe — compose left-to-right',
    tags: ['utility', 'functional', 'pipe', 'compose', 'transform'],
    patternType: 'utility',
  },

  // ─── Data Structures ───
  {
    name: 'lru-cache',
    code: `class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }
  get(key) {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, val);
  }
}`,
    testCode: `const c = new LRUCache(2);
c.set('a', 1); c.set('b', 2);
if (c.get('a') !== 1) throw new Error("get a");
c.set('c', 3);
if (c.get('b') !== undefined) throw new Error("evict b");
if (c.get('c') !== 3) throw new Error("get c");`,
    language: 'javascript',
    description: 'LRU Cache using Map for O(1) get/set with eviction',
    tags: ['data-structure', 'cache', 'lru', 'map', 'eviction'],
    patternType: 'data-structure',
  },
  {
    name: 'trie',
    code: `class Trie {
  constructor() { this.root = {}; }
  insert(word) {
    let node = this.root;
    for (const ch of word) { node = node[ch] = node[ch] || {}; }
    node._end = true;
  }
  search(word) {
    let node = this.root;
    for (const ch of word) { if (!node[ch]) return false; node = node[ch]; }
    return node._end === true;
  }
  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix) { if (!node[ch]) return false; node = node[ch]; }
    return true;
  }
}`,
    testCode: `const t = new Trie();
t.insert("hello"); t.insert("help");
if (!t.search("hello")) throw new Error("find hello");
if (t.search("hell")) throw new Error("partial");
if (!t.startsWith("hel")) throw new Error("prefix");
if (t.startsWith("xyz")) throw new Error("bad prefix");`,
    language: 'javascript',
    description: 'Trie (prefix tree) for fast string lookups and prefix search',
    tags: ['data-structure', 'trie', 'string', 'prefix', 'search'],
    patternType: 'data-structure',
  },

  // ─── Validation ───
  {
    name: 'validate-email',
    code: `function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return re.test(email) && email.length <= 254;
}`,
    testCode: `if (!validateEmail("user@example.com")) throw new Error("valid");
if (!validateEmail("a@b.co")) throw new Error("short valid");
if (validateEmail("@example.com")) throw new Error("no local");
if (validateEmail("user@")) throw new Error("no domain");
if (validateEmail("")) throw new Error("empty");
if (validateEmail(null)) throw new Error("null");
if (validateEmail("has space@x.com")) throw new Error("space");`,
    language: 'javascript',
    description: 'Email validation with basic RFC compliance',
    tags: ['validation', 'email', 'regex', 'input', 'sanitize'],
    patternType: 'validation',
  },

  // ─── Transformation ───
  {
    name: 'flatten-deep',
    code: `function flattenDeep(arr) {
  const result = [];
  const stack = [...arr];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
    } else {
      result.unshift(item);
    }
  }
  return result;
}`,
    testCode: `if (JSON.stringify(flattenDeep([1,[2,[3,[4]]]])) !== '[1,2,3,4]') throw new Error("nested");
if (JSON.stringify(flattenDeep([])) !== '[]') throw new Error("empty");
if (JSON.stringify(flattenDeep([1,2,3])) !== '[1,2,3]') throw new Error("flat");`,
    language: 'javascript',
    description: 'Flatten deeply nested arrays iteratively (no recursion limit)',
    tags: ['transformation', 'array', 'flatten', 'iterative', 'utility'],
    patternType: 'transformation',
  },
  {
    name: 'group-by',
    code: `function groupBy(arr, keyFn) {
  const groups = {};
  for (const item of arr) {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    (groups[key] = groups[key] || []).push(item);
  }
  return groups;
}`,
    testCode: `const data = [{n:'a',t:1},{n:'b',t:1},{n:'c',t:2}];
const g = groupBy(data, 't');
if (g[1].length !== 2) throw new Error("group 1");
if (g[2].length !== 1) throw new Error("group 2");
const g2 = groupBy(data, item => item.t);
if (g2[1].length !== 2) throw new Error("fn key");`,
    language: 'javascript',
    description: 'Group array items by a key or function',
    tags: ['transformation', 'array', 'group', 'aggregate', 'utility'],
    patternType: 'transformation',
  },

  // ─── Python patterns ───
  {
    name: 'binary-search-py',
    code: `def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,
    testCode: `assert binary_search([1,2,3,4,5], 3) == 2, "mid"
assert binary_search([1,2,3,4,5], 1) == 0, "first"
assert binary_search([1,2,3,4,5], 6) == -1, "missing"
assert binary_search([], 1) == -1, "empty"`,
    language: 'python',
    description: 'Binary search on sorted list — O(log n)',
    tags: ['search', 'algorithm', 'list', 'sorted', 'binary-search'],
    patternType: 'algorithm',
  },
  {
    name: 'memoize-py',
    code: `def memoize(fn):
    cache = {}
    def wrapper(*args):
        if args not in cache:
            cache[args] = fn(*args)
        return cache[args]
    wrapper.cache = cache
    return wrapper`,
    testCode: `calls = 0
def add(a, b):
    global calls
    calls += 1
    return a + b
memo_add = memoize(add)
assert memo_add(1, 2) == 3
assert memo_add(1, 2) == 3
assert calls == 1, f"should cache: {calls}"`,
    language: 'python',
    description: 'Memoize decorator — caches function results by arguments',
    tags: ['utility', 'cache', 'memoize', 'decorator', 'performance'],
    patternType: 'utility',
  },
];

/**
 * Seed the pattern library with all built-in patterns.
 * Skips patterns that already exist (by name match).
 */
function seedLibrary(oracle) {
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let registered = 0, skipped = 0, failed = 0;

  for (const seed of SEEDS) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
    } else {
      failed++;
      console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, total: SEEDS.length };
}

module.exports = { seedLibrary, SEEDS };
