/**
 * MCP Auto-Installation — Register the oracle MCP server across AI editors.
 *
 * Supports:
 *   - Claude Desktop (macOS, Linux, Windows)
 *   - Cursor (global + project-level)
 *   - VS Code (project-level .vscode/mcp.json)
 *   - Cline (VS Code extension)
 *   - Continue (VS Code extension)
 *   - Claude Code (project-level .mcp.json)
 *
 * All editors use the same { mcpServers: { name: { command, args } } } format.
 * No external dependencies — pure Node built-ins.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_NAME = 'remembrance-oracle';

// ─── Config Paths ───

function getConfigPaths() {
  const home = os.homedir();
  const platform = process.platform;
  const cwd = process.cwd();

  const paths = {
    claude: platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : platform === 'win32'
        ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
        : path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    cursor: path.join(home, '.cursor', 'mcp.json'),
    cursorProject: path.join(cwd, '.cursor', 'mcp.json'),
    vscode: path.join(cwd, '.vscode', 'mcp.json'),
    claudeCode: path.join(cwd, '.mcp.json'),
  };

  return paths;
}

// ─── Server Config ───

function getServerConfig(options = {}) {
  const command = options.command || 'node';
  const serverPath = options.serverPath || path.resolve(__dirname, '..', 'cli.js');

  // Determine args based on command
  if (command === 'npx') {
    return {
      command: 'npx',
      args: ['-y', 'remembrance-oracle-toolkit', 'mcp'],
    };
  }

  return {
    command,
    args: [serverPath, 'mcp'],
  };
}

// ─── Config File Updater ───

function updateConfigFile(filePath, serverConfig) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let config = { mcpServers: {} };
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      try {
        config = JSON.parse(content);
        if (!config.mcpServers) config.mcpServers = {};
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[mcp-install:updateConfigFile] silent failure:', e?.message || e);
        // Corrupted config — start fresh but preserve other fields
        config = { mcpServers: {} };
      }
    }

    config.mcpServers[SERVER_NAME] = serverConfig;
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, path: filePath, error: err.message };
  }
}

// ─── Remove from Config ───

function removeFromConfig(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { success: true, path: filePath, skipped: true };

    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);
    if (!config.mcpServers || !config.mcpServers[SERVER_NAME]) {
      return { success: true, path: filePath, skipped: true };
    }

    delete config.mcpServers[SERVER_NAME];
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, path: filePath, error: err.message };
  }
}

// ─── Check Installation Status ───

function checkInstallation() {
  const paths = getConfigPaths();
  const status = {};

  for (const [editor, configPath] of Object.entries(paths)) {
    try {
      if (!fs.existsSync(configPath)) {
        status[editor] = { installed: false, path: configPath };
        continue;
      }
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      const installed = !!(config.mcpServers && config.mcpServers[SERVER_NAME]);
      status[editor] = {
        installed,
        path: configPath,
        config: installed ? config.mcpServers[SERVER_NAME] : null,
      };
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[mcp-install:checkInstallation] silent failure:', e?.message || e);
      status[editor] = { installed: false, path: configPath, error: 'unreadable' };
    }
  }

  return status;
}

// ─── Install to All ───

function installAll(options = {}) {
  const serverConfig = getServerConfig(options);
  const paths = getConfigPaths();
  const targets = options.targets || Object.keys(paths);
  const results = {};

  for (const target of targets) {
    const configPath = paths[target];
    if (!configPath) {
      results[target] = { success: false, error: 'Unknown target' };
      continue;
    }
    results[target] = updateConfigFile(configPath, serverConfig);
  }

  return results;
}

// ─── Uninstall from All ───

function uninstallAll(options = {}) {
  const paths = getConfigPaths();
  const targets = options.targets || Object.keys(paths);
  const results = {};

  for (const target of targets) {
    const configPath = paths[target];
    if (!configPath) continue;
    results[target] = removeFromConfig(configPath);
  }

  return results;
}

// ─── Install to Specific Editor ───

function installTo(editor, options = {}) {
  const paths = getConfigPaths();
  const configPath = paths[editor];
  if (!configPath) return { success: false, error: `Unknown editor: ${editor}` };

  const serverConfig = getServerConfig(options);
  return updateConfigFile(configPath, serverConfig);
}

// ─── Uninstall from Specific Editor ───

function uninstallFrom(editor) {
  const paths = getConfigPaths();
  const configPath = paths[editor];
  if (!configPath) return { success: false, error: `Unknown editor: ${editor}` };

  return removeFromConfig(configPath);
}

// ─── Non-MCP Editor Configs ───

/**
 * Generate a Vim/Neovim plugin config for ALE or coc.nvim.
 * Writes oracle as an external linter + completion source.
 */
function generateVimConfig() {
  const cliPath = path.resolve(__dirname, '..', 'cli.js');
  return {
    'ale_config': `" ~/.vimrc or ~/.config/nvim/init.vim — Oracle via ALE
" Add oracle as a linter for JavaScript/TypeScript/Python
let g:ale_linters = {
\\  'javascript': ['oracle'],
\\  'typescript': ['oracle'],
\\  'python': ['oracle'],
\\}

" Custom ALE linter definition
call ale#linter#Define('javascript', {
\\  'name': 'oracle',
\\  'executable': 'node',
\\  'command': 'node ${cliPath} covenant --file %s --json',
\\  'callback': 'ale#handlers#oracle#Handle',
\\  'lint_file': 1,
\\})

" Map: search oracle for word under cursor
nnoremap <leader>os :!node ${cliPath} search "<cword>"<CR>
" Map: resolve from oracle
nnoremap <leader>or :!node ${cliPath} resolve --description "<cword>"<CR>
" Map: submit current file
nnoremap <leader>ou :!node ${cliPath} submit --file %<CR>
" Map: validate current file
nnoremap <leader>ov :!node ${cliPath} covenant --file %<CR>
`,
    'coc_config': `// coc-settings.json — Oracle as a coc.nvim language server
{
  "languageserver": {
    "oracle": {
      "command": "node",
      "args": ["${cliPath}", "mcp"],
      "filetypes": ["javascript", "typescript", "python", "go", "rust"],
      "rootPatterns": [".remembrance", "package.json", ".git"]
    }
  }
}
`,
  };
}

/**
 * Generate an Emacs config for flycheck + company-mode oracle integration.
 */
function generateEmacsConfig() {
  const cliPath = path.resolve(__dirname, '..', 'cli.js');
  return `;;; oracle.el — Remembrance Oracle integration for Emacs
;;; Add to ~/.emacs or ~/.emacs.d/init.el

;; Flycheck checker — oracle covenant
(flycheck-define-checker oracle-covenant
  "Check code against the Remembrance Oracle covenant."
  :command ("node" "${cliPath}" "covenant" "--file" source "--json")
  :error-patterns
  ((error line-start "VIOLATION:" (message) line-end))
  :modes (js-mode js2-mode typescript-mode python-mode go-mode rust-mode))

(add-to-list 'flycheck-checkers 'oracle-covenant)

;; Interactive commands
(defun oracle-search (query)
  "Search the Remembrance Oracle for a pattern."
  (interactive "sOracle search: ")
  (let ((buf (get-buffer-create "*oracle-search*")))
    (with-current-buffer buf
      (erase-buffer)
      (call-process "node" nil buf nil "${cliPath}" "search" query)
      (goto-char (point-min)))
    (display-buffer buf)))

(defun oracle-resolve (description)
  "Resolve code from the oracle (PULL/EVOLVE/GENERATE)."
  (interactive "sDescribe what you need: ")
  (let ((buf (get-buffer-create "*oracle-resolve*")))
    (with-current-buffer buf
      (erase-buffer)
      (call-process "node" nil buf nil "${cliPath}" "resolve" "--description" description)
      (goto-char (point-min)))
    (display-buffer buf)))

(defun oracle-validate-buffer ()
  "Validate the current buffer with the oracle covenant."
  (interactive)
  (let ((file (buffer-file-name)))
    (if file
        (let ((buf (get-buffer-create "*oracle-validate*")))
          (with-current-buffer buf
            (erase-buffer)
            (call-process "node" nil buf nil "${cliPath}" "covenant" "--file" file)
            (goto-char (point-min)))
          (display-buffer buf))
      (message "Buffer has no file"))))

(defun oracle-submit-buffer ()
  "Submit the current buffer to the oracle."
  (interactive)
  (let ((file (buffer-file-name)))
    (if file
        (let ((buf (get-buffer-create "*oracle-submit*")))
          (with-current-buffer buf
            (erase-buffer)
            (call-process "node" nil buf nil "${cliPath}" "submit" "--file" file)
            (goto-char (point-min)))
          (display-buffer buf))
      (message "Buffer has no file"))))

;; Keybindings (under C-c o prefix)
(global-set-key (kbd "C-c o s") 'oracle-search)
(global-set-key (kbd "C-c o r") 'oracle-resolve)
(global-set-key (kbd "C-c o v") 'oracle-validate-buffer)
(global-set-key (kbd "C-c o u") 'oracle-submit-buffer)

(provide 'oracle)
;;; oracle.el ends here
`;
}

/**
 * Generate a JetBrains external tool configuration.
 * Works with IntelliJ, WebStorm, PyCharm, GoLand, RustRover, etc.
 */
function generateJetBrainsConfig() {
  const cliPath = path.resolve(__dirname, '..', 'cli.js');
  return `<!-- .idea/tools/Oracle.xml — JetBrains External Tools -->
<!-- Import via: Settings → Tools → External Tools → Import -->
<toolSet name="Remembrance Oracle">
  <tool name="Oracle Search" description="Search proven code patterns" showInMainMenu="true"
        showInEditor="true" showInProject="true" showInSearchPopup="true"
        disabled="false" useConsole="true" showConsoleOnStdOut="true"
        showConsoleOnStdErr="true" synchronizeAfterRun="false">
    <exec>
      <option name="COMMAND" value="node" />
      <option name="PARAMETERS" value="${cliPath} search &quot;$Prompt$&quot;" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Oracle Resolve" description="Smart pull/evolve/generate from oracle" showInMainMenu="true"
        showInEditor="true" showInProject="true" showInSearchPopup="true"
        disabled="false" useConsole="true" showConsoleOnStdOut="true"
        showConsoleOnStdErr="true" synchronizeAfterRun="false">
    <exec>
      <option name="COMMAND" value="node" />
      <option name="PARAMETERS" value="${cliPath} resolve --description &quot;$Prompt$&quot;" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Oracle Validate" description="Run covenant check on current file" showInMainMenu="true"
        showInEditor="true" showInProject="true" showInSearchPopup="true"
        disabled="false" useConsole="true" showConsoleOnStdOut="true"
        showConsoleOnStdErr="true" synchronizeAfterRun="false">
    <exec>
      <option name="COMMAND" value="node" />
      <option name="PARAMETERS" value="${cliPath} covenant --file $FilePath$" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Oracle Submit" description="Submit current file to the oracle" showInMainMenu="true"
        showInEditor="true" showInProject="true" showInSearchPopup="true"
        disabled="false" useConsole="true" showConsoleOnStdOut="true"
        showConsoleOnStdErr="true" synchronizeAfterRun="false">
    <exec>
      <option name="COMMAND" value="node" />
      <option name="PARAMETERS" value="${cliPath} submit --file $FilePath$" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
  <tool name="Oracle Security Scan" description="Scan current file for security issues" showInMainMenu="true"
        showInEditor="true" showInProject="true" showInSearchPopup="true"
        disabled="false" useConsole="true" showConsoleOnStdOut="true"
        showConsoleOnStdErr="true" synchronizeAfterRun="false">
    <exec>
      <option name="COMMAND" value="node" />
      <option name="PARAMETERS" value="${cliPath} security-scan --file $FilePath$" />
      <option name="WORKING_DIRECTORY" value="$ProjectFileDir$" />
    </exec>
  </tool>
</toolSet>
`;
}

/**
 * Install editor-specific configs and print instructions.
 * @param {string} editor - 'vim', 'emacs', or 'jetbrains'
 * @returns {object} { success, files, instructions }
 */
function installEditorConfig(editor) {
  const cwd = process.cwd();

  if (editor === 'vim' || editor === 'neovim' || editor === 'nvim') {
    const configs = generateVimConfig();
    const vimrcPath = path.join(cwd, '.oracle-vim.vim');
    const cocPath = path.join(cwd, '.oracle-coc-settings.json');
    fs.writeFileSync(vimrcPath, configs.ale_config);
    fs.writeFileSync(cocPath, configs.coc_config);
    return {
      success: true,
      files: [vimrcPath, cocPath],
      instructions: `Add to your ~/.vimrc:  source ${vimrcPath}\nOr for coc.nvim: copy ${cocPath} to coc-settings.json`,
    };
  }

  if (editor === 'emacs') {
    const config = generateEmacsConfig();
    const elPath = path.join(cwd, '.oracle-emacs.el');
    fs.writeFileSync(elPath, config);
    return {
      success: true,
      files: [elPath],
      instructions: `Add to ~/.emacs.d/init.el:  (load "${elPath}")`,
    };
  }

  if (editor === 'jetbrains' || editor === 'intellij' || editor === 'webstorm' || editor === 'pycharm') {
    const config = generateJetBrainsConfig();
    const ideaDir = path.join(cwd, '.idea', 'tools');
    if (!fs.existsSync(ideaDir)) fs.mkdirSync(ideaDir, { recursive: true });
    const xmlPath = path.join(ideaDir, 'Oracle.xml');
    fs.writeFileSync(xmlPath, config);
    return {
      success: true,
      files: [xmlPath],
      instructions: `JetBrains tools installed at ${xmlPath}\nAccess via: Tools → External Tools → Remembrance Oracle`,
    };
  }

  return { success: false, error: `Unknown editor: ${editor}. Supported: vim, emacs, jetbrains` };
}

module.exports = {
  SERVER_NAME,
  getConfigPaths,
  getServerConfig,
  checkInstallation,
  installAll,
  uninstallAll,
  installTo,
  uninstallFrom,
  updateConfigFile,
  removeFromConfig,
  generateVimConfig,
  generateEmacsConfig,
  generateJetBrainsConfig,
  installEditorConfig,
};
