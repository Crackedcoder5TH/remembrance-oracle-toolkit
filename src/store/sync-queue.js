/**
 * Offline-First Sync Queue
 *
 * Queues sync operations when the target store is unreachable and replays
 * them on reconnect. Uses a local JSON file as a persistent queue.
 *
 * Features:
 *   - Persistent queue survives process restarts
 *   - Exponential backoff retry (2s, 4s, 8s, 16s)
 *   - Max 4 retries per operation
 *   - Automatic drain when store becomes reachable
 *   - Queue stats (pending, failed, completed)
 */

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

class SyncQueue {
  /**
   * @param {object} options
   *   - queueDir: directory to store queue files (default: .remembrance/)
   *   - onDrained: callback when queue is fully drained
   */
  constructor(options = {}) {
    this._queueDir = options.queueDir || path.join(process.cwd(), '.remembrance');
    this._queueFile = path.join(this._queueDir, 'sync-queue.json');
    this._onDrained = options.onDrained || null;
    this._draining = false;
    this._queue = this._load();
  }

  /**
   * Load persisted queue from disk.
   */
  _load() {
    try {
      if (fs.existsSync(this._queueFile)) {
        const data = JSON.parse(fs.readFileSync(this._queueFile, 'utf-8'));
        return Array.isArray(data) ? data : [];
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[sync-queue:_load] primary corrupted — try backup:', e?.message || e);
      // Attempt .bak recovery
      const bakPath = this._queueFile + '.bak';
      try {
        if (fs.existsSync(bakPath)) {
          const raw = fs.readFileSync(bakPath, 'utf-8');
          const parsed = JSON.parse(raw);
          const data = Array.isArray(parsed) ? parsed : [];
          try { fs.writeFileSync(this._queueFile, raw, 'utf-8'); } catch (_) { /* best effort */ }
          return data;
        }
      } catch (bakErr) {
        if (process.env.ORACLE_DEBUG) console.warn('[sync-queue:_load] backup also corrupted:', bakErr?.message || bakErr);
      }
    }
    return [];
  }

  /**
   * Persist queue to disk.
   */
  _save() {
    try {
      if (!fs.existsSync(this._queueDir)) {
        fs.mkdirSync(this._queueDir, { recursive: true });
      }
      // Atomic write: tmp → backup → rename
      const json = JSON.stringify(this._queue, null, 2);
      const tmpPath = this._queueFile + '.tmp';
      fs.writeFileSync(tmpPath, json, 'utf-8');
      if (fs.existsSync(this._queueFile)) {
        try { fs.copyFileSync(this._queueFile, this._queueFile + '.bak'); } catch (_) { /* best effort */ }
      }
      fs.renameSync(tmpPath, this._queueFile);
    } catch (err) {
      if (process.env.ORACLE_DEBUG) console.error('[sync-queue] save error:', err.message);
    }
  }

  /**
   * Enqueue a sync operation.
   * @param {object} operation
   *   - type: 'push' | 'pull' | 'share' | 'community-pull'
   *   - scope: 'personal' | 'community'
   *   - options: original sync options
   *   - patternIds: optional list of specific pattern IDs
   */
  enqueue(operation) {
    this._queue.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...operation,
      retries: 0,
      createdAt: new Date().toISOString(),
      lastAttempt: null,
      lastError: null,
      status: 'pending',
    });
    this._save();
    return this;
  }

  /**
   * Get pending operations.
   */
  pending() {
    return this._queue.filter(op => op.status === 'pending');
  }

  /**
   * Get queue statistics.
   */
  stats() {
    const pending = this._queue.filter(op => op.status === 'pending').length;
    const failed = this._queue.filter(op => op.status === 'failed').length;
    const completed = this._queue.filter(op => op.status === 'completed').length;
    return { total: this._queue.length, pending, failed, completed };
  }

  /**
   * Attempt to drain the queue — replay all pending operations.
   * @param {Function} executor - async function(operation) that performs the sync
   * @returns {object} { drained, failed, remaining }
   */
  async drain(executor) {
    if (this._draining) return { drained: 0, failed: 0, remaining: this.pending().length };
    this._draining = true;

    let drained = 0;
    let failed = 0;

    try {
      // Snapshot pending ops — avoid mutating array during iteration
      const pending = this._queue.filter(op => op.status === 'pending');
      for (const op of pending) {

        op.lastAttempt = new Date().toISOString();

        try {
          await executor(op);
          op.status = 'completed';
          drained++;
        } catch (err) {
          op.retries++;
          op.lastError = err.message;

          if (op.retries >= MAX_RETRIES) {
            op.status = 'failed';
            failed++;
          } else {
            // Exponential backoff
            const delay = BASE_DELAY_MS * Math.pow(2, op.retries - 1);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Retry once more inline
            try {
              await executor(op);
              op.status = 'completed';
              drained++;
            } catch (retryErr) {
              if (process.env.ORACLE_DEBUG) console.warn('[sync-queue:drain] operation failed:', retryErr?.message || retryErr);
              op.retries++;
              op.lastError = retryErr.message;
              if (op.retries >= MAX_RETRIES) {
                op.status = 'failed';
                failed++;
              }
            }
          }
        }
      }
    } finally {
      // Clean completed entries older than 24h
      const cutoff = Date.now() - 86400000;
      this._queue = this._queue.filter(op => {
        if (op.status === 'completed' && new Date(op.createdAt).getTime() < cutoff) return false;
        return true;
      });

      this._save();
      this._draining = false;
    }

    if (this._onDrained && this.pending().length === 0) {
      this._onDrained({ drained, failed });
    }

    return { drained, failed, remaining: this.pending().length };
  }

  /**
   * Clear all completed and failed entries.
   */
  clean() {
    const before = this._queue.length;
    this._queue = this._queue.filter(op => op.status === 'pending');
    this._save();
    return { removed: before - this._queue.length, remaining: this._queue.length };
  }

  /**
   * Clear entire queue.
   */
  reset() {
    this._queue = [];
    this._save();
  }
}

/**
 * Wrap a sync function with offline-first queueing.
 * If the sync fails, the operation is queued for later retry.
 *
 * @param {Function} syncFn - The sync function to wrap (e.g., syncToGlobal)
 * @param {SyncQueue} queue - Queue instance
 * @param {string} operationType - 'push' | 'pull' | 'share'
 * @returns {Function} Wrapped function
 */
function withOfflineQueue(syncFn, queue, operationType) {
  return async function wrappedSync(store, options = {}) {
    try {
      const result = await syncFn(store, options);
      // If sync succeeded, try to drain the queue too
      if (queue.pending().length > 0) {
        queue.drain((op) => syncFn(store, op.options || {})).catch((drainErr) => {
          if (process.env.ORACLE_DEBUG) console.warn('[sync-queue:drain] queue drain failed:', drainErr?.message || drainErr);
        });
      }
      return result;
    } catch (err) {
      // Queue the failed operation
      queue.enqueue({
        type: operationType,
        scope: options.scope || 'personal',
        options,
      });

      return {
        queued: true,
        error: err.message,
        queueStats: queue.stats(),
        message: `Sync failed — operation queued for retry (${queue.pending().length} pending)`,
      };
    }
  };
}

module.exports = { SyncQueue, withOfflineQueue, MAX_RETRIES, BASE_DELAY_MS };
