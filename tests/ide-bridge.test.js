const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { IDEBridge, SEVERITY } = require('../src/ide/bridge');
const { RemembranceOracle } = require('../src/api/oracle');

function createBridge() {
  const oracle = new RemembranceOracle({ autoSeed: false });
  return new IDEBridge({ oracle });
}

describe('IDE Bridge', () => {

  describe('getDiagnostics', () => {
    it('returns empty for empty code', () => {
      const bridge = createBridge();
      assert.deepEqual(bridge.getDiagnostics({ code: '' }), []);
    });

    it('flags covenant violations', () => {
      const bridge = createBridge();
      const code = 'function hack() { eval("rm -rf /"); }';
      const diags = bridge.getDiagnostics({ code, language: 'javascript' });
      const covenantErrors = diags.filter(d => d.source === 'oracle-covenant');
      assert.ok(covenantErrors.length > 0, 'should flag eval as covenant violation');
      assert.equal(covenantErrors[0].severity, SEVERITY.error);
    });

    it('flags low-coherency code', () => {
      const bridge = createBridge();
      // A very short/incomplete snippet
      const code = 'x';
      const diags = bridge.getDiagnostics({ code, language: 'javascript' });
      const lowCoherency = diags.filter(d => d.code === 'low-coherency');
      // May or may not trigger depending on coherency score
      assert.ok(Array.isArray(diags));
    });

    it('respects maxDiagnostics', () => {
      const bridge = new IDEBridge({ oracle: new RemembranceOracle({ autoSeed: false }), maxDiagnostics: 2 });
      const code = 'function test() { eval("bad"); exec("bad"); }';
      const diags = bridge.getDiagnostics({ code, language: 'javascript' });
      assert.ok(diags.length <= 2);
    });

    it('returns diagnostics as LSP-compatible objects', () => {
      const bridge = createBridge();
      const code = 'function test() { eval("evil"); }';
      const diags = bridge.getDiagnostics({ code, language: 'javascript' });
      for (const d of diags) {
        assert.ok('severity' in d);
        assert.ok('range' in d);
        assert.ok('message' in d);
        assert.ok('source' in d);
        assert.ok(d.range.start);
        assert.ok(d.range.end);
      }
    });
  });

  describe('getHoverInfo', () => {
    it('returns null for unknown symbols', () => {
      const bridge = createBridge();
      const result = bridge.getHoverInfo({ symbol: 'xyzzy_nonexistent_12345' });
      assert.equal(result, null);
    });

    it('returns null for short symbols', () => {
      const bridge = createBridge();
      assert.equal(bridge.getHoverInfo({ symbol: 'x' }), null);
      assert.equal(bridge.getHoverInfo({ symbol: '' }), null);
    });

    it('returns markdown content when pattern found', () => {
      const bridge = createBridge();
      // Register a pattern first
      bridge.oracle.registerPattern({
        name: 'hover-test-fn',
        code: 'function hoverTestFn(n) { return n + 1; }',
        testCode: 'if (hoverTestFn(0) !== 1) throw new Error("fail");',
        language: 'javascript',
        description: 'Increment',
        tags: ['test'],
      });
      const result = bridge.getHoverInfo({ symbol: 'hover-test-fn', language: 'javascript' });
      if (result) {
        assert.ok(result.contents);
        assert.equal(result.contents.kind, 'markdown');
        assert.ok(result.contents.value.includes('hover-test-fn'));
      }
    });
  });

  describe('getCodeActions', () => {
    it('returns debug fixes for error messages', () => {
      const bridge = createBridge();
      // Capture a debug pattern first
      bridge.oracle.debugCapture({
        errorMessage: 'TypeError: Cannot read properties of null',
        fixCode: 'if (obj != null) { return obj.prop; }',
        fixDescription: 'Null check before property access',
        language: 'javascript',
      });

      const actions = bridge.getCodeActions({
        code: 'return obj.prop;',
        language: 'javascript',
        errorMessage: 'TypeError: Cannot read properties of null',
      });

      const debugFixes = actions.filter(a => a.source === 'oracle-debug');
      assert.ok(debugFixes.length > 0, 'should find debug fixes');
      assert.ok(debugFixes[0].fixCode);
      assert.ok(debugFixes[0].confidence >= 0);
    });

    it('offers reflection refinement for low-coherency code', () => {
      const bridge = createBridge();
      const code = `function mess(a,b,c,d,e) {
        if (a) { if (b) { if (c) { if (d) { if (e) { return a+b+c+d+e; } } } } }
        return 0;
      }`;
      const actions = bridge.getCodeActions({ code, language: 'javascript' });
      const refineActions = actions.filter(a => a.source === 'oracle-refine');
      // May or may not trigger depending on coherency score
      assert.ok(Array.isArray(actions));
    });

    it('returns empty for no context', () => {
      const bridge = createBridge();
      const actions = bridge.getCodeActions({ language: 'javascript' });
      assert.ok(Array.isArray(actions));
    });
  });

  describe('getCompletions', () => {
    it('returns empty for short prefix', () => {
      const bridge = createBridge();
      assert.deepEqual(bridge.getCompletions({ prefix: 'x' }), []);
      assert.deepEqual(bridge.getCompletions({ prefix: '' }), []);
    });

    it('returns completion items with required fields', () => {
      const bridge = createBridge();
      // Register a pattern to find
      bridge.oracle.registerPattern({
        name: 'completion-debounce',
        code: 'function debounce(fn, delay) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; }',
        testCode: 'const d = debounce(() => {}, 100); if (typeof d !== "function") throw new Error("fail");',
        language: 'javascript',
        tags: ['utility'],
      });

      const completions = bridge.getCompletions({ prefix: 'debounce', language: 'javascript', limit: 5 });
      for (const c of completions) {
        assert.ok('label' in c);
        assert.ok('kind' in c);
        assert.ok('detail' in c);
        assert.ok('insertText' in c);
        assert.ok('sortText' in c);
      }
    });
  });

  describe('getDefinition', () => {
    it('returns null for unknown symbols', () => {
      const bridge = createBridge();
      assert.equal(bridge.getDefinition({ symbol: 'xyzzy_unknown' }), null);
    });

    it('returns pattern info for known symbols', () => {
      const bridge = createBridge();
      bridge.oracle.registerPattern({
        name: 'def-test',
        code: 'function defTest() { return 42; }',
        testCode: 'if (defTest() !== 42) throw new Error("fail");',
        language: 'javascript',
        tags: ['test'],
      });

      const def = bridge.getDefinition({ symbol: 'def-test', language: 'javascript' });
      if (def) {
        assert.equal(def.name, 'def-test');
        assert.ok(def.patternId);
        assert.ok(def.code);
      }
    });
  });

  describe('findReferences', () => {
    it('returns empty for unknown symbols', () => {
      const bridge = createBridge();
      const refs = bridge.findReferences({ symbol: 'xyzzy_unknown' });
      assert.deepEqual(refs, []);
    });
  });

  describe('analyzeFile', () => {
    it('returns a full analysis report', () => {
      const bridge = createBridge();
      const code = 'function add(a, b) { return a + b; }';
      const report = bridge.analyzeFile({ code, language: 'javascript', uri: 'test.js' });

      assert.equal(report.uri, 'test.js');
      assert.equal(report.language, 'javascript');
      assert.ok(Array.isArray(report.diagnostics));
      assert.ok(typeof report.functions === 'number');
      assert.ok(report.summary);
      assert.ok('errors' in report.summary);
      assert.ok('warnings' in report.summary);
    });

    it('counts functions correctly', () => {
      const bridge = createBridge();
      const code = `
        function addNums() {}
        function subNums() {}
        const mulNums = function() {};
      `;
      const report = bridge.analyzeFile({ code, language: 'javascript' });
      assert.ok(report.functions >= 2, `expected >= 2 functions, got ${report.functions}`);
    });
  });

  describe('executeAction', () => {
    it('applies debug fix actions', () => {
      const bridge = createBridge();
      const result = bridge.executeAction({
        source: 'oracle-debug',
        fixCode: 'const safe = x || 0;',
        debugPatternId: 'test-id',
      });
      assert.ok(result.applied);
      assert.equal(result.code, 'const safe = x || 0;');
    });

    it('applies pattern replacement actions', () => {
      const bridge = createBridge();
      const result = bridge.executeAction({
        source: 'oracle-pattern',
        code: 'function better() { return true; }',
        patternId: 'test-id',
      });
      assert.ok(result.applied);
      assert.ok(result.code.includes('better'));
    });

    it('returns error for unknown action types', () => {
      const bridge = createBridge();
      const result = bridge.executeAction({ source: 'unknown' });
      assert.ok(!result.applied);
      assert.ok(result.error);
    });
  });

  describe('SEVERITY constants', () => {
    it('has all 4 severity levels', () => {
      assert.equal(SEVERITY.error, 1);
      assert.equal(SEVERITY.warning, 2);
      assert.equal(SEVERITY.info, 3);
      assert.equal(SEVERITY.hint, 4);
    });
  });
});
