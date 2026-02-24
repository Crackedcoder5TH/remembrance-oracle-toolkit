/**
 * Priority Queue — elements dequeued by priority (lower number = higher priority)
 * createPriorityQueue() → { enqueue(item, priority), dequeue, peek, size }
 */
function createPriorityQueue() {
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
    while (i > 0 && heap[parent(i)].priority > heap[i].priority) {
      swap(i, parent(i));
      i = parent(i);
    }
  }

  function bubbleDown(i) {
    const n = heap.length;
    let smallest = i;
    const l = left(i);
    const r = right(i);
    if (l < n && heap[l].priority < heap[smallest].priority) smallest = l;
    if (r < n && heap[r].priority < heap[smallest].priority) smallest = r;
    if (smallest !== i) {
      swap(i, smallest);
      bubbleDown(smallest);
    }
  }

  function enqueue(item, priority) {
    heap.push({ item, priority });
    bubbleUp(heap.length - 1);
  }

  function dequeue() {
    if (heap.length === 0) return undefined;
    const min = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      bubbleDown(0);
    }
    return min.item;
  }

  function peek() {
    if (heap.length === 0) return undefined;
    return heap[0].item;
  }

  function size() {
    return heap.length;
  }

  return { enqueue, dequeue, peek, size };
}

module.exports = { createPriorityQueue };
