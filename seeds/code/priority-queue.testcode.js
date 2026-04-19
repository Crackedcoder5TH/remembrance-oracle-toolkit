// Test: priority-queue — inline assertions, no require
const pq1 = createPriorityQueue();
pq1.push({ value: 'c', priority: 3 });
pq1.push({ value: 'a', priority: 1 });
pq1.push({ value: 'b', priority: 2 });

if (pq1.pop().value !== 'a') throw new Error('Min-heap: first should be a');
if (pq1.pop().value !== 'b') throw new Error('Min-heap: second should be b');
if (pq1.pop().value !== 'c') throw new Error('Min-heap: third should be c');

// Max-heap
const pq2 = createPriorityQueue((a, b) => b.priority - a.priority);
pq2.push({ value: 'low', priority: 1 });
pq2.push({ value: 'high', priority: 10 });
pq2.push({ value: 'mid', priority: 5 });
if (pq2.pop().value !== 'high') throw new Error('Max-heap: first should be high');

// Peek
const pq3 = createPriorityQueue();
pq3.push({ priority: 5 });
pq3.push({ priority: 1 });
if (pq3.peek().priority !== 1) throw new Error('Peek should return min');
if (pq3.size !== 2) throw new Error('Peek should not remove');

// Empty queue
const pq4 = createPriorityQueue();
if (pq4.pop() !== undefined) throw new Error('Pop on empty should be undefined');
if (!pq4.isEmpty()) throw new Error('Should be empty');

// Many items - correctness
const pq5 = createPriorityQueue();
for (let i = 100; i >= 1; i--) pq5.push({ priority: i });
let prev = -1;
while (!pq5.isEmpty()) {
  const item = pq5.pop();
  if (item.priority < prev) throw new Error('Out of order: ' + item.priority + ' < ' + prev);
  prev = item.priority;
}
