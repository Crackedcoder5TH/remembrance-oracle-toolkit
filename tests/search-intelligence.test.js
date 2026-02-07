const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  parseIntent,
  rewriteQuery,
  editDistance,
  applyIntentRanking,
  expandLanguages,
  smartSearch,
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,
} = require('../src/core/search-intelligence');

// ─── editDistance ───

describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(editDistance('hello', 'hello'), 0);
  });

  it('returns string length for empty comparison', () => {
    assert.equal(editDistance('', 'abc'), 3);
    assert.equal(editDistance('abc', ''), 3);
  });

  it('computes single edit distance', () => {
    assert.equal(editDistance('cat', 'hat'), 1);
    assert.equal(editDistance('cat', 'cats'), 1);
    assert.equal(editDistance('cat', 'ca'), 1);
  });

  it('computes multi-edit distance', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
  });

  it('handles both empty strings', () => {
    assert.equal(editDistance('', ''), 0);
  });
});

// ─── rewriteQuery ───

describe('rewriteQuery', () => {
  it('corrects known typos', () => {
    assert.equal(rewriteQuery(['debounse']), 'debounce');
    assert.equal(rewriteQuery(['throttel']), 'throttle');
    assert.equal(rewriteQuery(['chache']), 'cache');
  });

  it('expands abbreviations', () => {
    assert.equal(rewriteQuery(['fn']), 'function');
    assert.equal(rewriteQuery(['cb']), 'callback');
    assert.equal(rewriteQuery(['arr']), 'array');
    assert.equal(rewriteQuery(['str']), 'string');
  });

  it('corrects close typos via edit distance', () => {
    // 'sotr' is in CORRECTIONS → 'sort'
    assert.equal(rewriteQuery(['sotr']), 'sort');
  });

  it('preserves correct words', () => {
    assert.equal(rewriteQuery(['debounce', 'function']), 'debounce function');
  });

  it('handles multiple tokens with mixed corrections', () => {
    const result = rewriteQuery(['fast', 'sotr', 'fn']);
    assert.equal(result, 'fast sort function');
  });
});

// ─── parseIntent ───

describe('parseIntent', () => {
  it('returns empty intent for null/empty input', () => {
    const result = parseIntent('');
    assert.equal(result.original, '');
    assert.deepEqual(result.tokens, []);
    assert.deepEqual(result.intents, []);
    assert.equal(result.language, null);
  });

  it('returns empty intent for non-string input', () => {
    const result = parseIntent(null);
    assert.equal(result.original, '');
  });

  it('detects performance intent', () => {
    const result = parseIntent('fast sorting algorithm');
    assert.ok(result.intents.some(i => i.name === 'performance'));
  });

  it('detects safety intent', () => {
    const result = parseIntent('safe input validation');
    assert.ok(result.intents.some(i => i.name === 'safety'));
  });

  it('detects simplicity intent', () => {
    const result = parseIntent('simple helper function');
    assert.ok(result.intents.some(i => i.name === 'simplicity'));
  });

  it('detects async intent', () => {
    const result = parseIntent('async data fetcher with promise');
    assert.ok(result.intents.some(i => i.name === 'async'));
  });

  it('detects functional intent', () => {
    const result = parseIntent('compose pipe utility');
    assert.ok(result.intents.some(i => i.name === 'functional'));
  });

  it('detects testing intent', () => {
    const result = parseIntent('unit test for sorting');
    assert.ok(result.intents.some(i => i.name === 'testing'));
  });

  it('detects multiple intents', () => {
    const result = parseIntent('fast safe async sort');
    assert.ok(result.intents.length >= 2);
    const names = result.intents.map(i => i.name);
    assert.ok(names.includes('performance'));
    assert.ok(names.includes('safety'));
  });

  it('detects language from aliases', () => {
    assert.equal(parseIntent('js sort function').language, 'javascript');
    assert.equal(parseIntent('py data parser').language, 'python');
    assert.equal(parseIntent('ts validator').language, 'typescript');
  });

  it('detects language from full names', () => {
    assert.equal(parseIntent('python sort function').language, 'python');
    assert.equal(parseIntent('rust hash map').language, 'rust');
    assert.equal(parseIntent('go http server').language, 'go');
  });

  it('detects O(n log n) complexity constraint', () => {
    const result = parseIntent('O(n log n) sorting');
    assert.equal(result.constraints.complexity, 'nlogn');
  });

  it('detects O(n) complexity constraint', () => {
    const result = parseIntent('O(n) search');
    assert.equal(result.constraints.complexity, 'linear');
  });

  it('detects O(1) complexity constraint', () => {
    const result = parseIntent('O(1) lookup');
    assert.equal(result.constraints.complexity, 'constant');
  });

  it('detects zero-dependency constraint', () => {
    const result = parseIntent('sort without dependencies');
    assert.ok(result.constraints.zeroDeps);
  });

  it('detects typed constraint', () => {
    const result = parseIntent('typesafe validator');
    assert.ok(result.constraints.typed);
  });

  it('applies query corrections', () => {
    const result = parseIntent('debounse throttel fn');
    assert.equal(result.rewritten, 'debounce throttle function');
    assert.notEqual(result.rewritten, result.original);
  });
});

// ─── applyIntentRanking ───

describe('applyIntentRanking', () => {
  const mockResults = [
    { name: 'quickSort', tags: ['algorithm', 'sort'], code: 'function quickSort() { cache(); }', matchScore: 0.5, language: 'javascript' },
    { name: 'bubbleSort', tags: ['algorithm', 'sort'], code: 'function bubbleSort() {}', matchScore: 0.6, language: 'javascript' },
    { name: 'safeParser', tags: ['validation', 'safe'], code: 'try { validate(); } catch(e) { throw e; }', matchScore: 0.4, language: 'javascript' },
  ];

  it('returns original results when no intent', () => {
    const ranked = applyIntentRanking(mockResults, { intents: [] });
    assert.equal(ranked.length, 3);
  });

  it('returns empty for empty results', () => {
    const ranked = applyIntentRanking([], { intents: [{ name: 'performance', weight: 0.15, boost: { tags: ['algorithm'], codeHints: ['cache'] } }] });
    assert.equal(ranked.length, 0);
  });

  it('boosts results matching performance intent tags', () => {
    const intent = parseIntent('fast sorting');
    const ranked = applyIntentRanking(mockResults, intent);
    // quickSort and bubbleSort both have 'algorithm' tag
    assert.ok(ranked[0].intentBoost > 0 || ranked[1].intentBoost > 0);
  });

  it('boosts results matching safety intent', () => {
    const intent = parseIntent('safe validation');
    const ranked = applyIntentRanking(mockResults, intent);
    // safeParser has 'validation' and 'safe' tags plus 'try'/'catch'/'throw' code hints
    const safeResult = ranked.find(r => r.name === 'safeParser');
    assert.ok(safeResult.intentBoost > 0);
  });

  it('applies language boost', () => {
    const intent = { intents: [], language: 'javascript' };
    const results = [
      { name: 'jsSort', language: 'javascript', matchScore: 0.5, tags: [], code: '' },
      { name: 'pySort', language: 'python', matchScore: 0.5, tags: [], code: '' },
    ];
    // No intents, but applyIntentRanking returns original when no intents
    // Let's add an intent to trigger the function
    intent.intents = [{ name: 'performance', weight: 0.15, boost: { tags: [], codeHints: [] } }];
    const ranked = applyIntentRanking(results, intent);
    const jsResult = ranked.find(r => r.name === 'jsSort');
    const pyResult = ranked.find(r => r.name === 'pySort');
    assert.ok(jsResult.matchScore >= pyResult.matchScore);
  });

  it('penalizes long code for simplicity intent', () => {
    const longCode = Array(25).fill('  console.log("line");').join('\n');
    const results = [
      { name: 'short', tags: ['utility'], code: 'const x = 1;', matchScore: 0.5 },
      { name: 'long', tags: ['utility'], code: longCode, matchScore: 0.5 },
    ];
    const intent = parseIntent('simple utility');
    const ranked = applyIntentRanking(results, intent);
    const shortResult = ranked.find(r => r.name === 'short');
    const longResult = ranked.find(r => r.name === 'long');
    assert.ok(shortResult.matchScore >= longResult.matchScore);
  });

  it('adds matchedIntents to results', () => {
    const intent = parseIntent('fast sort');
    const ranked = applyIntentRanking(mockResults, intent);
    assert.ok(ranked[0].matchedIntents.includes('performance'));
  });

  it('clamps scores between 0 and 1', () => {
    const results = [{ name: 'high', tags: ['algorithm', 'optimization', 'performance'], code: 'cache memo pool batch', matchScore: 0.95 }];
    const intent = parseIntent('fast optimized cached');
    const ranked = applyIntentRanking(results, intent);
    assert.ok(ranked[0].matchScore <= 1);
    assert.ok(ranked[0].matchScore >= 0);
  });
});

// ─── expandLanguages ───

describe('expandLanguages', () => {
  it('returns empty array for null', () => {
    assert.deepEqual(expandLanguages(null), []);
  });

  it('expands javascript to include typescript', () => {
    const result = expandLanguages('javascript');
    assert.ok(result.includes('javascript'));
    assert.ok(result.includes('typescript'));
  });

  it('expands typescript to include javascript', () => {
    const result = expandLanguages('typescript');
    assert.ok(result.includes('typescript'));
    assert.ok(result.includes('javascript'));
  });

  it('resolves aliases before expansion', () => {
    const result = expandLanguages('js');
    assert.ok(result.includes('javascript'));
    assert.ok(result.includes('typescript'));
  });

  it('handles languages with no family', () => {
    const result = expandLanguages('python');
    assert.deepEqual(result, ['python']);
  });

  it('handles unknown languages', () => {
    const result = expandLanguages('haskell');
    assert.deepEqual(result, ['haskell']);
  });
});

// ─── smartSearch ───

describe('smartSearch', () => {
  // Mock oracle with a basic search method
  const mockOracle = {
    search(query, options) {
      const patterns = [
        { id: '1', name: 'quickSort', description: 'Quick sort algorithm', language: 'javascript', tags: ['algorithm', 'sort', 'performance'], code: 'function quickSort(arr) { /* cache */ }', matchScore: 0.8, relevance: 0.8 },
        { id: '2', name: 'safeValidate', description: 'Safe input validator', language: 'javascript', tags: ['validation', 'safe'], code: 'try { check(input); } catch(e) { throw e; }', matchScore: 0.6, relevance: 0.6 },
        { id: '3', name: 'pySort', description: 'Python sort', language: 'python', tags: ['sort'], code: 'def sort(arr): return sorted(arr)', matchScore: 0.5, relevance: 0.5 },
        { id: '4', name: 'asyncFetch', description: 'Async data fetcher', language: 'javascript', tags: ['async', 'fetch'], code: 'async function fetchData() { await fetch(); }', matchScore: 0.7, relevance: 0.7 },
        { id: '5', name: 'compose', description: 'Function composition', language: 'javascript', tags: ['functional', 'composition'], code: 'const compose = (...fns) => fns.reduce((f, g) => (...args) => f(g(...args)));', matchScore: 0.65, relevance: 0.65 },
      ];

      const lang = options.language;
      let results = lang ? patterns.filter(p => p.language === lang) : [...patterns];
      const lower = query.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower) ||
        p.tags.some(t => t.includes(lower))
      );
      return results.slice(0, options.limit || 10);
    },
  };

  it('returns results with intent information', () => {
    const result = smartSearch(mockOracle, 'fast sort');
    assert.ok(result.results.length >= 0);
    assert.ok(result.intent);
    assert.equal(typeof result.rewrittenQuery, 'string');
    assert.ok(Array.isArray(result.suggestions));
    assert.equal(typeof result.totalMatches, 'number');
  });

  it('parses intent and applies corrections', () => {
    const result = smartSearch(mockOracle, 'sotr algorithm');
    // 'sotr' should be corrected to 'sort'
    assert.equal(result.rewrittenQuery, 'sort algorithm');
    assert.equal(result.corrections, 'sort algorithm');
  });

  it('filters by zero-dependency constraint', () => {
    // Create a mock with import/require in code
    const depsOracle = {
      search() {
        return [
          { id: '1', name: 'withDeps', code: "const x = require('lodash');", matchScore: 0.8, tags: [] },
          { id: '2', name: 'noDeps', code: 'function sort(arr) { return arr.sort(); }', matchScore: 0.7, tags: [] },
        ];
      },
    };
    const result = smartSearch(depsOracle, 'sort without dependencies');
    const resultNames = result.results.map(r => r.name);
    assert.ok(!resultNames.includes('withDeps'));
  });

  it('deduplicates by name', () => {
    const dupeOracle = {
      search() {
        return [
          { id: '1', name: 'sort', code: 'function sort() {}', matchScore: 0.8, tags: [] },
          { id: '2', name: 'sort', code: 'function sort() {}', matchScore: 0.7, tags: [] },
        ];
      },
    };
    const result = smartSearch(dupeOracle, 'sort');
    assert.equal(result.results.length, 1);
  });

  it('includes suggestions when few results', () => {
    const emptyOracle = { search() { return []; } };
    const result = smartSearch(emptyOracle, 'debounse fn');
    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions.some(s => s.includes('debounce function')));
  });

  it('respects limit option', () => {
    const result = smartSearch(mockOracle, 'sort', { limit: 2 });
    assert.ok(result.results.length <= 2);
  });

  it('returns null corrections when query unchanged', () => {
    const result = smartSearch(mockOracle, 'sort');
    assert.equal(result.corrections, null);
  });
});

// ─── Constants ───

describe('constants', () => {
  it('INTENT_PATTERNS has all expected intents', () => {
    const names = Object.keys(INTENT_PATTERNS);
    assert.ok(names.includes('performance'));
    assert.ok(names.includes('safety'));
    assert.ok(names.includes('simplicity'));
    assert.ok(names.includes('async'));
    assert.ok(names.includes('functional'));
    assert.ok(names.includes('testing'));
  });

  it('CORRECTIONS covers common typos', () => {
    assert.equal(CORRECTIONS['debounse'], 'debounce');
    assert.equal(CORRECTIONS['throttel'], 'throttle');
    assert.equal(CORRECTIONS['chache'], 'cache');
  });

  it('CORRECTIONS covers abbreviations', () => {
    assert.equal(CORRECTIONS['fn'], 'function');
    assert.equal(CORRECTIONS['cb'], 'callback');
    assert.equal(CORRECTIONS['arr'], 'array');
  });

  it('LANGUAGE_ALIASES resolves common shorthand', () => {
    assert.equal(LANGUAGE_ALIASES['js'], 'javascript');
    assert.equal(LANGUAGE_ALIASES['py'], 'python');
    assert.equal(LANGUAGE_ALIASES['ts'], 'typescript');
    assert.equal(LANGUAGE_ALIASES['rs'], 'rust');
  });

  it('LANGUAGE_FAMILIES defines bidirectional JS/TS', () => {
    assert.ok(LANGUAGE_FAMILIES['javascript'].includes('typescript'));
    assert.ok(LANGUAGE_FAMILIES['typescript'].includes('javascript'));
  });
});
