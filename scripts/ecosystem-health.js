#!/usr/bin/env node
'use strict';

/**
 * Ecosystem health — JS twin of void's ecosystem_health.py.
 *
 * Reads the same files (pattern_uri_index.json,
 * cross_repo_function_records.json, derived_by_index.json)
 * from the void repo and produces an equivalent report.
 *
 * Resolves the void repo via VOID_REPO env var or sibling path.
 * Same single-number health as the Python side: geometric mean of
 * (mean_coherency_v1, provenance_coverage, replica_freshness).
 *
 * Modes:
 *   node scripts/ecosystem-health.js           # human-readable
 *   node scripts/ecosystem-health.js --json    # one-line JSON
 *   node scripts/ecosystem-health.js --quiet   # health number only
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function _resolveVoidRepo() {
  if (process.env.VOID_REPO && fs.existsSync(process.env.VOID_REPO)) {
    return process.env.VOID_REPO;
  }
  for (const p of [
    path.resolve(__dirname, '../../Void-Data-Compressor'),
    path.resolve(__dirname, '../../void-data-compressor'),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Void-Data-Compressor not found — set VOID_REPO');
}

function _safeRead(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function _geomMean(arr) {
  const filtered = arr.filter(x => x > 0);
  if (filtered.length === 0) return 0;
  let prod = 1;
  for (const x of filtered) prod *= x;
  return Math.pow(prod, 1 / filtered.length);
}

function gather() {
  const voidRepo = _resolveVoidRepo();
  const idx     = _safeRead(path.join(voidRepo, 'pattern_uri_index.json'));
  const records = _safeRead(path.join(voidRepo, 'cross_repo_function_records.json'));
  const dbi     = _safeRead(path.join(voidRepo, 'derived_by_index.json'));

  const out = {
    generated_at: new Date().toISOString(),
    void_repo: voidRepo,
  };

  if (idx) {
    out.total_uris  = idx.unique_waveform_count || 0;
    out.unique_names = idx.unique_name_count || 0;
    out.domain_distribution = idx.domain_distribution || {};
    const byRepo = {};
    for (const u of Object.keys(idx.index_by_uri || {})) {
      const repo = u.split('://')[1]?.split('/')[0];
      if (repo) byRepo[repo] = (byRepo[repo] || 0) + 1;
    }
    out.by_repo = Object.fromEntries(
      Object.entries(byRepo).sort((a, b) => b[1] - a[1])
    );
  }

  if (records?.records) {
    out.total_records = records.records.length;
    const unifieds = records.records
      .map(r => r.coherency_v1?.unified)
      .filter(x => typeof x === 'number');
    out.mean_coherency_v1 = unifieds.length
      ? Number((unifieds.reduce((a, b) => a + b, 0) / unifieds.length).toFixed(4))
      : 0;
    let withProv = 0, totalEdges = 0, crossEdges = 0;
    for (const r of records.records) {
      const edges = r.derived_from || [];
      if (edges.length) withProv++;
      for (const e of edges) {
        totalEdges++;
        const targetRepo = e.split('://')[1]?.split('/')[0];
        if (targetRepo && targetRepo !== r.repo) crossEdges++;
      }
    }
    out.records_with_provenance = withProv;
    out.provenance_coverage     = records.records.length
      ? Number((withProv / records.records.length).toFixed(3)) : 0;
    out.provenance_edges_total      = totalEdges;
    out.provenance_edges_cross_repo = crossEdges;
  }

  if (dbi?.index) {
    const top = Object.entries(dbi.index)
      .map(([uri, deps]) => ({ uri, dependents: deps.length }))
      .sort((a, b) => b.dependents - a.dependents)
      .slice(0, 10);
    out.top_dependencies = top;
  }

  // Oracle DBs
  const dbs = [
    { label: 'primary',  path: path.resolve(__dirname, '../.remembrance/oracle.db') },
    { label: 'replica:blockchain', path: '/home/user/REMEMBRANCE-BLOCKCHAIN/.remembrance/oracle.db' },
    { label: 'replica:reflector',  path: '/home/user/Reflector-oracle-/.remembrance/oracle.db' },
  ];
  out.oracle_dbs = [];
  for (const d of dbs) {
    const info = { label: d.label, path: d.path, exists: fs.existsSync(d.path) };
    if (info.exists) {
      const stat = fs.statSync(d.path);
      info.size = stat.size;
      info.mtime = stat.mtime.toISOString();
      try {
        const conn = new DatabaseSync(d.path, { readonly: true });
        const meta = {};
        for (const r of conn.prepare('SELECT key, value FROM meta').all()) meta[r.key] = r.value;
        info.role = meta.oracle_role || '?';
        info.mirrored_at = meta.oracle_mirrored_at;
        info.unified_at  = meta.oracle_unified_at;
        for (const tbl of ['patterns', 'void_patterns']) {
          try { info[`rows_${tbl}`] = conn.prepare(`SELECT COUNT(*) as n FROM ${tbl}`).get().n; }
          catch { /* table missing in some DBs */ }
        }
        conn.close();
      } catch (e) { info.error = e.message; }
    }
    out.oracle_dbs.push(info);
  }

  // Replica freshness
  const primaryUnified = out.oracle_dbs.find(d => d.role === 'primary')?.unified_at;
  const replicas = out.oracle_dbs.filter(d => d.role === 'replica');
  let fresh = 1.0;
  if (primaryUnified && replicas.length) {
    const inSync = replicas.filter(r => r.mirrored_at && r.mirrored_at >= primaryUnified).length;
    fresh = inSync / replicas.length;
  }

  const coh  = out.mean_coherency_v1 || 0;
  const prov = out.provenance_coverage || 0;
  out.health_components = {
    coherency: Number(coh.toFixed(4)),
    provenance: Number(prov.toFixed(4)),
    replica_freshness: Number(fresh.toFixed(4)),
  };
  out.health = Number(_geomMean([coh, prov, fresh]).toFixed(4));

  return out;
}

function renderHuman(data) {
  const L = [];
  L.push('═══════════════════════════════════════════════════════');
  L.push(`  REMEMBRANCE ECOSYSTEM HEALTH    ${data.health.toFixed(4)}`);
  L.push('═══════════════════════════════════════════════════════');
  L.push('');
  if (data.health_components) {
    const c = data.health_components;
    L.push(`  coherency:          ${c.coherency.toFixed(4)}`);
    L.push(`  provenance:         ${c.provenance.toFixed(4)}`);
    L.push(`  replica freshness:  ${c.replica_freshness.toFixed(4)}`);
  }
  L.push('');
  L.push(`  total URIs:          ${(data.total_uris || 0).toLocaleString().padStart(10)}`);
  L.push(`  cross-repo records:  ${(data.total_records || 0).toLocaleString().padStart(10)}`);
  L.push(`  with provenance:     ${(data.records_with_provenance || 0).toLocaleString().padStart(10)} (${((data.provenance_coverage || 0) * 100).toFixed(1)}%)`);
  L.push(`  cross-repo edges:    ${(data.provenance_edges_cross_repo || 0).toLocaleString().padStart(10)} / ${(data.provenance_edges_total || 0).toLocaleString()}`);
  L.push('');
  L.push('  URIs by repo:');
  for (const [repo, n] of Object.entries(data.by_repo || {})) {
    L.push(`    ${repo.padEnd(14)} ${n.toLocaleString().padStart(8)}`);
  }
  L.push('');
  L.push('  Domain distribution:');
  for (const [dom, n] of Object.entries(data.domain_distribution || {})) {
    L.push(`    ${dom.padEnd(14)} ${n.toLocaleString().padStart(8)}`);
  }
  L.push('');
  if (data.top_dependencies?.length) {
    L.push('  Most-depended-on URIs:');
    for (const d of data.top_dependencies.slice(0, 5)) {
      L.push(`    ${String(d.dependents).padStart(4)} dependents  ${d.uri}`);
    }
    L.push('');
  }
  L.push('  Oracle DBs:');
  for (const d of data.oracle_dbs || []) {
    if (!d.exists) { L.push(`    ${d.label.padEnd(22)} MISSING — ${d.path}`); continue; }
    L.push(`    ${d.label.padEnd(22)} role=${(d.role || '?').padEnd(8)} patterns=${d.rows_patterns ?? '?'}  void_patterns=${d.rows_void_patterns ?? '?'}`);
  }
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const data = gather();
  if (args.includes('--quiet')) {
    console.log(data.health);
  } else if (args.includes('--json')) {
    console.log(JSON.stringify(data));
  } else {
    console.log(renderHuman(data));
  }
}

if (require.main === module) main();

module.exports = { gather, renderHuman };
