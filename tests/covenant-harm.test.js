'use strict';

/**
 * covenant-harm.test.js — unit coverage for the harm-signature catalog.
 *
 * These regexes gate every commit (covenant P2–P15), yet had no direct
 * tests. Three properties are pinned here:
 *   1. structural invariants — every entry is a well-formed rule;
 *   2. detection — each principle's signature fires on a real harm shape;
 *   3. restraint — innocuous cousins do NOT fire (false-positive guards),
 *      including this module's own source (self-referential immunity).
 *
 * Discipline: every harmful payload is assembled at RUNTIME from split
 * fragments — the same trick covenant-harm.js itself uses — so neither
 * this file nor the module ever contains a matchable harm string.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { HARM_PATTERNS } = require('../src/core/covenant-harm');
const { covenantCheck } = require('../src/core/covenant');

// join fragments — keeps harm shapes out of this file's raw source
const h = (...parts) => parts.join('');

const principlesMatching = (code) => {
  return HARM_PATTERNS.filter(p => {
    p.pattern.lastIndex = 0;
    return p.pattern.test(code);
  }).map(p => p.principle);
};

test('every harm pattern is a well-formed rule', () => {
  assert.ok(HARM_PATTERNS.length >= 20, 'catalog present');
  for (const p of HARM_PATTERNS) {
    assert.ok(p.pattern instanceof RegExp, 'pattern is a RegExp');
    // 1..15, not 2..15. The lower bound used to be 2 because P1 (I AM) had no
    // harm pattern — an accident of the catalog frozen into an assertion, so
    // the first rule written for P1 failed a test whose job was to check
    // well-formedness. P1, P4 and P5 are all enforced now.
    assert.ok(Number.isInteger(p.principle) && p.principle >= 1 && p.principle <= 15,
      'principle in 1..15');
    assert.ok(typeof p.reason === 'string' && p.reason.length > 0, 'reason present');
  }
});

test('self-referential immunity is enforced by covenantCheck, not the raw regexes', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'core', 'covenant-harm.js'), 'utf8');
  // The raw patterns DO match the module's own builder source — the
  // regex fragments look like the shapes they detect. Immunity is not a
  // property of the patterns; it is provided by covenantCheck, which
  // and strips comments/strings before matching. Pin BOTH facts so a
  // future refactor can't quietly move the immunity and lose it.
  assert.ok(principlesMatching(src).length > 0,
    'raw patterns are expected to match their own builder source');
  const trusted = covenantCheck(src, { trusted: true });
  assert.strictEqual(trusted.sealed, true,
    'covenant-harm.js must clear the covenant as a trusted pattern definition');
  assert.deepStrictEqual(trusted.violations, [],
    'no violations for the pattern-definition module through the real checker');
});

test('P2 fires on fork-bomb and destructive infinite loop', () => {
  assert.ok(principlesMatching(h(':()', '{ :|:', '& }', ';:')).includes(2));
  assert.ok(principlesMatching(h('while (tr', 'ue) { exe', 'c("x"); }')).includes(2));
});

test('P3 fires on malware terminology', () => {
  assert.ok(principlesMatching(h('const tool = "key', 'logger";')).includes(3));
});

test('P6 fires on unbounded growth and extreme allocation', () => {
  assert.ok(principlesMatching(h('while (tr', 'ue) { buf', '.push(x); }')).includes(6));
  assert.ok(principlesMatching(h('new Ar', 'ray(1e99)')).includes(6));
});

test('P8 fires on root privilege escalation', () => {
  assert.ok(principlesMatching(h('setu', 'id(0)')).includes(8));
});

test('P11 fires on SQL concatenation and template injection', () => {
  assert.ok(principlesMatching(h('"SEL', 'ECT * FROM users WHERE id=" + userId')).includes(11));
  assert.ok(principlesMatching(h('`SEL', 'ECT * FROM t WHERE n=${name}`')).includes(11));
});

test('P13 fires on dynamic regex from an identifier', () => {
  assert.ok(principlesMatching(h('new Reg', 'Exp(userInput)')).includes(13));
});

test('P15 fires on recursive deletion and system-file removal', () => {
  assert.ok(principlesMatching(h('exec("rm', ' -rf /")')).includes(15));
  assert.ok(principlesMatching(h('fs.rmS', 'ync("/etc/hosts")')).includes(15));
});

test('restraint: innocuous cousins do not fire', () => {
  const clean = [
    'const xs = list.filter(Boolean); xs.sort((a, b) => a - b);',
    h('exe', 'c("ls -la")'),                          // literal-only shell, no concat
    'el.innerHTML = \'<div>static</div>\';',          // literal markup assignment
    h('fs.rmS', 'ync("/tmp/scratch.txt")'),           // /tmp is excluded by design
    'new RegExp("^[a-z]+$")',                          // literal regex source
    'for (const u of urls) console.log(u);',           // loop without requests
    'const q = db.prepare("SELECT * FROM t WHERE id = ?").get(id);', // parameterized SQL
  ];
  for (const code of clean) {
    assert.deepStrictEqual(principlesMatching(code), [], 'clean snippet flagged: ' + code);
  }
});
