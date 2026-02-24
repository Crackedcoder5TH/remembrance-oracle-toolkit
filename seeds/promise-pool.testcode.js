// Test: promise-pool — inline assertions, no require
const pool1 = createPromisePool(2);
if (typeof pool1.run !== 'function') throw new Error('run missing');
if (typeof pool1.map !== 'function') throw new Error('map missing');
if (typeof pool1.drain !== 'function') throw new Error('drain missing');

// Test invalid concurrency (sync)
let threw = false;
try { createPromisePool(0); } catch(e) { threw = true; }
if (!threw) throw new Error('Should reject concurrency 0');

// Async tests wrapped in IIFE
(async () => {
  const _delay = (ms) => new Promise(r => setTimeout(r, ms));

  // Test concurrency limit
  let maxC = 0, cur = 0;
  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(pool1.run(async () => {
      cur++;
      maxC = Math.max(maxC, cur);
      await _delay(20);
      cur--;
    }));
  }
  await Promise.all(tasks);
  if (maxC > 2) throw new Error('Concurrency exceeded: ' + maxC);

  // Test map
  const pool2 = createPromisePool(3);
  const results = await pool2.map([1,2,3,4], async (x) => x * 10);
  if (JSON.stringify(results) !== '[10,20,30,40]') throw new Error('Map failed: ' + JSON.stringify(results));

  // Test error propagation
  const pool3 = createPromisePool(1);
  let caught = false;
  try { await pool3.run(() => Promise.reject(new Error('boom'))); }
  catch(e) { if (e.message === 'boom') caught = true; }
  if (!caught) throw new Error('Error not propagated');
})().catch(e => { console.error(e); process.exit(1); });
