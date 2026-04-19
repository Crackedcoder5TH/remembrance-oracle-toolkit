'use strict';

/**
 * `oracle audit explain <rule>` — worked examples for every rule.
 *
 * Each entry has:
 *   - summary:   one-line what the rule detects
 *   - why:       the actual failure mode
 *   - bad:       a self-contained counterexample that the rule fires on
 *   - good:      the safe canonical form the auto-fixer would produce
 *   - severity:  the rule's default severity
 *   - category:  'bug' | 'style' | 'smell'
 *   - patternTag: optional link to a pattern in the library
 *
 * To keep JavaScript template-literal interior syntax (backticks,
 * ${...}) out of the examples, every bad/good block is stored as an
 * array of lines joined with '\n'. This trades a bit of verbosity for
 * zero escaping.
 */

function lines() { return Array.from(arguments).join('\n'); }

const EXPLANATIONS = {
  'state-mutation/sort': {
    summary: '.sort() mutates the array in place — if the receiver is shared, every observer sees the change.',
    why: 'Array.prototype.sort mutates. A function that takes an array and calls .sort() on it modifies the caller\'s data, not a local copy. This is a classic source of "tests pass locally, break in parallel" bugs.',
    bad: lines(
      'function getSorted(items) {',
      '  return items.sort((a, b) => a - b);',
      '}'
    ),
    good: lines(
      'function getSorted(items) {',
      '  return [...items].sort((a, b) => a - b);',
      '  // or: items.slice().sort(...)',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'immutable-sort',
  },

  'state-mutation/reverse': {
    summary: '.reverse() mutates in place — copy first if you don\'t own the array.',
    why: 'Same failure mode as .sort(). .reverse() reorders the source array, which surprises every other holder of the reference.',
    bad: lines(
      'function display(items) {',
      '  return items.reverse().map(render);',
      '}'
    ),
    good: lines(
      'function display(items) {',
      '  return [...items].reverse().map(render);',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'immutable-reverse',
  },

  'state-mutation/splice': {
    summary: '.splice() mutates in place and returns the removed entries.',
    why: 'Calling .splice() on a shared array mutates it under the caller\'s feet. Usually the intent is to return a filtered copy; .filter() or destructuring is safer.',
    bad: lines(
      'function removeAt(items, i) {',
      '  items.splice(i, 1);',
      '  return items;',
      '}'
    ),
    good: lines(
      'function removeAt(items, i) {',
      '  return items.filter((_, idx) => idx !== i);',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'immutable-remove',
  },

  'state-mutation/object-assign': {
    summary: 'Object.assign(target, src) mutates target.',
    why: 'When target is not a fresh object, merging into it surprises every other reference holder. Always pass a fresh {} as the first argument, or use spread.',
    bad: lines(
      'function withExtras(base) {',
      '  return Object.assign(base, { extra: 1 });',
      '}'
    ),
    good: lines(
      'function withExtras(base) {',
      '  return { ...base, extra: 1 };',
      '  // or: Object.assign({}, base, { extra: 1 })',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'immutable-merge',
  },

  'security/eval': {
    summary: 'eval() on tainted input runs arbitrary attacker-controlled code.',
    why: 'Any input that reaches eval() is a full RCE vector. Even supposedly-safe sources (config files, URL params) end up attacker-controlled often enough that eval on anything but a compile-time constant is unsafe.',
    bad: lines(
      'function run(req) {',
      '  eval(req.body.code);',
      '}'
    ),
    good: lines(
      'const OPS = { add: (a,b) => a+b, sub: (a,b) => a-b };',
      'function run(req) {',
      '  const op = OPS[req.body.op];',
      '  if (!op) throw new Error("unknown op");',
      '  return op(req.body.a, req.body.b);',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'eval-whitelist',
  },

  'security/new-Function': {
    summary: 'new Function(code) is eval under another name.',
    why: 'Same failure mode as eval — the Function constructor compiles arbitrary source code and returns it as a callable. Attacker-controlled arguments mean attacker-controlled code.',
    bad: lines(
      'function build(req) {',
      '  return new Function("x", req.body.body);',
      '}'
    ),
    good: lines(
      '// Use a proper expression parser or whitelist.',
      '// If you need dynamic code from a safe source, validate against a grammar.'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'avoid-new-function',
  },

  'security/shell-exec': {
    summary: 'Shell exec with interpolated input enables command injection.',
    why: 'exec("git " + branch) lets a branch name of "master; rm -rf /" execute arbitrary shell. Use execFile with an argument array so no shell parsing happens.',
    bad: lines(
      'function checkout(branch) {',
      '  execSync("git checkout " + branch);',
      '}'
    ),
    good: lines(
      'function checkout(branch) {',
      '  execFileSync("git", ["checkout", branch]);',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'exec-file-array',
  },

  'security/sql-query': {
    summary: 'SQL with interpolated input enables injection. Use prepared statements.',
    why: 'Every interpolated value in a SQL string is a potential attack vector. Prepared statements with ? placeholders never mix data and code.',
    bad: lines(
      'function find(req) {',
      '  const name = req.body.name;',
      '  return db.query("SELECT * FROM users WHERE name = \'" + name + "\'");',
      '}'
    ),
    good: lines(
      'function find(req) {',
      '  return db.prepare("SELECT * FROM users WHERE name = ?").get(req.body.name);',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'prepared-statement',
  },
  'security/sql-exec': {
    summary: 'db.exec with interpolated input enables injection. Use prepared statements.',
    why: 'Same failure mode as sql-query. .exec() executes raw SQL, which means raw injection if any part of the string came from untrusted input.',
    bad: lines(
      'function find(req) {',
      '  db.exec("SELECT * FROM users WHERE name = \'" + req.body.name + "\'");',
      '}'
    ),
    good: lines(
      'function find(req) {',
      '  db.prepare("SELECT * FROM users WHERE name = ?").all(req.body.name);',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'prepared-statement',
  },
  'security/sql-prepare': {
    summary: 'db.prepare with interpolated SQL defeats the whole point of prepare.',
    why: 'Prepare caches a parsed SQL statement. If you interpolate a value into the SQL string, you cache an attacker-controlled statement forever.',
    bad: 'db.prepare("SELECT * FROM users WHERE name = \'" + name + "\'").get();',
    good: 'db.prepare("SELECT * FROM users WHERE name = ?").get(name);',
    severity: 'high',
    category: 'bug',
    patternTag: 'prepared-statement',
  },
  'security/xss-innerhtml': {
    summary: 'Assigning tainted input to innerHTML is XSS.',
    why: 'innerHTML parses and executes any embedded <script> or event handlers. Use textContent for plain text, or sanitize through DOMPurify before HTML.',
    bad: 'el.innerHTML = req.body.bio;',
    good: lines(
      'el.textContent = req.body.bio;',
      '// or: el.innerHTML = DOMPurify.sanitize(req.body.bio);'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'safe-text-render',
  },

  'concurrency/lock-without-finally': {
    summary: 'A lock acquire without a finally-block release leaks the lock on exceptions.',
    why: 'If any code between lock.acquire() and lock.release() throws, the lock is never released. Every subsequent caller deadlocks waiting for a lock the exception path abandoned.',
    bad: lines(
      'async function update(store) {',
      '  await store.acquire();',
      '  writeRisky(store); // may throw',
      '  store.release();',
      '}'
    ),
    good: lines(
      'async function update(store) {',
      '  await store.acquire();',
      '  try {',
      '    writeRisky(store);',
      '  } finally {',
      '    store.release();',
      '  }',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'lock-finally',
  },

  'type/division-by-zero': {
    summary: 'Division where the divisor is not provably non-zero produces Infinity/NaN.',
    why: 'JavaScript\'s / silently produces Infinity or NaN on 0. That value then flows through your math until it crashes the UI or corrupts a metric.',
    bad: lines(
      'function avg(xs) {',
      '  return xs.reduce((a,b) => a+b, 0) / xs.length;',
      '}'
    ),
    good: lines(
      'function avg(xs) {',
      '  return xs.length > 0 ? xs.reduce((a,b) => a+b, 0) / xs.length : 0;',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'avg-empty-guard',
  },

  'type/json-parse-no-try': {
    summary: 'JSON.parse throws SyntaxError on invalid input.',
    why: 'A malformed JSON string crashes the whole request handler. Always wrap in try/catch or use a safeParse helper that returns null.',
    bad: lines(
      'function load(raw) {',
      '  const data = JSON.parse(raw);',
      '  return data.value;',
      '}'
    ),
    good: lines(
      'function safeParse(raw) {',
      '  try { return JSON.parse(raw); } catch { return null; }',
      '}',
      'function load(raw) {',
      '  const data = safeParse(raw);',
      '  return data ? data.value : null;',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'safe-json-parse',
  },

  'integration/nullable-deref': {
    summary: 'A nullable-returning function\'s result is dereferenced without a guard.',
    why: 'The callee can return null on bad input, cache miss, or permission deny. If the caller immediately does .property or [i], the program crashes on the null path.',
    bad: lines(
      'function findUser(id) { if (!id) return null; return db.get(id); }',
      'function email(id) {',
      '  const u = findUser(id);',
      '  return u.email;',
      '}'
    ),
    good: lines(
      'function email(id) {',
      '  const u = findUser(id);',
      '  if (!u) return null;',
      '  return u.email;',
      '  // or: return u?.email;',
      '}'
    ),
    severity: 'high',
    category: 'bug',
    patternTag: 'guard-nullable',
  },

  'integration/arity-mismatch': {
    summary: 'Caller passes the wrong number of arguments after a signature change.',
    why: 'When a function adds a required parameter, every call site needs to pass it. The cascade detector finds old call sites still using the old signature.',
    bad: lines(
      '// callee was renamed/reparameterized',
      'function load(id, options) { /* new signature */ }',
      '// caller still uses old shape',
      'load(42);'
    ),
    good: 'load(42, { cacheOnly: false });',
    severity: 'high',
    category: 'bug',
    patternTag: 'sig-migration',
  },

  'integration/async-transition': {
    summary: 'Function went from sync to async (or vice versa) and callers didn\'t follow.',
    why: 'A caller that no longer awaits an async function sees a Promise where it expects a value. A caller that awaits a sync function adds unnecessary microtasks but still works.',
    bad: lines(
      'async function load(id) { /* now async */ }',
      'const user = load(42); // Promise, not the user'
    ),
    good: 'const user = await load(42);',
    severity: 'high',
    category: 'bug',
    patternTag: 'await-async',
  },

  'edge-case/switch-no-default': {
    summary: 'A switch statement with no default silently ignores unmatched values.',
    why: 'New enum variants added in the future fall through without warning. Adding default: throw new Error("unknown " + x) makes the gap explicit and loud.',
    bad: lines(
      'function label(kind) {',
      '  switch (kind) {',
      '    case "a": return "alpha";',
      '    case "b": return "beta";',
      '  }',
      '}'
    ),
    good: lines(
      'function label(kind) {',
      '  switch (kind) {',
      '    case "a": return "alpha";',
      '    case "b": return "beta";',
      '    default: throw new Error("unknown kind: " + kind);',
      '  }',
      '}'
    ),
    severity: 'medium',
    category: 'bug',
    patternTag: 'exhaustive-switch',
  },

  'lint/parameter-validation': {
    summary: 'A public function with multiple required params has no entry-guard.',
    why: 'Not a bug per se — but a stylistic convention. Adding a guard clause makes bad inputs crash loudly near the call site instead of deep in the body.',
    bad: lines(
      'function transfer(from, to, amount) {',
      '  from.balance -= amount;',
      '  to.balance += amount;',
      '}'
    ),
    good: lines(
      'function transfer(from, to, amount) {',
      '  if (!from || !to) throw new TypeError("accounts required");',
      '  if (typeof amount !== "number") throw new TypeError("amount must be a number");',
      '  from.balance -= amount;',
      '  to.balance += amount;',
      '}'
    ),
    severity: 'info',
    category: 'style',
    patternTag: 'guard-clause',
  },

  'lint/todo-comment': {
    summary: 'TODO/FIXME/HACK comment — track the work in an issue instead.',
    why: 'Comments rot. Turn them into issues with assignees and due dates so the work actually gets done, not just forgotten.',
    bad: lines(
      '// TODO: handle unicode edge cases',
      'return text.toLowerCase();'
    ),
    good: lines(
      '// Tracked under #1234 — revisit after the unicode migration.',
      'return text.toLowerCase();'
    ),
    severity: 'info',
    category: 'style',
  },

  'lint/parseInt-no-radix': {
    summary: 'parseInt without a radix can misparse numbers that start with 0.',
    why: 'Historically parseInt("0755") was parsed as octal. Modern engines default to base 10, but being explicit prevents surprises on older runtimes and in code review.',
    bad: 'const n = parseInt(raw);',
    good: 'const n = parseInt(raw, 10);',
    severity: 'warn',
    category: 'style',
  },

  'lint/var-usage': {
    summary: 'var is function-scoped and hoisted — prefer const or let.',
    why: 'var variables leak out of blocks and are hoisted to the top of the enclosing function, which causes subtle TDZ and scope bugs.',
    bad: lines(
      'var x = 1;',
      'if (cond) {',
      '  var x = 2; // same var',
      '}'
    ),
    good: 'const x = cond ? 2 : 1;',
    severity: 'info',
    category: 'style',
  },

  // ─── Smells ──────────────────────────────────────────────────────────────

  'smell/long-function': {
    summary: 'Function is longer than the recommended complexity budget.',
    why: 'Long functions accumulate implicit state and make invariants hard to reason about. Every extra line multiplies the surface of possible bugs.',
    bad: 'function handler(req, res) { /* 200 lines of mixed IO, validation, and business logic */ }',
    good: lines(
      'function handler(req, res) {',
      '  const input = validate(req);',
      '  const result = compute(input);',
      '  respond(res, result);',
      '}'
    ),
    severity: 'info',
    category: 'smell',
    patternTag: 'extract-functions',
  },

  'smell/deep-nesting': {
    summary: 'Block nesting exceeds the recommended depth.',
    why: 'Every extra level of indentation adds cognitive load and usually indicates missing early returns or extracted helpers.',
    bad: lines(
      'function fn(x) {',
      '  if (x) {',
      '    if (x.a) {',
      '      if (x.a.b) {',
      '        if (x.a.b.c) { return x.a.b.c; }',
      '      }',
      '    }',
      '  }',
      '  return null;',
      '}'
    ),
    good: lines(
      'function fn(x) {',
      '  return x && x.a && x.a.b ? x.a.b.c : null;',
      '}'
    ),
    severity: 'info',
    category: 'smell',
    patternTag: 'flatten-nesting',
  },

  'smell/too-many-params': {
    summary: 'Function takes too many parameters — bundle them into an options object.',
    why: 'Positional parameters past 4 or 5 are hard to call correctly and hard to extend. An options object is self-documenting and extensible.',
    bad: 'function draw(x, y, w, h, color, stroke, fill, dashed, rounded) {}',
    good: 'function draw({ x, y, w, h, color, stroke, fill, dashed, rounded }) {}',
    severity: 'info',
    category: 'smell',
    patternTag: 'options-object',
  },

  'smell/god-file': {
    summary: 'File exports too many top-level symbols — split along responsibility boundaries.',
    why: 'A file that exports 30+ symbols usually has unrelated concerns glued together. Splitting the file reveals the real modules hiding inside and makes dependencies explicit.',
    bad: '// one 2000-line file exporting 40 unrelated utilities',
    good: '// smaller files, each with a single responsibility',
    severity: 'info',
    category: 'smell',
  },

  'smell/feature-envy': {
    summary: 'A function touches another object more than its own.',
    why: 'When a method reads/writes another object\'s fields more than its own, the behavior probably belongs on that other object. Moving the method keeps data and behavior together.',
    bad: lines(
      'class Order {',
      '  totalWithDiscount(customer) {',
      '    return this.total - customer.tier.discount * customer.tier.ratio;',
      '  }',
      '}'
    ),
    good: lines(
      'class Customer {',
      '  discountFor(total) { return this.tier.discount * this.tier.ratio; }',
      '}',
      'class Order {',
      '  totalWithDiscount(customer) { return this.total - customer.discountFor(this.total); }',
      '}'
    ),
    severity: 'info',
    category: 'smell',
  },
};

function listRules(filter) {
  const out = [];
  for (const [ruleId, info] of Object.entries(EXPLANATIONS)) {
    if (filter && info.category !== filter) continue;
    out.push({
      ruleId,
      category: info.category,
      severity: info.severity,
      summary: info.summary,
    });
  }
  return [...out].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function explain(ruleId) {
  return EXPLANATIONS[ruleId] || null;
}

module.exports = { EXPLANATIONS, explain, listRules };
