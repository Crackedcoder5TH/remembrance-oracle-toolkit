/**
 * Min Heap — binary min heap data structure
 * createMinHeap() → { insert, extractMin, peek, size }
 */
function createMinHeap() {
  const heap = [];

  function parent(i) { return Math.floor((i - 1) / 2); }
  function left(i) { return 2 * i + 1; }
  function right(i) { return 2 * i + 2; }

  function swap(i, j) {
    const tmp = heap[i];
    heap[i] = heap[j];
    heap[j] = tmp;
  }

  function bubbleUp(i) {
    while (i > 0 && heap[parent(i)] > heap[i]) {
      swap(i, parent(i));
      i = parent(i);
    }
  }

  function bubbleDown(i) {
    const n = heap.length;
    let smallest = i;
    const l = left(i);
    const r = right(i);
    if (l < n && heap[l] < heap[smallest]) smallest = l;
    if (r < n && heap[r] < heap[smallest]) smallest = r;
    if (smallest !== i) {
      swap(i, smallest);
      bubbleDown(smallest);
    }
  }

  function insert(value) {
    heap.push(value);
    bubbleUp(heap.length - 1);
  }

  function extractMin() {
    if (heap.length === 0) return undefined;
    const min = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      bubbleDown(0);
    }
    return min;
  }

  function peek() {
    return heap.length === 0 ? undefined : heap[0];
  }

  function size() {
    return heap.length;
  }

  return { insert, extractMin, peek, size };
}

module.exports = { createMinHeap };
