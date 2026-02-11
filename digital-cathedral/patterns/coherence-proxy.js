// Coherence-proxy — weighted scoring algorithm for coherence measurement
// Combines input length, word diversity, and user rating into 0-1 score

function computeCoherence(input, rating, weights) {
  const w = weights || { rating: 0.4, length: 0.3, diversity: 0.3 };
  const words = input.trim().split(/\s+/).filter(Boolean);
  const lengthScore = Math.min(words.length / 20, 1);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const diversityScore = words.length > 0 ? uniqueWords.size / words.length : 0;
  const ratingScore = Math.max(0, Math.min((rating || 5) / 10, 1));
  return Math.round((w.rating * ratingScore + w.length * lengthScore + w.diversity * diversityScore) * 1000) / 1000;
}

function coherenceTier(score) {
  if (score < 0.35) return 'low';
  if (score < 0.65) return 'mid';
  return 'high';
}

module.exports = { computeCoherence, coherenceTier };
