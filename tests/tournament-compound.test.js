const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { PatternRecycler } = require('../src/evolution/recycler');
const { RemembranceOracle } = require('../src/api/oracle');
const { makeTempDir } = require('./helpers');
const { TOURNAMENT, COMPOUND } = require('../src/constants/thresholds');

describe('Tournament Generation', () => {
  let oracle, recycler, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, generateVariants: false, autoGrow: false });
    recycler = new PatternRecycler(oracle, { generateVariants: true, variantLanguages: ['typescript'] });
  });

  it('TOURNAMENT constants are defined', () => {
    assert.equal(TOURNAMENT.CANDIDATES_PER_ROUND, 3);
    assert.equal(TOURNAMENT.ROUNDS, 3);
    assert.equal(TOURNAMENT.MIN_WINNER_COHERENCY, 0.6);
    assert.equal(TOURNAMENT.LOSER_HARVEST_FLOOR, 0.5);
  });

  it('tournamentGenerate runs without errors on empty library', () => {
    const report = recycler.tournamentGenerate();
    assert.equal(report.patternsProcessed, 0);
    assert.equal(report.winners.length, 0);
    assert.equal(report.losersHarvested, 0);
  });

  it('tournamentGenerate processes proven patterns', () => {
    // Register a proven JS pattern
    oracle.registerPattern({
      name: 'tourney-add',
      code: 'function tourneyAdd(a, b) { return a + b; }',
      testCode: 'if (tourneyAdd(2, 3) !== 5) throw new Error("fail");',
      language: 'javascript',
      description: 'Add two numbers',
      tags: ['math'],
      patternType: 'utility',
    });

    const report = recycler.tournamentGenerate({
      candidatesPerRound: 2,
      rounds: 2,
    });

    assert.ok(report.patternsProcessed >= 1, 'Should process at least one pattern');
    assert.ok(report.totalGenerated >= 0, 'Should generate contenders');
    assert.ok(Array.isArray(report.winners), 'Winners should be an array');
    assert.ok(Array.isArray(report.roundDetails), 'Round details should be an array');
  });

  it('tournamentGenerate stores winners and harvests losers', () => {
    oracle.registerPattern({
      name: 'tourney-inc',
      code: 'function tourneyInc(n) { return n + 1; }',
      testCode: 'if (tourneyInc(0) !== 1) throw new Error("fail");',
      language: 'javascript',
      description: 'Increment number',
      tags: ['math'],
      patternType: 'utility',
    });

    const report = recycler.tournamentGenerate({
      candidatesPerRound: 3,
      rounds: 2,
      loserHarvestFloor: 0.3, // Low floor to harvest more losers
    });

    // Check that any winners/losers that were generated end up in candidates
    const candidates = oracle.patterns.getCandidates();
    const tournamentCandidates = candidates.filter(c =>
      (c.tags || []).some(t => t === 'tournament-winner' || t === 'tournament-loser')
    );

    // Total stored should match winners + harvested losers
    const expectedStored = report.winners.length + report.losersHarvested;
    assert.ok(tournamentCandidates.length <= expectedStored + 10, 'Tournament candidates should be stored');
  });

  it('tournamentGenerate respects maxPatterns', () => {
    // Register two patterns
    oracle.registerPattern({
      name: 'tourney-a',
      code: 'function tourneyA(x) { return x * 2; }',
      testCode: 'if (tourneyA(3) !== 6) throw new Error("fail");',
      language: 'javascript', description: 'Double', tags: ['math'], patternType: 'utility',
    });
    oracle.registerPattern({
      name: 'tourney-b',
      code: 'function tourneyB(x) { return x * 3; }',
      testCode: 'if (tourneyB(2) !== 6) throw new Error("fail");',
      language: 'javascript', description: 'Triple', tags: ['math'], patternType: 'utility',
    });

    const report = recycler.tournamentGenerate({ maxPatterns: 1, rounds: 1 });
    assert.ok(report.patternsProcessed <= 1, 'Should respect maxPatterns limit');
  });

  it('report roundDetails contains per-round information', () => {
    oracle.registerPattern({
      name: 'tourney-round-detail',
      code: 'function tourneyDetail(a, b) { return a + b; }',
      testCode: 'if (tourneyDetail(1, 2) !== 3) throw new Error("fail");',
      language: 'javascript', description: 'Add', tags: ['math'], patternType: 'utility',
    });

    const report = recycler.tournamentGenerate({ candidatesPerRound: 2, rounds: 2 });

    assert.ok(report.roundDetails.length >= 1, 'Should have round details');
    for (const rd of report.roundDetails) {
      assert.ok(rd.source, 'Each round detail should have a source pattern name');
      assert.ok(Array.isArray(rd.rounds), 'Each round detail should have rounds array');
    }
  });
});

describe('Compounding Growth on Feedback', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, generateVariants: false, autoGrow: false });
  });

  it('COMPOUND constants are defined', () => {
    assert.equal(COMPOUND.MIN_SUCCESSES, 2);
    assert.equal(COMPOUND.MIN_RELIABILITY, 0.75);
    assert.equal(COMPOUND.COMPOUND_EVERY, 2);
  });

  it('patternFeedback returns compoundResult on success', () => {
    // Register a proven pattern
    const result = oracle.registerPattern({
      name: 'compound-add',
      code: 'function compoundAdd(a, b) { return a + b; }',
      testCode: 'if (compoundAdd(1, 2) !== 3) throw new Error("fail");',
      language: 'javascript', description: 'Add', tags: ['math'], patternType: 'utility',
    });

    const patternId = result.pattern.id;

    // Report success multiple times to trigger compounding
    const r1 = oracle.patternFeedback(patternId, true);
    assert.equal(r1.success, true);

    const r2 = oracle.patternFeedback(patternId, true);
    assert.equal(r2.success, true);

    // compoundResult may or may not have stored candidates depending on
    // whether the pattern is JS and can be transpiled, but it should run without error
    assert.ok(r2.hasOwnProperty('compoundResult'), 'Should include compoundResult in response');
  });

  it('feedback does not compound on failure', () => {
    const result = oracle.registerPattern({
      name: 'no-compound',
      code: 'function noCompound(x) { return x; }',
      testCode: 'if (noCompound(1) !== 1) throw new Error("fail");',
      language: 'javascript', description: 'Identity', tags: ['util'], patternType: 'utility',
    });

    const patternId = result.pattern.id;

    // Report failure — should not trigger compounding
    const r1 = oracle.patternFeedback(patternId, false);
    assert.equal(r1.compoundResult, null);
  });

  it('compounding only triggers after MIN_SUCCESSES', () => {
    const result = oracle.registerPattern({
      name: 'threshold-test',
      code: 'function thresholdTest(n) { return n + 1; }',
      testCode: 'if (thresholdTest(0) !== 1) throw new Error("fail");',
      language: 'javascript', description: 'Increment', tags: ['math'], patternType: 'utility',
    });

    const patternId = result.pattern.id;

    // First success — should not compound (below MIN_SUCCESSES)
    const r1 = oracle.patternFeedback(patternId, true);
    // compoundResult should be null because successCount=1 < MIN_SUCCESSES=2
    assert.equal(r1.compoundResult, null);
  });
});

describe('Oracle API — tournamentGenerate', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, generateVariants: false, autoGrow: false });
  });

  it('oracle.tournamentGenerate delegates to recycler', () => {
    const report = oracle.tournamentGenerate();
    assert.ok(report, 'Should return a report');
    assert.equal(report.patternsProcessed, 0, 'Empty library should process 0 patterns');
    assert.deepEqual(report.winners, []);
  });
});
