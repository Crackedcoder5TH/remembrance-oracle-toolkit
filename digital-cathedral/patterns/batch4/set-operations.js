/**
 * Set Operations — union, intersection, difference, symmetricDifference for arrays
 */
function union(a, b) {
  return [...new Set([...a, ...b])];
}

function intersection(a, b) {
  const setB = new Set(b);
  return [...new Set(a.filter(item => setB.has(item)))];
}

function difference(a, b) {
  const setB = new Set(b);
  return [...new Set(a.filter(item => !setB.has(item)))];
}

function symmetricDifference(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const result = [];
  for (const item of setA) {
    if (!setB.has(item)) result.push(item);
  }
  for (const item of setB) {
    if (!setA.has(item)) result.push(item);
  }
  return result;
}

module.exports = { union, intersection, difference, symmetricDifference };
