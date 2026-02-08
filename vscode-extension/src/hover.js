/**
 * Hover Provider — show pattern info when hovering over function names.
 */

const vscode = require('vscode');

class HoverProvider {
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
   * Provide hover information for a position in the document.
   * @param {vscode.TextDocument} document
   * @param {vscode.Position} position
   * @returns {vscode.Hover|null}
   */
  provideHover(document, position) {
    try {
      const bridge = this._getBridge();
      const code = document.getText();
      const language = document.languageId;

      // Get the word at the hover position
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) return null;
      const word = document.getText(wordRange);

      const hoverInfo = bridge.getHoverInfo({
        code,
        language,
        position: { line: position.line, character: position.character },
        word,
      });

      if (!hoverInfo || !hoverInfo.contents) return null;

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;

      // Build hover content
      if (hoverInfo.patternName) {
        markdown.appendMarkdown(`**Oracle Pattern: ${hoverInfo.patternName}**\n\n`);
      }
      if (hoverInfo.coherency != null) {
        const icon = hoverInfo.coherency >= 0.8 ? '$(pass)' : hoverInfo.coherency >= 0.6 ? '$(warning)' : '$(error)';
        markdown.appendMarkdown(`Coherency: ${icon} ${hoverInfo.coherency.toFixed(3)}\n\n`);
      }
      if (hoverInfo.description) {
        markdown.appendMarkdown(`${hoverInfo.description}\n\n`);
      }
      if (hoverInfo.tags && hoverInfo.tags.length > 0) {
        markdown.appendMarkdown(`Tags: ${hoverInfo.tags.map(t => `\`${t}\``).join(' ')}\n\n`);
      }
      if (hoverInfo.alternatives && hoverInfo.alternatives.length > 0) {
        markdown.appendMarkdown(`**Alternatives:**\n`);
        for (const alt of hoverInfo.alternatives.slice(0, 3)) {
          markdown.appendMarkdown(`- ${alt.name} (coherency: ${alt.coherency?.toFixed(3) || '?'})\n`);
        }
      }
      if (hoverInfo.contents) {
        markdown.appendMarkdown(hoverInfo.contents);
      }

      return new vscode.Hover(markdown, wordRange);
    } catch {
      return null;
    }
  }
}

module.exports = { HoverProvider };
