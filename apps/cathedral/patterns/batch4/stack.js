/**
 * Stack — LIFO data structure
 * createStack() → { push, pop, peek, size, isEmpty }
 */
function createStack() {
  const items = [];

  function push(value) {
    items.push(value);
  }

  function pop() {
    if (items.length === 0) return undefined;
    return items.pop();
  }

  function peek() {
    if (items.length === 0) return undefined;
    return items[items.length - 1];
  }

  function size() {
    return items.length;
  }

  function isEmpty() {
    return items.length === 0;
  }

  return { push, pop, peek, size, isEmpty };
}

module.exports = { createStack };
