/**
 * levenshtein - Calculate the Levenshtein edit distance between two strings.
 * @param {string} str1 - First string.
 * @param {string} str2 - Second string.
 * @returns {number} The minimum number of single-character edits (insertions, deletions, substitutions).
 */
function levenshtein(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  // Use a 2D array for the DP table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

module.exports = levenshtein;
