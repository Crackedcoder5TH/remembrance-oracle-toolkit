/**
 * knapsack - Solve the 0/1 knapsack problem using dynamic programming.
 * @param {Array<{weight: number, value: number}>} items - Items with weight and value.
 * @param {number} capacity - Maximum weight capacity.
 * @returns {{ maxValue: number, selectedItems: number[] }} The maximum value and indices of selected items.
 */
function knapsack(items, capacity) {
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      if (items[i - 1].weight <= w) {
        dp[i][w] = Math.max(
          dp[i - 1][w],
          dp[i - 1][w - items[i - 1].weight] + items[i - 1].value
        );
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // Backtrack to find selected items
  const selectedItems = [];
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selectedItems.unshift(i - 1);
      w -= items[i - 1].weight;
    }
  }

  return { maxValue: dp[n][capacity], selectedItems };
}

module.exports = knapsack;
