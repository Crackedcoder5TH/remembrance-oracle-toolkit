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
      } catch {
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
    } catch {
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
};
