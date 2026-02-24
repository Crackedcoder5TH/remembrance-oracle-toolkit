'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Multi-Task Queuing & Prioritization Module
 *
 * Manages a queue of swarm tasks with priority scheduling.
 * Tasks are processed in background with configurable concurrency.
 *
 * Priority levels:
 *   1 (critical) — security fixes, production bugs
 *   2 (high)     — feature implementation
 *   3 (normal)   — code review, optimization
 *   4 (low)      — cleanup, documentation
 *
 * Oracle decision: EVOLVE from pipe (0.970) + retry-async (0.609)
 */

const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
};

/**
 * Swarm Task Queue — processes tasks with priority ordering.
 * Emits events: task:queued, task:started, task:completed, task:failed, queue:empty, queue:drained
 */
class SwarmTaskQueue extends EventEmitter {
  /**
   * @param {object} [options] - Queue configuration
   * @param {number} [options.concurrency=1] - Max concurrent tasks
   * @param {number} [options.maxQueueSize=50] - Max pending tasks
   */
  constructor(options = {}) {
    super();
    this._concurrency = options.concurrency || 1;
    this._maxQueueSize = options.maxQueueSize || 50;
    this._pending = [];      // Sorted by priority
    this._active = new Map(); // id → { task, promise }
    this._completed = [];     // Finished tasks (last 100)
    this._processing = false;
  }

  /**
   * Add a task to the queue.
   *
   * @param {string} description - Task description
   * @param {object} [options] - Task options
   * @param {number} [options.priority=3] - Priority level (1=critical, 4=low)
   * @param {string} [options.language] - Target language
   * @param {string} [options.type='code'] - Task type: code, review, heal
   * @param {object} [options.meta] - Additional metadata
   * @returns {{ id: string, position: number }}
   */
  enqueue(description, options = {}) {
    if (this._pending.length >= this._maxQueueSize) {
      throw new Error(`Queue full (max ${this._maxQueueSize})`);
    }

    const task = {
      id: crypto.randomUUID(),
      description,
      priority: options.priority || PRIORITY.NORMAL,
      language: options.language || 'javascript',
      type: options.type || 'code',
      meta: options.meta || {},
      status: 'pending',
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    // Insert sorted by priority (lower number = higher priority)
    const insertIdx = this._pending.findIndex(t => t.priority > task.priority);
    if (insertIdx === -1) {
      this._pending.push(task);
    } else {
      this._pending.splice(insertIdx, 0, task);
    }

    this.emit('task:queued', { id: task.id, description, priority: task.priority, position: this._pending.indexOf(task) + 1 });

    return { id: task.id, position: this._pending.indexOf(task) + 1 };
  }

  /**
   * Start processing the queue.
   *
   * @param {function} swarmFn - The swarm execution function: (task) => Promise<SwarmResult>
   */
  async process(swarmFn) {
    if (this._processing) return;
    this._processing = true;

    while (this._pending.length > 0 || this._active.size > 0) {
      // Fill active slots up to concurrency
      while (this._pending.length > 0 && this._active.size < this._concurrency) {
        const task = this._pending.shift();
        task.status = 'running';
        task.startedAt = new Date().toISOString();

        this.emit('task:started', { id: task.id, description: task.description, priority: task.priority });

        const promise = this._executeTask(task, swarmFn);
        this._active.set(task.id, { task, promise });
      }

      // Wait for any active task to complete
      if (this._active.size > 0) {
        const promises = Array.from(this._active.values()).map(a => a.promise);
        await Promise.race(promises);
      }
    }

    this._processing = false;
    this.emit('queue:drained');
  }

  /**
   * Execute a single task and handle completion/failure.
   */
  async _executeTask(task, swarmFn) {
    try {
      const result = await swarmFn(task);
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.result = result;

      this.emit('task:completed', {
        id: task.id,
        description: task.description,
        winner: result.winner?.agent,
        score: result.winner?.score,
        durationMs: result.totalDurationMs,
      });
    } catch (err) {
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      task.error = err.message;

      this.emit('task:failed', { id: task.id, description: task.description, error: err.message });
    } finally {
      this._active.delete(task.id);
      this._completed.push(task);
      if (this._completed.length > 100) {
        this._completed = this._completed.slice(-100);
      }
      if (this._pending.length === 0 && this._active.size === 0) {
        this.emit('queue:empty');
      }
    }
  }

  /**
   * Get current queue status.
   *
   * @returns {object} Queue state snapshot
   */
  status() {
    return {
      pending: this._pending.length,
      active: this._active.size,
      completed: this._completed.filter(t => t.status === 'completed').length,
      failed: this._completed.filter(t => t.status === 'failed').length,
      processing: this._processing,
      concurrency: this._concurrency,
      tasks: {
        pending: this._pending.map(t => ({ id: t.id, description: t.description.slice(0, 80), priority: t.priority })),
        active: Array.from(this._active.values()).map(a => ({ id: a.task.id, description: a.task.description.slice(0, 80), priority: a.task.priority })),
      },
    };
  }

  /**
   * Cancel a pending task by ID.
   *
   * @param {string} taskId - Task to cancel
   * @returns {boolean} Whether the task was found and cancelled
   */
  cancel(taskId) {
    const idx = this._pending.findIndex(t => t.id === taskId);
    if (idx === -1) return false;
    this._pending.splice(idx, 1);
    return true;
  }

  /**
   * Get a completed task's result by ID.
   *
   * @param {string} taskId - Task ID
   * @returns {object|null} Task with result
   */
  getResult(taskId) {
    return this._completed.find(t => t.id === taskId) || null;
  }

  /** Number of pending tasks */
  get pendingCount() { return this._pending.length; }

  /** Number of active tasks */
  get activeCount() { return this._active.size; }

  /** Whether the queue is currently processing */
  get isProcessing() { return this._processing; }
}

module.exports = {
  PRIORITY,
  SwarmTaskQueue,
};
