/**
 * Priority Queue — Binary heap implementation.
 * Default: min-heap (smallest priority first).
 * Pass comparator for max-heap or custom ordering.
 *
 * @param {function} [comparator] - (a, b) => number. Default: (a, b) => a.priority - b.priority
 */
function createPriorityQueue(comparator) {
  const cmp = comparator || ((a, b) => a.priority - b.priority);
  const heap = [];

  function parent(i) { return (i - 1) >>> 1; }
  function left(i) { return 2 * i + 1; }
  function right(i) { return 2 * i + 2; }

  function swap(i, j) {
    [heap[i], heap[j]] = [heap[j], heap[i]];
  }

  function siftUp(i) {
    while (i > 0 && cmp(heap[i], heap[parent(i)]) < 0) {
      swap(i, parent(i));
      i = parent(i);
    }
  }

  function siftDown(i) {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const l = left(i);
      const r = right(i);
      if (l < n && cmp(heap[l], heap[smallest]) < 0) smallest = l;
      if (r < n && cmp(heap[r], heap[smallest]) < 0) smallest = r;
      if (smallest === i) break;
      swap(i, smallest);
      i = smallest;
    }
  }

  function push(item) {
    heap.push(item);
    siftUp(heap.length - 1);
  }

  function pop() {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      siftDown(0);
    }
    return top;
  }

  function peek() {
    return heap[0];
  }

  return {
    push,
    pop,
    peek,
    get size() { return heap.length; },
    isEmpty() { return heap.length === 0; },
    toArray() { return [...heap].sort(cmp); },
  };
}

module.exports = { createPriorityQueue };
