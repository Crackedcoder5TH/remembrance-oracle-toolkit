/**
 * Remembrance Oracle — VS Code Extension
 *
 * Integrates the Oracle's proven code memory into the editor:
 * - Diagnostics: covenant violations, coherency warnings, pattern suggestions
 * - Hover: pattern info on function names
 * - Code Actions: debug fixes, pattern upgrades, reflection refinement
 * - Completions: context-aware pattern suggestions
 * - Sidebar: pattern browser, debug fixes, statistics
 * - Commands: search, smart-search, submit, resolve, debug capture/search
 */

const vscode = require('vscode');
const path = require('path');
const { DiagnosticsProvider } = require('./diagnostics');
const { SidebarProvider } = require('./sidebar');
const { CommandHandler } = require('./commands');
const { HoverProvider } = require('./hover');
const { CodeActionProvider } = require('./code-actions');
const { CompletionProvider } = require('./completions');

let diagnosticsProvider;
let sidebarProvider;
let commandHandler;

/**
 * Extension activation — called when VS Code loads the extension.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const config = vscode.workspace.getConfiguration('oracle');

  // Resolve oracle toolkit path — look for it in workspace or installed location
  const oraclePath = resolveOraclePath();
  if (!oraclePath) {
    vscode.window.showWarningMessage(
      'Remembrance Oracle toolkit not found. Install it or open a project that contains it.'
    );
    return;
  }

  // Initialize providers
  diagnosticsProvider = new DiagnosticsProvider(oraclePath, config);
  sidebarProvider = new SidebarProvider(oraclePath, config);
  commandHandler = new CommandHandler(oraclePath, config);

  // Register diagnostics collection
  const diagCollection = vscode.languages.createDiagnosticCollection('oracle');
  context.subscriptions.push(diagCollection);
  diagnosticsProvider.setCollection(diagCollection);

  // Register hover provider for supported languages
  const supportedLanguages = ['javascript', 'typescript', 'python', 'go', 'rust'];
  const hoverProvider = new HoverProvider(oraclePath);
  const codeActionProvider = new CodeActionProvider(oraclePath);
  const completionProvider = new CompletionProvider(oraclePath);

  for (const lang of supportedLanguages) {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(lang, hoverProvider)
    );
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(lang, codeActionProvider, {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.Refactor,
        ],
      })
    );
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(lang, completionProvider, '.', ' ')
    );
  }

  // Register sidebar views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('oracle-patterns', sidebarProvider.patternsView),
    vscode.window.registerTreeDataProvider('oracle-debug', sidebarProvider.debugView),
    vscode.window.registerTreeDataProvider('oracle-stats', sidebarProvider.statsView)
  );

  // Register commands
  const commands = [
    ['oracle.search', () => commandHandler.search()],
    ['oracle.smartSearch', () => commandHandler.smartSearch()],
    ['oracle.submit', () => commandHandler.submitSelection()],
    ['oracle.debugCapture', () => commandHandler.debugCapture()],
    ['oracle.debugSearch', () => commandHandler.debugSearch()],
    ['oracle.resolve', () => commandHandler.resolve()],
    ['oracle.stats', () => commandHandler.showStats()],
    ['oracle.refreshDiagnostics', () => diagnosticsProvider.refreshAll()],
    ['oracle.insertPattern', (item) => commandHandler.insertPattern(item)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }

  // Auto-analyze on save
  if (config.get('autoAnalyze', true)) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (supportedLanguages.includes(doc.languageId)) {
          diagnosticsProvider.analyze(doc);
        }
      })
    );
  }

  // Analyze active document on activation
  if (vscode.window.activeTextEditor) {
    const doc = vscode.window.activeTextEditor.document;
    if (supportedLanguages.includes(doc.languageId)) {
      diagnosticsProvider.analyze(doc);
    }
  }

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(database) Oracle';
  statusBar.tooltip = 'Remembrance Oracle — Click to search';
  statusBar.command = 'oracle.smartSearch';
  statusBar.show();
  context.subscriptions.push(statusBar);

  vscode.window.showInformationMessage('Remembrance Oracle activated');
}

function deactivate() {
  diagnosticsProvider = null;
  sidebarProvider = null;
  commandHandler = null;
}

/**
 * Find the remembrance-oracle-toolkit installation.
 * Checks: workspace root, parent directories, global install.
 */
function resolveOraclePath() {
  // Check workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, 'src', 'api', 'oracle.js');
    try {
      require.resolve(candidate);
      return folder.uri.fsPath;
    } catch { /* not here */ }

    // Check node_modules
    const nmCandidate = path.join(folder.uri.fsPath, 'node_modules', 'remembrance-oracle-toolkit');
    try {
      require.resolve(path.join(nmCandidate, 'src', 'api', 'oracle.js'));
      return nmCandidate;
    } catch { /* not here */ }
  }

  // Check relative to this extension
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const candidate = path.join(extensionRoot, 'src', 'api', 'oracle.js');
  try {
    require.resolve(candidate);
    return extensionRoot;
  } catch { /* not here */ }

  return null;
}

module.exports = { activate, deactivate, resolveOraclePath };
