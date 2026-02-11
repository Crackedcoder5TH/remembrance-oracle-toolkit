/**
 * Returns a shuffled copy of the array using the Fisher-Yates algorithm.
 * Does not mutate the original array.
 * @param {Array} array - The array to shuffle.
 * @returns {Array} A new shuffled array.
 */
function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

module.exports = shuffle;
