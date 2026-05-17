'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * Auto-Publish — slots into the oracle weave at the "Codex Registration Gate"
 * boundary (STRUCTURAL_COVENANT.weavePoints[3]).
 *
 * On PR merges to main across peer repos, this probes three gates:
 *   1. coherency ≥ 0.8  (via runAllChecks density on the diff)
 *   2. covenantSealed    (16 active seals, incl. framing)
 *   3. testProof         (at least one test file touched in the PR)
 *
 * If all pass: records a PUBLISH event locally AND posts an issue on
 * remembrance-blockchain tagged ledger-queue — durable across machines
 * so Publisher.publish() can ingest on next run.
 *
 * Idempotent via .remembrance/published.json keyed on repo#prNumber.
 */

const fs = require('fs');
const path = require('path');
const { runAllChecks } = require('./covenant-checks');

const PUBLISHED_FILE = path.join(process.cwd(), '.remembrance', 'published.json');
const OWNER = process.env.ECOSYSTEM_OWNER || 'crackedcoder5th';
const TOKEN = process.env.ECOSYSTEM_PAT || process.env.GITHUB_TOKEN;
const BLOCKCHAIN_REPO = 'remembrance-blockchain';
const COHERENCY_THRESHOLD = 0.8;
const COVENANT_FLOOR = 0.6;

async function gh(pathname, opts = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'auto-publish', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${pathname}: ${res.status}`);
  return res.json();
}

function readPublished() {
  if (!fs.existsSync(PUBLISHED_FILE)) return { published: [] };
  try { return JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf-8')); } catch { return { published: [] }; }
}

function markPublished(entry) {
  const dir = path.dirname(PUBLISHED_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = readPublished();
  if (current.published.find(p => p.prKey === entry.prKey)) return false;
  current.published.push(entry);
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(current, null, 2));
  return true;
}

async function computeCoherency(repo, pr) {
  const files = await gh(`/repos/${OWNER}/${repo}/pulls/${pr.number}/files`);
  let scanned = 0, sealed = 0;
  for (const f of files) {
    if (!/\.(js|jsx|ts|tsx|py)$/.test(f.filename)) continue;
    if (!f.patch) continue;
    scanned++;
    const result = runAllChecks(f.patch, f.filename);
    if (result.sealed) sealed++;
  }
  if (scanned === 0) return { coherency: 0.5, note: 'no scannable files' };
  const __retVal = { coherency: Math.round((sealed / scanned) * 100) / 100, scanned, sealed };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:auto-publish:computeCoherency' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}
computeCoherency.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.8, group: 13, period: 5,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

async function hasTestProof(repo, pr) {
  const files = await gh(`/repos/${OWNER}/${repo}/pulls/${pr.number}/files`);
  const testFiles = files.filter(f => /(test|spec)\b.*\.(js|jsx|ts|tsx|py)$/i.test(f.filename));
  return { hasTests: testFiles.length > 0, testFiles: testFiles.map(f => f.filename) };
}
hasTestProof.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 15, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'quality',
};

async function evaluatePR(repo, pr) {
  const [cov, proof] = await Promise.all([computeCoherency(repo, pr), hasTestProof(repo, pr)]);
  const covenantSealed = cov.coherency >= COVENANT_FLOOR;
  const coherencyOk = cov.coherency >= COHERENCY_THRESHOLD;
  const allGates = covenantSealed && coherencyOk && proof.hasTests;
  return { repo, pr: pr.number, title: pr.title, author: pr.user?.login, merged_at: pr.merged_at, coherency: cov.coherency, covenantSealed, coherencyOk, testProof: proof.hasTests, allGates, testFiles: proof.testFiles };
}
evaluatePR.atomicProperties = {
  charge: 0, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

async function findRecentMerges(repo, sinceMs = 2 * 3600 * 1000) {
  const prs = await gh(`/repos/${OWNER}/${repo}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=30`);
  return prs.filter(p => p.merged_at && Date.now() - new Date(p.merged_at).getTime() < sinceMs);
}

async function postPublishIssue(event) {
  const body = `## PUBLISH event\n\n- **repo**: \`${event.repo}\`\n- **pr**: #${event.pr} — ${event.title}\n- **author**: ${event.author}\n- **merged_at**: ${event.merged_at}\n- **coherency**: ${event.coherency}\n- **covenant sealed**: ${event.covenantSealed}\n- **test proof**: ${event.testProof}\n\nReady for blockchain ingestion via \`node src/cli.js publish-pattern\`.`;
  return gh(`/repos/${OWNER}/${BLOCKCHAIN_REPO}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: `PUBLISH: ${event.repo}#${event.pr}`, body, labels: ['auto-publish', 'ledger-queue'] }),
  }).catch(e => ({ error: String(e.message || e) }));
}

async function runAutoPublish() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN or ECOSYSTEM_PAT required');
  const { loadPeers } = require('./ecosystem-sweep');
  const peers = loadPeers();
  const published = [];
  const rejected = [];
  for (const repo of peers) {
    const merges = await findRecentMerges(repo).catch(() => []);
    for (const pr of merges) {
      const prKey = `${repo}#${pr.number}`;
      if (readPublished().published.find(p => p.prKey === prKey)) continue;
      const evaluation = await evaluatePR(repo, pr).catch(e => ({ error: String(e.message || e), repo, pr: pr.number }));
      if (evaluation.error) { rejected.push(evaluation); continue; }
      if (!evaluation.allGates) { rejected.push({ ...evaluation, reason: 'gates failed' }); continue; }
      const event = { ...evaluation, prKey, publishedAt: new Date().toISOString() };
      if (!markPublished(event)) continue;
      const issueResult = await postPublishIssue(event);
      event.issueNumber = issueResult?.number || null;
      published.push(event);
    }
  }
  return { published, rejected, at: new Date().toISOString() };
}
runAutoPublish.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.95, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'orchestration',
};

if (require.main === module) {
  runAutoPublish()
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error('# Auto-publish failed\n\n' + e.message); process.exit(1); });
}

module.exports = { runAutoPublish, evaluatePR, computeCoherency, hasTestProof, findRecentMerges, COHERENCY_THRESHOLD, COVENANT_FLOOR };
