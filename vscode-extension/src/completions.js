/**
 * Completion Provider — suggest proven patterns as you type.
 */

const vscode = require('vscode');

class CompletionProvider {
  constructor(oraclePath) {
    this.oraclePath = oraclePath;
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
   * Provide completion items based on the current context.
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @returns {vscode.CompletionItem[]}
   */
  provideCompletionItems(document, position) {
    try {
      const oracle = this._getOracle();

      // Get the current line text up to cursor
      const lineText = document.lineAt(position.line).text;
      const textBefore = lineText.substring(0, position.character);

      // Extract the partial word being typed
      const wordMatch = textBefore.match(/(\w+)$/);
      if (!wordMatch || wordMatch[1].length < 3) return [];

      const partial = wordMatch[1];
      const language = document.languageId;

      // Search oracle for matching patterns
      const results = oracle.search(partial, { limit: 8, language });
      if (results.length === 0) return [];

      return results.map((r, i) => {
        const item = new vscode.CompletionItem(
          r.name || r.description || 'pattern',
          vscode.CompletionItemKind.Snippet
        );

        item.detail = `Oracle (${(r.coherency || 0).toFixed(2)})`;
        item.documentation = new vscode.MarkdownString(
          `**${r.name || 'Pattern'}**\n\n` +
          `Coherency: ${(r.coherency || 0).toFixed(3)}\n\n` +
          `Language: ${r.language}\n\n` +
          `Tags: ${(r.tags || []).join(', ')}\n\n` +
          '```' + (r.language || 'javascript') + '\n' + (r.code || '') + '\n```'
        );

        item.insertText = new vscode.SnippetString(r.code || '');
        item.sortText = String(i).padStart(3, '0');
        item.filterText = `${partial} ${r.name} ${(r.tags || []).join(' ')}`;

        return item;
      });
    } catch {
      return [];
    }
  }
}

module.exports = { CompletionProvider };
