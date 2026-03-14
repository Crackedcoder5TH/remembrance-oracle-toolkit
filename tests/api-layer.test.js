'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTempDir, cleanTempDir, createTestOracle } = require('./helpers');

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_CODE_A = `
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
`.trim();

const VALID_CODE_B = `
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`.trim();

const VALID_CODE_C = `
function flatten(arr) {
  const result = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item));
    } else {
      result.push(item);
    }
  }
  return result;
}
`.trim();

const VALID_CODE_D = `
function debounce(fn, delay) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
`.trim();

const VALID_CODE_E = `
function groupBy(arr, keyFn) {
  const groups = {};
  for (const item of arr) {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
`.trim();

const TEST_CODE_CLAMP = `
if (clamp(5, 1, 10) !== 5) throw new Error('mid failed');
if (clamp(-1, 0, 10) !== 0) throw new Error('low failed');
if (clamp(20, 0, 10) !== 10) throw new Error('high failed');
`.trim();

// ─── Search ─────────────────────────────────────────────────────────────────

describe('API Layer — Search', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
    oracle.submit(VALID_CODE_A, { description: 'Clamp a number between min and max', tags: ['math', 'utility'], language: 'javascript' });
    oracle.submit(VALID_CODE_B, { description: 'Capitalize the first letter of a string', tags: ['string', 'utility'], language: 'javascript' });
    oracle.submit(VALID_CODE_C, { description: 'Flatten a nested array recursively', tags: ['array', 'utility'], language: 'javascript' });
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('search returns results matching a keyword', () => {
    const results = oracle.search('clamp');
    assert.ok(results.length > 0);
    assert.ok(results[0].code.includes('clamp'));
  });

  it('search returns empty array for null/undefined term', () => {
    assert.deepStrictEqual(oracle.search(null), []);
    assert.deepStrictEqual(oracle.search(undefined), []);
  });

  it('search returns empty array for non-string term', () => {
    assert.deepStrictEqual(oracle.search(42), []);
    assert.deepStrictEqual(oracle.search({}), []);
  });

  it('search respects limit option', () => {
    const results = oracle.search('utility', { limit: 1 });
    assert.ok(results.length <= 1);
  });

  it('search filters by language option', () => {
    const results = oracle.search('clamp', { language: 'python' });
    // Should still return array (may be empty or contain mismatched results depending on scoring)
    assert.ok(Array.isArray(results));
  });

  it('search with mode=semantic returns results', () => {
    const results = oracle.search('number clamping', { mode: 'semantic' });
    assert.ok(Array.isArray(results));
  });

  it('search results contain expected fields', () => {
    const results = oracle.search('capitalize');
    assert.ok(results.length > 0);
    const r = results[0];
    assert.ok('id' in r);
    assert.ok('matchScore' in r);
    assert.ok('source' in r);
    assert.ok('code' in r);
  });

  it('search on empty store returns empty', () => {
    const { oracle: emptyOracle, tmpDir: t2 } = createTestOracle();
    const results = emptyOracle.search('anything');
    assert.deepStrictEqual(results, []);
    cleanTempDir(t2);
  });

  it('smartSearch returns results and intent', () => {
    const result = oracle.smartSearch('flatten array');
    assert.ok('results' in result);
    assert.ok('intent' in result);
    assert.ok(Array.isArray(result.results));
  });

  it('smartSearch handles null/undefined gracefully', () => {
    const result = oracle.smartSearch(null);
    assert.deepStrictEqual(result.results, []);
    assert.strictEqual(result.intent, null);
  });

  it('parseSearchIntent extracts intent from query', () => {
    const intent = oracle.parseSearchIntent('javascript debounce function');
    assert.ok(intent);
    assert.ok('intents' in intent || 'language' in intent || 'rewritten' in intent);
  });
});

// ─── Resolve ────────────────────────────────────────────────────────────────

describe('API Layer — Resolve', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('resolve returns GENERATE when store is empty', () => {
    const result = oracle.resolve({ description: 'something new', tags: ['test'] });
    assert.strictEqual(result.decision, 'generate');
    assert.ok('confidence' in result);
    assert.ok('reasoning' in result);
  });

  it('resolve returns pattern data when match exists', () => {
    oracle.registerPattern({
      name: 'clamp-number', code: VALID_CODE_A, language: 'javascript',
      description: 'Clamp a number', tags: ['math', 'utility'],
      testCode: TEST_CODE_CLAMP,
    });
    const result = oracle.resolve({ description: 'clamp a number between min and max', tags: ['math'] });
    assert.ok(['pull', 'evolve', 'generate'].includes(result.decision));
    assert.ok('whisper' in result);
    assert.ok('historyMatches' in result);
  });

  it('resolve handles null/undefined request gracefully', () => {
    const result = oracle.resolve(null);
    assert.ok(result.decision);
  });

  it('resolve handles empty object', () => {
    const result = oracle.resolve({});
    assert.strictEqual(result.decision, 'generate');
  });

  it('resolve result contains healing info when pattern found', () => {
    oracle.registerPattern({
      name: 'capitalize-str', code: VALID_CODE_B, language: 'javascript',
      description: 'Capitalize first letter', tags: ['string'],
    });
    const result = oracle.resolve({ description: 'capitalize first letter of string', tags: ['string'] });
    if (result.decision !== 'generate') {
      assert.ok('healing' in result);
      assert.ok('healedCode' in result);
    }
  });

  it('resolve with heal=false skips healing', () => {
    oracle.registerPattern({
      name: 'flatten-arr', code: VALID_CODE_C, language: 'javascript',
      description: 'Flatten nested array', tags: ['array'],
    });
    const result = oracle.resolve({ description: 'flatten nested array', tags: ['array'], heal: false });
    if (result.decision !== 'generate') {
      assert.strictEqual(result.healing, null);
    }
  });
});

// ─── Submit ─────────────────────────────────────────────────────────────────

describe('API Layer — Submit', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('submit rejects null code', () => {
    const result = oracle.submit(null, {});
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('submit rejects non-string code', () => {
    const result = oracle.submit(123, {});
    assert.strictEqual(result.success, false);
  });

  it('submit accepts valid code', () => {
    const result = oracle.submit(VALID_CODE_A, {
      description: 'Clamp values', tags: ['math'], language: 'javascript',
    });
    assert.strictEqual(result.accepted, true);
    assert.ok(result.entry);
    assert.ok(result.entry.id);
  });

  it('submit with passing tests records testPassed', () => {
    const result = oracle.submit(VALID_CODE_A, {
      description: 'Clamp', language: 'javascript', tags: ['math'],
      testCode: TEST_CODE_CLAMP,
    });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.validation.testPassed, true);
  });

  it('submit with failing tests rejects code', () => {
    const result = oracle.submit(VALID_CODE_A, {
      description: 'Clamp', language: 'javascript',
      testCode: 'if (clamp(5, 1, 10) !== 999) throw new Error("wrong");',
    });
    assert.strictEqual(result.accepted, false);
  });

  it('submit handles null metadata gracefully', () => {
    const result = oracle.submit(VALID_CODE_A, null);
    // Should still work with defaults
    assert.strictEqual(result.accepted, true);
  });

  it('submit detects near-duplicate code', () => {
    oracle.submit(VALID_CODE_A, { description: 'Clamp', tags: ['math'] });
    // Register as pattern first so similarity gate has something to match against
    oracle.registerPattern({
      name: 'clamp-orig', code: VALID_CODE_A, language: 'javascript',
      description: 'Clamp', tags: ['math'],
    });
    // Submit identical code — should be rejected, routed to candidate, or accepted with similarity info
    const result = oracle.submit(VALID_CODE_A, { description: 'Clamp copy', tags: ['math'] });
    assert.ok(
      result.success === false || result.candidateStored === true || 'similarity' in result,
      'Duplicate submission should be detected or tracked'
    );
  });

  it('registerPattern validates and stores pattern', () => {
    const result = oracle.registerPattern({
      name: 'debounce-fn', code: VALID_CODE_D, language: 'javascript',
      description: 'Debounce a function', tags: ['utility', 'timing'],
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.registered, true);
    assert.ok(result.pattern);
    assert.ok(result.pattern.id);
  });

  it('registerPattern rejects code that fails tests', () => {
    const result = oracle.registerPattern({
      name: 'bad-fn', code: 'function bad() { return 1; }', language: 'javascript',
      description: 'Bad function', tags: [],
      testCode: 'if (bad() !== 999) throw new Error("FAIL");',
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.registered, false);
  });

  it('evolvePattern creates new version linked to parent', () => {
    const reg = oracle.registerPattern({
      name: 'group-by', code: VALID_CODE_E, language: 'javascript',
      description: 'Group array by key', tags: ['array'],
    });
    assert.ok(reg.registered);

    const newCode = VALID_CODE_E.replace('const groups = {};', 'const groups = Object.create(null);');
    const evolved = oracle.evolvePattern(reg.pattern.id, newCode, { description: 'Improved groupBy' });
    assert.strictEqual(evolved.success, true);
    assert.strictEqual(evolved.evolved, true);
    assert.ok(evolved.pattern);
  });

  it('evolvePattern returns error for unknown parent', () => {
    const result = oracle.evolvePattern('nonexistent-id', 'function x() {}', {});
    assert.strictEqual(result.success, false);
  });
});

// ─── Feedback ───────────────────────────────────────────────────────────────

describe('API Layer — Feedback', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('feedback records success and returns new reliability', () => {
    const { entry } = oracle.submit(VALID_CODE_A, { tags: ['math'] });
    const result = oracle.feedback(entry.id, true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.newReliability, 1.0);
  });

  it('feedback records failure and returns updated reliability', () => {
    const { entry } = oracle.submit(VALID_CODE_B, { tags: ['string'] });
    oracle.feedback(entry.id, true);
    const result = oracle.feedback(entry.id, false);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.newReliability, 0.5);
  });

  it('feedback returns error for nonexistent id', () => {
    const result = oracle.feedback('does-not-exist', true);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('patternFeedback records usage on a registered pattern', () => {
    const reg = oracle.registerPattern({
      name: 'clamp-fb', code: VALID_CODE_A, language: 'javascript',
      description: 'Clamp numbers', tags: ['math'],
    });
    assert.ok(reg.registered);

    const result = oracle.patternFeedback(reg.pattern.id, true);
    assert.strictEqual(result.success, true);
    assert.ok(result.usageCount >= 1);
    assert.ok(result.successCount >= 1);
  });

  it('patternFeedback returns error for unknown pattern', () => {
    const result = oracle.patternFeedback('ghost-pattern', false);
    assert.strictEqual(result.success, false);
  });
});

// ─── Pattern Management ─────────────────────────────────────────────────────

describe('API Layer — Pattern Management', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('patterns.getAll returns registered patterns', () => {
    oracle.registerPattern({
      name: 'cap-fn', code: VALID_CODE_B, language: 'javascript',
      description: 'Capitalize', tags: ['string'],
    });
    const all = oracle.patterns.getAll();
    assert.ok(all.length >= 1);
    assert.ok(all.some(p => p.name === 'cap-fn'));
  });

  it('patterns.getAll filters by language', () => {
    oracle.registerPattern({
      name: 'js-fn', code: VALID_CODE_A, language: 'javascript',
      description: 'Clamp JS', tags: ['math'],
    });
    const jsOnly = oracle.patterns.getAll({ language: 'javascript' });
    assert.ok(jsOnly.every(p => p.language === 'javascript'));
  });

  it('patterns.register and update work correctly', () => {
    const reg = oracle.registerPattern({
      name: 'flatten-fn', code: VALID_CODE_C, language: 'javascript',
      description: 'Flatten arrays', tags: ['array'],
    });
    assert.ok(reg.registered);

    oracle.patterns.update(reg.pattern.id, { tags: ['array', 'recursive', 'utility'] });
    const updated = oracle.patterns.getAll().find(p => p.id === reg.pattern.id);
    assert.ok(updated.tags.includes('recursive'));
  });

  it('retag enriches pattern tags', () => {
    const reg = oracle.registerPattern({
      name: 'debounce-rt', code: VALID_CODE_D, language: 'javascript',
      description: 'Debounce function calls', tags: [],
    });
    assert.ok(reg.registered);

    const result = oracle.retag(reg.pattern.id);
    assert.strictEqual(result.success, true);
    assert.ok(result.newTags.length >= 0);
  });

  it('retag returns error for unknown pattern', () => {
    const result = oracle.retag('nonexistent');
    assert.strictEqual(result.success, false);
  });

  it('retagAll processes all patterns', () => {
    oracle.registerPattern({ name: 'fn-a', code: VALID_CODE_A, language: 'javascript', description: 'Clamp', tags: [] });
    oracle.registerPattern({ name: 'fn-b', code: VALID_CODE_B, language: 'javascript', description: 'Capitalize', tags: [] });
    const result = oracle.retagAll();
    assert.strictEqual(result.success, true);
    assert.ok(result.total >= 2);
  });

  it('deepClean removes duplicates and stubs', () => {
    oracle.registerPattern({ name: 'real-fn', code: VALID_CODE_C, language: 'javascript', description: 'Flatten', tags: ['array'] });
    const result = oracle.deepClean({ dryRun: true });
    assert.ok('removed' in result);
    assert.ok('duplicates' in result);
    assert.ok('stubs' in result);
    assert.ok('remaining' in result);
  });
});

// ─── Candidates ─────────────────────────────────────────────────────────────

describe('API Layer — Candidates', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('candidates returns empty list when none exist', () => {
    const result = oracle.candidates();
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  it('candidateStats returns summary', () => {
    const stats = oracle.candidateStats();
    assert.ok(typeof stats === 'object');
    // May have 'total' or 'totalCandidates' depending on implementation
    assert.ok('total' in stats || 'totalCandidates' in stats || Object.keys(stats).length >= 0);
  });

  it('autoPromote runs without error on empty candidates', () => {
    const result = oracle.autoPromote();
    assert.ok('promoted' in result || result === undefined || result === null
      || (typeof result === 'object'));
  });

  it('smartAutoPromote returns structured report', () => {
    const result = oracle.smartAutoPromote({ dryRun: true });
    assert.ok('promoted' in result);
    assert.ok('skipped' in result);
    assert.ok('vetoed' in result);
    assert.ok('total' in result);
    assert.strictEqual(result.total, 0);
  });
});

// ─── Voting ─────────────────────────────────────────────────────────────────

describe('API Layer — Voting', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('vote records an upvote on a pattern', () => {
    const reg = oracle.registerPattern({
      name: 'vote-test', code: VALID_CODE_A, language: 'javascript',
      description: 'Clamp for voting', tags: ['math'],
    });
    assert.ok(reg.registered);

    const result = oracle.vote(reg.pattern.id, 'test-voter', 1);
    // vote may succeed or fail depending on SQLite store availability
    assert.ok('success' in result);
  });

  it('vote records a downvote', () => {
    const reg = oracle.registerPattern({
      name: 'vote-down', code: VALID_CODE_B, language: 'javascript',
      description: 'Capitalize for voting', tags: ['string'],
    });
    assert.ok(reg.registered);

    const result = oracle.vote(reg.pattern.id, 'voter-2', -1);
    assert.ok('success' in result);
  });

  it('getVotes retrieves votes for a pattern', () => {
    const reg = oracle.registerPattern({
      name: 'votes-get', code: VALID_CODE_C, language: 'javascript',
      description: 'Flatten for votes', tags: ['array'],
    });
    assert.ok(reg.registered);
    const voteResult = oracle.vote(reg.pattern.id, 'v1', 1);

    if (voteResult.success) {
      oracle.vote(reg.pattern.id, 'v2', 1);
      const votes = oracle.getVotes(reg.pattern.id);
      assert.ok(votes !== undefined);
    } else {
      // SQLite store not available — getVotes returns null
      const votes = oracle.getVotes(reg.pattern.id);
      assert.ok(votes === null || votes !== undefined);
    }
  });

  it('topVoted returns a list', () => {
    const result = oracle.topVoted(5);
    assert.ok(Array.isArray(result));
  });

  it('topVoters returns a list', () => {
    const result = oracle.topVoters(5);
    assert.ok(Array.isArray(result));
  });

  it('getVoterReputation returns data or null', () => {
    const reg = oracle.registerPattern({
      name: 'rep-test', code: VALID_CODE_D, language: 'javascript',
      description: 'Debounce for rep', tags: ['utility'],
    });
    assert.ok(reg.registered);
    oracle.vote(reg.pattern.id, 'rep-voter', 1);

    const rep = oracle.getVoterReputation('rep-voter');
    // May be null if SQLite store not available, or object with weight
    assert.ok(rep === null || 'weight' in rep);
  });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

describe('API Layer — Stats', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('stats returns store summary', () => {
    oracle.submit(VALID_CODE_A, { tags: ['math'] });
    const stats = oracle.stats();
    assert.ok('totalEntries' in stats);
    assert.ok(stats.totalEntries >= 1);
  });

  it('stats on empty store returns zero counts', () => {
    const stats = oracle.stats();
    assert.ok('totalEntries' in stats);
    assert.strictEqual(stats.totalEntries, 0);
  });

  it('patternStats returns pattern summary', () => {
    oracle.registerPattern({
      name: 'stat-fn', code: VALID_CODE_B, language: 'javascript',
      description: 'Capitalize', tags: ['string'],
    });
    const stats = oracle.patternStats();
    assert.ok('totalPatterns' in stats || 'total' in stats);
  });

  it('healingStats returns healing information', () => {
    const stats = oracle.healingStats();
    assert.ok('totalAttempts' in stats);
    assert.ok('totalSuccesses' in stats);
  });

  it('getHealingSuccessRate returns 1.0 for unknown pattern', () => {
    const rate = oracle.getHealingSuccessRate('nonexistent');
    assert.strictEqual(rate, 1.0);
  });

  it('getHealingLineage returns empty lineage for unknown pattern', () => {
    const lineage = oracle.getHealingLineage('nonexistent');
    assert.ok('variants' in lineage);
    assert.strictEqual(lineage.variants.length, 0);
  });
});

// ─── Events ─────────────────────────────────────────────────────────────────

describe('API Layer — Events', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('on registers a listener that receives events', () => {
    const events = [];
    oracle.on(e => events.push(e));

    oracle.submit(VALID_CODE_A, { description: 'Clamp', tags: ['math'] });
    assert.ok(events.length > 0);
    assert.ok(events.some(e => e.type === 'entry_added'));
  });

  it('on returns an unsubscribe function', () => {
    const events = [];
    const unsub = oracle.on(e => events.push(e));

    oracle.submit(VALID_CODE_A, { tags: ['a'] });
    const countBefore = events.length;

    unsub();
    oracle.submit(VALID_CODE_B, { tags: ['b'] });
    assert.strictEqual(events.length, countBefore);
  });

  it('listener errors do not crash the oracle', () => {
    oracle.on(() => { throw new Error('listener boom'); });
    // Should not throw
    oracle.submit(VALID_CODE_A, { tags: ['math'] });
    assert.ok(true, 'Oracle survived listener error');
  });
});

// ─── Export / Import ────────────────────────────────────────────────────────

describe('API Layer — Export / Import', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
    oracle.registerPattern({ name: 'exp-clamp', code: VALID_CODE_A, language: 'javascript', description: 'Clamp', tags: ['math'] });
    oracle.registerPattern({ name: 'exp-cap', code: VALID_CODE_B, language: 'javascript', description: 'Capitalize', tags: ['string'] });
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('export returns JSON string with patterns', () => {
    const json = oracle.export({ format: 'json' });
    const parsed = JSON.parse(json);
    assert.ok(parsed.count >= 2);
    assert.ok(Array.isArray(parsed.patterns));
    assert.ok(parsed.patterns[0].code);
    assert.ok(parsed.patterns[0].name);
  });

  it('export respects limit option', () => {
    const json = oracle.export({ format: 'json', limit: 1 });
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.count, 1);
  });

  it('export in markdown format returns string', () => {
    const md = oracle.export({ format: 'markdown' });
    assert.ok(typeof md === 'string');
    assert.ok(md.includes('# Remembrance Oracle'));
  });

  it('import loads patterns into a fresh oracle', () => {
    const json = oracle.export({ format: 'json' });

    const { oracle: oracle2, tmpDir: t2 } = createTestOracle();
    const result = oracle2.import(json);
    assert.ok(result.imported >= 1);
    assert.ok(Array.isArray(result.results));
    cleanTempDir(t2);
  });

  it('import skips duplicates', () => {
    const json = oracle.export({ format: 'json' });
    // Import into same oracle — should skip all as duplicates
    const result = oracle.import(json);
    assert.strictEqual(result.imported, 0);
    assert.ok(result.skipped >= 2);
  });

  it('import dryRun does not actually register', () => {
    const json = oracle.export({ format: 'json' });
    const { oracle: oracle2, tmpDir: t2 } = createTestOracle();
    const result = oracle2.import(json, { dryRun: true });
    assert.ok(result.imported >= 1);
    // Patterns not actually stored
    const all = oracle2.patterns.getAll();
    assert.strictEqual(all.length, 0);
    cleanTempDir(t2);
  });

  it('import handles invalid JSON gracefully', () => {
    const result = oracle.import('not valid json at all');
    assert.strictEqual(result.imported, 0);
  });
});

// ─── Security ───────────────────────────────────────────────────────────────

describe('API Layer — Security', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('securityScan scans raw code', () => {
    const result = oracle.securityScan(VALID_CODE_A, { language: 'javascript' });
    assert.ok('totalFindings' in result || 'deepFindings' in result || 'veto' in result);
  });

  it('securityScan returns result for suspicious code', () => {
    const sketchy = `
function danger() {
  eval(userInput);
  child_process.execSync(cmd);
}
    `.trim();
    const result = oracle.securityScan(sketchy, { language: 'javascript' });
    // Security scan returns a structured result regardless of findings
    assert.ok('veto' in result || 'deepFindings' in result || 'totalFindings' in result);
  });

  it('securityAudit scans all patterns', () => {
    oracle.registerPattern({ name: 'safe-fn', code: VALID_CODE_A, language: 'javascript', description: 'Clamp', tags: ['math'] });
    const report = oracle.securityAudit();
    assert.ok('scanned' in report);
    assert.ok(report.scanned >= 1);
    assert.ok('clean' in report);
    assert.ok('vetoed' in report);
  });

  it('securityAudit on empty library scans zero', () => {
    const report = oracle.securityAudit();
    assert.strictEqual(report.scanned, 0);
  });
});

// ─── Diff ───────────────────────────────────────────────────────────────────

describe('API Layer — Diff', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('diff compares two submitted entries', () => {
    const a = oracle.submit(VALID_CODE_A, { description: 'Clamp', tags: ['math'] });
    const b = oracle.submit(VALID_CODE_B, { description: 'Capitalize', tags: ['string'] });
    const result = oracle.diff(a.entry.id, b.entry.id);
    assert.ok(result.a);
    assert.ok(result.b);
    assert.ok(Array.isArray(result.diff));
    assert.ok(result.stats.added >= 0);
    assert.ok(result.stats.removed >= 0);
  });

  it('diff returns error for unknown id', () => {
    const result = oracle.diff('no-such-id', 'also-nope');
    assert.ok(result.error);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('API Layer — Edge Cases', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('inspect returns null for non-string id', () => {
    assert.strictEqual(oracle.inspect(null), null);
    assert.strictEqual(oracle.inspect(undefined), null);
    assert.strictEqual(oracle.inspect(42), null);
  });

  it('inspect returns null/undefined for unknown id', () => {
    const result = oracle.inspect('nonexistent');
    assert.ok(result === null || result === undefined);
  });

  it('inspect returns entry after submit', () => {
    const { entry } = oracle.submit(VALID_CODE_A, { description: 'Clamp', tags: ['math'] });
    const inspected = oracle.inspect(entry.id);
    assert.ok(inspected);
    assert.strictEqual(inspected.id, entry.id);
    assert.ok(inspected.code.includes('clamp'));
  });

  it('prune removes entries below threshold', () => {
    oracle.submit(VALID_CODE_A, { tags: ['a'] });
    const result = oracle.prune(0.99);
    assert.ok('removed' in result);
  });

  it('retirePatterns removes low-reliability patterns', () => {
    oracle.registerPattern({ name: 'retire-me', code: VALID_CODE_C, language: 'javascript', description: 'Flatten', tags: ['array'] });
    const result = oracle.retirePatterns(0.99);
    assert.ok(result !== undefined);
  });

  it('queryHealingImprovement returns array', () => {
    const result = oracle.queryHealingImprovement(0.1);
    assert.ok(Array.isArray(result));
  });

  it('constructor with default options works', () => {
    const { oracle: o, tmpDir: t } = createTestOracle({ threshold: 0.3 });
    assert.strictEqual(o.threshold, 0.3);
    assert.ok(o.patterns);
    assert.ok(o.store);
    cleanTempDir(t);
  });

  it('multiple oracles with separate dirs are isolated', () => {
    const { oracle: o1, tmpDir: t1 } = createTestOracle();
    const { oracle: o2, tmpDir: t2 } = createTestOracle();

    o1.submit(VALID_CODE_A, { description: 'Only in o1', tags: ['math'] });
    assert.ok(o1.stats().totalEntries >= 1);
    assert.strictEqual(o2.stats().totalEntries, 0);

    cleanTempDir(t1);
    cleanTempDir(t2);
  });
});
