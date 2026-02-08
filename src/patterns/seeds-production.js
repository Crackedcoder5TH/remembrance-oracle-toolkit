/**
 * Production Seed Patterns — battle-tested concurrency, design-pattern, and utility primitives.
 *
 * Each pattern includes:
 * - Production-quality implementation (150-600 chars)
 * - Test code with 3-5 meaningful assertions
 * - Metadata (name, description, tags, type)
 *
 * These patterns cover real-world infrastructure needs:
 * rate limiting, retries, event systems, state machines,
 * middleware, connection pooling, circuit breaking,
 * semaphores, promise queues, and async memoization.
 */

function getProductionSeeds() {
  return [
    // ─── Concurrency ───
    {
      name: 'rate-limiter',
      code: `class RateLimiter {
  constructor(maxTokens, refillRate) {
    this.max = maxTokens;
    this.tokens = maxTokens;
    this.rate = refillRate;
    this.last = Date.now();
  }
  _refill() {
    const now = Date.now();
    this.tokens = Math.min(this.max, this.tokens + (now - this.last) / 1000 * this.rate);
    this.last = now;
  }
  consume(tokens = 1) {
    this._refill();
    if (this.tokens >= tokens) { this.tokens -= tokens; return true; }
    return false;
  }
  remainingTokens() {
    this._refill();
    return Math.floor(this.tokens);
  }
}`,
      testCode: `const limiter = new RateLimiter(5, 1);
if (!limiter.consume(1)) throw new Error('should consume 1 token');
if (!limiter.consume(4)) throw new Error('should consume remaining 4 tokens');
if (limiter.consume(1)) throw new Error('should reject when exhausted');
if (limiter.remainingTokens() !== 0) throw new Error('should have 0 remaining');
const l2 = new RateLimiter(3, 10);
if (!l2.consume(2)) throw new Error('should consume 2 of 3');`,
      language: 'javascript',
      description: 'Token bucket rate limiter with configurable max tokens and refill rate per second',
      tags: ['rate-limit', 'throttle', 'token-bucket', 'concurrency', 'rate-limiter'],
      type: 'concurrency',
    },

    {
      name: 'semaphore',
      code: `class Semaphore {
  constructor(permits) {
    this._permits = permits;
    this._max = permits;
    this._queue = [];
  }
  acquire() {
    if (this._permits > 0) {
      this._permits--;
      return Promise.resolve();
    }
    return new Promise(resolve => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) {
      this._queue.shift()();
    } else if (this._permits < this._max) {
      this._permits++;
    }
  }
  available() {
    return this._permits;
  }
}`,
      testCode: `const sem = new Semaphore(2);
if (sem.available() !== 2) throw new Error('should start with 2 permits');
await sem.acquire();
if (sem.available() !== 1) throw new Error('should have 1 after acquire');
await sem.acquire();
if (sem.available() !== 0) throw new Error('should have 0 after 2 acquires');
let acquired = false;
const pending = sem.acquire().then(() => { acquired = true; });
sem.release();
await pending;
if (!acquired) throw new Error('should acquire after release');`,
      language: 'javascript',
      description: 'Counting semaphore with async acquire and bounded permits',
      tags: ['semaphore', 'concurrency', 'async', 'locking', 'permits'],
      type: 'concurrency',
    },

    {
      name: 'promise-queue',
      code: `class PromiseQueue {
  constructor(concurrency = 1) {
    this._c = concurrency; this._q = []; this._p = 0;
  }
  add(fn) {
    return new Promise((resolve, reject) => {
      this._q.push({ fn, resolve, reject }); this._run();
    });
  }
  _run() {
    while (this._p < this._c && this._q.length) {
      const t = this._q.shift(); this._p++;
      Promise.resolve(t.fn()).then(
        v => { this._p--; t.resolve(v); this._run(); },
        e => { this._p--; t.reject(e); this._run(); }
      );
    }
  }
  size() { return this._q.length; }
  pending() { return this._p; }
}`,
      testCode: `const q = new PromiseQueue(2);
const order = [];
const task = (id, ms) => () => new Promise(r => setTimeout(() => { order.push(id); r(id); }, ms));
const p1 = q.add(task('a', 50));
const p2 = q.add(task('b', 30));
const p3 = q.add(task('c', 10));
if (q.pending() !== 2) throw new Error('should have 2 pending');
if (q.size() !== 1) throw new Error('should have 1 queued');
const results = await Promise.all([p1, p2, p3]);
if (results.join(',') !== 'a,b,c') throw new Error('should resolve with correct values');`,
      language: 'javascript',
      description: 'Concurrency-limited promise queue that processes async tasks with bounded parallelism',
      tags: ['queue', 'promise', 'concurrency', 'async', 'task-queue', 'parallel'],
      type: 'concurrency',
    },

    {
      name: 'connection-pool',
      code: `class ConnectionPool {
  constructor(factory, opts = {}) {
    this._f = factory; this._max = opts.max || 10;
    this._p = []; this._a = 0; this._w = [];
  }
  async acquire() {
    if (this._p.length > 0) { this._a++; return this._p.pop(); }
    if (this._a < this._max) { this._a++; return this._f(); }
    return new Promise(r => this._w.push(r));
  }
  release(conn) {
    if (this._w.length > 0) this._w.shift()(conn);
    else { this._a--; this._p.push(conn); }
  }
  drain() {
    this._p = []; this._w.forEach(r => r(null));
    this._w = []; this._a = 0;
  }
}`,
      testCode: `let created = 0;
const pool = new ConnectionPool(() => ({ id: ++created }), { max: 2 });
const c1 = await pool.acquire();
const c2 = await pool.acquire();
if (created !== 2) throw new Error('should create 2 connections');
pool.release(c1);
const c3 = await pool.acquire();
if (c3.id !== c1.id) throw new Error('should reuse released connection');
if (created !== 2) throw new Error('should not create new after reuse');
await pool.drain();`,
      language: 'javascript',
      description: 'Object connection pool with configurable max size, factory function, and waiting queue',
      tags: ['pool', 'connection', 'concurrency', 'resource', 'database', 'connection-pool'],
      type: 'concurrency',
    },

    // ─── Design Patterns ───
    {
      name: 'event-emitter',
      code: `class EventEmitter {
  constructor() { this._e = {}; }
  on(event, fn) {
    (this._e[event] = this._e[event] || []).push(fn);
    return this;
  }
  off(event, fn) {
    if (this._e[event]) this._e[event] = this._e[event].filter(h => h !== fn);
    return this;
  }
  emit(event, ...args) {
    if (this._e[event]) this._e[event].slice().forEach(h => h(...args));
    return this;
  }
  once(event, fn) {
    const w = (...a) => { this.off(event, w); fn(...a); };
    return this.on(event, w);
  }
}`,
      testCode: `const ee = new EventEmitter();
let called = 0;
const handler = () => called++;
ee.on('test', handler);
ee.emit('test');
if (called !== 1) throw new Error('should call handler once');
ee.off('test', handler);
ee.emit('test');
if (called !== 1) throw new Error('should not call after off');
let onceCount = 0;
ee.once('x', () => onceCount++);
ee.emit('x');
ee.emit('x');
if (onceCount !== 1) throw new Error('once should fire only once');
let arg;
ee.on('data', v => { arg = v; });
ee.emit('data', 42);
if (arg !== 42) throw new Error('should pass arguments to handler');`,
      language: 'javascript',
      description: 'Minimal event emitter with on, off, emit, and once support',
      tags: ['event', 'emitter', 'pubsub', 'observer', 'design-pattern', 'events'],
      type: 'design-pattern',
    },

    {
      name: 'state-machine',
      code: `class StateMachine {
  constructor(config) {
    this._state = config.initial;
    this._t = {};
    for (const t of config.transitions || []) this._t[t.from + ':' + t.event] = t.to;
  }
  transition(event) {
    const next = this._t[this._state + ':' + event];
    if (!next) throw new Error('Invalid: ' + event + ' from ' + this._state);
    this._state = next;
    return this._state;
  }
  can(event) {
    return !!(this._t[this._state + ':' + event]);
  }
  getState() { return this._state; }
}`,
      testCode: `const sm = new StateMachine({
  initial: 'idle',
  transitions: [
    { from: 'idle', event: 'start', to: 'running' },
    { from: 'running', event: 'pause', to: 'paused' },
    { from: 'paused', event: 'resume', to: 'running' },
    { from: 'running', event: 'stop', to: 'idle' }
  ]
});
if (sm.getState() !== 'idle') throw new Error('initial state should be idle');
if (!sm.can('start')) throw new Error('should be able to start from idle');
if (sm.can('pause')) throw new Error('should not pause from idle');
sm.transition('start');
if (sm.getState() !== 'running') throw new Error('should be running after start');
let threw = false;
try { sm.transition('resume'); } catch(e) { threw = true; }
if (!threw) throw new Error('invalid transition should throw');`,
      language: 'javascript',
      description: 'Finite state machine with declarative transitions and state querying',
      tags: ['state-machine', 'fsm', 'design-pattern', 'state', 'transitions'],
      type: 'design-pattern',
    },

    {
      name: 'middleware-chain',
      code: `class MiddlewareChain {
  constructor() { this._middlewares = []; }
  use(fn) {
    this._middlewares.push(fn);
    return this;
  }
  execute(context) {
    let index = 0;
    const next = () => {
      if (index >= this._middlewares.length) return Promise.resolve();
      const fn = this._middlewares[index++];
      return Promise.resolve(fn(context, next));
    };
    return next();
  }
}`,
      testCode: `const chain = new MiddlewareChain();
const order = [];
chain.use(async (ctx, next) => { order.push('a'); ctx.a = 1; await next(); order.push('a2'); });
chain.use(async (ctx, next) => { order.push('b'); ctx.b = 2; await next(); });
const ctx = {};
await chain.execute(ctx);
if (ctx.a !== 1 || ctx.b !== 2) throw new Error('middleware should modify context');
if (order.join(',') !== 'a,b,a2') throw new Error('should execute in onion order: ' + order);
const empty = new MiddlewareChain();
await empty.execute({});`,
      language: 'javascript',
      description: 'Express-style middleware chain with async next() calling and context passing',
      tags: ['middleware', 'chain', 'pipeline', 'design-pattern', 'express', 'compose'],
      type: 'design-pattern',
    },

    {
      name: 'circuit-breaker',
      code: `class CircuitBreaker {
  constructor(fn, o={}) {
    this._fn = fn; this._th = o.threshold || 5; this._to = o.timeout || 30000;
    this._s = 'closed'; this._f = this._at = 0;
  }
  async call(...args) {
    if (this._s === 'open') {
      if (Date.now() - this._at >= this._to) this._s = 'half-open';
      else throw new Error('Open');
    }
    try {
      const r = await this._fn(...args);
      this._f = 0; this._s = 'closed'; return r;
    } catch (e) {
      if (++this._f >= this._th) { this._s = 'open'; this._at = Date.now(); }
      throw e;
    }
  }
  getState() { return this._s; }
}`,
      testCode: `let callCount = 0;
const breaker = new CircuitBreaker(async () => { callCount++; throw new Error('fail'); }, { threshold: 3, timeout: 100 });
for (let i = 0; i < 3; i++) { try { await breaker.call(); } catch(e) {} }
if (breaker.getState() !== 'open') throw new Error('should be open after threshold failures');
let blocked = false;
try { await breaker.call(); } catch(e) { blocked = e.message === 'Open'; }
if (!blocked) throw new Error('should block calls when circuit is open');
if (callCount !== 3) throw new Error('should not invoke fn when open');
const ok = new CircuitBreaker(async (x) => x * 2, { threshold: 5 });
const r = await ok.call(21);
if (r !== 42) throw new Error('should return result on success');`,
      language: 'javascript',
      description: 'Circuit breaker with closed/open/half-open states, failure threshold, and automatic recovery',
      tags: ['circuit-breaker', 'resilience', 'fault-tolerance', 'design-pattern', 'reliability'],
      type: 'design-pattern',
    },

    // ─── Utilities ───
    {
      name: 'retry-with-backoff',
      code: `async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 100, maxDelay = 5000, jitter = true } = options;
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        let delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
        if (jitter) delay *= 0.5 + Math.random() * 0.5;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}`,
      testCode: `let count = 0;
const flaky = async () => { count++; if (count < 3) throw new Error('not yet'); return 'done'; };
const result = await retryWithBackoff(flaky, { maxRetries: 3, baseDelay: 10 });
if (result !== 'done') throw new Error('should return successful result');
if (count !== 3) throw new Error('should have retried until success');
let threw = false;
try { await retryWithBackoff(() => { throw new Error('always'); }, { maxRetries: 2, baseDelay: 10 }); }
catch(e) { threw = true; if (e.message !== 'always') throw new Error('should throw last error'); }
if (!threw) throw new Error('should throw after retries exhausted');`,
      language: 'javascript',
      description: 'Async retry with exponential backoff, jitter, configurable max retries and delay bounds',
      tags: ['retry', 'backoff', 'exponential', 'resilience', 'async', 'utility'],
      type: 'utility',
    },

    {
      name: 'memoize-async',
      code: `function memoizeAsync(fn, opts = {}) {
  const { ttl = 0, keyFn = (...a) => JSON.stringify(a), max = 100 } = opts;
  const cache = new Map(), order = [];
  return async function(...args) {
    const k = keyFn(...args), e = cache.get(k);
    if (e && (!ttl || Date.now() - e.t < ttl)) {
      const i = order.indexOf(k);
      if (i > -1) { order.splice(i, 1); order.push(k); }
      return e.v;
    }
    const v = await fn(...args);
    cache.set(k, { v, t: Date.now() });
    if (!order.includes(k)) order.push(k);
    while (order.length > max) cache.delete(order.shift());
    return v;
  };
}`,
      testCode: `let calls = 0;
const fn = memoizeAsync(async (x) => { calls++; return x * 2; }, { max: 2 });
const r1 = await fn(5);
if (r1 !== 10) throw new Error('should return computed value');
await fn(5);
if (calls !== 1) throw new Error('should use cache on second call');
await fn(6);
await fn(7);
if (calls !== 3) throw new Error('should compute for new args');
await fn(5);
if (calls !== 4) throw new Error('should evict LRU entry when maxSize exceeded');`,
      language: 'javascript',
      description: 'Async function memoizer with LRU eviction, TTL expiry, and custom key function',
      tags: ['memoize', 'cache', 'async', 'lru', 'ttl', 'utility', 'memoization'],
      type: 'utility',
    },
  ];
}

module.exports = { getProductionSeeds };
