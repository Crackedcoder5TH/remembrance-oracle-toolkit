#!/usr/bin/env node
'use strict';

/**
 * prune-superseded-keys — remove index entries written under an OLDER key
 * scheme whose file the substrate already holds under the current one.
 * Reached through the goggles: `--do prune [repo|all] [--apply]`.
 *
 * This is NOT a deletion of memory. A superseded key is a duplicate of an
 * entry that is still present:
 *
 *   void/Void-Data-Compressor/api      <- old scheme: namespace + repo dir,
 *                                         extension stripped, older schema
 *                                         (composed_v4, no ledger, no
 *                                         coherence)
 *   void/api.py                        <- current scheme, current schema
 *
 * Both describe the same file. The map used to report all of these as
 * "deleted since ingestion", which said Void had lost 50 files when it had
 * lost 24 and double-counted 26.
 *
 * GENUINE DELETIONS ARE NEVER TOUCHED. A file that existed and was removed is
 * history, and this substrate's whole premise is that it remembers. Only keys
 * that duplicate a surviving entry are removed, and an entry is only
 * considered a duplicate when the current-scheme entry actually exists in the
 * index.
 *
 * Dry-run by default. Pass --apply to write.
 */

const fs = require('node:fs');
const path = require('node:path');

const HOME = process.env.HARVEST_HOME || '/home/user';
const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(HOME, 'Void-Data-Compressor', 'pattern_index_fractal.json');

const NS_TO_REPO = {
  oracle: 'remembrance-oracle-toolkit',
  void: 'Void-Data-Compressor',
  'rmb-blockchain': 'REMEMBRANCE-BLOCKCHAIN',
  'rmb-swarm': 'REMEMBRANCE-AGENT-Swarm-',
  'rmb-interface': 'REMEMBRANCE-Interface',
  'rmb-dialer': 'Remembrance-dialer',
  'rmb-plugger': 'REMEMBRANCE-API-Key-Plugger',
  moons: 'MOONS-OF-REMEMBRANCE',
  reflector: 'Reflector-oracle-',
};
const EXTS = ['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.md', '.json', '.sh', '.rs'];

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const target = argv.find((a) => !a.startsWith('--')) || 'all';

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate index at ${INDEX_PATH}: ${e.message}`); process.exit(1); }
  const index = idx.index;
  const keys = Object.keys(index);

  const namespaces = target === 'all' ? Object.keys(NS_TO_REPO) : [target];
  const superseded = [];

  for (const ns of namespaces) {
    const repoDir = NS_TO_REPO[ns];
    if (!repoDir) { console.error('unknown repo: ' + target); process.exit(1); }
    const prefix = ns + '/';
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue;
      const rel = k.slice(prefix.length);
      // The leading segment must be the REPO DIRECTORY NAME. That is the
      // old scheme's actual signature: namespace + repo dir + path.
      //
      // Stripping ANY leading directory is far too loose and would have been
      // destructive: it matched `oracle/vscode-extension/README.md` as a
      // duplicate of `oracle/README.md`, and `oracle/src/dashboard/server.js`
      // as a duplicate of `oracle/dashboard/server.js`. Those are distinct
      // files in nested directories. The dry-run default is what caught it —
      // 58 legitimate entries would have been deleted.
      if (!rel.startsWith(repoDir + '/')) continue;
      const base = rel.slice(repoDir.length + 1);
      // The surviving entry must actually exist, under any known extension.
      const survivor = EXTS.map((e) => prefix + base + e).find((c) => index[c])
        || (index[prefix + base] ? prefix + base : null);
      if (!survivor) continue;
      superseded.push({ key: k, survivor });
    }
  }

  if (!superseded.length) {
    console.log('no superseded duplicate keys found — nothing to prune.');
    process.exit(0);
  }

  console.log(`superseded duplicate keys: ${superseded.length}`);
  for (const s of superseded.slice(0, 12)) console.log(`   ${s.key}\n      duplicates → ${s.survivor}`);
  if (superseded.length > 12) console.log(`   … +${superseded.length - 12} more`);

  if (!apply) {
    console.log('\ndry run — nothing written. Re-run with --apply to prune.');
    console.log('genuine deletions are never included: only keys whose current-scheme entry still exists.');
    process.exit(0);
  }

  for (const s of superseded) delete index[s.key];
  if (idx.total_patterns != null) idx.total_patterns = Object.keys(index).length;
  idx.ingestion_log = idx.ingestion_log || [];
  idx.ingestion_log.push({
    at: new Date().toISOString(),
    pruned: superseded.length,
    tool: 'prune-superseded-keys',
    note: 'old-scheme duplicate keys removed; the same files remain indexed under the current scheme',
  });
  const tmp = INDEX_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx));
  fs.renameSync(tmp, INDEX_PATH);
  console.log(`\npruned ${superseded.length} duplicate key(s) → ${INDEX_PATH}`);
  console.log(`substrate: ${keys.length} → ${Object.keys(index).length} entries`);
}

main();
