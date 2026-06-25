#!/usr/bin/env node
// Launch the Remembrance Oracle MCP server (stdio JSON-RPC) from the toolkit,
// passing stdio straight through so Claude Code speaks to the real server.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { findToolkit } from './toolkit.mjs';

const toolkit = findToolkit();
if (!toolkit) {
  // No toolkit -> exit cleanly so the MCP server is simply absent, not erroring.
  process.stderr.write('remembrance MCP: toolkit not found (set ORACLE_TOOLKIT). Server not started.\n');
  process.exit(0);
}
const r = spawnSync(process.execPath, [resolve(toolkit, 'src/cli.js'), 'mcp'], { stdio: 'inherit' });
process.exit(r.status ?? 0);
