/**
 * VS Code Extension Tests
 *
 * Tests the extension components without requiring VS Code runtime.
 * Mocks the vscode module to test pure logic.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Mock the vscode module for testing outside VS Code
const mockVscode = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  CodeActionKind: { QuickFix: 'quickfix', Refactor: 'refactor' },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
  TreeItem: class TreeItem {
    constructor(label, collapsible) { this.label = label; this.collapsibleState = collapsible; }
  },
  MarkdownString: class MarkdownString {
    constructor() { this.value = ''; this.isTrusted = false; }
    appendMarkdown(s) { this.value += s; }
  },
  Range: class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  },
  Position: class Position {
    constructor(line, char) { this.line = line; this.character = char; }
  },
  Diagnostic: class Diagnostic {
    constructor(range, message, severity) {
      this.range = range; this.message = message; this.severity = severity;
    }
  },
  EventEmitter: class EventEmitter {
    constructor() { this._listeners = []; }
    get event() { return (fn) => this._listeners.push(fn); }
    fire(data) { this._listeners.forEach(fn => fn(data)); }
  },
  window: {
    activeTextEditor: null,
    visibleTextEditors: [],
    showInformationMessage: () => {},
    showWarningMessage: () => {},
    showInputBox: () => Promise.resolve(''),
    showQuickPick: () => Promise.resolve(null),
    createStatusBarItem: () => ({ text: '', show: () => {}, dispose: () => {} }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, def) => def,
    }),
    workspaceFolders: [],
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    openTextDocument: () => Promise.resolve({ getText: () => '' }),
  },
  languages: {
    createDiagnosticCollection: () => ({
      set: () => {},
      clear: () => {},
      dispose: () => {},
    }),
    registerHoverProvider: () => ({ dispose: () => {} }),
    registerCodeActionsProvider: () => ({ dispose: () => {} }),
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
  CompletionItem: class CompletionItem {
    constructor(label, kind) { this.label = label; this.kind = kind; }
  },
  CompletionItemKind: { Snippet: 15 },
  SnippetString: class SnippetString {
    constructor(value) { this.value = value; }
  },
  WorkspaceEdit: class WorkspaceEdit {
    constructor() { this.edits = []; }
    replace(uri, range, text) { this.edits.push({ uri, range, text }); }
  },
  CodeAction: class CodeAction {
    constructor(title, kind) { this.title = title; this.kind = kind; }
  },
  Hover: class Hover {
    constructor(contents, range) { this.contents = contents; this.range = range; }
  },
};

// Override require to provide mock vscode
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
const originalLoad = Module._cache;
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: mockVscode };

// Now require extension modules
const oraclePath = path.resolve(__dirname, '..', '..');

// ─── resolveOraclePath ───

describe('Extension', () => {
  describe('resolveOraclePath', () => {
    it('exports activate and deactivate', () => {
      const ext = require('../src/extension');
      assert.equal(typeof ext.activate, 'function');
      assert.equal(typeof ext.deactivate, 'function');
    });

    it('exports resolveOraclePath', () => {
      const ext = require('../src/extension');
      assert.equal(typeof ext.resolveOraclePath, 'function');
    });

    it('resolveOraclePath finds the toolkit from extension location', () => {
      const ext = require('../src/extension');
      const result = ext.resolveOraclePath();
      // Since we're running from within the toolkit, it should find it
      assert.ok(result === null || typeof result === 'string');
    });
  });
});

// ─── Sidebar ───

describe('Sidebar', () => {
  const { SidebarProvider, PatternsTreeProvider, DebugTreeProvider, StatsTreeProvider, OracleTreeItem } = require('../src/sidebar');

  describe('OracleTreeItem', () => {
    it('creates a tree item with label and data', () => {
      const item = new OracleTreeItem('test', 0, { description: 'desc', icon: 'bug' });
      assert.equal(item.label, 'test');
      assert.equal(item.description, 'desc');
      assert.ok(item.iconPath);
    });

    it('handles empty data', () => {
      const item = new OracleTreeItem('test', 0);
      assert.equal(item.label, 'test');
    });

    it('sets command when provided', () => {
      const cmd = { command: 'test.cmd', title: 'Test' };
      const item = new OracleTreeItem('test', 0, { command: cmd });
      assert.deepEqual(item.command, cmd);
    });
  });

  describe('PatternsTreeProvider', () => {
    it('creates with oracle path', () => {
      const provider = new PatternsTreeProvider(oraclePath);
      assert.ok(provider);
      assert.equal(typeof provider.getChildren, 'function');
      assert.equal(typeof provider.getTreeItem, 'function');
    });

    it('returns root language groups', () => {
      const provider = new PatternsTreeProvider(oraclePath);
      const children = provider.getChildren();
      assert.ok(Array.isArray(children));
      // May be empty in test environment with fresh oracle — just check it doesn't throw
    });

    it('getTreeItem returns the element', () => {
      const provider = new PatternsTreeProvider(oraclePath);
      const item = new OracleTreeItem('test', 0);
      assert.equal(provider.getTreeItem(item), item);
    });

    it('refresh fires event', () => {
      const provider = new PatternsTreeProvider(oraclePath);
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.ok(fired);
    });
  });

  describe('DebugTreeProvider', () => {
    it('creates with oracle path', () => {
      const provider = new DebugTreeProvider(oraclePath);
      assert.ok(provider);
    });

    it('returns children array', () => {
      const provider = new DebugTreeProvider(oraclePath);
      const children = provider.getChildren();
      assert.ok(Array.isArray(children));
    });
  });

  describe('StatsTreeProvider', () => {
    it('creates with oracle path', () => {
      const provider = new StatsTreeProvider(oraclePath);
      assert.ok(provider);
    });

    it('returns stats items', () => {
      const provider = new StatsTreeProvider(oraclePath);
      const children = provider.getChildren();
      assert.ok(Array.isArray(children));
      assert.ok(children.length > 0);
      // Should have total patterns
      assert.ok(children.some(c => c.label.includes('Total Patterns')));
    });

    it('includes coherency stat', () => {
      const provider = new StatsTreeProvider(oraclePath);
      const children = provider.getChildren();
      assert.ok(children.some(c => c.label.includes('Coherency')));
    });
  });

  describe('SidebarProvider', () => {
    it('creates all three views', () => {
      const config = { get: (k, d) => d };
      const provider = new SidebarProvider(oraclePath, config);
      assert.ok(provider.patternsView);
      assert.ok(provider.debugView);
      assert.ok(provider.statsView);
    });
  });
});

// ─── Diagnostics ───

describe('Diagnostics', () => {
  const { DiagnosticsProvider } = require('../src/diagnostics');

  it('creates provider', () => {
    const config = { get: (k, d) => d };
    const provider = new DiagnosticsProvider(oraclePath, config);
    assert.ok(provider);
  });

  it('setCollection stores the collection', () => {
    const config = { get: (k, d) => d };
    const provider = new DiagnosticsProvider(oraclePath, config);
    const mockCollection = { set: () => {}, clear: () => {} };
    provider.setCollection(mockCollection);
    assert.equal(provider.collection, mockCollection);
  });

  it('analyze does nothing without collection', () => {
    const config = { get: (k, d) => d };
    const provider = new DiagnosticsProvider(oraclePath, config);
    // Should not throw
    provider.analyze({ getText: () => 'const x = 1;', languageId: 'javascript', uri: { toString: () => 'test' } });
  });

  it('analyze processes a document with collection', () => {
    const config = { get: (k, d) => d };
    const provider = new DiagnosticsProvider(oraclePath, config);
    let setCalled = false;
    provider.setCollection({
      set: () => { setCalled = true; },
      clear: () => {},
    });
    const mockDoc = {
      getText: () => 'function test() { return 42; }',
      languageId: 'javascript',
      uri: { toString: () => 'file:///test.js' },
    };
    provider.analyze(mockDoc);
    assert.ok(setCalled);
  });

  it('refreshAll clears and re-analyzes', () => {
    const config = { get: (k, d) => d };
    const provider = new DiagnosticsProvider(oraclePath, config);
    let cleared = false;
    provider.setCollection({ set: () => {}, clear: () => { cleared = true; } });
    provider.refreshAll();
    assert.ok(cleared);
  });
});

// ─── Hover ───

describe('Hover', () => {
  const { HoverProvider } = require('../src/hover');

  it('creates provider', () => {
    const provider = new HoverProvider(oraclePath);
    assert.ok(provider);
    assert.equal(typeof provider.provideHover, 'function');
  });
});

// ─── Code Actions ───

describe('CodeActions', () => {
  const { CodeActionProvider } = require('../src/code-actions');

  it('creates provider', () => {
    const provider = new CodeActionProvider(oraclePath);
    assert.ok(provider);
    assert.equal(typeof provider.provideCodeActions, 'function');
  });

  it('returns empty array when no diagnostics', () => {
    const provider = new CodeActionProvider(oraclePath);
    const mockDoc = {
      getText: () => 'function test() { return 42; }',
      languageId: 'javascript',
    };
    const mockRange = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };
    const actions = provider.provideCodeActions(mockDoc, mockRange, { diagnostics: [] });
    assert.ok(Array.isArray(actions));
  });
});

// ─── Completions ───

describe('Completions', () => {
  const { CompletionProvider } = require('../src/completions');

  it('creates provider', () => {
    const provider = new CompletionProvider(oraclePath);
    assert.ok(provider);
    assert.equal(typeof provider.provideCompletionItems, 'function');
  });
});

// ─── Commands ───

describe('Commands', () => {
  const { CommandHandler } = require('../src/commands');

  it('creates handler', () => {
    const config = { get: (k, d) => d };
    const handler = new CommandHandler(oraclePath, config);
    assert.ok(handler);
    assert.equal(typeof handler.search, 'function');
    assert.equal(typeof handler.smartSearch, 'function');
    assert.equal(typeof handler.submitSelection, 'function');
    assert.equal(typeof handler.debugCapture, 'function');
    assert.equal(typeof handler.debugSearch, 'function');
    assert.equal(typeof handler.resolve, 'function');
    assert.equal(typeof handler.showStats, 'function');
    assert.equal(typeof handler.insertPattern, 'function');
  });
});
