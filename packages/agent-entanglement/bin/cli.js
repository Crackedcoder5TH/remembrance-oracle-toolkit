#!/usr/bin/env node
'use strict';

/**
 * agent-entanglement CLI — see the shared field, claim files, heartbeat.
 *
 * Subcommands:
 *   agent-entanglement                          (same as snapshot)
 *   agent-entanglement snapshot                 print current shared state
 *   agent-entanglement heartbeat <tag>          register presence as <tag>
 *   agent-entanglement claim <file> --tag <t>   try to claim a file
 *   agent-entanglement release <file> --tag <t> release a held claim
 *   agent-entanglement claimed <file>           is file claimed?
 *   agent-entanglement peers                    list active peers
 *   agent-entanglement claims                   list active claims
 *   agent-entanglement help                     this message
 *
 * Options:
 *   --ttl-ms <n>                                claim TTL (default 300000 = 5 min)
 *   --json                                      machine-readable output
 *   --window-ms <n>                             peer window (default 600000 = 10 min)
 */

const e = require('../src/index');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') out.tag = argv[++i];
    else if (a === '--ttl-ms') out.ttlMs = parseInt(argv[++i], 10);
    else if (a === '--window-ms') out.windowMs = parseInt(argv[++i], 10);
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out._.push('help');
    else out._.push(a);
  }
  return out;
}

const HELP = `agent-entanglement — coordination layer for parallel AI agents

Subcommands:
  agent-entanglement                          (same as snapshot)
  snapshot                                    print shared field state
  heartbeat <tag>                             register presence as <tag>
  claim <file> --tag <t>                      try to claim a file for editing
  release <file> --tag <t>                    release a held claim
  claimed <file>                              read-only check
  peers                                       list active peers
  claims                                      list active claims
  help                                        this message

Options:
  --ttl-ms <n>          claim TTL (default 300000 = 5 min)
  --json                machine-readable output
  --window-ms <n>       peer window (default 600000 = 10 min)
`;

const args = parseArgs(process.argv);
const cmd = args._[0] || 'snapshot';

function out(obj) {
  if (args.json) {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  } else {
    if (typeof obj === 'string') process.stdout.write(obj);
    else process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  }
}

function snapshotText(s) {
  let lines = [];
  lines.push('=== SHARED FIELD STATE ===');
  lines.push('  cognition: n=' + s.cognition.n
    + ' mean=' + (s.cognition.mean || 0).toFixed(3)
    + ' var=' + (s.cognition.variance || 0).toFixed(4)
    + ' (' + s.cognition.cls + ')');
  lines.push('  active peers (' + s.peers.length + '):');
  for (const p of s.peers) {
    const agoS = Math.round(p.lastAgeMs / 1000);
    lines.push('    [' + p.tag + '] heartbeats=' + p.heartbeats + ' last=' + agoS + 's ago');
  }
  lines.push('  active file claims (' + s.claims.length + '):');
  for (const c of s.claims) {
    const expS = Math.max(0, Math.round((c.expiresAt - Date.now()) / 1000));
    lines.push('    ' + c.file + ' held by [' + c.holder + '] expires in ' + expS + 's');
  }
  lines.push('  recent edits (newest first):');
  for (const f of s.recent.slice().reverse()) {
    lines.push('    ' + f.file + ' (' + (typeof f.coh === 'number' ? f.coh.toFixed(3) : 'n/a') + ')');
  }
  return lines.join('\n') + '\n';
}

if (cmd === 'help' || args._.includes('help')) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (cmd === 'snapshot') {
  const s = e.snapshot({ peerWindowMs: args.windowMs });
  if (args.json) out(s); else out(snapshotText(s));
  process.exit(0);
}

if (cmd === 'heartbeat') {
  const tag = args._[1];
  if (!tag) { process.stderr.write('heartbeat: missing <tag>\n'); process.exit(2); }
  const r = e.heartbeat(tag);
  if (args.json) out(r || { ok: false });
  else out('[' + tag + '] heartbeat ' + (r ? 'recorded at ' + new Date(r.ts).toISOString() : 'FAILED') + '\n');
  process.exit(r ? 0 : 1);
}

if (cmd === 'claim') {
  const file = args._[1];
  if (!file || !args.tag) {
    process.stderr.write('claim: usage: agent-entanglement claim <file> --tag <name> [--ttl-ms n]\n');
    process.exit(2);
  }
  const r = e.claim(file, { tag: args.tag, ttlMs: args.ttlMs });
  if (args.json) out(r);
  else out((r.claimed ? '✓ CLAIMED ' : '✗ BLOCKED ') + file
    + (r.claimed ? ' by [' + r.holder + '] expires ' + new Date(r.expiresAt).toISOString()
      : ' (' + r.reason + (r.holder ? ' [' + r.holder + ']' : '') + ')') + '\n');
  process.exit(r.claimed ? 0 : 1);
}

if (cmd === 'release') {
  const file = args._[1];
  if (!file || !args.tag) {
    process.stderr.write('release: usage: agent-entanglement release <file> --tag <name>\n');
    process.exit(2);
  }
  const ok = e.release(file, { tag: args.tag });
  if (args.json) out({ released: ok });
  else out((ok ? '✓ RELEASED ' : '✗ NO ACTIVE CLAIM ') + file + ' [' + args.tag + ']\n');
  process.exit(ok ? 0 : 1);
}

if (cmd === 'claimed') {
  const file = args._[1];
  if (!file) { process.stderr.write('claimed: missing <file>\n'); process.exit(2); }
  const r = e.isClaimed(file);
  if (args.json) out(r);
  else out((r.claimed ? 'HELD by [' + r.holder + '] expires ' + new Date(r.expiresAt).toISOString() : 'FREE') + '\n');
  process.exit(r.claimed ? 0 : 1);
}

if (cmd === 'peers') {
  const ps = e.listPeers({ maxAgeMs: args.windowMs });
  if (args.json) out(ps);
  else {
    if (ps.length === 0) out('(no active peers)\n');
    else for (const p of ps) {
      const agoS = Math.round(p.lastAgeMs / 1000);
      out('  [' + p.tag + '] heartbeats=' + p.heartbeats + ' last=' + agoS + 's ago\n');
    }
  }
  process.exit(0);
}

if (cmd === 'claims') {
  const cs = e.listClaims();
  if (args.json) out(cs);
  else {
    if (cs.length === 0) out('(no active claims)\n');
    else for (const c of cs) {
      const expS = Math.max(0, Math.round((c.expiresAt - Date.now()) / 1000));
      out('  ' + c.file + ' held by [' + c.holder + '] expires in ' + expS + 's\n');
    }
  }
  process.exit(0);
}

process.stderr.write('unknown command: ' + cmd + '\n');
process.stderr.write(HELP);
process.exit(2);
