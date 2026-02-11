const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createObservable', () => {
  it('should get and set values', () => {
    const obs = createObservable(10);
    assert.strictEqual(obs.get(), 10);
    obs.set(20);
    assert.strictEqual(obs.get(), 20);
  });

  it('should notify subscribers on set', () => {
    const obs = createObservable('hello');
    const calls = [];
    obs.subscribe((newVal, oldVal) => calls.push({ newVal, oldVal }));
    obs.set('world');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].newVal, 'world');
    assert.strictEqual(calls[0].oldVal, 'hello');
  });

  it('should support multiple subscribers', () => {
    const obs = createObservable(0);
    let count1 = 0;
    let count2 = 0;
    obs.subscribe(() => count1++);
    obs.subscribe(() => count2++);
    obs.set(1);
    obs.set(2);
    assert.strictEqual(count1, 2);
    assert.strictEqual(count2, 2);
  });

  it('should unsubscribe listeners', () => {
    const obs = createObservable(0);
    let count = 0;
    const id = obs.subscribe(() => count++);
    obs.set(1);
    assert.strictEqual(count, 1);
    obs.unsubscribe(id);
    obs.set(2);
    assert.strictEqual(count, 1); // no additional call
  });

  it('should return subscription id from subscribe', () => {
    const obs = createObservable(null);
    const id1 = obs.subscribe(() => {});
    const id2 = obs.subscribe(() => {});
    assert.strictEqual(typeof id1, 'number');
    assert.notStrictEqual(id1, id2);
  });
});
