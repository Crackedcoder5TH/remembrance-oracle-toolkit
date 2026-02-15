const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProductionSeeds, getProductionSeeds2 } = require('../src/patterns/seed-helpers');
const { RemembranceOracle } = require('../src/api/oracle');

describe('Production Seeds - Batch 1', () => {
  const seeds = getProductionSeeds();

  it('has 10 patterns', () => {
    assert.equal(seeds.length, 10);
  });

  it('all have required fields', () => {
    for (const seed of seeds) {
      assert.ok(seed.name, `missing name`);
      assert.ok(seed.code, `${seed.name}: missing code`);
      assert.ok(seed.testCode, `${seed.name}: missing testCode`);
      assert.ok(seed.description, `${seed.name}: missing description`);
      assert.ok(seed.tags && seed.tags.length > 0, `${seed.name}: missing tags`);
      assert.equal(seed.language, 'javascript');
    }
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

  it('rate-limiter works', () => {
    const code = seeds.find(s => s.name === 'rate-limiter').code;
    const fn = new Function(code + '\nreturn new RateLimiter(3, 1);');
    const limiter = fn();
    assert.ok(limiter.consume());
    assert.ok(limiter.consume());
    assert.ok(limiter.consume());
    assert.ok(!limiter.consume()); // exhausted
  });

  it('event-emitter works', () => {
    const code = seeds.find(s => s.name === 'event-emitter').code;
    const fn = new Function(code + '\nreturn new EventEmitter();');
    const emitter = fn();
    let called = false;
    emitter.on('test', () => { called = true; });
    emitter.emit('test');
    assert.ok(called);
  });

  it('state-machine works', () => {
    const code = seeds.find(s => s.name === 'state-machine').code;
    const fn = new Function(code + `\nreturn new StateMachine({
      initial: 'idle',
      states: { idle: {}, running: {}, done: {} },
      transitions: [
        { from: 'idle', to: 'running', event: 'start' },
        { from: 'running', to: 'done', event: 'finish' },
      ],
    });`);
    const sm = fn();
    assert.equal(sm.getState(), 'idle');
    sm.transition('start');
    assert.equal(sm.getState(), 'running');
  });

  it('semaphore works', () => {
    const code = seeds.find(s => s.name === 'semaphore').code;
    const fn = new Function(code + '\nreturn new Semaphore(2);');
    const sem = fn();
    assert.equal(sem.available(), 2);
  });
});

describe('Production Seeds - Batch 2', () => {
  const seeds = getProductionSeeds2();

  it('has 10 patterns', () => {
    assert.equal(seeds.length, 10);
  });

  it('all have required fields', () => {
    for (const seed of seeds) {
      assert.ok(seed.name, `missing name`);
      assert.ok(seed.code, `${seed.name}: missing code`);
      assert.ok(seed.testCode, `${seed.name}: missing testCode`);
      assert.ok(seed.description, `${seed.name}: missing description`);
      assert.ok(seed.tags && seed.tags.length > 0, `${seed.name}: missing tags`);
      assert.equal(seed.language, 'javascript');
    }
  });

  it('all have substantial code (>100 chars)', () => {
    for (const seed of seeds) {
      assert.ok(seed.code.length > 100, `${seed.name}: code too short (${seed.code.length} chars)`);
    }
  });

  it('request-validator works', () => {
    const code = seeds.find(s => s.name === 'request-validator').code;
    const fn = new Function(code + `\nreturn new RequestValidator({
      name: { type: 'string', required: true },
      age: { type: 'number', min: 0 },
    });`);
    const v = fn();
    const r1 = v.validate({ name: 'test', age: 25 });
    assert.ok(r1.valid);
    const r2 = v.validate({});
    assert.ok(!r2.valid);
  });

  it('bloom-filter works', () => {
    const code = seeds.find(s => s.name === 'bloom-filter').code;
    const fn = new Function(code + '\nreturn new BloomFilter(1000, 3);');
    const bf = fn();
    bf.add('hello');
    assert.ok(bf.mightContain('hello'));
    // Fresh filter should likely not contain random string
    const bf2 = new Function(code + '\nreturn new BloomFilter(1000, 3);')();
    assert.ok(!bf2.mightContain('xyz_not_added'));
  });

  it('pub-sub works', () => {
    const code = seeds.find(s => s.name === 'pub-sub').code;
    const fn = new Function(code + '\nreturn new PubSub();');
    const ps = fn();
    let received = null;
    ps.subscribe('test', (data) => { received = data; });
    ps.publish('test', 'hello');
    assert.equal(received, 'hello');
  });

  it('dependency-injection works', () => {
    const code = seeds.find(s => s.name === 'dependency-injection').code;
    const fn = new Function(code + '\nreturn new DIContainer();');
    const di = fn();
    di.register('config', () => ({ port: 3000 }));
    const config = di.resolve('config');
    assert.equal(config.port, 3000);
  });

  it('observable works', () => {
    const code = seeds.find(s => s.name === 'observable').code;
    const fn = new Function(code + `\nreturn Observable.of(1, 2, 3);`);
    const obs = fn();
    const values = [];
    obs.subscribe({ next: v => values.push(v) });
    assert.deepEqual(values, [1, 2, 3]);
  });
});

describe('Production Seeds Oracle Registration', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-seeds-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers all 20 patterns through oracle', () => {
    const allSeeds = [...getProductionSeeds(), ...getProductionSeeds2()];
    let registered = 0;
    for (const seed of allSeeds) {
      const result = oracle.registerPattern({
        name: seed.name,
        code: seed.code,
        testCode: seed.testCode,
        language: seed.language,
        description: seed.description,
        tags: seed.tags,
        patternType: seed.type,
      });
      if (result) registered++;
    }
    assert.equal(registered, 20);
  });
});
