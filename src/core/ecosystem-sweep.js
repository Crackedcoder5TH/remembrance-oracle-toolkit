'use strict';

/**
 * Ecosystem Sweep — slots into the oracle's Evolution Cycle as an ecosystem-wide
 * reconnaissance + auto-merge pass. Runs from GHA cron every 6h.
 *
 * Lexicon slot: PROCESSES.EVOLUTION_CYCLE extension
 * Events emitted: ecosystem.sweep.start / ecosystem.sweep.end / ecosystem.sweep.merged
 *
 * For each peer in ecosystem.json:
 *   1. Probe: open PRs, reflector PRs, last commit age, last CI conclusion
 *   2. Classify: healthy | warning | critical | error | empty
 *   3. Auto-merge qualifying reflector PRs (≤3 files changed + all checks passing)
 *   4. Emit a markdown report (consumed by the GHA step that creates an issue)
 */

const fs = require('fs');
const path = require('path');

const ECOSYSTEM_FILE = path.resolve(__dirname, '..', '..', 'ecosystem.json');
const OWNER = process.env.ECOSYSTEM_OWNER || 'crackedcoder5th';
const TOKEN = process.env.ECOSYSTEM_PAT || process.env.GITHUB_TOKEN;

// Canonical repo-name cache. GitHub's REST returns 404 (not 301) on
// case-mismatched sub-paths like `/repos/X/Y/pulls`, but the base
// `/repos/X/Y` endpoint DOES redirect on case mismatch. We resolve once
// per repo via that base endpoint, follow the redirect, read `full_name`
// for the canonical casing, and rewrite subsequent paths.
const _canonicalCache = new Map();

function _ghHeaders(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ecosystem-sweep', ...extra };
}

function _resolveCanonical(owner, repo) {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  // Cache the *promise* so concurrent 404s from probeRepo's Promise.all
  // share a single resolution roundtrip instead of each kicking off their own.
  if (_canonicalCache.has(key)) return _canonicalCache.get(key);
  const p = (async () => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: _ghHeaders(),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body?.full_name) return null;
    const [cOwner, cRepo] = body.full_name.split('/');
    return { owner: cOwner, repo: cRepo };
  })();
  _canonicalCache.set(key, p);
  return p;
}

async function gh(pathname, opts = {}) {
  const doFetch = (p) => fetch(`https://api.github.com${p}`, {
    headers: _ghHeaders(opts.headers || {}),
    redirect: 'follow',
    ...opts,
  });
  let res = await doFetch(pathname);
  // 404 on a sub-path may be a case-mismatch — resolve canonical and retry once.
  if (res.status === 404) {
    const m = pathname.match(/^\/repos\/([^/]+)\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
    if (m) {
      const [, oldOwner, oldRepo, rest = '', qs = ''] = m;
      const canonical = await _resolveCanonical(oldOwner, oldRepo);
      if (canonical && (canonical.owner !== oldOwner || canonical.repo !== oldRepo)) {
        const fixed = `/repos/${canonical.owner}/${canonical.repo}${rest}${qs}`;
        res = await doFetch(fixed);
      }
    }
  }
  if (!res.ok) throw new Error(`${pathname}: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

function loadPeers() {
  if (fs.existsSync(ECOSYSTEM_FILE)) {
    try {
      const eco = JSON.parse(fs.readFileSync(ECOSYSTEM_FILE, 'utf-8'));
      // Support two shapes:
      //   { repos: { "Repo-Name": {...} } }     ← current canonical shape
      //   { services: [{ repo: "name" }, ...] } ← older list shape
      let peers = [];
      if (eco.repos && typeof eco.repos === 'object') {
        peers = Object.keys(eco.repos).filter(name => name && name !== 'remembrance-oracle-toolkit');
      }
      if (!peers.length && Array.isArray(eco.services)) {
        peers = eco.services.map(s => s.repo).filter(Boolean);
      }
      if (peers.length) return peers;
    } catch {}
  }
  // Fallback uses canonical GitHub casing so the case-resolution roundtrip
  // is avoided on a fresh checkout. _resolveCanonical still covers any drift.
  return [
    'Void-Data-Compressor', 'MOONS-OF-REMEMBRANCE', 'REMEMBRANCE-AGENT-Swarm-',
    'REMEMBRANCE-Interface', 'REMEMBRANCE-BLOCKCHAIN', 'Reflector-oracle-',
    'Remembrance-dialer', 'remembrance-api-key-plugger',
  ];
}

async function probeRepo(repo) {
  try {
    const [prs, commits, runs] = await Promise.all([
      gh(`/repos/${OWNER}/${repo}/pulls?state=open&per_page=50`),
      gh(`/repos/${OWNER}/${repo}/commits?per_page=1`).catch(() => []),
      gh(`/repos/${OWNER}/${repo}/actions/runs?per_page=5`).catch(() => ({ workflow_runs: [] })),
    ]);
    const reflectorPRs = prs.filter(p => /reflector\//.test(p.head.ref) || /heal/i.test(p.title));
    const last = commits[0];
    const ageDays = last ? Math.round(((Date.now() - new Date(last.commit.author.date).getTime()) / 86400000) * 10) / 10 : null;
    const latestRun = runs.workflow_runs[0];
    const status = !last ? 'empty'
      : latestRun?.conclusion === 'failure' ? 'critical'
      : ageDays != null && ageDays > 14 ? 'warning'
      : 'healthy';
    return { repo, openPRs: prs.length, reflectorPRs: reflectorPRs.length, reflectorPRList: reflectorPRs.map(p => ({ number: p.number, title: p.title, headSha: p.head.sha, headRef: p.head.ref })), lastCommitAge: ageDays, lastRunStatus: latestRun?.conclusion || 'n/a', status };
  } catch (e) {
    return { repo, status: 'error', error: String(e.message || e) };
  }
}

async function tryAutoMergeReflector(repo, pr) {
  const files = await gh(`/repos/${OWNER}/${repo}/pulls/${pr.number}/files`).catch(() => []);
  if (files.length > 3) return { merged: false, reason: `touched ${files.length} files (> 3)` };
  const checks = await gh(`/repos/${OWNER}/${repo}/commits/${pr.headSha}/check-runs`).catch(() => ({ check_runs: [] }));
  const failed = checks.check_runs.filter(c => c.conclusion === 'failure');
  if (failed.length > 0) return { merged: false, reason: `${failed.length} check(s) failing` };
  const incomplete = checks.check_runs.filter(c => c.status !== 'completed');
  if (incomplete.length > 0) return { merged: false, reason: `${incomplete.length} check(s) pending` };
  // Resolve canonical name (cached) so the merge PUT doesn't 404 on case mismatch.
  const canonical = (await _resolveCanonical(OWNER, repo)) || { owner: OWNER, repo };
  const res = await fetch(`https://api.github.com/repos/${canonical.owner}/${canonical.repo}/pulls/${pr.number}/merge`, {
    method: 'PUT',
    headers: _ghHeaders({ 'Content-Type': 'application/json' }),
    redirect: 'follow',
    body: JSON.stringify({ merge_method: 'squash', commit_title: `auto-merge: ${pr.title}` }),
  });
  if (res.ok) return { merged: true, reason: 'merged', at: new Date().toISOString() };
  return { merged: false, reason: `${res.status} ${await res.text().catch(() => '')}` };
}

async function runSweep(opts = {}) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN or ECOSYSTEM_PAT required');
  const peers = loadPeers();
  const reports = [];
  for (const p of peers) reports.push(await probeRepo(p));
  const merged = [];
  if (opts.autoMerge !== false) {
    for (const r of reports) {
      if (r.status !== 'healthy' || !r.reflectorPRList) continue;
      for (const pr of r.reflectorPRList) {
        const result = await tryAutoMergeReflector(r.repo, pr);
        if (result.merged) merged.push({ repo: r.repo, number: pr.number, title: pr.title });
      }
    }
  }
  return { reports, merged, at: new Date().toISOString() };
}

function toMarkdown({ reports, merged, at }) {
  const icon = { healthy: '🟢', warning: '🟡', critical: '🔴', error: '⚫', empty: '⚪' };
  const lines = [
    `# Ecosystem Sweep — ${at}`,
    '',
    `${reports.length} repos probed. ${merged.length} reflector PR(s) auto-merged.`,
    '',
    '| repo | status | open PRs | reflector PRs | last commit (d) | last CI |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of reports) {
    lines.push(`| \`${r.repo}\` | ${icon[r.status] || '?'} ${r.status} | ${r.openPRs ?? '-'} | ${r.reflectorPRs ?? '-'} | ${r.lastCommitAge ?? '-'} | ${r.lastRunStatus || '-'} |`);
  }
  if (merged.length) {
    lines.push('', '## Auto-merged reflector PRs', '');
    for (const m of merged) lines.push(`- \`${m.repo}\` **#${m.number}** ${m.title}`);
  }
  const errored = reports.filter(r => r.status === 'error');
  if (errored.length) {
    lines.push('', '## Probe errors', '');
    for (const e of errored) lines.push(`- \`${e.repo}\`: ${e.error}`);
  }
  return lines.join('\n');
}

runSweep.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'orchestration',
};

if (require.main === module) {
  runSweep()
    .then(r => { console.log(toMarkdown(r)); process.exit(0); })
    .catch(e => { console.error(`# Sweep Failed\n\n${e.message}`); process.exit(1); });
}

module.exports = { runSweep, toMarkdown, probeRepo, loadPeers, tryAutoMergeReflector, _resolveCanonical, _canonicalCache };
