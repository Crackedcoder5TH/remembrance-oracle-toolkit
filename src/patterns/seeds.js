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

  // ─── TypeScript patterns ───
  {
    name: 'debounce-ts',
    code: `function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}`,
    testCode: `let count = 0;
const inc = debounce(() => { count++; }, 50);
inc(); inc(); inc();
setTimeout(() => {
  if (count !== 0) throw new Error("should not fire yet: " + count);
  setTimeout(() => {
    if (count !== 1) throw new Error("should fire once: " + count);
  }, 60);
}, 20);`,
    language: 'typescript',
    description: 'Debounce with TypeScript generics — preserves argument types',
    tags: ['utility', 'async', 'debounce', 'rate-limit', 'typescript', 'generic'],
    patternType: 'utility',
  },
  {
    name: 'result-type-ts',
    code: `type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}`,
    testCode: `const ok = Ok(42);
if (!ok.ok || ok.value !== 42) throw new Error("Ok failed");
const err = Err(new Error("boom"));
if (err.ok) throw new Error("Err should not be ok");
try { unwrap(err); throw new Error("should throw"); } catch(e) { if (e.message !== "boom") throw e; }
if (unwrap(Ok("hello")) !== "hello") throw new Error("unwrap ok");`,
    language: 'typescript',
    description: 'Result type (Rust-style Ok/Err) for typed error handling',
    tags: ['utility', 'error-handling', 'typescript', 'type-safety', 'result'],
    patternType: 'utility',
  },
  {
    name: 'typed-event-emitter-ts',
    code: `type EventMap = Record<string, any>;

class TypedEmitter<T extends EventMap> {
  private listeners: { [K in keyof T]?: Array<(payload: T[K]) => void> } = {};

  on<K extends keyof T>(event: K, fn: (payload: T[K]) => void): void {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }

  off<K extends keyof T>(event: K, fn: (payload: T[K]) => void): void {
    const fns = this.listeners[event];
    if (fns) this.listeners[event] = fns.filter(f => f !== fn);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    for (const fn of this.listeners[event] || []) fn(payload);
  }
}`,
    testCode: `const em = new TypedEmitter();
let got = null;
const handler = (v) => { got = v; };
em.on('test', handler);
em.emit('test', 42);
if (got !== 42) throw new Error("emit failed: " + got);
em.off('test', handler);
em.emit('test', 99);
if (got !== 42) throw new Error("off failed: " + got);`,
    language: 'typescript',
    description: 'Type-safe event emitter with generics for event map',
    tags: ['utility', 'events', 'typescript', 'generic', 'type-safe'],
    patternType: 'design-pattern',
  },

  // ─── Go patterns (sandbox-executable) ───
  {
    name: 'binary-search-go',
    code: `package sandbox

func BinarySearch(arr []int, target int) int {
	lo, hi := 0, len(arr)-1
	for lo <= hi {
		mid := lo + (hi-lo)/2
		if arr[mid] == target {
			return mid
		} else if arr[mid] < target {
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return -1
}`,
    testCode: `package sandbox

import "testing"

func TestBinarySearch(t *testing.T) {
	if BinarySearch([]int{1,2,3,4,5}, 3) != 2 { t.Fatal("mid") }
	if BinarySearch([]int{1,2,3,4,5}, 1) != 0 { t.Fatal("first") }
	if BinarySearch([]int{1,2,3,4,5}, 6) != -1 { t.Fatal("missing") }
	if BinarySearch([]int{}, 1) != -1 { t.Fatal("empty") }
}`,
    language: 'go',
    description: 'Binary search on sorted slice — O(log n)',
    tags: ['search', 'algorithm', 'slice', 'sorted', 'binary-search'],
    patternType: 'algorithm',
  },
  {
    name: 'merge-sort-go',
    code: `package sandbox

func MergeSort(arr []int) []int {
	if len(arr) <= 1 {
		return arr
	}
	mid := len(arr) / 2
	left := MergeSort(arr[:mid])
	right := MergeSort(arr[mid:])
	return merge(left, right)
}

func merge(a, b []int) []int {
	result := make([]int, 0, len(a)+len(b))
	i, j := 0, 0
	for i < len(a) && j < len(b) {
		if a[i] <= b[j] {
			result = append(result, a[i])
			i++
		} else {
			result = append(result, b[j])
			j++
		}
	}
	result = append(result, a[i:]...)
	result = append(result, b[j:]...)
	return result
}`,
    testCode: `package sandbox

import (
	"reflect"
	"testing"
)

func TestMergeSort(t *testing.T) {
	got := MergeSort([]int{5,3,8,1,9,2})
	want := []int{1,2,3,5,8,9}
	if !reflect.DeepEqual(got, want) { t.Fatalf("got %v want %v", got, want) }
	if len(MergeSort([]int{})) != 0 { t.Fatal("empty") }
	if MergeSort([]int{1})[0] != 1 { t.Fatal("single") }
}`,
    language: 'go',
    description: 'Merge sort — stable O(n log n) sorting for slices',
    tags: ['sort', 'algorithm', 'slice', 'stable', 'merge-sort'],
    patternType: 'algorithm',
  },
  {
    name: 'retry-go',
    code: `package sandbox

import (
	"fmt"
	"time"
)

func Retry(attempts int, delay time.Duration, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		if i < attempts-1 {
			time.Sleep(delay)
			delay *= 2
		}
	}
	return fmt.Errorf("failed after %d attempts: %w", attempts, err)
}`,
    testCode: `package sandbox

import (
	"errors"
	"testing"
	"time"
)

func TestRetry(t *testing.T) {
	count := 0
	err := Retry(3, time.Millisecond, func() error {
		count++
		if count < 3 { return errors.New("fail") }
		return nil
	})
	if err != nil { t.Fatalf("should succeed: %v", err) }
	if count != 3 { t.Fatalf("attempts: %d", count) }
}`,
    language: 'go',
    description: 'Retry with exponential backoff — robust error recovery',
    tags: ['utility', 'async', 'retry', 'backoff', 'error-handling'],
    patternType: 'utility',
  },
  {
    name: 'lru-cache-go',
    code: `package sandbox

type LRUCache struct {
	capacity int
	items    map[string]*node
	head     *node
	tail     *node
}

type node struct {
	key        string
	value      interface{}
	prev, next *node
}

func NewLRUCache(capacity int) *LRUCache {
	head := &node{}
	tail := &node{}
	head.next = tail
	tail.prev = head
	return &LRUCache{capacity: capacity, items: make(map[string]*node), head: head, tail: tail}
}

func (c *LRUCache) Get(key string) (interface{}, bool) {
	if n, ok := c.items[key]; ok {
		c.moveToFront(n)
		return n.value, true
	}
	return nil, false
}

func (c *LRUCache) Put(key string, value interface{}) {
	if n, ok := c.items[key]; ok {
		n.value = value
		c.moveToFront(n)
		return
	}
	n := &node{key: key, value: value}
	c.items[key] = n
	c.addToFront(n)
	if len(c.items) > c.capacity {
		back := c.tail.prev
		c.remove(back)
		delete(c.items, back.key)
	}
}

func (c *LRUCache) moveToFront(n *node) { c.remove(n); c.addToFront(n) }
func (c *LRUCache) addToFront(n *node) { n.prev = c.head; n.next = c.head.next; c.head.next.prev = n; c.head.next = n }
func (c *LRUCache) remove(n *node) { n.prev.next = n.next; n.next.prev = n.prev }`,
    testCode: `package sandbox

import "testing"

func TestLRUCache(t *testing.T) {
	c := NewLRUCache(2)
	c.Put("a", 1)
	c.Put("b", 2)
	if v, ok := c.Get("a"); !ok || v != 1 { t.Fatal("get a") }
	c.Put("c", 3)
	if _, ok := c.Get("b"); ok { t.Fatal("should evict b") }
	if v, ok := c.Get("c"); !ok || v != 3 { t.Fatal("get c") }
}`,
    language: 'go',
    description: 'LRU cache with O(1) get/put using doubly-linked list + hashmap',
    tags: ['data-structure', 'cache', 'lru', 'map', 'eviction'],
    patternType: 'data-structure',
  },

  // ─── Rust patterns (sandbox-executable) ───
  {
    name: 'binary-search-rs',
    code: `pub fn binary_search(arr: &[i32], target: i32) -> Option<usize> {
    let (mut lo, mut hi) = (0usize, arr.len());
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        match arr[mid].cmp(&target) {
            std::cmp::Ordering::Equal => return Some(mid),
            std::cmp::Ordering::Less => lo = mid + 1,
            std::cmp::Ordering::Greater => hi = mid,
        }
    }
    None
}`,
    testCode: `    use super::*;

    #[test]
    fn test_binary_search() {
        assert_eq!(binary_search(&[1,2,3,4,5], 3), Some(2));
        assert_eq!(binary_search(&[1,2,3,4,5], 1), Some(0));
        assert_eq!(binary_search(&[1,2,3,4,5], 6), None);
        assert_eq!(binary_search(&[], 1), None);
    }`,
    language: 'rust',
    description: 'Binary search returning Option<usize> — idiomatic Rust',
    tags: ['search', 'algorithm', 'slice', 'sorted', 'binary-search'],
    patternType: 'algorithm',
  },
  {
    name: 'merge-sort-rs',
    code: `pub fn merge_sort(arr: &mut Vec<i32>) {
    let len = arr.len();
    if len <= 1 { return; }
    let mid = len / 2;
    let mut left = arr[..mid].to_vec();
    let mut right = arr[mid..].to_vec();
    merge_sort(&mut left);
    merge_sort(&mut right);
    let (mut i, mut j, mut k) = (0, 0, 0);
    while i < left.len() && j < right.len() {
        if left[i] <= right[j] { arr[k] = left[i]; i += 1; }
        else { arr[k] = right[j]; j += 1; }
        k += 1;
    }
    while i < left.len() { arr[k] = left[i]; i += 1; k += 1; }
    while j < right.len() { arr[k] = right[j]; j += 1; k += 1; }
}`,
    testCode: `    use super::*;

    #[test]
    fn test_merge_sort() {
        let mut v = vec![5,3,8,1,9,2];
        merge_sort(&mut v);
        assert_eq!(v, vec![1,2,3,5,8,9]);
        let mut e: Vec<i32> = vec![];
        merge_sort(&mut e);
        assert!(e.is_empty());
    }`,
    language: 'rust',
    description: 'In-place merge sort for Vec<i32> — stable O(n log n)',
    tags: ['sort', 'algorithm', 'vec', 'stable', 'merge-sort'],
    patternType: 'algorithm',
  },
  {
    name: 'retry-rs',
    code: `use std::time::Duration;

pub fn retry<F, T, E>(attempts: u32, initial_delay: Duration, mut f: F) -> Result<T, E>
where
    F: FnMut() -> Result<T, E>,
{
    let mut delay = initial_delay;
    for i in 0..attempts {
        match f() {
            Ok(val) => return Ok(val),
            Err(e) => {
                if i == attempts - 1 { return Err(e); }
                std::thread::sleep(delay);
                delay *= 2;
            }
        }
    }
    unreachable!()
}`,
    testCode: `    use super::*;
    use std::time::Duration;

    #[test]
    fn test_retry() {
        let mut count = 0u32;
        let result = retry(3, Duration::from_millis(1), || -> Result<&str, &str> {
            count += 1;
            if count < 3 { Err("fail") } else { Ok("ok") }
        });
        assert_eq!(result, Ok("ok"));
        assert_eq!(count, 3);
    }`,
    language: 'rust',
    description: 'Generic retry with exponential backoff — works with any Result<T, E>',
    tags: ['utility', 'async', 'retry', 'backoff', 'error-handling', 'generic'],
    patternType: 'utility',
  },
  {
    name: 'lru-cache-rs',
    code: `use std::collections::HashMap;

pub struct LruCache<K: std::hash::Hash + Eq + Clone, V> {
    capacity: usize,
    map: HashMap<K, (V, usize)>,
    counter: usize,
}

impl<K: std::hash::Hash + Eq + Clone, V> LruCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        LruCache { capacity, map: HashMap::new(), counter: 0 }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        if let Some(entry) = self.map.get_mut(key) {
            self.counter += 1;
            entry.1 = self.counter;
            Some(&entry.0)
        } else {
            None
        }
    }

    pub fn put(&mut self, key: K, value: V) {
        self.counter += 1;
        if self.map.contains_key(&key) {
            self.map.insert(key, (value, self.counter));
            return;
        }
        if self.map.len() >= self.capacity {
            let lru_key = self.map.iter()
                .min_by_key(|(_, (_, ts))| *ts)
                .map(|(k, _)| k.clone())
                .unwrap();
            self.map.remove(&lru_key);
        }
        self.map.insert(key, (value, self.counter));
    }
}`,
    testCode: `    use super::*;

    #[test]
    fn test_lru_cache() {
        let mut c = LruCache::new(2);
        c.put("a", 1);
        c.put("b", 2);
        assert_eq!(c.get(&"a"), Some(&1));
        c.put("c", 3);
        assert_eq!(c.get(&"b"), None);
        assert_eq!(c.get(&"c"), Some(&3));
    }`,
    language: 'rust',
    description: 'Generic LRU cache with HashMap — evicts least recently used',
    tags: ['data-structure', 'cache', 'lru', 'hashmap', 'eviction', 'generic'],
    patternType: 'data-structure',
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
