// Whisper-selector — tier-based random text selection from pools
// Maps numeric values to tiers, picks random non-repeating text

function getTier(value, thresholds) {
  const t = thresholds || { low: 3, mid: 7 };
  if (value <= t.low) return 'low';
  if (value <= t.mid) return 'mid';
  return 'high';
}

function pickFromPool(pool, exclude) {
  if (!pool || pool.length === 0) return '';
  const filtered = exclude ? pool.filter(w => w !== exclude) : pool;
  const source = filtered.length > 0 ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function pickWhisper(value, pools, exclude) {
  const tier = getTier(value);
  const pool = pools[tier] || [];
  return pickFromPool(pool, exclude);
}

module.exports = { getTier, pickFromPool, pickWhisper };
