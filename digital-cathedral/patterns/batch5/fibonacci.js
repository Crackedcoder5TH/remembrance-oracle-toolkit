/**
 * fibonacci - Calculate the nth Fibonacci number iteratively with O(1) space.
 * @param {number} n - The index (0-based) of the Fibonacci number to compute.
 * @returns {number} The nth Fibonacci number.
 */
function fibonacci(n) {
  if (n < 0) {
    throw new Error('Input must be a non-negative integer');
  }

  if (n === 0) return 0;
  if (n === 1) return 1;

  let prev2 = 0;
  let prev1 = 1;

  for (let i = 2; i <= n; i++) {
    const current = prev1 + prev2;
    prev2 = prev1;
    prev1 = current;
  }

  return prev1;
}

module.exports = fibonacci;
