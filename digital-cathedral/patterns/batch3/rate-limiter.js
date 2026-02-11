/**
 * createRateLimiter - Creates a rate limiter that allows maxCalls within windowMs.
 * @param {number} maxCalls - Maximum number of calls allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ tryCall: Function }} Object with tryCall() that returns true/false
 */
function createRateLimiter(maxCalls, windowMs) {
  const timestamps = [];

  return {
    tryCall() {
      const now = Date.now();
      // Remove timestamps outside the window
      while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
        timestamps.shift();
      }

      if (timestamps.length < maxCalls) {
        timestamps.push(now);
        return true;
      }
      return false;
    }
  };
}

module.exports = { createRateLimiter };
