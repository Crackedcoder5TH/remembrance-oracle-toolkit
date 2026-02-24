const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMutex, createSemaphore } = require('../seeds/async-mutex');

describe('async-mutex', () => {
  it('mutex should enforce exclusive access', async () => {
    const mutex = createMutex();
    const order = [];

    const p1 = mutex.runExclusive(async () => {
      order.push('a-start');
      await new Promise(r => setTimeout(r, 50));
      order.push('a-end');
    });
    const p2 = mutex.runExclusive(async () => {
      order.push('b-start');
      await new Promise(r => setTimeout(r, 10));
      order.push('b-end');
    });

    await Promise.all([p1, p2]);
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('mutex should report locked state', async () => {
    const mutex = createMutex();
    assert.equal(mutex.isLocked(), false);

    const release = await mutex.acquire();
    assert.equal(mutex.isLocked(), true);
    release();
    assert.equal(mutex.isLocked(), false);
  });

  it('semaphore should allow N concurrent', async () => {
    const sem = createSemaphore(2);
    let maxConcurrent = 0;
    let current = 0;

    const task = () => sem.runExclusive(async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise(r => setTimeout(r, 30));
      current--;
    });

    await Promise.all([task(), task(), task(), task()]);
    assert.equal(maxConcurrent, 2);
  });

  it('semaphore should track available and waiting', async () => {
    const sem = createSemaphore(1);
    assert.equal(sem.available, 1);
    assert.equal(sem.waiting, 0);

    const release = await sem.acquire();
    assert.equal(sem.available, 0);

    let waitingPromiseResolved = false;
    const p = sem.acquire().then((rel) => { waitingPromiseResolved = true; return rel; });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(sem.waiting, 1);
    assert.equal(waitingPromiseResolved, false);

    release();
    const rel2 = await p;
    assert.equal(waitingPromiseResolved, true);
    rel2();
  });

  it('should reject invalid permits', () => {
    assert.throws(() => createSemaphore(0));
    assert.throws(() => createSemaphore(-1));
    assert.throws(() => createSemaphore(1.5));
  });

  it('runExclusive should propagate errors', async () => {
    const mutex = createMutex();
    await assert.rejects(
      () => mutex.runExclusive(() => { throw new Error('boom'); }),
      { message: 'boom' }
    );
    // Mutex should be released after error
    assert.equal(mutex.isLocked(), false);
  });
});
