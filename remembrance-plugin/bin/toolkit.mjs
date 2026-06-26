// Locate the remembrance-oracle-toolkit (the engine the plugin drives).
// The plugin may be installed standalone (cached), so resolve the toolkit from
// env or known locations rather than assuming a relative path.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function findToolkit() {
  const candidates = [
    process.env.ORACLE_TOOLKIT,
    process.env.REMEMBRANCE_TOOLKIT,
    resolve(process.cwd(), 'remembrance-oracle-toolkit'),
    resolve(process.cwd(), '../remembrance-oracle-toolkit'),
    resolve(process.cwd(), '../../remembrance-oracle-toolkit'),
    '/home/user/remembrance-oracle-toolkit',
    process.cwd(), // we may already be inside it
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(resolve(c, 'src/tools/goggles.js'))) return c;
  }
  return null;
}
