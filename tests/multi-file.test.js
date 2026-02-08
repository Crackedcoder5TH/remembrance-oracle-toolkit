const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  ModulePattern,
  DependencyGraph,
  TemplateEngine,
  ModuleStore,
  scaffold,
  compose,
  detectFileLanguage,
  inferFileRole,
  extractImports,
  resolveImport,
} = require('../src/patterns/multi-file');

// ─── ModulePattern ───

describe('ModulePattern', () => {
  it('creates a module pattern', () => {
    const mod = new ModulePattern({
      name: 'auth-module',
      description: 'Authentication module',
      files: [
        { path: 'src/auth.js', code: 'module.exports = {}' },
        { path: 'tests/auth.test.js', code: 'assert.ok(true)' },
      ],
      tags: ['auth', 'security'],
    });
    assert.ok(mod.id);
    assert.equal(mod.name, 'auth-module');
    assert.equal(mod.files.length, 2);
    assert.equal(mod.files[0].language, 'javascript');
    assert.equal(mod.files[0].role, 'source');
    assert.equal(mod.files[1].role, 'test');
  });

  it('throws without name', () => {
    assert.throws(() => new ModulePattern({ files: [{ path: 'a.js', code: '' }] }), /name required/i);
  });

  it('throws without files', () => {
    assert.throws(() => new ModulePattern({ name: 'x', files: [] }), /At least one file/);
  });

  it('getMain returns first file or main role', () => {
    const mod = new ModulePattern({
      name: 'test',
      files: [
        { path: 'src/utils.js', code: 'helper' },
        { path: 'src/index.js', code: 'main' },
      ],
    });
    assert.equal(mod.getMain().path, 'src/index.js');
  });

  it('getTests returns test files', () => {
    const mod = new ModulePattern({
      name: 'test',
      files: [
        { path: 'src/lib.js', code: 'code' },
        { path: 'tests/lib.test.js', code: 'test1' },
        { path: 'tests/lib.spec.js', code: 'test2' },
      ],
    });
    assert.equal(mod.getTests().length, 2);
  });

  it('serializes to/from JSON', () => {
    const mod = new ModulePattern({
      name: 'json-test',
      description: 'Test JSON roundtrip',
      files: [{ path: 'a.js', code: 'x' }],
      tags: ['test'],
      template: { name: 'default' },
    });
    const json = mod.toJSON();
    assert.equal(json.type, 'module');
    const restored = ModulePattern.fromJSON(json);
    assert.equal(restored.name, 'json-test');
    assert.equal(restored.id, mod.id);
  });

  it('getDependencyGraph detects internal imports', () => {
    const mod = new ModulePattern({
      name: 'graph-test',
      files: [
        { path: 'src/index.js', code: "const utils = require('./utils');" },
        { path: 'src/utils.js', code: 'module.exports = {}' },
      ],
    });
    const graph = mod.getDependencyGraph();
    const deps = graph.dependenciesOf('src/index.js');
    assert.equal(deps.length, 1);
    assert.equal(deps[0], 'src/utils.js');
  });
});

// ─── DependencyGraph ───

describe('DependencyGraph', () => {
  let graph;

  beforeEach(() => {
    graph = new DependencyGraph();
    graph.addNode('A');
    graph.addNode('B');
    graph.addNode('C');
    graph.addEdge('A', 'B');
    graph.addEdge('B', 'C');
  });

  it('tracks nodes and edges', () => {
    assert.equal(graph.nodes().length, 3);
    assert.deepEqual(graph.dependenciesOf('A'), ['B']);
    assert.deepEqual(graph.dependentsOf('C'), ['B']);
  });

  it('topological sort returns dependency order', () => {
    const sorted = graph.topologicalSort();
    assert.ok(sorted.indexOf('C') < sorted.indexOf('B'));
    assert.ok(sorted.indexOf('B') < sorted.indexOf('A'));
  });

  it('detects cycles', () => {
    graph.addEdge('C', 'A');
    const cycles = graph.detectCycles();
    assert.ok(cycles.length > 0);
  });

  it('throws on topological sort with cycle', () => {
    graph.addEdge('C', 'A');
    assert.throws(() => graph.topologicalSort(), /Circular dependency/);
  });

  it('impact analysis finds affected nodes', () => {
    const affected = graph.impactOf('C');
    assert.ok(affected.includes('B'));
    assert.ok(affected.includes('A'));
  });

  it('leaves are nodes with no dependencies', () => {
    const leaves = graph.leaves();
    assert.deepEqual(leaves, ['C']);
  });

  it('roots are nodes nothing depends on', () => {
    const roots = graph.roots();
    assert.deepEqual(roots, ['A']);
  });

  it('computes depths', () => {
    const depths = graph.depths();
    assert.equal(depths['C'], 0);
    assert.equal(depths['B'], 1);
    assert.equal(depths['A'], 2);
  });
});

// ─── TemplateEngine ───

describe('TemplateEngine', () => {
  it('renders simple variables', () => {
    const result = TemplateEngine.render('Hello {{name}}!', { name: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('handles conditionals', () => {
    const tpl = '{{#if auth}}requireAuth();{{/if}}';
    assert.equal(TemplateEngine.render(tpl, { auth: true }), 'requireAuth();');
    assert.equal(TemplateEngine.render(tpl, { auth: false }), '');
  });

  it('handles each loops with strings', () => {
    const tpl = '{{#each items}}import {{this}};\n{{/each}}';
    const result = TemplateEngine.render(tpl, { items: ['fs', 'path'] });
    assert.equal(result, 'import fs;\nimport path;\n');
  });

  it('handles each loops with objects', () => {
    const tpl = '{{#each fields}}{{name}}: {{type}},\n{{/each}}';
    const result = TemplateEngine.render(tpl, {
      fields: [
        { name: 'id', type: 'string' },
        { name: 'count', type: 'number' },
      ],
    });
    assert.ok(result.includes('id: string'));
    assert.ok(result.includes('count: number'));
  });

  it('leaves unknown variables as-is', () => {
    const result = TemplateEngine.render('{{known}} {{unknown}}', { known: 'yes' });
    assert.equal(result, 'yes {{unknown}}');
  });

  it('extracts variables', () => {
    const vars = TemplateEngine.extractVariables(
      '{{name}} {{#if auth}}{{secret}}{{/if}} {{#each items}}{{this}}{{/each}}'
    );
    assert.ok(vars.includes('name'));
    assert.ok(vars.includes('auth'));
    assert.ok(vars.includes('secret'));
    assert.ok(vars.includes('items'));
    assert.ok(!vars.includes('this'));
  });

  it('validates variables', () => {
    const result = TemplateEngine.validate('{{a}} {{b}} {{c}}', { a: 1, b: 2 });
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['c']);
  });
});

// ─── ModuleStore ───

describe('ModuleStore', () => {
  let store;

  beforeEach(() => {
    store = new ModuleStore();
  });

  it('saves and retrieves modules', () => {
    const mod = new ModulePattern({
      name: 'test-mod',
      files: [{ path: 'a.js', code: 'x' }],
    });
    store.save(mod);
    const retrieved = store.get(mod.id);
    assert.equal(retrieved.name, 'test-mod');
  });

  it('lists modules with tag filter', () => {
    store.save(new ModulePattern({ name: 'a', files: [{ path: 'a.js', code: '' }], tags: ['auth'] }));
    store.save(new ModulePattern({ name: 'b', files: [{ path: 'b.js', code: '' }], tags: ['util'] }));
    assert.equal(store.list({ tag: 'auth' }).length, 1);
  });

  it('lists modules with search', () => {
    store.save(new ModulePattern({ name: 'logger', description: 'Logging utility', files: [{ path: 'l.js', code: '' }] }));
    store.save(new ModulePattern({ name: 'cache', description: 'Caching layer', files: [{ path: 'c.js', code: '' }] }));
    assert.equal(store.list({ search: 'log' }).length, 1);
  });

  it('deletes modules', () => {
    const mod = new ModulePattern({ name: 'del', files: [{ path: 'a.js', code: '' }] });
    store.save(mod);
    store.delete(mod.id);
    assert.equal(store.get(mod.id), null);
  });

  it('computes stats', () => {
    store.save(new ModulePattern({ name: 'a', files: [{ path: 'a.js', code: '' }, { path: 'b.py', code: '' }] }));
    const stats = store.stats();
    assert.equal(stats.totalModules, 1);
    assert.equal(stats.totalFiles, 2);
    assert.ok(stats.languages.includes('javascript'));
    assert.ok(stats.languages.includes('python'));
  });
});

// ─── Scaffold ───

describe('scaffold', () => {
  it('generates files from module pattern', () => {
    const mod = new ModulePattern({
      name: 'api',
      files: [
        { path: 'src/{{name}}.js', code: 'class {{name}} {}' },
        { path: 'tests/{{name}}.test.js', code: 'test("{{name}}")' },
      ],
      template: { name: 'UserService' },
    });
    const files = scaffold(mod, { name: 'UserService' });
    assert.equal(files.length, 2);
    assert.equal(files[0].path, 'src/UserService.js');
    assert.ok(files[0].code.includes('class UserService'));
  });

  it('applies output directory prefix', () => {
    const mod = new ModulePattern({
      name: 'simple',
      files: [{ path: 'index.js', code: '' }],
    });
    const files = scaffold(mod, {}, { outputDir: 'my-project' });
    assert.equal(files[0].path, 'my-project/index.js');
  });
});

// ─── Compose ───

describe('compose', () => {
  it('combines multiple modules', () => {
    const modA = new ModulePattern({
      name: 'utils',
      files: [{ path: 'src/utils.js', code: 'export const add = (a,b) => a+b;' }],
    });
    const modB = new ModulePattern({
      name: 'app',
      files: [{ path: 'src/app.js', code: "import { add } from './utils';" }],
      requires: [modA.id],
    });
    const result = compose([modA, modB]);
    assert.equal(result.files.length, 2);
    assert.ok(result.graph.nodes().includes(modA.id));
  });

  it('deduplicates files by path', () => {
    const a = new ModulePattern({ name: 'a', files: [{ path: 'shared.js', code: 'v1' }] });
    const b = new ModulePattern({ name: 'b', files: [{ path: 'shared.js', code: 'v2' }] });
    const result = compose([a, b]);
    assert.equal(result.files.length, 1);
  });

  it('throws on circular dependencies', () => {
    const a = new ModulePattern({ name: 'a', files: [{ path: 'a.js', code: '' }] });
    const b = new ModulePattern({ name: 'b', files: [{ path: 'b.js', code: '' }], requires: [a.id] });
    a.requires = [b.id];
    assert.throws(() => compose([a, b]), /Circular module dependencies/);
  });
});

// ─── Helpers ───

describe('detectFileLanguage', () => {
  it('detects common languages', () => {
    assert.equal(detectFileLanguage('app.js'), 'javascript');
    assert.equal(detectFileLanguage('app.ts'), 'typescript');
    assert.equal(detectFileLanguage('app.py'), 'python');
    assert.equal(detectFileLanguage('app.go'), 'go');
    assert.equal(detectFileLanguage('app.rs'), 'rust');
    assert.equal(detectFileLanguage('app.rb'), 'ruby');
    assert.equal(detectFileLanguage('app.java'), 'java');
    assert.equal(detectFileLanguage('style.css'), 'css');
    assert.equal(detectFileLanguage('data.json'), 'json');
    assert.equal(detectFileLanguage('config.yaml'), 'yaml');
  });
});

describe('inferFileRole', () => {
  it('infers roles from paths', () => {
    assert.equal(inferFileRole('tests/auth.test.js'), 'test');
    assert.equal(inferFileRole('src/index.js'), 'main');
    assert.equal(inferFileRole('types.d.ts'), 'types');
    assert.equal(inferFileRole('README.md'), 'docs');
    assert.equal(inferFileRole('package.json'), 'config');
    assert.equal(inferFileRole('src/utils.js'), 'source');
  });
});

describe('extractImports', () => {
  it('extracts JS require imports', () => {
    const code = "const fs = require('fs');\nconst lib = require('./lib');";
    const imports = extractImports(code, 'javascript');
    assert.ok(imports.includes('fs'));
    assert.ok(imports.includes('./lib'));
  });

  it('extracts ES module imports', () => {
    const code = "import { foo } from './foo';\nimport bar from 'bar';";
    const imports = extractImports(code, 'javascript');
    assert.ok(imports.includes('./foo'));
    assert.ok(imports.includes('bar'));
  });

  it('extracts Python imports', () => {
    const code = "from os import path\nimport sys";
    const imports = extractImports(code, 'python');
    assert.ok(imports.includes('os'));
    assert.ok(imports.includes('sys'));
  });

  it('extracts Go imports', () => {
    const code = 'import (\n  "fmt"\n  "os"\n)';
    const imports = extractImports(code, 'go');
    assert.ok(imports.includes('fmt'));
    assert.ok(imports.includes('os'));
  });
});

describe('resolveImport', () => {
  const known = new Set(['src/utils.js', 'src/lib/helper.js', 'src/index.js']);

  it('resolves relative import', () => {
    assert.equal(resolveImport('./utils', 'src/main.js', known), 'src/utils.js');
  });

  it('resolves parent directory import', () => {
    assert.equal(resolveImport('../utils', 'src/lib/deep.js', known), 'src/utils.js');
  });

  it('returns null for external packages', () => {
    assert.equal(resolveImport('express', 'src/app.js', known), null);
  });

  it('resolves index file', () => {
    assert.equal(resolveImport('./', 'src/main.js', known), 'src/index.js');
  });
});
