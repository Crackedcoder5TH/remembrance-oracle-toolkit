/**
 * timeoutPromise - Wraps a promise with a timeout. Rejects if the promise
 * does not settle within the given milliseconds.
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<*>} Resolves with promise value or rejects on timeout
 */
function timeoutPromise(promise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out after ${ms}ms`));
      }
    }, ms);

    Promise.resolve(promise)
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

module.exports = { timeoutPromise };
