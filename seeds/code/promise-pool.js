/**
 * Promise Pool — Run async tasks with bounded concurrency.
 * Like p-limit/p-map but zero dependencies.
 *
 * @param {number} concurrency - Max simultaneous promises
 * @returns {{ run: (fn) => Promise, map: (items, fn) => Promise<any[]>, drain: () => Promise }}
 */
function createPromisePool(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer');
  }

  let active = 0;
  const queue = [];

  function next() {
    if (queue.length === 0 || active >= concurrency) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  }

  async function map(items, fn) {
    return Promise.all(items.map((item, i) => run(() => fn(item, i))));
  }

  function drain() {
    if (active === 0 && queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (active === 0 && queue.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });
  }

  return { run, map, drain, get active() { return active; }, get pending() { return queue.length; } };
}

module.exports = { createPromisePool };
