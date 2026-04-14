/**
 * Async Mutex & Semaphore — Mutual exclusion and bounded concurrency
 * for async JavaScript contexts.
 *
 * Mutex: only one holder at a time.
 * Semaphore: up to N holders at a time.
 */

function createMutex() {
  return createSemaphore(1);
}

function createSemaphore(permits) {
  if (!Number.isInteger(permits) || permits < 1) {
    throw new Error('Permits must be a positive integer');
  }

  let available = permits;
  const waiters = [];

  function acquire() {
    if (available > 0) {
      available--;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => {
      waiters.push(() => {
        available--;
        resolve(release);
      });
    });
  }

  function release() {
    available++;
    if (waiters.length > 0 && available > 0) {
      const next = waiters.shift();
      next();
    }
  }

  async function runExclusive(fn) {
    const releaseFn = await acquire();
    try {
      return await fn();
    } finally {
      releaseFn();
    }
  }

  function isLocked() {
    return available === 0;
  }

  return { acquire, runExclusive, isLocked, get available() { return available; }, get waiting() { return waiters.length; } };
}

module.exports = { createMutex, createSemaphore };
