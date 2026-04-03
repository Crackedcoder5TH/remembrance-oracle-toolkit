/**
 * isIpv6 - Validates whether a string is a valid IPv6 address.
 * Supports full form, compressed (::) notation, and mixed IPv4 notation.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid IPv6 address
 */
function isIpv6(str) {
  if (typeof str !== 'string') return false;
  str = str.trim();
  if (str.length === 0) return false;

  // Handle :: shorthand
  const doubleColonCount = (str.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;

  // Split by :
  const groups = str.split(':');

  if (doubleColonCount === 1) {
    // With ::, we can have between 1 and 8 groups total
    // The :: represents one or more groups of 0000
    const emptyIndex = str.indexOf('::');
    const left = str.substring(0, emptyIndex).split(':').filter(g => g.length > 0);
    const right = str.substring(emptyIndex + 2).split(':').filter(g => g.length > 0);
    const totalGroups = left.length + right.length;
    if (totalGroups > 7) return false;
    const allGroups = [...left, ...right];
    for (const group of allGroups) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return false;
    }
    return true;
  }

  // Without ::, must have exactly 8 groups
  if (groups.length !== 8) return false;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return false;
  }
  return true;
}

module.exports = isIpv6;
