const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// createEventEmitter is available via isolated sandbox concatenation

describe('createEventEmitter', () => {
  it('should register and emit events', () => {
    const emitter = createEventEmitter();
    let received;
    emitter.on('test', (val) => { received = val; });
    emitter.emit('test', 42);
    assert.equal(received, 42);
  });

  it('should support multiple listeners', () => {
    const emitter = createEventEmitter();
    const results = [];
    emitter.on('data', (v) => results.push(v * 2));
    emitter.on('data', (v) => results.push(v * 3));
    emitter.emit('data', 5);
    assert.deepEqual(results, [10, 15]);
  });

  it('should remove listeners with off', () => {
    const emitter = createEventEmitter();
    let count = 0;
    const handler = () => { count++; };
    emitter.on('click', handler);
    emitter.emit('click');
    emitter.off('click', handler);
    emitter.emit('click');
    assert.equal(count, 1);
  });

  it('should support once listeners', () => {
    const emitter = createEventEmitter();
    let count = 0;
    emitter.once('init', () => { count++; });
    emitter.emit('init');
    emitter.emit('init');
    emitter.emit('init');
    assert.equal(count, 1);
  });

  it('should pass multiple arguments to listeners', () => {
    const emitter = createEventEmitter();
    let captured;
    emitter.on('multi', (a, b, c) => { captured = [a, b, c]; });
    emitter.emit('multi', 1, 2, 3);
    assert.deepEqual(captured, [1, 2, 3]);
  });

  it('should not throw when emitting with no listeners', () => {
    const emitter = createEventEmitter();
    assert.doesNotThrow(() => emitter.emit('nothing'));
  });
});
