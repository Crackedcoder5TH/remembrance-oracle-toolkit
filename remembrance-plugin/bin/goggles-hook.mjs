#!/usr/bin/env node
// PostToolUse adapter: run the goggles' ambient hook on the just-edited file.
// Best-effort and exception-only — silent unless the change weakened structure
// or is an outlier. Passes our stdin (the hook JSON) through to the real hook.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { findToolkit } from './toolkit.mjs';

const toolkit = findToolkit();
if (!toolkit) process.exit(0); // no toolkit -> no-op, never block an edit
const hook = resolve(toolkit, 'src/tools/goggles-hook.js');
spawnSync(process.execPath, [hook], { stdio: 'inherit' });
process.exit(0); // advisory only — never block or error an edit
