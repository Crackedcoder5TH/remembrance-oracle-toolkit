/**
 * Observable — reactive value with subscriptions
 * createObservable(initialValue) → { get, set, subscribe, unsubscribe }
 */
function createObservable(initialValue) {
  let value = initialValue;
  const listeners = new Map();
  let nextId = 0;

  function get() {
    return value;
  }

  function set(newValue) {
    const oldValue = value;
    value = newValue;
    for (const [, listener] of listeners) {
      listener(newValue, oldValue);
    }
  }

  function subscribe(listener) {
    const id = nextId++;
    listeners.set(id, listener);
    return id;
  }

  function unsubscribe(id) {
    return listeners.delete(id);
  }

  return { get, set, subscribe, unsubscribe };
}

module.exports = { createObservable };
