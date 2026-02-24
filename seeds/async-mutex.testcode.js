// Test: async-mutex — inline assertions, no require

// Invalid permits (sync)
let threw = false;
try { createSemaphore(0); } catch(e) { threw = true; }
if (!threw) throw new Error('Should reject 0 permits');

// Async tests wrapped
(async () => {
  const _delay = (ms) => new Promise(r => setTimeout(r, ms));

  // Mutex exclusive access
  const mutex = createMutex();
  const order = [];
  const p1 = mutex.runExclusive(async () => {
    order.push('a-start');
    await _delay(30);
    order.push('a-end');
  });
  const p2 = mutex.runExclusive(async () => {
    order.push('b-start');
    await _delay(10);
    order.push('b-end');
  });
  await Promise.all([p1, p2]);
  if (order[0] !== 'a-start' || order[1] !== 'a-end' || order[2] !== 'b-start' || order[3] !== 'b-end') {
    throw new Error('Mutex order wrong: ' + JSON.stringify(order));
  }

  // Mutex locked state
  const m2 = createMutex();
  if (m2.isLocked()) throw new Error('Should start unlocked');
  const rel = await m2.acquire();
  if (!m2.isLocked()) throw new Error('Should be locked after acquire');
  rel();
  if (m2.isLocked()) throw new Error('Should be unlocked after release');

  // Semaphore allows N concurrent
  const sem = createSemaphore(2);
  let maxC = 0, curC = 0;
  const tasks = [];
  for (let i = 0; i < 4; i++) {
    tasks.push(sem.runExclusive(async () => {
      curC++;
      maxC = Math.max(maxC, curC);
      await _delay(20);
      curC--;
    }));
  }
  await Promise.all(tasks);
  if (maxC !== 2) throw new Error('Semaphore should allow 2 concurrent, got ' + maxC);

  // Error propagation
  const m3 = createMutex();
  let errCaught = false;
  try { await m3.runExclusive(() => { throw new Error('boom'); }); }
  catch(e) { if (e.message === 'boom') errCaught = true; }
  if (!errCaught) throw new Error('Should propagate errors');
  if (m3.isLocked()) throw new Error('Should release after error');
})().catch(e => { console.error(e); process.exit(1); });
