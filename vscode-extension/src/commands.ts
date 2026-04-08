/**
 * Command Implementations — handles all Remembrance commands.
 *
 * - scoreFileCommand:    Score the active file, show dimension breakdown in output panel
 * - searchPatternCommand: Input box -> Oracle search -> quick pick result list
 * - cascadeFileCommand:   Send active file to Void Compressor, show cascade resonance
 * - resolvePatternCommand: Input box -> Oracle resolve -> show PULL/EVOLVE/GENERATE decision
 */

import * as vscode from 'vscode';
import { scoreCode, CoherencyResult } from './scorer';
import { OracleClient, VoidClient } from './api-client';

// ─── Shared State ───

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Remembrance Oracle');
  }
  return outputChannel;
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('remembrance');
}

function getOracleClient(): OracleClient {
  const config = getConfig();
  return new OracleClient(config.get<string>('oracleUrl', 'http://localhost:3000'));
}

function getVoidClient(): VoidClient {
  const config = getConfig();
  return new VoidClient(config.get<string>('voidUrl', 'http://localhost:3001'));
}

// ─── Score File Command ───

/**
 * Score the active file and display a detailed dimension breakdown.
 * Uses the local offline scorer — no API calls needed.
 */
export async function scoreFileCommand(): Promise<CoherencyResult | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor — open a file to score.');
    return undefined;
  }

  const doc = editor.document;
  const code = doc.getText();
  const language = doc.languageId;

  if (!code.trim()) {
    vscode.window.showInformationMessage('File is empty — nothing to score.');
    return undefined;
  }

  const result = scoreCode(code, language);
  const channel = getOutputChannel();

  // Build output
  channel.clear();
  channel.appendLine('=== Remembrance Coherency Score ===');
  channel.appendLine('');
  channel.appendLine(`File:     ${doc.fileName}`);
  channel.appendLine(`Language: ${language}`);
  channel.appendLine(`Lines:    ${doc.lineCount}`);
  channel.appendLine('');
  channel.appendLine(`TOTAL:    ${result.total.toFixed(3)}  (${result.verdict})`);
  channel.appendLine('');
  channel.appendLine('--- Dimensions ---');

  const dims = result.dimensions;
  const entries: Array<{ label: string; score: number; detail: string }> = [
    { label: dims.syntax.label, score: dims.syntax.score, detail: dims.syntax.detail },
    { label: dims.completeness.label, score: dims.completeness.score, detail: dims.completeness.detail },
    { label: dims.readability.label, score: dims.readability.score, detail: dims.readability.detail },
    { label: dims.simplicity.label, score: dims.simplicity.score, detail: dims.simplicity.detail },
    { label: dims.security.label, score: dims.security.score, detail: dims.security.detail },
    { label: dims.consistency.label, score: dims.consistency.score, detail: dims.consistency.detail },
    { label: dims.testability.label, score: dims.testability.score, detail: dims.testability.detail },
  ];

  for (const entry of entries) {
    const bar = makeBar(entry.score);
    const padded = entry.label.padEnd(14);
    channel.appendLine(`  ${padded} ${entry.score.toFixed(3)}  ${bar}  ${entry.detail}`);
  }

  channel.appendLine('');
  channel.appendLine(`Verdict: ${result.verdict.toUpperCase()}`);
  channel.show(true);

  return result;
}

/**
 * Create a simple ASCII bar for a 0-1 score.
 */
function makeBar(score: number): string {
  const filled = Math.round(score * 20);
  const empty = 20 - filled;
  return '[' + '#'.repeat(filled) + '-'.repeat(empty) + ']';
}

// ─── Search Pattern Command ───

/**
 * Search for patterns via the Oracle API.
 * Shows an input box, then displays results in a quick pick list.
 */
export async function searchPatternCommand(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Search Oracle patterns',
    placeHolder: 'e.g., debounce, retry, cache, sort',
  });
  if (!query) return;

  const client = getOracleClient();

  try {
    const results = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Searching patterns...' },
      () => client.search(query, { limit: 20 })
    );

    if (results.length === 0) {
      vscode.window.showInformationMessage(`No patterns found for "${query}".`);
      return;
    }

    const items = results.map(r => ({
      label: `$(symbol-function) ${r.name || r.description || 'untitled'}`,
      description: `${r.language} | coherency: ${(r.coherency || 0).toFixed(3)}`,
      detail: (r.tags || []).join(', '),
      pattern: r,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `${results.length} pattern(s) found for "${query}"`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected && selected.pattern.code) {
      const doc = await vscode.workspace.openTextDocument({
        content: [
          `// Oracle Pattern: ${selected.pattern.name || 'untitled'}`,
          `// Coherency: ${(selected.pattern.coherency || 0).toFixed(3)}`,
          `// Language: ${selected.pattern.language || 'unknown'}`,
          `// Tags: ${(selected.pattern.tags || []).join(', ')}`,
          '',
          selected.pattern.code,
        ].join('\n'),
        language: selected.pattern.language || 'javascript',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Pattern search failed: ${msg}`);
  }
}

// ─── Cascade File Command ───

/**
 * Send the active file to the Void Compressor for cascade resonance analysis.
 * Shows how well the file's code resonates with known patterns.
 */
export async function cascadeFileCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor — open a file to cascade.');
    return;
  }

  const doc = editor.document;
  const code = doc.getText();
  const language = doc.languageId;

  if (!code.trim()) {
    vscode.window.showInformationMessage('File is empty — nothing to cascade.');
    return;
  }

  const client = getVoidClient();

  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Running cascade resonance...' },
      () => client.cascade(code, language)
    );

    const channel = getOutputChannel();
    channel.clear();
    channel.appendLine('=== Cascade Resonance Analysis ===');
    channel.appendLine('');
    channel.appendLine(`File:      ${doc.fileName}`);
    channel.appendLine(`Language:  ${language}`);
    channel.appendLine(`Resonance: ${result.resonance.toFixed(3)}`);
    channel.appendLine('');

    if (result.patterns && result.patterns.length > 0) {
      channel.appendLine('--- Resonating Patterns ---');
      for (const p of result.patterns) {
        channel.appendLine(`  ${p.name.padEnd(30)} coherency: ${p.coherency.toFixed(3)}  contribution: ${p.resonanceContribution.toFixed(3)}`);
      }
      channel.appendLine('');
    }

    if (result.suggestions && result.suggestions.length > 0) {
      channel.appendLine('--- Suggestions ---');
      for (const s of result.suggestions) {
        channel.appendLine(`  - ${s}`);
      }
      channel.appendLine('');
    }

    channel.show(true);

    const icon = result.resonance >= 0.68 ? '$(pass)' : result.resonance >= 0.50 ? '$(warning)' : '$(error)';
    vscode.window.showInformationMessage(
      `Cascade resonance: ${result.resonance.toFixed(3)} — ${result.patterns?.length || 0} pattern(s) matched`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Cascade resonance failed: ${msg}`);
  }
}

// ─── Resolve Pattern Command ───

/**
 * Resolve a description against the Oracle.
 * Returns a PULL/EVOLVE/GENERATE decision with the matching pattern if found.
 */
export async function resolvePatternCommand(): Promise<void> {
  const description = await vscode.window.showInputBox({
    prompt: 'Describe what you need',
    placeHolder: 'e.g., function to debounce API calls with configurable delay',
  });
  if (!description) return;

  const language = vscode.window.activeTextEditor?.document.languageId || 'javascript';
  const client = getOracleClient();

  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Resolving pattern...' },
      () => client.resolve(description, language)
    );

    if (result.decision === 'GENERATE') {
      vscode.window.showInformationMessage(
        `Oracle: GENERATE — no matching pattern found. Write new code. (${result.reason})`
      );
      return;
    }

    const actionLabel = result.decision === 'PULL' ? 'Use as-is' : 'Adapt and evolve';

    const choice = await vscode.window.showInformationMessage(
      `Oracle: ${result.decision} — "${result.pattern?.name || 'match'}" (confidence: ${result.confidence.toFixed(3)})`,
      actionLabel,
      'View Code',
      'Dismiss'
    );

    if ((choice === actionLabel || choice === 'View Code') && result.pattern?.code) {
      const doc = await vscode.workspace.openTextDocument({
        content: [
          `// Oracle ${result.decision}: ${result.pattern.name || 'untitled'}`,
          `// Confidence: ${result.confidence.toFixed(3)}`,
          `// Decision: ${result.decision} — ${result.reason}`,
          `// Language: ${result.pattern.language || language}`,
          '',
          result.pattern.code,
        ].join('\n'),
        language: result.pattern.language || language,
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Pattern resolve failed: ${msg}`);
  }
}

/**
 * Dispose the output channel when the extension deactivates.
 */
export function disposeCommands(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
