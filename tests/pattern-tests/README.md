# Pattern testCode specimens — NOT suite tests

Every `*.testcode.js` file here is an extracted pattern **testCode
specimen**: assertion code written to run CONCATENATED after its
pattern's implementation, where `module.exports` carries the pattern's
functions. Run standalone, `module.exports` is empty and the assertions
throw — that is the specimen's nature, not a defect.

The plain `.js` files (`sha256-cache-key.js`, `dynamic-fix-suggestions.js`,
`self-referential-prevention.js`) are the companion pattern
implementations the specimens pair with.

History: these carried `.test.js` names, which put them inside the
suite-reachability ratchet's scope while nothing could run them — six of
seven failed the moment they were actually executed (2026-08-09), which
is exactly the silent-rot the ratchet exists to surface. They were
renamed `.testcode.js` so the name says what the file is; the
suite-reachability baseline followed the census to zero.

To make a specimen LIVE, pair it with its pattern through the
verification pipeline (exec-verify / test-forge concatenation) — never
by moving it into `tests/` bare, where its empty `module.exports`
guarantees a false red.
