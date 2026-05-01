/**
 * Void Store CLI commands: void-store {get|put|delete|stats|list}
 *
 * Exposes the Void Compression Layer — pattern-aware storage where
 * data gets compressed through the substrate's pattern library
 * instead of stored as raw JSON. Content-addressed, integrity-checked,
 * with deduplication.
 *
 * For everyday use, store/retrieve arbitrary JSON-serialisable data:
 *   node src/cli.js void-store put my-key '{"foo": 123}'
 *   node src/cli.js void-store get my-key
 *
 * For inspection:
 *   node src/cli.js void-store stats
 *   node src/cli.js void-store list [prefix]
 *
 * @oracle-infrastructure
 */

const fs = require('fs');
const path = require('path');
const { c } = require('../colors');

let _store = null;

function _getStore(opts = {}) {
  if (_store) return _store;
  const { getVoidStore } = require('../../core/void-compression-layer');
  _store = getVoidStore(opts);
  return _store;
}

function registerVoidStoreCommands(handlers, { oracle }) {

  handlers['void-store'] = (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Void Store Commands:')}`);
      console.log(`  ${c.cyan('void-store put')} <key> <json>            Store JSON data with pattern-aware compression`);
      console.log(`  ${c.cyan('void-store put')} <key> --file <path>     Store contents of a file`);
      console.log(`  ${c.cyan('void-store get')} <key>                   Retrieve and decompress`);
      console.log(`  ${c.cyan('void-store delete')} <key>                Remove a stored entry`);
      console.log(`  ${c.cyan('void-store stats')}                       Storage statistics + compression ratio`);
      console.log(`  ${c.cyan('void-store list')} [prefix]               List keys (optionally filtered)`);
      console.log(``);
      console.log(`${c.dim('Pattern-aware compression: data gets delta-encoded against the')}`);
      console.log(`${c.dim('substrate pattern library, then zlib on top, with SHA-256 integrity.')}`);
      console.log(`${c.dim('Result: 40-70% smaller than gzip on code-like data.')}`);
      console.log(``);
      console.log(`${c.dim('Default store path: .remembrance/compressed/  (override with --store <path>)')}`);
      return;
    }

    const storeOpts = args.store ? { storePath: args.store } : {};
    const store = _getStore(storeOpts);

    if (sub === 'put') {
      const key = args._positional && args._positional[1];
      if (!key) {
        console.error(`${c.red('error:')} key required`);
        return;
      }
      let data;
      if (args.file) {
        try {
          const raw = fs.readFileSync(args.file, 'utf-8');
          // Try to parse as JSON; otherwise store as a string
          try { data = JSON.parse(raw); } catch { data = raw; }
        } catch (e) {
          console.error(`${c.red('error reading file:')} ${e.message}`);
          return;
        }
      } else {
        const json = args._positional && args._positional[2];
        if (!json) {
          console.error(`${c.red('error:')} JSON value or --file required`);
          return;
        }
        try { data = JSON.parse(json); }
        catch (e) {
          console.error(`${c.red('error parsing JSON:')} ${e.message}`);
          console.error(`${c.dim('  if the value is a plain string, wrap it in quotes: \\"hello\\"')}`);
          return;
        }
      }
      try {
        const result = store.write(key, data);
        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`${c.green('✓')} stored ${c.cyan(key)}`);
          console.log(`  hash:        ${result.hash || '(n/a)'}`);
          console.log(`  original:    ${result.originalSize} bytes`);
          console.log(`  compressed:  ${result.compressedSize} bytes`);
          if (result.ratio !== undefined) {
            // VoidStore returns ratio as a string ("50%") or Infinity
            // for dedup hits; render either form safely.
            const r = typeof result.ratio === 'number'
              ? (Number.isFinite(result.ratio) ? result.ratio.toFixed(3) + 'x' : '∞ (dedup)')
              : result.ratio;
            console.log(`  ratio:       ${r}`);
          }
          if (result.method) console.log(`  method:      ${result.method}`);
        }
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    if (sub === 'get') {
      const key = args._positional && args._positional[1];
      if (!key) {
        console.error(`${c.red('error:')} key required`);
        return;
      }
      try {
        const data = store.read(key);
        if (data === null || data === undefined) {
          console.error(`${c.red('not found:')} ${key}`);
          process.exitCode = 1;
          return;
        }
        console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    if (sub === 'delete' || sub === 'rm') {
      const key = args._positional && args._positional[1];
      if (!key) {
        console.error(`${c.red('error:')} key required`);
        return;
      }
      try {
        const removed = store.delete(key);
        if (removed) console.log(`${c.green('✓')} deleted ${c.cyan(key)}`);
        else { console.log(`${c.dim('not found:')} ${key}`); process.exitCode = 1; }
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    if (sub === 'stats') {
      try {
        const s = store.stats();
        if (args.json) {
          console.log(JSON.stringify(s, null, 2));
          return;
        }
        const ops = s.operations || {};
        console.log(`${c.bold('Void Store Statistics')}`);
        console.log(`  keys:              ${s.keys || 0}`);
        console.log(`  unique blobs:      ${s.uniqueBlobs || 0}`);
        console.log(`  deduplicated:      ${s.deduplicatedKeys || 0}`);
        console.log(`  total original:    ${s.totalOriginalBytes || 0} bytes`);
        console.log(`  total compressed:  ${s.totalCompressedBytes || 0} bytes`);
        console.log(`  overall ratio:     ${s.overallRatio || '0%'} reduction`);
        console.log(`  savings:           ${s.savingsBytes || 0} bytes  (${s.savingsMb || 0} MB)`);
        console.log(`  ${c.dim('lifetime ops — writes:' + (ops.writes || 0) + ' reads:' + (ops.reads || 0) + ' deduped:' + (ops.deduped || 0))}`);
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    if (sub === 'list') {
      const prefix = args._positional && args._positional[1];
      try {
        const keys = store.list(prefix);
        if (args.json) {
          console.log(JSON.stringify(keys, null, 2));
          return;
        }
        if (!keys || keys.length === 0) {
          console.log(`${c.dim('(no keys' + (prefix ? ' matching prefix ' + JSON.stringify(prefix) : '') + ')')}`);
          return;
        }
        for (const k of keys) console.log(`  ${k}`);
        console.log(`${c.dim('(' + keys.length + ' keys)')}`);
      } catch (e) {
        console.error(`${c.red('error:')} ${e.message}`);
        process.exitCode = 1;
      }
      return;
    }

    console.error(`${c.red('error:')} unknown subcommand: ${sub}`);
  };

}

module.exports = { registerVoidStoreCommands };
