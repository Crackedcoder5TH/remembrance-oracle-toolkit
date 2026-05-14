/**
 * Remembrance Oracle — VS Code Extension
 *
 * Pattern memory + code quality scoring for your codebase.
 *
 * Features:
 * - Inline coherency scoring with diagnostics on save
 * - Pattern search via Oracle API
 * - Cascade resonance via Void Compressor
 * - Status bar coherency indicator with color coding
 *
 * Activation: onStartupFinished
 */

import * as vscode from 'vscode';
import { scoreCode, CoherencyResult } from './scorer';
import {
  scoreFileCommand,
  searchPatternCommand,
  cascadeFileCommand,
  resolvePatternCommand,
  disposeCommands,
} from './commands';

// ─── State ───

let statusBarItem: vscode.StatusBarItem;
let diagnosticCollection: vscode.DiagnosticCollection;

// ─── Activation ───

export function activate(context: vscode.ExtensionContext): void {
  // Create diagnostic collection for coherency warnings
  diagnosticCollection = vscode.languages.createDiagnosticCollection('remembrance');
  context.subscriptions.push(diagnosticCollection);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('remembrance.scoreFile', async () => {
      const result = await scoreFileCommand();
      if (result) {
        updateStatusBar(result);
        updateDiagnostics(vscode.window.activeTextEditor?.document, result);
      }
    }),
    vscode.commands.registerCommand('remembrance.searchPattern', searchPatternCommand),
    vscode.commands.registerCommand('remembrance.cascadeFile', cascadeFileCommand),
    vscode.commands.registerCommand('remembrance.resolvePattern', resolvePatternCommand),
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'remembrance.scoreFile';
  statusBarItem.tooltip = 'Remembrance Oracle — click to score current file';
  statusBarItem.text = '$(database) Remembrance: ---';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Auto-score on file save (if enabled)
  const config = vscode.workspace.getConfiguration('remembrance');
  if (config.get<boolean>('autoScore', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        autoScoreDocument(doc);
      })
    );
  }

  // Score active document on activation
  if (vscode.window.activeTextEditor) {
    autoScoreDocument(vscode.window.activeTextEditor.document);
  }

  // Update status bar when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        autoScoreDocument(editor.document);
      } else {
        statusBarItem.text = '$(database) Remembrance: ---';
      }
    })
  );

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('remembrance')) {
        // Re-read config — auto-score toggle changes take effect on next save
      }
    })
  );
}

// ─── Deactivation ───

export function deactivate(): void {
  disposeCommands();
  diagnosticCollection?.dispose();
}

// ─── Auto-Scoring ───

/**
 * Score a document and update the status bar + diagnostics.
 * Runs the local offline scorer — no API calls.
 */
function autoScoreDocument(doc: vscode.TextDocument): void {
  const supportedLanguages = [
    'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
    'python', 'go', 'rust', 'java', 'c', 'cpp', 'csharp',
  ];

  if (!supportedLanguages.includes(doc.languageId)) {
    return;
  }

  const code = doc.getText();
  if (!code.trim()) {
    statusBarItem.text = '$(database) Remembrance: ---';
    diagnosticCollection.delete(doc.uri);
    return;
  }

  const result = scoreCode(code, doc.languageId);
  updateStatusBar(result);
  updateDiagnostics(doc, result);
}

// ─── Status Bar ───

/**
 * Update the status bar item with the coherency score.
 * Color coding:
 *   green  (>= 0.68) — good or excellent
 *   yellow (>= 0.50) — acceptable
 *   red    (< 0.50)  — needs work or poor
 */
function updateStatusBar(result: CoherencyResult): void {
  const score = result.total;
  const display = score.toFixed(3);

  statusBarItem.text = `$(database) Remembrance: ${display}`;

  if (score >= 0.68) {
    statusBarItem.backgroundColor = undefined; // default (no highlight = green/normal)
    statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
    statusBarItem.tooltip = `Coherency: ${display} (${result.verdict}) — click to see details`;
  } else if (score >= 0.50) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.color = undefined;
    statusBarItem.tooltip = `Coherency: ${display} (${result.verdict}) — some dimensions need attention`;
  } else {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.color = undefined;
    statusBarItem.tooltip = `Coherency: ${display} (${result.verdict}) — significant issues detected`;
  }
}

// ─── Diagnostics ───

/**
 * Update VS Code diagnostics based on coherency scoring.
 * Creates warnings for dimensions that score below the configured threshold.
 */
function updateDiagnostics(doc: vscode.TextDocument | undefined, result: CoherencyResult): void {
  if (!doc) return;

  const config = vscode.workspace.getConfiguration('remembrance');
  const threshold = config.get<number>('threshold', 0.68);
  const diagnostics: vscode.Diagnostic[] = [];

  // File-level diagnostic for overall score
  if (result.total < threshold) {
    const range = new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
    const diag = new vscode.Diagnostic(
      range,
      `Coherency score ${result.total.toFixed(3)} is below threshold ${threshold} (${result.verdict})`,
      result.total < 0.50 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information
    );
    diag.source = 'Remembrance';
    diag.code = 'coherency-threshold';
    diagnostics.push(diag);
  }

  // Per-dimension diagnostics for low-scoring dimensions
  const dimEntries: Array<{ key: string; dim: { score: number; label: string; detail: string } }> = [
    { key: 'syntax', dim: result.dimensions.syntax },
    { key: 'completeness', dim: result.dimensions.completeness },
    { key: 'readability', dim: result.dimensions.readability },
    { key: 'simplicity', dim: result.dimensions.simplicity },
    { key: 'security', dim: result.dimensions.security },
    { key: 'consistency', dim: result.dimensions.consistency },
    { key: 'testability', dim: result.dimensions.testability },
  ];

  for (const { key, dim } of dimEntries) {
    if (dim.score < 0.50) {
      const range = new vscode.Range(0, 0, 0, doc.lineAt(0).text.length);
      const severity = dim.score < 0.30
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
      const diag = new vscode.Diagnostic(
        range,
        `${dim.label}: ${dim.score.toFixed(3)} — ${dim.detail}`,
        severity
      );
      diag.source = 'Remembrance';
      diag.code = `coherency-${key}`;
      diagnostics.push(diag);
    }
  }

  diagnosticCollection.set(doc.uri, diagnostics);
}
