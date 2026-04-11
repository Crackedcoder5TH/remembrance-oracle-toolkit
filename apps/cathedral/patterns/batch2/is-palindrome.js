/**
 * isPalindrome - Checks if a string is a palindrome (case-insensitive, ignoring non-alphanumeric chars).
 * @param {string} str - The string to check.
 * @returns {boolean} True if the string is a palindrome.
 */
function isPalindrome(str) {
  if (typeof str !== 'string') return false;
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned.length === 0) return true;
  const reversed = cleaned.split('').reverse().join('');
  return cleaned === reversed;
}

module.exports = isPalindrome;
