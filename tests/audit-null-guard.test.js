const assert = require('assert');
const { detectNullPropertyAccess } = require('../src/patterns/audit-patterns/null-property-access-guard');

const w1 = detectNullPropertyAccess('const name = item.name.toLowerCase();');
assert(w1.length > 0, 'Should detect unguarded .name.toLowerCase()');

const w2 = detectNullPropertyAccess("const name = (item.name || '').toLowerCase();");
assert(w2.length === 0, 'Should not flag guarded access');

assert.deepStrictEqual(detectNullPropertyAccess(null), []);

const w3 = detectNullPropertyAccess('for (const tag of entry.tags) { console.log(tag); }');
assert(w3.length > 0, 'Should detect unguarded iteration');

console.log('All null-property-access-guard tests passed');
