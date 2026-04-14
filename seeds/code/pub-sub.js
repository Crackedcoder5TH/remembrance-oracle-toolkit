/**
 * Pub/Sub — Simple typed event bus / message broker.
 * Supports: subscribe, publish, once, wildcard topics, unsubscribe.
 *
 * @returns {{ publish, subscribe, once, unsubscribe, clear, topics }}
 */
function createPubSub() {
  const subscribers = new Map();

  function subscribe(topic, handler) {
    if (!subscribers.has(topic)) {
      subscribers.set(topic, new Set());
    }
    subscribers.get(topic).add(handler);
    return () => unsubscribe(topic, handler);
  }

  function once(topic, handler) {
    const wrapper = (...args) => {
      unsubscribe(topic, wrapper);
      return handler(...args);
    };
    return subscribe(topic, wrapper);
  }

  function publish(topic, ...args) {
    let count = 0;

    // Exact match
    if (subscribers.has(topic)) {
      for (const handler of subscribers.get(topic)) {
        handler(...args);
        count++;
      }
    }

    // Wildcard subscribers
    if (subscribers.has('*')) {
      for (const handler of subscribers.get('*')) {
        handler(topic, ...args);
        count++;
      }
    }

    // Hierarchical wildcard (e.g., 'user.*' matches 'user.created')
    for (const [pattern, handlers] of subscribers) {
      if (pattern !== '*' && pattern !== topic && pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (topic.startsWith(prefix + '.') || topic === prefix) {
          for (const handler of handlers) {
            handler(...args);
            count++;
          }
        }
      }
    }

    return count;
  }

  function unsubscribe(topic, handler) {
    if (!subscribers.has(topic)) return false;
    const removed = subscribers.get(topic).delete(handler);
    if (subscribers.get(topic).size === 0) {
      subscribers.delete(topic);
    }
    return removed;
  }

  function clear(topic) {
    if (topic) {
      subscribers.delete(topic);
    } else {
      subscribers.clear();
    }
  }

  return {
    publish,
    subscribe,
    once,
    unsubscribe,
    clear,
    get topics() { return [...subscribers.keys()]; },
    get size() { return subscribers.size; },
  };
}

module.exports = { createPubSub };
