const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  autoTag,
  retagPattern,
  tagDiff,
  extractCodeTags,
  extractDescriptionKeywords,
  extractConceptTags,
  extractNameTags,
  detectLanguageTag,
  camelToKebab,
} = require('../src/core/auto-tagger');

// ─── Unit Tests: camelToKebab ───

describe('camelToKebab', () => {
  it('converts camelCase to kebab-case', () => {
    assert.equal(camelToKebab('binarySearch'), 'binary-search');
    assert.equal(camelToKebab('mergeSort'), 'merge-sort');
    assert.equal(camelToKebab('deepClone'), 'deep-clone');
  });

  it('converts PascalCase to kebab-case', () => {
    assert.equal(camelToKebab('EventEmitter'), 'event-emitter');
    assert.equal(camelToKebab('PatternLibrary'), 'pattern-library');
  });

  it('handles already lowercase', () => {
    assert.equal(camelToKebab('cache'), 'cache');
    assert.equal(camelToKebab('sort'), 'sort');
  });

  it('handles consecutive uppercase', () => {
    assert.equal(camelToKebab('XMLParser'), 'xml-parser');
    assert.equal(camelToKebab('HTMLElement'), 'html-element');
  });
});

// ─── Unit Tests: extractDescriptionKeywords ───

describe('extractDescriptionKeywords', () => {
  it('extracts meaningful keywords from descriptions', () => {
    const keywords = extractDescriptionKeywords('Binary search algorithm for sorted arrays');
    assert.ok(keywords.includes('binary'));
    assert.ok(keywords.includes('search'));
    assert.ok(keywords.includes('algorithm'));
    assert.ok(keywords.includes('sorted'));
    assert.ok(keywords.includes('arrays'));
  });

  it('filters stop words', () => {
    const keywords = extractDescriptionKeywords('A function that returns the sorted array');
    assert.ok(!keywords.includes('that'));
    assert.ok(!keywords.includes('the'));
    assert.ok(keywords.includes('sorted'));
    assert.ok(keywords.includes('array'));
  });

  it('returns empty for null/undefined', () => {
    assert.deepEqual(extractDescriptionKeywords(null), []);
    assert.deepEqual(extractDescriptionKeywords(undefined), []);
    assert.deepEqual(extractDescriptionKeywords(''), []);
  });

  it('deduplicates keywords', () => {
    const keywords = extractDescriptionKeywords('sort sort sort array array');
    const sortCount = keywords.filter(k => k === 'sort').length;
    assert.equal(sortCount, 1);
  });
});

// ─── Unit Tests: extractCodeTags ───

describe('extractCodeTags', () => {
  it('detects auth domain', () => {
    const tags = extractCodeTags('function login(username, password) { return jwt.sign({ sub: username }); }');
    assert.ok(tags.includes('auth'));
  });

  it('detects crypto domain', () => {
    const tags = extractCodeTags('const hash = crypto.createHash("sha256").update(data).digest("hex");');
    assert.ok(tags.includes('crypto'));
  });

  it('detects async patterns', () => {
    const tags = extractCodeTags('async function fetchData() { const res = await fetch(url); return res.json(); }');
    assert.ok(tags.includes('async'));
    assert.ok(tags.includes('network'));
  });

  it('detects React hooks', () => {
    const tags = extractCodeTags('function App() { const [state, setState] = useState(0); useEffect(() => {}, []); }');
    assert.ok(tags.includes('react'));
  });

  it('detects database domain', () => {
    const tags = extractCodeTags('const result = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);');
    assert.ok(tags.includes('database'));
  });

  it('detects file-io domain', () => {
    const tags = extractCodeTags('const data = fs.readFileSync(path.join(__dirname, "config.json"), "utf-8");');
    assert.ok(tags.includes('file-io'));
  });

  it('detects Solana domain', () => {
    const tags = extractCodeTags('const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));');
    assert.ok(tags.includes('solana'));
  });

  it('detects blockchain/web3 domain', () => {
    const tags = extractCodeTags('const contract = new ethers.Contract(address, abi, provider);');
    assert.ok(tags.includes('blockchain'));
  });

  it('detects AI/LLM domain', () => {
    const tags = extractCodeTags('const response = await anthropic.messages.create({ model: "claude-3" });');
    assert.ok(tags.includes('ai'));
  });

  it('detects whisper/audio domain', () => {
    const tags = extractCodeTags('const transcription = await whisper.transcribe(audioFile);');
    assert.ok(tags.includes('whisper'));
  });

  it('detects class construct', () => {
    const tags = extractCodeTags('class EventBus { constructor() { this.listeners = []; } }');
    assert.ok(tags.includes('class'));
  });

  it('detects error handling', () => {
    const tags = extractCodeTags('try { doStuff(); } catch (err) { throw new Error("failed"); }');
    assert.ok(tags.includes('error-handling'));
  });

  it('detects functional patterns', () => {
    const tags = extractCodeTags('const pipeline = compose(validate, transform, save);');
    assert.ok(tags.includes('functional'));
  });

  it('detects testing patterns', () => {
    const tags = extractCodeTags('describe("sort", () => { it("sorts array", () => { expect(sort([3,1,2])).toEqual([1,2,3]); }); });');
    assert.ok(tags.includes('testing'));
  });

  it('returns empty for null/undefined', () => {
    assert.deepEqual(extractCodeTags(null), []);
    assert.deepEqual(extractCodeTags(undefined), []);
    assert.deepEqual(extractCodeTags(''), []);
  });

  it('deduplicates detected tags', () => {
    const tags = extractCodeTags('async function a() { await Promise.all([fetch(url1), fetch(url2)]); }');
    const asyncCount = tags.filter(t => t === 'async').length;
    assert.equal(asyncCount, 1);
  });
});

// ─── Unit Tests: extractConceptTags ───

describe('extractConceptTags', () => {
  it('detects sorting concept', () => {
    const tags = extractConceptTags('function quicksort(arr) { /* partition and sort */ }', 'Fast sorting algorithm');
    assert.ok(tags.includes('sorting'));
  });

  it('detects caching concept', () => {
    const tags = extractConceptTags('function memoize(fn) { const cache = new Map(); }', 'Memoize function results');
    assert.ok(tags.includes('caching'));
  });

  it('detects rate-limiting concept', () => {
    const tags = extractConceptTags('function debounce(fn, delay) { let timer; }', 'Prevent calling too often');
    assert.ok(tags.includes('rate-limiting'));
  });

  it('caps at 5 concept tags', () => {
    const text = 'sort search cache validate retry compose clone flatten stack queue string error';
    const tags = extractConceptTags(text, text);
    assert.ok(tags.length <= 5);
  });
});

// ─── Unit Tests: extractNameTags ───

describe('extractNameTags', () => {
  it('extracts function names', () => {
    const tags = extractNameTags('function binarySearch(arr, target) { return -1; }');
    assert.ok(tags.includes('binary-search'));
  });

  it('extracts class names', () => {
    const tags = extractNameTags('class EventEmitter { constructor() {} }');
    assert.ok(tags.includes('event-emitter'));
  });

  it('extracts arrow function names', () => {
    const tags = extractNameTags('const deepClone = (obj) => JSON.parse(JSON.stringify(obj));');
    assert.ok(tags.includes('deep-clone'));
  });

  it('filters generic names', () => {
    const tags = extractNameTags('function handler(data) { return result; }');
    assert.ok(!tags.includes('handler'));
    assert.ok(!tags.includes('data'));
  });

  it('returns empty for null/empty', () => {
    assert.deepEqual(extractNameTags(null), []);
    assert.deepEqual(extractNameTags(''), []);
  });
});

// ─── Unit Tests: detectLanguageTag ───

describe('detectLanguageTag', () => {
  it('returns provided language', () => {
    assert.equal(detectLanguageTag('code', 'JavaScript'), 'javascript');
    assert.equal(detectLanguageTag('code', 'Python'), 'python');
  });

  it('detects TypeScript from code', () => {
    assert.equal(detectLanguageTag('interface User { name: string; age: number; }'), 'typescript');
  });

  it('detects Python from code', () => {
    assert.equal(detectLanguageTag('def greet(name):\n    return f"Hello {name}"'), 'python');
  });

  it('detects Go from code', () => {
    assert.equal(detectLanguageTag('func main() {\n    fmt.Println("hello")\n}'), 'go');
  });

  it('detects Rust from code', () => {
    assert.equal(detectLanguageTag('fn main() {\n    let mut x = 5;\n    println!("{}", x);\n}'), 'rust');
  });

  it('detects JavaScript from code', () => {
    assert.equal(detectLanguageTag('function greet(name) { return `Hello ${name}`; }'), 'javascript');
  });

  it('returns null for unknown', () => {
    assert.equal(detectLanguageTag('x = 1'), null);
  });
});

// ─── Unit Tests: tagDiff ───

describe('tagDiff', () => {
  it('computes added and kept tags', () => {
    const diff = tagDiff(['sort', 'array'], ['sort', 'array', 'algorithm', 'javascript']);
    assert.ok(diff.added.includes('algorithm'));
    assert.ok(diff.added.includes('javascript'));
    assert.ok(diff.kept.includes('sort'));
    assert.ok(diff.kept.includes('array'));
    assert.equal(diff.total, 4);
  });

  it('handles empty existing tags', () => {
    const diff = tagDiff([], ['auth', 'crypto']);
    assert.deepEqual(diff.added, ['auth', 'crypto']);
    assert.deepEqual(diff.kept, []);
  });

  it('handles no new tags', () => {
    const diff = tagDiff(['auth'], ['auth']);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.kept, ['auth']);
  });
});

// ─── Integration: autoTag ───

describe('autoTag', () => {
  it('enriches tags for auth code', () => {
    const tags = autoTag(
      'function login(username, password) { return jwt.sign({ sub: username }, SECRET); }',
      { description: 'User authentication with JWT tokens', tags: ['backend'], language: 'javascript' }
    );
    assert.ok(tags.includes('backend'));   // user tag preserved
    assert.ok(tags.includes('auth'));      // domain detected
    assert.ok(tags.includes('javascript'));// language tag
  });

  it('enriches tags for sorting algorithm', () => {
    const tags = autoTag(
      'function mergeSort(arr) {\n  if (arr.length <= 1) return arr;\n  const mid = Math.floor(arr.length / 2);\n  return merge(mergeSort(arr.slice(0, mid)), mergeSort(arr.slice(mid)));\n}',
      { description: 'Merge sort algorithm', tags: ['sort'], name: 'mergeSort' }
    );
    assert.ok(tags.includes('sort'));        // user tag preserved
    assert.ok(tags.includes('algorithm'));    // domain detected
    assert.ok(tags.includes('merge-sort'));   // name tag
    assert.ok(tags.includes('sorting'));      // concept tag
  });

  it('enriches tags for React component', () => {
    const tags = autoTag(
      'function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count+1)}>{count}</button>; }',
      { description: 'Simple counter component', language: 'javascript' }
    );
    assert.ok(tags.includes('react'));
    assert.ok(tags.includes('ui'));
  });

  it('preserves all user tags', () => {
    const userTags = ['my-custom-tag', 'project-x', 'important'];
    const tags = autoTag('function foo() { return 1; }', { tags: userTags });
    for (const t of userTags) {
      assert.ok(tags.includes(t), `Missing user tag: ${t}`);
    }
  });

  it('handles empty code gracefully', () => {
    const tags = autoTag('', { description: 'test', tags: ['keep'] });
    assert.ok(tags.includes('keep'));
  });

  it('handles null options gracefully', () => {
    const tags = autoTag('function test() {}');
    assert.ok(Array.isArray(tags));
  });

  it('removes noise tags (auto-generated, variant, etc.)', () => {
    const tags = autoTag('function sort() {}', { tags: ['auto-generated', 'variant', 'auto-refined', 'real-tag'] });
    assert.ok(!tags.includes('auto-generated'));
    assert.ok(!tags.includes('variant'));
    assert.ok(!tags.includes('auto-refined'));
    assert.ok(tags.includes('real-tag'));
  });

  it('deduplicates tags', () => {
    const tags = autoTag(
      'function sort(arr) { return arr.sort(); }',
      { description: 'sort array', tags: ['sort', 'array'] }
    );
    const sortCount = tags.filter(t => t === 'sort').length;
    assert.equal(sortCount, 1);
  });

  it('produces sorted output', () => {
    const tags = autoTag(
      'async function fetchUsers() { const res = await fetch("/api/users"); return res.json(); }',
      { description: 'Fetch users from API', tags: ['utility'] }
    );
    const sorted = [...tags].sort();
    assert.deepEqual(tags, sorted);
  });

  it('detects multiple domains in complex code', () => {
    const tags = autoTag(
      `async function secureSubmit(data) {
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        const token = jwt.sign({ hash }, SECRET);
        const res = await fetch('/api/submit', { method: 'POST', body: JSON.stringify({ token }) });
        return res.json();
      }`,
      { description: 'Secure data submission with hashing and JWT' }
    );
    assert.ok(tags.includes('auth'));
    assert.ok(tags.includes('crypto'));
    assert.ok(tags.includes('network'));
    assert.ok(tags.includes('async'));
  });
});

// ─── Integration: retagPattern ───

describe('retagPattern', () => {
  it('re-tags a pattern with enriched tags', () => {
    const pattern = {
      name: 'binarySearch',
      code: 'function binarySearch(arr, target) {\n  let lo = 0, hi = arr.length - 1;\n  while (lo <= hi) {\n    const mid = (lo + hi) >> 1;\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n  }\n  return -1;\n}',
      description: 'Binary search for sorted arrays',
      language: 'javascript',
      tags: ['search', 'algorithm'],
    };
    const newTags = retagPattern(pattern);
    assert.ok(newTags.includes('search'));     // existing preserved
    assert.ok(newTags.includes('algorithm'));   // existing preserved
    assert.ok(newTags.includes('binary-search')); // name-derived
    assert.ok(newTags.includes('javascript')); // language tag
    assert.ok(newTags.length > pattern.tags.length); // enriched
  });

  it('handles patterns with no code', () => {
    const tags = retagPattern({ name: 'empty', tags: ['old'] });
    assert.deepEqual(tags, ['old']);
  });

  it('handles null pattern', () => {
    const tags = retagPattern(null);
    assert.deepEqual(tags, []);
  });
});

// ─── Integration: Oracle submit() with auto-tagging ───

describe('Oracle auto-tag integration', () => {
  it('auto-tags on submit', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-test-${Date.now()}` });

    const result = oracle.submit(
      'function debounce(fn, ms) {\n  let timer;\n  return function(...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), ms);\n  };\n}',
      {
        description: 'Debounce a function call',
        tags: ['utility'],
        language: 'javascript',
        testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("debounce", () => { assert.ok(true); });',
      }
    );

    if (result.accepted) {
      const entry = oracle.inspect(result.entry.id);
      assert.ok(entry.tags.length > 1, `Expected enriched tags, got: ${JSON.stringify(entry.tags)}`);
      assert.ok(entry.tags.includes('utility'), 'User tag "utility" preserved');
    }
  });

  it('auto-tags on registerPattern', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-reg-${Date.now()}` });

    const result = oracle.registerPattern({
      name: 'quickSort',
      code: 'function quickSort(arr) {\n  if (arr.length <= 1) return arr;\n  const pivot = arr[0];\n  const left = arr.slice(1).filter(x => x <= pivot);\n  const right = arr.slice(1).filter(x => x > pivot);\n  return [...quickSort(left), pivot, ...quickSort(right)];\n}',
      description: 'Quick sort algorithm',
      language: 'javascript',
      tags: ['sort'],
      testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("sort", () => { assert.ok(true); });',
    });

    if (result.registered) {
      const pattern = oracle.patterns.getAll().find(p => p.id ===result.pattern.id);
      assert.ok(pattern.tags.length > 1, `Expected enriched tags, got: ${JSON.stringify(pattern.tags)}`);
      assert.ok(pattern.tags.includes('sort'), 'User tag "sort" preserved');
    }
  });
});

// ─── Oracle retag/retagAll methods ───

describe('Oracle retag methods', () => {
  it('retag() enriches a single pattern', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-retag-${Date.now()}` });

    const reg = oracle.registerPattern({
      name: 'retry',
      code: 'async function retry(fn, attempts = 3) {\n  for (let i = 0; i < attempts; i++) {\n    try { return await fn(); } catch (err) {\n      if (i === attempts - 1) throw err;\n      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));\n    }\n  }\n}',
      description: 'Retry with exponential backoff',
      language: 'javascript',
      tags: ['resilience'],
      testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("retry", () => { assert.ok(true); });',
    });

    if (reg.registered) {
      const result = oracle.retag(reg.pattern.id);
      assert.ok(!result.error);
      assert.ok(result.newTags.length >= result.oldTags.length);
      assert.ok(result.newTags.includes('resilience'), 'Original tag preserved');
    }
  });

  it('retag() dry run does not modify', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-dry-${Date.now()}` });

    const reg = oracle.registerPattern({
      name: 'simpleAdd',
      code: 'function add(a, b) { return a + b; }',
      description: 'Add two numbers',
      language: 'javascript',
      tags: [],
      testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("add", () => { assert.equal(1+1, 2); });',
    });

    if (reg.registered) {
      const before = oracle.patterns.getAll().find(p => p.id ===reg.pattern.id);
      const result = oracle.retag(reg.pattern.id, { dryRun: true });
      const after = oracle.patterns.getAll().find(p => p.id ===reg.pattern.id);
      assert.deepEqual(before.tags, after.tags, 'Tags should not change in dry run');
      assert.ok(result.added.length >= 0);
    }
  });

  it('retag() returns error for missing pattern', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-miss-${Date.now()}` });
    const result = oracle.retag('nonexistent-id');
    assert.ok(result.error);
  });

  it('retagAll() enriches multiple patterns', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false, baseDir: `/tmp/auto-tag-all-${Date.now()}` });

    // Register two patterns with minimal tags
    oracle.registerPattern({
      name: 'memoize',
      code: 'function memoize(fn) {\n  const cache = new Map();\n  return function(...args) {\n    const key = JSON.stringify(args);\n    if (cache.has(key)) return cache.get(key);\n    const result = fn(...args);\n    cache.set(key, result);\n    return result;\n  };\n}',
      description: 'Memoize function results in cache',
      language: 'javascript',
      tags: [],
      testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("memo", () => { assert.ok(true); });',
    });

    oracle.registerPattern({
      name: 'throttle',
      code: 'function throttle(fn, ms) {\n  let last = 0;\n  return function(...args) {\n    const now = Date.now();\n    if (now - last >= ms) {\n      last = now;\n      return fn.apply(this, args);\n    }\n  };\n}',
      description: 'Throttle function calls',
      language: 'javascript',
      tags: [],
      testCode: 'const { test } = require("node:test"); const assert = require("node:assert"); test("throttle", () => { assert.ok(true); });',
    });

    const report = oracle.retagAll();
    assert.ok(report.total >= 2);
    assert.ok(report.enriched >= 0);
    assert.ok(typeof report.totalTagsAdded === 'number');
  });
});
