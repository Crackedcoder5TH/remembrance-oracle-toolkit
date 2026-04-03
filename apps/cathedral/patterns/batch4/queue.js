/**
 * Queue — FIFO data structure
 * createQueue() → { enqueue, dequeue, peek, size, isEmpty }
 */
function createQueue() {
  const items = [];
  let front = 0;

  function enqueue(value) {
    items.push(value);
  }

  function dequeue() {
    if (front >= items.length) return undefined;
    const value = items[front];
    items[front] = undefined; // allow GC
    front++;
    // compact when half the array is empty
    if (front > items.length / 2 && front > 10) {
      items.splice(0, front);
      front = 0;
    }
    return value;
  }

  function peek() {
    if (front >= items.length) return undefined;
    return items[front];
  }

  function size() {
    return items.length - front;
  }

  function isEmpty() {
    return size() === 0;
  }

  return { enqueue, dequeue, peek, size, isEmpty };
}

module.exports = { createQueue };
