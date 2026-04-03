/**
 * isIpv4 - Validates whether a string is a valid IPv4 address.
 * Each octet must be 0-255 with no leading zeros.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid IPv4 address
 */
function isIpv4(str) {
  if (typeof str !== 'string') return false;
  const parts = str.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (part.length === 0 || part.length > 3) return false;
    if (part.length > 1 && part[0] === '0') return false;
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

module.exports = isIpv4;
