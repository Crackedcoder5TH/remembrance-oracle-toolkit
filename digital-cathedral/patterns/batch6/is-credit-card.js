/**
 * isCreditCard - Validates a credit card number using the Luhn algorithm.
 * Strips spaces and dashes before validation.
 * Expects 13-19 digit card numbers.
 * @param {string} str - The credit card number string
 * @returns {boolean} True if the number passes Luhn validation
 */
function isCreditCard(str) {
  if (typeof str !== 'string') return false;
  const cleaned = str.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(cleaned)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = parseInt(cleaned[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

module.exports = isCreditCard;
