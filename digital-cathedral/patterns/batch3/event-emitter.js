/**
 * createEventEmitter - Creates a simple event emitter.
 * @returns {{ on: Function, off: Function, emit: Function, once: Function }}
 */
function createEventEmitter() {
  const listeners = new Map();

  function on(event, handler) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(handler);
  }

  function off(event, handler) {
    if (!listeners.has(event)) return;
    const handlers = listeners.get(event);
    listeners.set(event, handlers.filter((candidate) => candidate !== handler));
  }

  function emit(event, ...args) {
    if (!listeners.has(event)) return;
    // Copy the array to handle removal during iteration (e.g. once handlers)
    const handlers = listeners.get(event).slice();
    for (const handler of handlers) {
      handler(...args);
    }
  }

  function once(event, handler) {
    function wrapper(...args) {
      off(event, wrapper);
      handler(...args);
    }
    on(event, wrapper);
  }

  return { on, off, emit, once };
}

module.exports = { createEventEmitter };
