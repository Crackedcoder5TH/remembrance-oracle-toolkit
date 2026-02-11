/**
 * passwordStrength - Evaluates password strength on a 0-4 scale.
 * Checks length, character variety (lowercase, uppercase, digits, symbols),
 * and common patterns.
 * @param {string} str - The password to evaluate
 * @returns {{ score: number, feedback: string[] }} Score 0-4 and feedback array
 */
function passwordStrength(str) {
  if (typeof str !== 'string') return { score: 0, feedback: ['Password must be a string'] };

  const feedback = [];
  let score = 0;

  // Length checks
  if (str.length < 6) {
    feedback.push('Password is too short (minimum 6 characters)');
  } else if (str.length < 8) {
    score += 1;
    feedback.push('Password could be longer (8+ characters recommended)');
  } else if (str.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  // Character variety
  const hasLower = /[a-z]/.test(str);
  const hasUpper = /[A-Z]/.test(str);
  const hasDigit = /\d/.test(str);
  const hasSymbol = /[^a-zA-Z0-9]/.test(str);

  if (!hasLower) feedback.push('Add lowercase letters');
  if (!hasUpper) feedback.push('Add uppercase letters');
  if (!hasDigit) feedback.push('Add numbers');
  if (!hasSymbol) feedback.push('Add special characters');

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (varietyCount >= 3) score += 1;
  if (varietyCount >= 4) score += 1;

  // Common patterns penalty
  const commonPatterns = ['password', '123456', 'qwerty', 'abc123', 'letmein'];
  if (commonPatterns.some(p => str.toLowerCase().includes(p))) {
    score = Math.max(0, score - 1);
    feedback.push('Avoid common password patterns');
  }

  // Repeated characters penalty
  if (/(.)\1{2,}/.test(str)) {
    score = Math.max(0, score - 1);
    feedback.push('Avoid repeated characters');
  }

  // Cap score at 4
  score = Math.min(4, score);

  if (feedback.length === 0) {
    feedback.push('Strong password');
  }

  return { score, feedback };
}

module.exports = passwordStrength;
