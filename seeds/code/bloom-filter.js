/**
 * Bloom Filter — Probabilistic set membership with zero false negatives.
 * Space-efficient: uses bit array instead of storing actual values.
 *
 * @param {number} size - Bit array size (larger = fewer false positives)
 * @param {number} hashCount - Number of hash functions (optimal: (size/n) * ln(2))
 */
function createBloomFilter(size, hashCount) {
  if (!Number.isInteger(size) || size < 1) throw new Error('Size must be a positive integer');
  if (!Number.isInteger(hashCount) || hashCount < 1) throw new Error('Hash count must be a positive integer');

  const bits = new Uint8Array(Math.ceil(size / 8));
  let count = 0;

  // FNV-1a inspired hash with seed
  function hash(value, seed) {
    const str = String(value);
    let h = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % size;
  }

  function getHashes(value) {
    const hashes = [];
    for (let i = 0; i < hashCount; i++) {
      hashes.push(hash(value, i * 0x9e3779b9));
    }
    return hashes;
  }

  function setBit(pos) {
    bits[pos >>> 3] |= (1 << (pos & 7));
  }

  function getBit(pos) {
    return (bits[pos >>> 3] & (1 << (pos & 7))) !== 0;
  }

  function add(value) {
    const hashes = getHashes(value);
    for (const h of hashes) {
      setBit(h);
    }
    count++;
  }

  function has(value) {
    const hashes = getHashes(value);
    return hashes.every(h => getBit(h));
  }

  function falsePositiveRate() {
    // Theoretical: (1 - e^(-kn/m))^k
    const k = hashCount;
    const n = count;
    const m = size;
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  return {
    add,
    has,
    falsePositiveRate,
    get count() { return count; },
    get size() { return size; },
  };
}

/**
 * Create a bloom filter with optimal parameters for expected items and desired false positive rate.
 */
function createOptimalBloomFilter(expectedItems, falsePositiveRate = 0.01) {
  const m = Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
  const k = Math.round((m / expectedItems) * Math.log(2));
  return createBloomFilter(m, Math.max(1, k));
}

module.exports = { createBloomFilter, createOptimalBloomFilter };
