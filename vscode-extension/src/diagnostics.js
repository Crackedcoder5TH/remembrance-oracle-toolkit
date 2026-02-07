/**
 * Diagnostics Provider — bridges IDEBridge diagnostics to VS Code diagnostic API.
 */

const vscode = require('vscode');

class DiagnosticsProvider {
  constructor(oraclePath, config) {
    this.oraclePath = oraclePath;
    this.config = config;
    this.collection = null;
    this._bridge = null;
  }

  setCollection(collection) {
    this.collection = collection;
  }

  _getBridge() {
    if (!this._bridge) {
      const { IDEBridge } = require(`${this.oraclePath}/src/ide/bridge`);
      this._bridge = new IDEBridge({
        minCoherency: this.config.get('minCoherency', 0.7),
        maxDiagnostics: this.config.get('maxDiagnostics', 20),
        enableDebug: this.config.get('enableDebugOracle', true),
      });
    }
    return this._bridge;
  }

  /**
   * Analyze a document and update diagnostics.
   * @param {vscode.TextDocument} document
   */
  analyze(document) {
    if (!this.collection) return;

    try {
      const bridge = this._getBridge();
      const code = document.getText();
      const language = document.languageId;
      const uri = document.uri.toString();

      const diagnostics = bridge.getDiagnostics({ code, language, uri });

      const vscodeDiags = diagnostics.map(d => {
        const range = new vscode.Range(
          new vscode.Position(d.range?.start?.line || 0, d.range?.start?.character || 0),
          new vscode.Position(d.range?.end?.line || 0, d.range?.end?.character || 999)
        );

        const severity = this._mapSeverity(d.severity);
        const diag = new vscode.Diagnostic(range, d.message, severity);
        diag.source = 'Oracle';
        diag.code = d.code || d.type;

        if (d.data) {
          diag.data = d.data;
        }

        return diag;
      });

      this.collection.set(document.uri, vscodeDiags);
    } catch (err) {
      // Diagnostics should never crash — fail silently
      console.error('Oracle diagnostics error:', err.message);
    }
  }

  /**
   * Refresh diagnostics for all open documents.
   */
  refreshAll() {
    if (this.collection) {
      this.collection.clear();
    }
    for (const editor of vscode.window.visibleTextEditors) {
      this.analyze(editor.document);
    }
  }

  _mapSeverity(severity) {
    switch (severity) {
      case 1: return vscode.DiagnosticSeverity.Error;
      case 2: return vscode.DiagnosticSeverity.Warning;
      case 3: return vscode.DiagnosticSeverity.Information;
      case 4: return vscode.DiagnosticSeverity.Hint;
      default: return vscode.DiagnosticSeverity.Information;
    }
  }
}

module.exports = { DiagnosticsProvider };
