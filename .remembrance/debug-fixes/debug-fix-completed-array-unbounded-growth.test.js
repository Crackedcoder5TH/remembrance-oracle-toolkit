const { describe, it } = require('node:test');
const assert = require('node:assert');

function trimTaskForStorage(task) {
  return {
    id: task.id,
    description: task.description,
    priority: task.priority,
    status: task.status,
    queuedAt: task.queuedAt,
    completedAt: task.completedAt,
    error: task.error,
    resultSummary: task.result ? {
      winner: task.result.winner?.agent,
      score: task.result.winner?.score,
      durationMs: task.result.totalDurationMs,
    } : null,
  };
}

function addToCompletedBounded(completed, task, maxCompleted) {
  completed.push(trimTaskForStorage(task));
  while (completed.length > maxCompleted) {
    completed.shift();
  }
}

describe('bounded completed task storage', () => {
  it('trims large result objects', () => {
    const task = {
      id: '1', description: 'test', priority: 3, status: 'completed',
      queuedAt: '2024-01-01', completedAt: '2024-01-01', error: null,
      result: {
        winner: { agent: 'claude', score: 0.95 },
        totalDurationMs: 1234,
        fullOutput: 'x'.repeat(100000), // 100KB of output
        agents: [{ output: 'x'.repeat(50000) }],
      },
    };

    const trimmed = trimTaskForStorage(task);
    const trimmedSize = JSON.stringify(trimmed).length;
    const originalSize = JSON.stringify(task).length;
    assert.ok(trimmedSize < originalSize / 10, 'trimmed should be much smaller');
    assert.strictEqual(trimmed.resultSummary.winner, 'claude');
    assert.strictEqual(trimmed.resultSummary.score, 0.95);
  });

  it('caps array at maxCompleted', () => {
    const completed = [];
    for (let i = 0; i < 10; i++) {
      addToCompletedBounded(completed, {
        id: String(i), description: `task ${i}`, status: 'completed',
        result: null, priority: 3,
      }, 5);
    }
    assert.strictEqual(completed.length, 5);
    assert.strictEqual(completed[0].id, '5'); // oldest retained
    assert.strictEqual(completed[4].id, '9'); // newest
  });

  it('handles null result gracefully', () => {
    const trimmed = trimTaskForStorage({ id: '1', result: null });
    assert.strictEqual(trimmed.resultSummary, null);
  });
});
