/**
 * isPhoneNumber - Validates basic international phone number format.
 * Supports optional + prefix, country code, and various separator formats.
 * Expects 7-15 digits total (per E.164 recommendation).
 * @param {string} str - The phone number string
 * @returns {boolean} True if the string is a valid phone number format
 */
function isPhoneNumber(str) {
  if (typeof str !== 'string') return false;
  // Strip common separators
  const cleaned = str.replace(/[\s\-().]/g, '');
  // Must start with optional + then digits only
  if (!/^\+?\d+$/.test(cleaned)) return false;
  // Count digits only
  const digits = cleaned.replace(/\D/g, '');
  // E.164: 7-15 digits
  return digits.length >= 7 && digits.length <= 15;
}

module.exports = isPhoneNumber;
