/**
 * Code Action Provider — quick-fix suggestions from debug oracle + pattern library.
 */

const vscode = require('vscode');

class CodeActionProvider {
  constructor(oraclePath) {
    this.oraclePath = oraclePath;
    this._bridge = null;
  }

  _getBridge() {
    if (!this._bridge) {
      const { IDEBridge } = require(`${this.oraclePath}/src/ide/bridge`);
      this._bridge = new IDEBridge();
    }
    return this._bridge;
  }

  /**
   * Provide code actions for diagnostics at the given range.
   * @param {vscode.TextDocument} document
   * @param {vscode.Range} range
   * @param {vscode.CodeActionContext} context
   * @returns {vscode.CodeAction[]}
   */
  provideCodeActions(document, range, context) {
    const actions = [];

    try {
      const bridge = this._getBridge();
      const code = document.getText();
      const language = document.languageId;

      // Get oracle code actions
      const oracleActions = bridge.getCodeActions({
        code,
        language,
        range: {
          start: { line: range.start.line, character: range.start.character },
          end: { line: range.end.line, character: range.end.character },
        },
        diagnostics: context.diagnostics
          .filter(d => d.source === 'Oracle')
          .map(d => ({ message: d.message, code: d.code, data: d.data })),
      });

      for (const action of oracleActions) {
        const vsAction = new vscode.CodeAction(
          action.title,
          action.kind === 'quickfix' ? vscode.CodeActionKind.QuickFix : vscode.CodeActionKind.Refactor
        );

        if (action.edit) {
          const edit = new vscode.WorkspaceEdit();
          const editRange = new vscode.Range(
            new vscode.Position(action.edit.range.start.line, action.edit.range.start.character),
            new vscode.Position(action.edit.range.end.line, action.edit.range.end.character)
          );
          edit.replace(document.uri, editRange, action.edit.newText);
          vsAction.edit = edit;
        }

        if (action.command) {
          vsAction.command = {
            command: action.command.id,
            title: action.command.title,
            arguments: action.command.arguments,
          };
        }

        vsAction.diagnostics = context.diagnostics.filter(d => d.source === 'Oracle');
        actions.push(vsAction);
      }

      // Add debug oracle search for error diagnostics
      for (const diag of context.diagnostics) {
        if (diag.severity === vscode.DiagnosticSeverity.Error) {
          const debugAction = new vscode.CodeAction(
            `Oracle: Search for fix "${diag.message.slice(0, 50)}..."`,
            vscode.CodeActionKind.QuickFix
          );
          debugAction.command = {
            command: 'oracle.debugSearch',
            title: 'Search Debug Oracle',
            arguments: [diag.message],
          };
          actions.push(debugAction);
        }
      }
    } catch {
      // Code actions should never crash
    }

    return actions;
  }
}

module.exports = { CodeActionProvider };
