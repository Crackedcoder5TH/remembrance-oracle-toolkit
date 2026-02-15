/**
 * Production Seeds 3 — pagination, command/undo, cron, proxy, object pool, transform streams.
 *
 * 6 JavaScript patterns + 6 TypeScript variants = 12 total.
 * Each pattern includes working code and test proof.
 */

function getProductionSeeds3() {
  return [
    // ─── 1. Paginator (Utility) ───
    {
      name: 'paginator',
      code: `class Paginator {
  constructor(items, pageSize) {
    this._items = items;
    this._size = Math.max(1, pageSize);
  }
  page(n) {
    const start = (n - 1) * this._size;
    return this._items.slice(start, start + this._size);
  }
  totalPages() {
    return Math.ceil(this._items.length / this._size);
  }
  hasNext(n) { return n < this.totalPages(); }
  hasPrev(n) { return n > 1; }
  offset(n) { return (n - 1) * this._size; }
  meta(n) {
    return {
      page: n, pageSize: this._size,
      total: this._items.length,
      totalPages: this.totalPages(),
      hasNext: this.hasNext(n),
      hasPrev: this.hasPrev(n)
    };
  }
}`,
      testCode: `const items = Array.from({ length: 25 }, (_, i) => i + 1);
const pg = new Paginator(items, 10);
if (pg.totalPages() !== 3) throw new Error('should have 3 pages');
const p1 = pg.page(1);
if (p1.length !== 10 || p1[0] !== 1) throw new Error('page 1 wrong');
const p3 = pg.page(3);
if (p3.length !== 5 || p3[0] !== 21) throw new Error('page 3 wrong');
if (!pg.hasNext(1)) throw new Error('page 1 should have next');
if (pg.hasNext(3)) throw new Error('page 3 should not have next');
if (pg.hasPrev(1)) throw new Error('page 1 should not have prev');
if (!pg.hasPrev(2)) throw new Error('page 2 should have prev');
const m = pg.meta(2);
if (m.total !== 25 || m.totalPages !== 3) throw new Error('meta wrong');`,
      language: 'javascript',
      description: 'Offset-based paginator with page retrieval, navigation helpers, and metadata',
      tags: ['pagination', 'paginator', 'paging', 'utility', 'list', 'offset'],
      patternType: 'utility',
    },

    // ─── 2. Command / Undo (Design Pattern) ───
    {
      name: 'command-undo',
      code: `class CommandManager {
  constructor() {
    this._history = [];
    this._undone = [];
  }
  execute(command) {
    command.execute();
    this._history.push(command);
    this._undone = [];
  }
  undo() {
    const cmd = this._history.pop();
    if (!cmd) return false;
    cmd.undo();
    this._undone.push(cmd);
    return true;
  }
  redo() {
    const cmd = this._undone.pop();
    if (!cmd) return false;
    cmd.execute();
    this._history.push(cmd);
    return true;
  }
  canUndo() { return this._history.length > 0; }
  canRedo() { return this._undone.length > 0; }
  clear() { this._history = []; this._undone = []; }
}`,
      testCode: `const state = { value: 0 };
const mgr = new CommandManager();
const inc = { execute() { state.value += 10; }, undo() { state.value -= 10; } };
const dec = { execute() { state.value -= 3; }, undo() { state.value += 3; } };
mgr.execute(inc);
if (state.value !== 10) throw new Error('execute should apply');
mgr.execute(dec);
if (state.value !== 7) throw new Error('second execute');
mgr.undo();
if (state.value !== 10) throw new Error('undo should revert');
if (!mgr.canRedo()) throw new Error('should be able to redo');
mgr.redo();
if (state.value !== 7) throw new Error('redo should reapply');
mgr.undo(); mgr.undo();
if (state.value !== 0) throw new Error('full undo to start');
if (mgr.canUndo()) throw new Error('should not be able to undo');`,
      language: 'javascript',
      description: 'Command pattern with undo/redo history stack and navigation',
      tags: ['command', 'undo', 'redo', 'design-pattern', 'history', 'action'],
      patternType: 'design-pattern',
    },

    // ─── 3. Cron Scheduler (Utility) ───
    {
      name: 'cron-scheduler',
      code: `class CronScheduler {
  constructor() { this._jobs = new Map(); this._id = 0; }
  _parse(expr) {
    const p = expr.split(' ');
    if (p.length !== 5) throw new Error('Invalid cron: need 5 fields');
    return { min: p[0], hour: p[1], dom: p[2], mon: p[3], dow: p[4] };
  }
  _matches(field, value) {
    if (field === '*') return true;
    if (field.includes('/')) {
      const step = parseInt(field.split('/')[1], 10);
      return value % step === 0;
    }
    if (field.includes(',')) return field.split(',').map(Number).includes(value);
    if (field.includes('-')) {
      const parts = field.split('-').map(Number);
      return value >= parts[0] && value <= parts[1];
    }
    return parseInt(field, 10) === value;
  }
  shouldRun(expr, date) {
    const c = this._parse(expr);
    const d = date || new Date();
    return this._matches(c.min, d.getMinutes())
      && this._matches(c.hour, d.getHours())
      && this._matches(c.dom, d.getDate())
      && this._matches(c.mon, d.getMonth() + 1)
      && this._matches(c.dow, d.getDay());
  }
  add(expr, fn) {
    const id = ++this._id;
    this._jobs.set(id, { expr, fn, enabled: true });
    return id;
  }
  remove(id) { return this._jobs.delete(id); }
  tick(date) {
    const results = [];
    for (const [id, job] of this._jobs) {
      if (job.enabled && this.shouldRun(job.expr, date)) {
        job.fn(); results.push(id);
      }
    }
    return results;
  }
  list() { return Array.from(this._jobs.keys()); }
}`,
      testCode: `const sched = new CronScheduler();
const d = new Date(2025, 0, 15, 10, 30, 0);
if (!sched.shouldRun('30 10 * * *', d)) throw new Error('exact match should run');
if (sched.shouldRun('0 10 * * *', d)) throw new Error('wrong minute should not run');
if (!sched.shouldRun('*/5 * * * *', d)) throw new Error('step match should run');
if (!sched.shouldRun('30,45 * * * *', d)) throw new Error('list match should run');
if (!sched.shouldRun('25-35 * * * *', d)) throw new Error('range match should run');
let ran = 0;
const id = sched.add('30 10 * * *', () => { ran++; });
sched.tick(d);
if (ran !== 1) throw new Error('tick should fire matching job');
sched.remove(id);
sched.tick(d);
if (ran !== 1) throw new Error('removed job should not fire');`,
      language: 'javascript',
      description: 'Cron expression scheduler with 5-field parsing, step/range/list matching, and job management',
      tags: ['cron', 'scheduler', 'job', 'timer', 'utility', 'schedule', 'task'],
      patternType: 'utility',
    },

    // ─── 4. Proxy Handler (Design Pattern) ───
    {
      name: 'proxy-handler',
      code: `class ProxyHandler {
  constructor(target, hooks) {
    this._target = target;
    this._hooks = hooks || {};
    this._log = [];
  }
  get(prop) {
    if (this._hooks.beforeGet) this._hooks.beforeGet(prop);
    this._log.push({ op: 'get', prop, time: Date.now() });
    const val = this._target[prop];
    if (this._hooks.afterGet) this._hooks.afterGet(prop, val);
    return typeof val === 'function' ? val.bind(this._target) : val;
  }
  set(prop, value) {
    const old = this._target[prop];
    if (this._hooks.beforeSet) {
      const allowed = this._hooks.beforeSet(prop, value, old);
      if (allowed === false) return false;
    }
    this._log.push({ op: 'set', prop, old, value, time: Date.now() });
    this._target[prop] = value;
    if (this._hooks.afterSet) this._hooks.afterSet(prop, value, old);
    return true;
  }
  getLog() { return this._log.slice(); }
  clearLog() { this._log = []; }
}`,
      testCode: `const obj = { x: 1, y: 2 };
const proxy = new ProxyHandler(obj, {
  beforeSet(prop, val) { if (prop === 'y' && val < 0) return false; }
});
if (proxy.get('x') !== 1) throw new Error('get should return value');
proxy.set('x', 10);
if (obj.x !== 10) throw new Error('set should update target');
if (!proxy.set('y', 5)) throw new Error('valid set should return true');
if (proxy.set('y', -1) !== false) throw new Error('blocked set should return false');
if (obj.y !== 5) throw new Error('blocked set should not update target');
const log = proxy.getLog();
if (log.length !== 3) throw new Error('should log 3 operations (blocked set excluded), got ' + log.length);
if (log[0].op !== 'get') throw new Error('first log should be get');
proxy.clearLog();
if (proxy.getLog().length !== 0) throw new Error('clearLog should empty log');`,
      language: 'javascript',
      description: 'Proxy handler with get/set hooks, access logging, and write protection',
      tags: ['proxy', 'handler', 'intercept', 'design-pattern', 'logging', 'access-control'],
      patternType: 'design-pattern',
    },

    // ─── 5. Object Pool (Concurrency) ───
    {
      name: 'object-pool',
      code: `class ObjectPool {
  constructor(factory, opts) {
    opts = opts || {};
    this._factory = factory;
    this._max = opts.max || 10;
    this._pool = [];
    this._active = 0;
    this._reset = opts.reset || null;
  }
  acquire() {
    if (this._pool.length > 0) {
      this._active++;
      const obj = this._pool.pop();
      if (this._reset) this._reset(obj);
      return obj;
    }
    if (this._active < this._max) {
      this._active++;
      return this._factory();
    }
    return null;
  }
  release(obj) {
    if (this._active <= 0) return false;
    this._active--;
    this._pool.push(obj);
    return true;
  }
  size() { return this._pool.length; }
  active() { return this._active; }
  drain() {
    this._pool = [];
    this._active = 0;
  }
}`,
      testCode: `let created = 0;
const pool = new ObjectPool(() => ({ id: ++created, data: null }), {
  max: 3, reset: (obj) => { obj.data = null; }
});
const a = pool.acquire();
const b = pool.acquire();
if (created !== 2) throw new Error('should create 2 objects');
if (pool.active() !== 2) throw new Error('should have 2 active');
a.data = 'dirty';
pool.release(a);
if (pool.size() !== 1) throw new Error('pool should have 1 after release');
const c = pool.acquire();
if (c.id !== a.id) throw new Error('should reuse released object');
if (c.data !== null) throw new Error('reset should clean object');
const d = pool.acquire();
const e = pool.acquire();
if (pool.acquire() !== null) throw new Error('should return null when exhausted');
pool.drain();
if (pool.active() !== 0 || pool.size() !== 0) throw new Error('drain should empty pool');`,
      language: 'javascript',
      description: 'Generic object pool with factory, max size, optional reset, and drain support',
      tags: ['pool', 'object-pool', 'concurrency', 'resource', 'reuse', 'factory'],
      patternType: 'concurrency',
    },

    // ─── 6. Transform Stream (IO) ───
    {
      name: 'transform-stream',
      code: `class TransformStream {
  constructor() {
    this._transforms = [];
    this._buffer = [];
    this._flushed = false;
  }
  addTransform(fn) {
    this._transforms.push(fn);
    return this;
  }
  write(chunk) {
    if (this._flushed) throw new Error('Stream already flushed');
    let data = chunk;
    for (const t of this._transforms) {
      data = t(data);
      if (data == null) return this;
    }
    this._buffer.push(data);
    return this;
  }
  flush() {
    this._flushed = true;
    return this._buffer.slice();
  }
  pipe(other) {
    const output = this.flush();
    for (const item of output) other.write(item);
    return other;
  }
  size() { return this._buffer.length; }
  reset() { this._buffer = []; this._flushed = false; return this; }
}`,
      testCode: `const ts = new TransformStream();
ts.addTransform(x => x * 2).addTransform(x => x + 1);
ts.write(1); ts.write(2); ts.write(3);
const out = ts.flush();
if (out.length !== 3) throw new Error('should have 3 items');
if (out[0] !== 3 || out[1] !== 5 || out[2] !== 7) throw new Error('transforms wrong');
const filter = new TransformStream();
filter.addTransform(x => x > 5 ? x : null);
filter.write(3); filter.write(8); filter.write(2); filter.write(10);
const filtered = filter.flush();
if (filtered.length !== 2) throw new Error('filter should drop nulls');
if (filtered[0] !== 8 || filtered[1] !== 10) throw new Error('filter values wrong');
const ts2 = new TransformStream();
ts2.addTransform(x => x.toUpperCase());
const ts3 = new TransformStream();
ts3.addTransform(x => x + '!');
ts2.write('hello'); ts2.write('world');
ts2.pipe(ts3);
const piped = ts3.flush();
if (piped[0] !== 'HELLO!' || piped[1] !== 'WORLD!') throw new Error('pipe wrong');`,
      language: 'javascript',
      description: 'Transform stream with chainable transforms, null filtering, piping, and buffered flush',
      tags: ['stream', 'transform', 'pipeline', 'io', 'buffer', 'chain', 'filter'],
      patternType: 'io',
    },

    // ─── TypeScript Variants ───

    // ─── 7. Paginator TS ───
    {
      name: 'paginator-ts',
      code: `interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

class Paginator<T> {
  private items: T[];
  private pageSize: number;

  constructor(items: T[], pageSize: number) {
    this.items = items;
    this.pageSize = Math.max(1, pageSize);
  }

  page(n: number): T[] {
    const start = (n - 1) * this.pageSize;
    return this.items.slice(start, start + this.pageSize);
  }

  totalPages(): number {
    return Math.ceil(this.items.length / this.pageSize);
  }

  hasNext(n: number): boolean { return n < this.totalPages(); }
  hasPrev(n: number): boolean { return n > 1; }

  meta(n: number): PageMeta {
    return {
      page: n, pageSize: this.pageSize,
      total: this.items.length,
      totalPages: this.totalPages(),
      hasNext: this.hasNext(n),
      hasPrev: this.hasPrev(n)
    };
  }
}`,
      testCode: `const items: number[] = Array.from({ length: 25 }, (_, i) => i + 1);
const pg = new Paginator<number>(items, 10);
if (pg.totalPages() !== 3) throw new Error('should have 3 pages');
const p1 = pg.page(1);
if (p1.length !== 10 || p1[0] !== 1) throw new Error('page 1 wrong');
if (!pg.hasNext(1)) throw new Error('page 1 should have next');
if (pg.hasNext(3)) throw new Error('page 3 should not have next');
const m = pg.meta(2);
if (m.total !== 25) throw new Error('meta wrong');`,
      language: 'typescript',
      description: 'Generic typed paginator with page retrieval, navigation, and metadata',
      tags: ['pagination', 'paginator', 'utility', 'typescript', 'generic', 'variant'],
      patternType: 'utility',
    },

    // ─── 8. Command/Undo TS ───
    {
      name: 'command-undo-ts',
      code: `interface Command {
  execute(): void;
  undo(): void;
}

class CommandManager {
  private history: Command[] = [];
  private undone: Command[] = [];

  execute(command: Command): void {
    command.execute();
    this.history.push(command);
    this.undone = [];
  }

  undo(): boolean {
    const cmd = this.history.pop();
    if (!cmd) return false;
    cmd.undo();
    this.undone.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.undone.pop();
    if (!cmd) return false;
    cmd.execute();
    this.history.push(cmd);
    return true;
  }

  canUndo(): boolean { return this.history.length > 0; }
  canRedo(): boolean { return this.undone.length > 0; }
  clear(): void { this.history = []; this.undone = []; }
}`,
      testCode: `const state = { value: 0 };
const mgr = new CommandManager();
const inc: Command = { execute() { state.value += 10; }, undo() { state.value -= 10; } };
mgr.execute(inc);
if (state.value !== 10) throw new Error('execute should apply');
mgr.undo();
if (state.value !== 0) throw new Error('undo should revert');
mgr.redo();
if (state.value !== 10) throw new Error('redo should reapply');
if (!mgr.canUndo()) throw new Error('should be able to undo');
mgr.clear();
if (mgr.canUndo()) throw new Error('clear should empty history');`,
      language: 'typescript',
      description: 'Command pattern with typed interface, undo/redo stack, and clear',
      tags: ['command', 'undo', 'redo', 'design-pattern', 'typescript', 'variant'],
      patternType: 'design-pattern',
    },

    // ─── 9. Cron Scheduler TS ───
    {
      name: 'cron-scheduler-ts',
      code: `interface CronField {
  min: string; hour: string; dom: string; mon: string; dow: string;
}

class CronScheduler {
  private jobs = new Map<number, { expr: string; fn: () => void; enabled: boolean }>();
  private nextId = 0;

  private parse(expr: string): CronField {
    const p = expr.split(' ');
    if (p.length !== 5) throw new Error('Invalid cron: need 5 fields');
    return { min: p[0], hour: p[1], dom: p[2], mon: p[3], dow: p[4] };
  }

  private matches(field: string, value: number): boolean {
    if (field === '*') return true;
    if (field.includes('/')) return value % parseInt(field.split('/')[1], 10) === 0;
    if (field.includes(',')) return field.split(',').map(Number).includes(value);
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(field, 10) === value;
  }

  shouldRun(expr: string, date?: Date): boolean {
    const c = this.parse(expr);
    const d = date || new Date();
    return this.matches(c.min, d.getMinutes())
      && this.matches(c.hour, d.getHours())
      && this.matches(c.dom, d.getDate())
      && this.matches(c.mon, d.getMonth() + 1)
      && this.matches(c.dow, d.getDay());
  }

  add(expr: string, fn: () => void): number {
    const id = ++this.nextId;
    this.jobs.set(id, { expr, fn, enabled: true });
    return id;
  }

  remove(id: number): boolean { return this.jobs.delete(id); }

  tick(date?: Date): number[] {
    const results: number[] = [];
    for (const [id, job] of this.jobs) {
      if (job.enabled && this.shouldRun(job.expr, date)) {
        job.fn(); results.push(id);
      }
    }
    return results;
  }
}`,
      testCode: `const sched = new CronScheduler();
const d = new Date(2025, 0, 15, 10, 30, 0);
if (!sched.shouldRun('30 10 * * *', d)) throw new Error('exact match should run');
if (sched.shouldRun('0 10 * * *', d)) throw new Error('wrong minute should not run');
if (!sched.shouldRun('*/5 * * * *', d)) throw new Error('step should run');
let ran = 0;
const id = sched.add('30 10 * * *', () => { ran++; });
sched.tick(d);
if (ran !== 1) throw new Error('tick should fire matching job');
sched.remove(id);
sched.tick(d);
if (ran !== 1) throw new Error('removed job should not fire');`,
      language: 'typescript',
      description: 'Typed cron scheduler with 5-field parsing, step/range/list matching, and job management',
      tags: ['cron', 'scheduler', 'job', 'utility', 'typescript', 'variant'],
      patternType: 'utility',
    },

    // ─── 10. Proxy Handler TS ───
    {
      name: 'proxy-handler-ts',
      code: `interface ProxyHooks<T> {
  beforeGet?(prop: string): void;
  afterGet?(prop: string, value: unknown): void;
  beforeSet?(prop: string, value: unknown, old: unknown): boolean | void;
  afterSet?(prop: string, value: unknown, old: unknown): void;
}

interface LogEntry {
  op: string; prop: string; time: number;
  old?: unknown; value?: unknown;
}

class ProxyHandler<T extends Record<string, unknown>> {
  private target: T;
  private hooks: ProxyHooks<T>;
  private log: LogEntry[] = [];

  constructor(target: T, hooks?: ProxyHooks<T>) {
    this.target = target;
    this.hooks = hooks || {};
  }

  get(prop: string): unknown {
    if (this.hooks.beforeGet) this.hooks.beforeGet(prop);
    this.log.push({ op: 'get', prop, time: Date.now() });
    const val = this.target[prop];
    if (this.hooks.afterGet) this.hooks.afterGet(prop, val);
    return val;
  }

  set(prop: string, value: unknown): boolean {
    const old = this.target[prop];
    if (this.hooks.beforeSet) {
      const allowed = this.hooks.beforeSet(prop, value, old);
      if (allowed === false) return false;
    }
    this.log.push({ op: 'set', prop, old, value, time: Date.now() });
    (this.target as Record<string, unknown>)[prop] = value;
    if (this.hooks.afterSet) this.hooks.afterSet(prop, value, old);
    return true;
  }

  getLog(): LogEntry[] { return this.log.slice(); }
  clearLog(): void { this.log = []; }
}`,
      testCode: `const obj: Record<string, number> = { x: 1, y: 2 };
const proxy = new ProxyHandler(obj, {
  beforeSet(prop: string, val: unknown) { if (prop === 'y' && (val as number) < 0) return false; }
});
if (proxy.get('x') !== 1) throw new Error('get should return value');
proxy.set('x', 10);
if (obj.x !== 10) throw new Error('set should update target');
if (proxy.set('y', -1) !== false) throw new Error('blocked set should return false');
if (obj.y !== 2) throw new Error('blocked set should not update');
const log = proxy.getLog();
if (log.length !== 2) throw new Error('should log 2 operations (blocked set excluded)');
proxy.clearLog();
if (proxy.getLog().length !== 0) throw new Error('clearLog should empty');`,
      language: 'typescript',
      description: 'Generic typed proxy handler with hooks, logging, and write protection',
      tags: ['proxy', 'handler', 'design-pattern', 'typescript', 'generic', 'variant'],
      patternType: 'design-pattern',
    },

    // ─── 11. Object Pool TS ───
    {
      name: 'object-pool-ts',
      code: `interface PoolOptions<T> {
  max?: number;
  reset?: (obj: T) => void;
}

class ObjectPool<T> {
  private factory: () => T;
  private maxSize: number;
  private pool: T[] = [];
  private activeCount = 0;
  private resetFn: ((obj: T) => void) | null;

  constructor(factory: () => T, opts?: PoolOptions<T>) {
    this.factory = factory;
    this.maxSize = opts?.max || 10;
    this.resetFn = opts?.reset || null;
  }

  acquire(): T | null {
    if (this.pool.length > 0) {
      this.activeCount++;
      const obj = this.pool.pop()!;
      if (this.resetFn) this.resetFn(obj);
      return obj;
    }
    if (this.activeCount < this.maxSize) {
      this.activeCount++;
      return this.factory();
    }
    return null;
  }

  release(obj: T): boolean {
    if (this.activeCount <= 0) return false;
    this.activeCount--;
    this.pool.push(obj);
    return true;
  }

  size(): number { return this.pool.length; }
  active(): number { return this.activeCount; }
  drain(): void { this.pool = []; this.activeCount = 0; }
}`,
      testCode: `let created = 0;
const pool = new ObjectPool<{ id: number; data: string | null }>(
  () => ({ id: ++created, data: null }),
  { max: 3, reset: (obj) => { obj.data = null; } }
);
const a = pool.acquire()!;
const b = pool.acquire()!;
if (created !== 2) throw new Error('should create 2');
a.data = 'dirty';
pool.release(a);
const c = pool.acquire()!;
if (c.id !== a.id) throw new Error('should reuse');
if (c.data !== null) throw new Error('should reset');
pool.acquire(); pool.acquire();
if (pool.acquire() !== null) throw new Error('should return null when full');
pool.drain();
if (pool.active() !== 0) throw new Error('drain should empty');`,
      language: 'typescript',
      description: 'Generic typed object pool with factory, reset, max size, and drain',
      tags: ['pool', 'object-pool', 'concurrency', 'typescript', 'generic', 'variant'],
      patternType: 'concurrency',
    },

    // ─── 12. Transform Stream TS ───
    {
      name: 'transform-stream-ts',
      code: `class TransformStream<TIn, TOut = TIn> {
  private transforms: Array<(data: unknown) => unknown> = [];
  private buffer: unknown[] = [];
  private flushed = false;

  addTransform<R>(fn: (data: unknown) => R): TransformStream<TIn, R> {
    this.transforms.push(fn as (data: unknown) => unknown);
    return this as unknown as TransformStream<TIn, R>;
  }

  write(chunk: TIn): this {
    if (this.flushed) throw new Error('Stream already flushed');
    let data: unknown = chunk;
    for (const t of this.transforms) {
      data = t(data);
      if (data == null) return this;
    }
    this.buffer.push(data);
    return this;
  }

  flush(): TOut[] {
    this.flushed = true;
    return this.buffer.slice() as TOut[];
  }

  size(): number { return this.buffer.length; }

  reset(): this {
    this.buffer = [];
    this.flushed = false;
    return this;
  }
}`,
      testCode: `const ts = new TransformStream<number, number>();
ts.addTransform((x: unknown) => (x as number) * 2).addTransform((x: unknown) => (x as number) + 1);
ts.write(1); ts.write(2); ts.write(3);
const out = ts.flush();
if (out.length !== 3) throw new Error('should have 3 items');
if (out[0] !== 3 || out[1] !== 5) throw new Error('transforms wrong');
const filter = new TransformStream<number, number>();
filter.addTransform((x: unknown) => (x as number) > 5 ? x : null);
filter.write(3); filter.write(8); filter.write(10);
const filtered = filter.flush();
if (filtered.length !== 2) throw new Error('filter should drop nulls');
if (filtered[0] !== 8) throw new Error('filter values wrong');`,
      language: 'typescript',
      description: 'Generic typed transform stream with chainable transforms, null filtering, and flush',
      tags: ['stream', 'transform', 'io', 'typescript', 'generic', 'variant'],
      patternType: 'io',
    },
  ];
}

function seedProductionLibrary3(oracle, options = {}) {
  const seeds = getProductionSeeds3();
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let registered = 0, skipped = 0, failed = 0;

  for (const seed of seeds) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (options.verbose) console.log(`  [OK] ${seed.name} (${seed.language})`);
    } else {
      failed++;
      if (options.verbose) console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, total: seeds.length };
}

module.exports = { getProductionSeeds3, seedProductionLibrary3 };
