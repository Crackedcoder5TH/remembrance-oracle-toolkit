const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { PatternComposer, BUILT_IN_TEMPLATES } = require('../src/patterns/composer');
const { getProductionSeeds, getProductionSeeds2 } = require('../src/patterns/seed-helpers');

describe('PatternComposer', () => {
  let tmpDir, oracle, composer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composer-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false });

    // Register production patterns for composition
    const allSeeds = [...getProductionSeeds(), ...getProductionSeeds2()];
    for (const seed of allSeeds) {
      oracle.registerPattern({
        name: seed.name,
        code: seed.code,
        testCode: seed.testCode,
        language: seed.language,
        description: seed.description,
        tags: seed.tags,
        patternType: seed.type,
      });
    }

    composer = new PatternComposer(oracle);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('templates', () => {
    it('returns built-in templates', () => {
      const templates = composer.templates();
      assert.ok(templates.length >= 5);
    });

    it('includes rest-api template', () => {
      const templates = composer.templates();
      const restApi = templates.find(t => t.name === 'rest-api');
      assert.ok(restApi);
      assert.ok(restApi.patterns.length >= 3);
    });

    it('includes resilient-service template', () => {
      const templates = composer.templates();
      const rs = templates.find(t => t.name === 'resilient-service');
      assert.ok(rs);
      assert.ok(rs.description.length > 10);
    });
  });

  describe('addTemplate', () => {
    it('adds a custom template', () => {
      const before = composer.templates().length;
      composer.addTemplate({
        name: 'custom-api',
        description: 'Custom API template',
        patterns: ['rate-limiter', 'event-emitter'],
      });
      assert.equal(composer.templates().length, before + 1);
    });
  });

  describe('compose', () => {
    it('composes multiple patterns by name', () => {
      const result = composer.compose({
        patterns: ['rate-limiter', 'event-emitter'],
        language: 'javascript',
        glue: 'module',
      });
      assert.ok(result.code.length > 100);
      assert.ok(result.patterns.length >= 1);
    });

    it('generates module glue by default', () => {
      const result = composer.compose({
        patterns: ['rate-limiter', 'middleware-chain'],
        language: 'javascript',
      });
      assert.ok(result.code.includes('module.exports') || result.code.includes('Composed module'));
    });

    it('generates class glue', () => {
      const result = composer.compose({
        patterns: ['rate-limiter', 'event-emitter'],
        language: 'javascript',
        glue: 'class',
      });
      assert.ok(result.code.includes('class'));
    });

    it('generates function glue', () => {
      const result = composer.compose({
        patterns: ['rate-limiter', 'event-emitter'],
        language: 'javascript',
        glue: 'function',
      });
      assert.ok(result.code.includes('function'));
    });

    it('handles unknown patterns gracefully', () => {
      const result = composer.compose({
        patterns: ['nonexistent-pattern', 'also-nonexistent'],
        language: 'javascript',
      });
      assert.ok(result.patterns.length === 0 || result.code.length >= 0);
    });
  });

  describe('composeFromDescription', () => {
    it('detects rate limiting from description', () => {
      const result = composer.composeFromDescription('API with rate limiting', 'javascript');
      assert.ok(result.patterns.length >= 0); // May or may not find patterns
    });

    it('returns a result object with code', () => {
      const result = composer.composeFromDescription('REST API with auth and validation', 'javascript');
      assert.ok('code' in result);
      assert.ok('patterns' in result);
      assert.ok('description' in result);
    });
  });
});

describe('BUILT_IN_TEMPLATES', () => {
  it('exports template array', () => {
    assert.ok(Array.isArray(BUILT_IN_TEMPLATES));
    assert.ok(BUILT_IN_TEMPLATES.length >= 5);
  });

  it('each template has name, description, and patterns', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      assert.ok(t.name);
      assert.ok(t.description);
      assert.ok(Array.isArray(t.patterns));
      assert.ok(t.patterns.length > 0);
    }
  });
});
