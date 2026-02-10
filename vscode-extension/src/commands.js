/**
 * Command Handler — implements all Oracle commands for the VS Code command palette.
 */

const vscode = require('vscode');

class CommandHandler {
  constructor(oraclePath, config) {
    this.oraclePath = oraclePath;
    this.config = config;
    this._oracle = null;
  }

  _getOracle() {
    if (!this._oracle) {
      const { RemembranceOracle } = require(`${this.oraclePath}/src/api/oracle`);
      this._oracle = new RemembranceOracle({ autoSeed: false });
    }
    return this._oracle;
  }

  /**
   * Search for patterns — opens quick pick with results.
   */
  async search() {
    const query = await vscode.window.showInputBox({
      prompt: 'Search Oracle patterns',
      placeHolder: 'e.g., debounce, sort algorithm, cache',
    });
    if (!query) return;

    const oracle = this._getOracle();
    const results = oracle.search(query, { limit: 15 });

    if (results.length === 0) {
      vscode.window.showInformationMessage('No patterns found.');
      return;
    }

    const items = results.map(r => ({
      label: `$(symbol-function) ${r.name || r.description || 'untitled'}`,
      description: `${r.language} | coherency: ${(r.coherency || 0).toFixed(3)}`,
      detail: (r.tags || []).join(', '),
      pattern: r,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${results.length} pattern(s) found`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      await this._showPatternPreview(selected.pattern);
    }
  }

  /**
   * Smart search with intent parsing and typo correction.
   */
  async smartSearch() {
    const query = await vscode.window.showInputBox({
      prompt: 'Smart search (supports typos, abbreviations, intent signals)',
      placeHolder: 'e.g., fast sotr fn, safe validaton, async fetch cb',
    });
    if (!query) return;

    const oracle = this._getOracle();
    const result = oracle.smartSearch(query, { limit: 15 });

    // Show correction if applied
    if (result.corrections) {
      vscode.window.showInformationMessage(`Auto-corrected: "${query}" -> "${result.corrections}"`);
    }

    if (result.results.length === 0) {
      let msg = 'No patterns found.';
      if (result.suggestions.length > 0) {
        msg += ` Try: ${result.suggestions.slice(0, 2).join(', ')}`;
      }
      vscode.window.showInformationMessage(msg);
      return;
    }

    const intentLabel = result.intent.intents.length > 0
      ? ` [${result.intent.intents.map(i => i.name).join(', ')}]`
      : '';

    const items = result.results.map(r => ({
      label: `$(symbol-function) ${r.name || r.description || 'untitled'}`,
      description: `${r.language || '?'} | match: ${(r.matchScore || 0).toFixed(3)}${r.intentBoost > 0 ? ' +boost' : ''}`,
      detail: (r.tags || []).join(', ') + (r.matchedIntents?.length > 0 ? ` [${r.matchedIntents.join(', ')}]` : ''),
      pattern: r,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${result.results.length} result(s)${intentLabel}`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      await this._showPatternPreview(selected.pattern);
    }
  }

  /**
   * Submit the current selection as a new pattern.
   */
  async submitSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const code = editor.document.getText(selection);
    if (!code.trim()) {
      vscode.window.showWarningMessage('Select code to submit');
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: 'Pattern name',
      placeHolder: 'e.g., quickSort, debounce, memoize',
    });
    if (!name) return;

    const tags = await vscode.window.showInputBox({
      prompt: 'Tags (comma-separated)',
      placeHolder: 'e.g., algorithm, sort, performance',
    });

    const oracle = this._getOracle();
    const result = oracle.submit(code, {
      language: editor.document.languageId,
      name,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      description: `Submitted from VS Code: ${name}`,
    });

    if (result.stored) {
      vscode.window.showInformationMessage(
        `Pattern "${name}" stored (coherency: ${result.coherency.total.toFixed(3)})`
      );
    } else {
      vscode.window.showWarningMessage(
        `Pattern rejected: ${result.reason || 'below threshold'}`
      );
    }
  }

  /**
   * Capture an error-fix pair in the debug oracle.
   */
  async debugCapture() {
    const errorMessage = await vscode.window.showInputBox({
      prompt: 'Error message to capture',
      placeHolder: 'e.g., TypeError: Cannot read property of undefined',
    });
    if (!errorMessage) return;

    const editor = vscode.window.activeTextEditor;
    let fixCode = '';
    if (editor && !editor.selection.isEmpty) {
      fixCode = editor.document.getText(editor.selection);
    } else {
      const input = await vscode.window.showInputBox({
        prompt: 'Fix code (or select code in editor first)',
        placeHolder: 'The code that fixes this error',
      });
      fixCode = input || '';
    }
    if (!fixCode) return;

    const fixDescription = await vscode.window.showInputBox({
      prompt: 'Describe the fix',
      placeHolder: 'e.g., Add null check before accessing property',
    });

    const oracle = this._getOracle();
    const result = oracle.debugCapture({
      errorMessage,
      fixCode,
      fixDescription: fixDescription || '',
      language: editor?.document.languageId || 'javascript',
    });

    if (result.captured) {
      const variants = result.variants || 0;
      vscode.window.showInformationMessage(
        `Debug pattern captured (${variants} variant${variants !== 1 ? 's' : ''} generated)`
      );
    } else {
      vscode.window.showWarningMessage(`Capture failed: ${result.error || 'unknown error'}`);
    }
  }

  /**
   * Search for fixes matching an error.
   */
  async debugSearch(errorMessage) {
    if (!errorMessage) {
      // Check if there's selected text
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        errorMessage = editor.document.getText(editor.selection);
      } else {
        errorMessage = await vscode.window.showInputBox({
          prompt: 'Error message to find fixes for',
          placeHolder: 'Paste the error message',
        });
      }
    }
    if (!errorMessage) return;

    const oracle = this._getOracle();
    const results = oracle.debugSearch({ errorMessage, limit: 10 });

    if (results.length === 0) {
      vscode.window.showInformationMessage('No debug fixes found for this error.');
      return;
    }

    const items = results.map(r => ({
      label: `$(lightbulb) ${r.fixDescription || r.errorClass || 'Fix'}`,
      description: `confidence: ${(r.confidence || 0).toFixed(3)} | ${r.language || '?'}`,
      detail: `Error: ${(r.errorMessage || '').slice(0, 80)}`,
      fix: r,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${results.length} fix(es) found`,
    });

    if (selected && selected.fix.fixCode) {
      const doc = await vscode.workspace.openTextDocument({
        content: selected.fix.fixCode,
        language: selected.fix.language || 'javascript',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  }

  /**
   * Resolve — smart pull/evolve/generate decision.
   */
  async resolve() {
    const description = await vscode.window.showInputBox({
      prompt: 'Describe what you need',
      placeHolder: 'e.g., function to debounce API calls',
    });
    if (!description) return;

    const language = vscode.window.activeTextEditor?.document.languageId || 'javascript';

    const oracle = this._getOracle();
    const result = oracle.resolve({ description, language });

    if (result.decision === 'GENERATE') {
      vscode.window.showInformationMessage('Oracle: GENERATE — no matching pattern, write new code.');
      return;
    }

    const action = result.decision === 'PULL' ? 'Use as-is' : 'Adapt and evolve';
    const pattern = result.pattern;

    const choice = await vscode.window.showInformationMessage(
      `Oracle: ${result.decision} — "${pattern.name}" (coherency: ${(result.confidence || 0).toFixed(3)})`,
      action,
      'View Code',
      'Dismiss'
    );

    if (choice === action || choice === 'View Code') {
      await this._showPatternPreview(pattern);
    }
  }

  /**
   * Show store statistics in a notification.
   */
  async showStats() {
    const oracle = this._getOracle();
    const stats = oracle.stats();

    const lines = [
      `Patterns: ${stats.totalEntries || 0}`,
      `Avg Coherency: ${(stats.averageCoherency || 0).toFixed(3)}`,
      `Languages: ${Object.entries(stats.byLanguage || {}).map(([k, v]) => `${k}(${v})`).join(', ')}`,
    ];

    vscode.window.showInformationMessage(`Oracle Stats: ${lines.join(' | ')}`);
  }

  /**
   * Insert a pattern at the current cursor position.
   */
  async insertPattern(pattern) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !pattern?.code) return;

    await editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, pattern.code);
    });
  }

  /**
   * Show a pattern in a preview document.
   */
  async _showPatternPreview(pattern) {
    const content = [
      `// Oracle Pattern: ${pattern.name || 'untitled'}`,
      `// Coherency: ${(pattern.coherency || 0).toFixed(3)}`,
      `// Language: ${pattern.language || 'unknown'}`,
      `// Tags: ${(pattern.tags || []).join(', ')}`,
      '',
      pattern.code || '// No code available',
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({
      content,
      language: pattern.language || 'javascript',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
}

module.exports = { CommandHandler };
