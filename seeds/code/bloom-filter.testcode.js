// Test: bloom-filter — inline assertions, no require
const bf1 = createBloomFilter(1000, 5);
bf1.add('hello');
bf1.add('world');
bf1.add('test');

if (!bf1.has('hello')) throw new Error('Should contain hello');
if (!bf1.has('world')) throw new Error('Should contain world');
if (!bf1.has('test')) throw new Error('Should contain test');
if (bf1.count !== 3) throw new Error('Count should be 3');

// Zero false negatives with many items
const bf2 = createBloomFilter(10000, 7);
for (let i = 0; i < 100; i++) bf2.add('item-' + i);
for (let i = 0; i < 100; i++) {
  if (!bf2.has('item-' + i)) throw new Error('False negative for item-' + i);
}

// Low false positive rate
let fp = 0;
for (let i = 0; i < 1000; i++) {
  if (bf2.has('nonmember-' + i)) fp++;
}
if (fp > 50) throw new Error('Too many false positives: ' + fp);

// FP rate
if (bf2.falsePositiveRate() <= 0) throw new Error('FP rate should be > 0');
if (bf2.falsePositiveRate() >= 1) throw new Error('FP rate should be < 1');

// Invalid params
let threw1 = false, threw2 = false;
try { createBloomFilter(0, 3); } catch(e) { threw1 = true; }
try { createBloomFilter(100, 0); } catch(e) { threw2 = true; }
if (!threw1 || !threw2) throw new Error('Should reject invalid params');

// Optimal filter
const bf3 = createOptimalBloomFilter(1000, 0.01);
for (let i = 0; i < 1000; i++) bf3.add('opt-' + i);
for (let i = 0; i < 1000; i++) {
  if (!bf3.has('opt-' + i)) throw new Error('Optimal: false negative for opt-' + i);
}
