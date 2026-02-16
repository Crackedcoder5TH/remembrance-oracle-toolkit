const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProductionSeeds3 } = require('../src/patterns/seed-helpers');
const { RemembranceOracle } = require('../src/api/oracle');

describe('Production Seeds - Batch 3 (pagination, command, cron, proxy, pool, streams)', () => {
  const seeds = getProductionSeeds3();

  it('has 12 patterns (6 JS + 6 TS)', () => {
    assert.equal(seeds.length, 12);
  });

  it('all have required fields', () => {
    for (const seed of seeds) {
      assert.ok(seed.name, `missing name`);
      assert.ok(seed.code, `${seed.name}: missing code`);
      assert.ok(seed.testCode, `${seed.name}: missing testCode`);
      assert.ok(seed.description, `${seed.name}: missing description`);
      assert.ok(seed.tags && seed.tags.length > 0, `${seed.name}: missing tags`);
      assert.ok(['javascript', 'typescript'].includes(seed.language), `${seed.name}: bad language`);
    }
  });

  it('has 6 javascript and 6 typescript patterns', () => {
    const js = seeds.filter(s => s.language === 'javascript');
    const ts = seeds.filter(s => s.language === 'typescript');
    assert.equal(js.length, 6, 'should have 6 JS patterns');
    assert.equal(ts.length, 6, 'should have 6 TS patterns');
  });

  it('all have substantial code (>100 chars)', () => {
    for (const seed of seeds) {
      assert.ok(seed.code.length > 100, `${seed.name}: code too short (${seed.code.length} chars)`);
    }
  });

  it('all have substantial tests (>100 chars)', () => {
    for (const seed of seeds) {
      assert.ok(seed.testCode.length > 100, `${seed.name}: testCode too short (${seed.testCode.length} chars)`);
    }
  });

  // ─── JS Pattern Functional Tests ───

  it('paginator works', () => {
    const code = seeds.find(s => s.name === 'paginator').code;
    const fn = new Function(code + '\nreturn new Paginator(Array.from({length:25},(_,i)=>i+1), 10);');
    const pg = fn();
    assert.equal(pg.totalPages(), 3);
    assert.deepEqual(pg.page(1).slice(0, 3), [1, 2, 3]);
    assert.equal(pg.page(3).length, 5);
    assert.ok(pg.hasNext(1));
    assert.ok(!pg.hasNext(3));
    assert.ok(!pg.hasPrev(1));
    assert.ok(pg.hasPrev(2));
  });

  it('command-undo works', () => {
    const code = seeds.find(s => s.name === 'command-undo').code;
    const fn = new Function(code + `
      const state = { value: 0 };
      const mgr = new CommandManager();
      const cmd = { execute() { state.value += 5; }, undo() { state.value -= 5; } };
      mgr.execute(cmd);
      const afterExec = state.value;
      mgr.undo();
      const afterUndo = state.value;
      mgr.redo();
      const afterRedo = state.value;
      return { afterExec, afterUndo, afterRedo, canUndo: mgr.canUndo(), canRedo: mgr.canRedo() };
    `);
    const r = fn();
    assert.equal(r.afterExec, 5);
    assert.equal(r.afterUndo, 0);
    assert.equal(r.afterRedo, 5);
    assert.ok(r.canUndo);
    assert.ok(!r.canRedo);
  });

  it('cron-scheduler works', () => {
    const code = seeds.find(s => s.name === 'cron-scheduler').code;
    const fn = new Function(code + `
      const s = new CronScheduler();
      const d = new Date(2025, 0, 15, 10, 30, 0);
      return {
        exact: s.shouldRun('30 10 * * *', d),
        wrong: s.shouldRun('0 10 * * *', d),
        step: s.shouldRun('*/5 * * * *', d),
        range: s.shouldRun('25-35 * * * *', d),
        list: s.shouldRun('30,45 * * * *', d)
      };
    `);
    const r = fn();
    assert.ok(r.exact);
    assert.ok(!r.wrong);
    assert.ok(r.step);
    assert.ok(r.range);
    assert.ok(r.list);
  });

  it('proxy-handler works', () => {
    const code = seeds.find(s => s.name === 'proxy-handler').code;
    const fn = new Function(code + `
      const obj = { x: 1, y: 2 };
      const p = new ProxyHandler(obj, {
        beforeSet(prop, val) { if (prop === 'y' && val < 0) return false; }
      });
      const getX = p.get('x');
      p.set('x', 10);
      const blocked = p.set('y', -1);
      return { getX, x: obj.x, y: obj.y, blocked, logLen: p.getLog().length };
    `);
    const r = fn();
    assert.equal(r.getX, 1);
    assert.equal(r.x, 10);
    assert.equal(r.y, 2); // blocked
    assert.equal(r.blocked, false);
    assert.equal(r.logLen, 2); // blocked set doesn't log
  });

  it('object-pool works', () => {
    const code = seeds.find(s => s.name === 'object-pool').code;
    const fn = new Function(code + `
      let created = 0;
      const pool = new ObjectPool(() => ({ id: ++created }), { max: 2 });
      const a = pool.acquire();
      const b = pool.acquire();
      const full = pool.acquire();
      pool.release(a);
      const reused = pool.acquire();
      return { created, full, reusedId: reused.id, aId: a.id };
    `);
    const r = fn();
    assert.equal(r.created, 2);
    assert.equal(r.full, null);
    assert.equal(r.reusedId, r.aId);
  });

  it('transform-stream works', () => {
    const code = seeds.find(s => s.name === 'transform-stream').code;
    const fn = new Function(code + `
      const ts = new TransformStream();
      ts.addTransform(x => x * 2).addTransform(x => x + 1);
      ts.write(1); ts.write(2); ts.write(3);
      return ts.flush();
    `);
    const r = fn();
    assert.deepEqual(r, [3, 5, 7]);
  });
});

describe('Production Seeds 3 - Oracle Registration', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-seeds3-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers all 12 patterns through oracle', () => {
    const seeds = getProductionSeeds3();
    let registered = 0;
    for (const seed of seeds) {
      const result = oracle.registerPattern({
        name: seed.name,
        code: seed.code,
        testCode: seed.testCode,
        language: seed.language,
        description: seed.description,
        tags: seed.tags,
        patternType: seed.patternType,
      });
      if (result) registered++;
    }
    assert.equal(registered, 12);
  });
});
