/**
 * retry - Retries an async function on failure up to maxAttempts times.
 * @param {Function} fn - Async function to retry
 * @param {number} [maxAttempts=3] - Maximum number of attempts
 * @param {number} [delayMs=100] - Delay between retries in milliseconds
 * @returns {Promise<*>} Result of fn on success
 */
function retry(fn, maxAttempts = 3, delayMs = 100) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attempt() {
      attempts++;
      Promise.resolve()
        .then(() => fn())
        .then(resolve)
        .catch((err) => {
          if (attempts >= maxAttempts) {
            reject(err);
          } else {
            setTimeout(attempt, delayMs);
          }
        });
    }

    attempt();
  });
}

module.exports = { retry };
