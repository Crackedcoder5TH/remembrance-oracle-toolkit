/**
 * Sidebar Provider — tree views for patterns, debug fixes, and statistics.
 */

const vscode = require('vscode');

// ─── Tree Item ───

class OracleTreeItem extends vscode.TreeItem {
  constructor(label, collapsible, data = {}) {
    super(label, collapsible);
    this.data = data;

    if (data.description) {
      this.description = data.description;
    }
    if (data.tooltip) {
      this.tooltip = data.tooltip;
    }
    if (data.icon) {
      this.iconPath = new vscode.ThemeIcon(data.icon);
    }
    if (data.command) {
      this.command = data.command;
    }
    if (data.contextValue) {
      this.contextValue = data.contextValue;
    }
  }
}

// ─── Patterns View ───

class PatternsTreeProvider {
  constructor(oraclePath) {
    this.oraclePath = oraclePath;
    this._oracle = null;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  _getOracle() {
    if (!this._oracle) {
      const { RemembranceOracle } = require(`${this.oraclePath}/src/api/oracle`);
      this._oracle = new RemembranceOracle({ autoSeed: false });
    }
    return this._oracle;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    try {
      const oracle = this._getOracle();

      if (!element) {
        // Root level — show language groups
        const stats = oracle.stats();
        const languages = stats.byLanguage || {};
        return Object.entries(languages).map(([lang, count]) =>
          new OracleTreeItem(
            `${lang} (${count})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            { icon: 'symbol-namespace', language: lang }
          )
        );
      }

      // Language level — show top patterns for this language
      const language = element.data?.language;
      if (language) {
        const results = oracle.search(language, { limit: 20, language });
        return results.map(r =>
          new OracleTreeItem(
            r.name || r.description || 'untitled',
            vscode.TreeItemCollapsibleState.None,
            {
              description: `${(r.coherency || 0).toFixed(2)}`,
              tooltip: `${r.name}\nCoherency: ${(r.coherency || 0).toFixed(3)}\nTags: ${(r.tags || []).join(', ')}`,
              icon: 'symbol-function',
              command: {
                command: 'oracle.insertPattern',
                title: 'Insert Pattern',
                arguments: [r],
              },
              contextValue: 'pattern',
            }
          )
        );
      }

      return [];
    } catch {
      return [new OracleTreeItem('Error loading patterns', vscode.TreeItemCollapsibleState.None, { icon: 'error' })];
    }
  }
}

// ─── Debug Fixes View ───

class DebugTreeProvider {
  constructor(oraclePath) {
    this.oraclePath = oraclePath;
    this._oracle = null;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  _getOracle() {
    if (!this._oracle) {
      const { RemembranceOracle } = require(`${this.oraclePath}/src/api/oracle`);
      this._oracle = new RemembranceOracle({ autoSeed: false });
    }
    return this._oracle;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    try {
      const oracle = this._getOracle();

      if (!element) {
        // Root level — show error categories
        const stats = oracle.debugStats();
        if (!stats || stats.totalPatterns === 0) {
          return [new OracleTreeItem('No debug patterns yet', vscode.TreeItemCollapsibleState.None, { icon: 'info' })];
        }

        const categories = stats.byCategory || {};
        return Object.entries(categories).map(([cat, count]) =>
          new OracleTreeItem(
            `${cat} (${count})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            { icon: 'bug', category: cat }
          )
        );
      }

      // Category level — show patterns in this category
      const category = element.data?.category;
      if (category) {
        const patterns = oracle.debugPatterns({ category, limit: 15 });
        return patterns.map(p =>
          new OracleTreeItem(
            p.fixDescription || p.errorClass || 'Fix',
            vscode.TreeItemCollapsibleState.None,
            {
              description: `conf: ${(p.confidence || 0).toFixed(2)}`,
              tooltip: `Error: ${p.errorMessage}\nFix: ${p.fixDescription}\nConfidence: ${(p.confidence || 0).toFixed(3)}`,
              icon: 'lightbulb',
              contextValue: 'debugPattern',
            }
          )
        );
      }

      return [];
    } catch {
      return [new OracleTreeItem('Error loading debug patterns', vscode.TreeItemCollapsibleState.None, { icon: 'error' })];
    }
  }
}

// ─── Stats View ───

class StatsTreeProvider {
  constructor(oraclePath) {
    this.oraclePath = oraclePath;
    this._oracle = null;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  _getOracle() {
    if (!this._oracle) {
      const { RemembranceOracle } = require(`${this.oraclePath}/src/api/oracle`);
      this._oracle = new RemembranceOracle({ autoSeed: false });
    }
    return this._oracle;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    try {
      const oracle = this._getOracle();
      const stats = oracle.stats();
      const items = [];

      items.push(new OracleTreeItem(
        `Total Patterns: ${stats.totalEntries || 0}`,
        vscode.TreeItemCollapsibleState.None,
        { icon: 'database' }
      ));

      items.push(new OracleTreeItem(
        `Avg Coherency: ${(stats.averageCoherency || 0).toFixed(3)}`,
        vscode.TreeItemCollapsibleState.None,
        { icon: 'graph' }
      ));

      if (stats.byLanguage) {
        for (const [lang, count] of Object.entries(stats.byLanguage)) {
          items.push(new OracleTreeItem(
            `${lang}: ${count}`,
            vscode.TreeItemCollapsibleState.None,
            { icon: 'symbol-namespace' }
          ));
        }
      }

      // Debug stats
      const debugStats = oracle.debugStats();
      if (debugStats && debugStats.totalPatterns > 0) {
        items.push(new OracleTreeItem(
          `Debug Patterns: ${debugStats.totalPatterns}`,
          vscode.TreeItemCollapsibleState.None,
          { icon: 'bug' }
        ));
        items.push(new OracleTreeItem(
          `Avg Confidence: ${(debugStats.avgConfidence || 0).toFixed(3)}`,
          vscode.TreeItemCollapsibleState.None,
          { icon: 'shield' }
        ));
      }

      return items;
    } catch {
      return [new OracleTreeItem('Error loading stats', vscode.TreeItemCollapsibleState.None, { icon: 'error' })];
    }
  }
}

// ─── Sidebar Provider ───

class SidebarProvider {
  constructor(oraclePath, config) {
    this.patternsView = new PatternsTreeProvider(oraclePath);
    this.debugView = new DebugTreeProvider(oraclePath);
    this.statsView = new StatsTreeProvider(oraclePath);
  }
}

module.exports = { SidebarProvider, PatternsTreeProvider, DebugTreeProvider, StatsTreeProvider, OracleTreeItem };
