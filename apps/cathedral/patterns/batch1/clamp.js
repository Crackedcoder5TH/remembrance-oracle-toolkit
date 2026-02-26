/**
 * Clamps a number within an inclusive range.
 * @param {number} value - The number to clamp.
 * @param {number} min - The lower bound.
 * @param {number} max - The upper bound.
 * @returns {number} The clamped value.
 */
function clamp(value, min, max) {
  if (min > max) {
    throw new RangeError('min must be less than or equal to max');
  }
  return Math.min(Math.max(value, min), max);
}

module.exports = clamp;
