const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPubSub } = require('../seeds/pub-sub');

describe('pub-sub', () => {
  it('should publish and subscribe', () => {
    const bus = createPubSub();
    const received = [];
    bus.subscribe('test', (msg) => received.push(msg));
    bus.publish('test', 'hello');
    bus.publish('test', 'world');
    assert.deepEqual(received, ['hello', 'world']);
  });

  it('should support multiple subscribers', () => {
    const bus = createPubSub();
    let count = 0;
    bus.subscribe('event', () => count++);
    bus.subscribe('event', () => count++);
    bus.publish('event');
    assert.equal(count, 2);
  });

  it('should unsubscribe via returned function', () => {
    const bus = createPubSub();
    const received = [];
    const unsub = bus.subscribe('test', (msg) => received.push(msg));
    bus.publish('test', 'a');
    unsub();
    bus.publish('test', 'b');
    assert.deepEqual(received, ['a']);
  });

  it('should support once', () => {
    const bus = createPubSub();
    const received = [];
    bus.once('test', (msg) => received.push(msg));
    bus.publish('test', 'first');
    bus.publish('test', 'second');
    assert.deepEqual(received, ['first']);
  });

  it('should support wildcard * subscriber', () => {
    const bus = createPubSub();
    const received = [];
    bus.subscribe('*', (topic, data) => received.push({ topic, data }));
    bus.publish('user.created', { id: 1 });
    bus.publish('order.placed', { id: 2 });
    assert.equal(received.length, 2);
    assert.equal(received[0].topic, 'user.created');
  });

  it('should support hierarchical wildcards', () => {
    const bus = createPubSub();
    const received = [];
    bus.subscribe('user.*', (data) => received.push(data));
    bus.publish('user.created', 'new');
    bus.publish('user.deleted', 'gone');
    bus.publish('order.placed', 'order');
    assert.deepEqual(received, ['new', 'gone']);
  });

  it('should return publish count', () => {
    const bus = createPubSub();
    bus.subscribe('x', () => {});
    bus.subscribe('x', () => {});
    const count = bus.publish('x');
    assert.equal(count, 2);
  });

  it('should clear topics', () => {
    const bus = createPubSub();
    bus.subscribe('a', () => {});
    bus.subscribe('b', () => {});
    assert.equal(bus.size, 2);
    bus.clear('a');
    assert.equal(bus.size, 1);
    bus.clear();
    assert.equal(bus.size, 0);
  });

  it('should list topics', () => {
    const bus = createPubSub();
    bus.subscribe('alpha', () => {});
    bus.subscribe('beta', () => {});
    assert.deepEqual(bus.topics.sort(), ['alpha', 'beta']);
  });

  it('should handle publish with no subscribers', () => {
    const bus = createPubSub();
    const count = bus.publish('nothing');
    assert.equal(count, 0);
  });
});
