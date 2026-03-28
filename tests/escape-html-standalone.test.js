const assert = require('node:assert/strict');
assert.equal(escapeHtml('a & b'), 'a &amp; b');
assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
assert.equal(escapeHtml('"hi"'), '&quot;hi&quot;');
assert.equal(escapeHtml("it's"), "it&#39;s");
assert.equal(escapeHtml(null), '');
assert.equal(escapeHtml(''), '');
console.log('All tests passed');
