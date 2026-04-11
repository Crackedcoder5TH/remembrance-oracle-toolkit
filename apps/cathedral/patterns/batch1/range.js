/**
 * Generates an array of numbers from start (inclusive) to end (exclusive).
 * @param {number} start - The start of the range.
 * @param {number} end - The end of the range (exclusive).
 * @param {number} [step=1] - The step between values.
 * @returns {number[]} An array of numbers.
 */
function range(start, end, step) {
  if (step === 0) {
    throw new RangeError('step must not be zero');
  }
  const s = step !== undefined ? step : (start <= end ? 1 : -1);
  const result = [];
  if (s > 0) {
    for (let i = start; i < end; i += s) {
      result.push(i);
    }
  } else {
    for (let i = start; i > end; i += s) {
      result.push(i);
    }
  }
  return result;
}

module.exports = range;
