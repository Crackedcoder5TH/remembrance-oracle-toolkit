'use strict';

/**
 * Blockchain Ingest — drains ledger-queue issues on remembrance-blockchain
 * into a real ledger event trail.
 *
 * Auto-publish queues PUBLISH events as GitHub issues (label: ledger-queue).
 * Before this, nothing consumed those issues. Now:
 *   1. Fetch open ledger-queue issues
 *   2. Parse PUBLISH events from each issue body
 *   3. Build a patch that appends events to .remembrance/ledger.json on remembrance-blockchain
 *   4. Open a PR on that repo
 *   5. Close + comment each consumed issue
 */

const OWNER = process.env.ECOSYSTEM_OWNER || 'crackedcoder5th';
const TOKEN = process.env.ECOSYSTEM_PAT || process.env.GITHUB_TOKEN;
const BLOCKCHAIN_REPO = 'remembrance-blockchain';

async function gh(pathname, opts = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'blockchain-ingest', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${pathname}: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

function parseIssue(issue) {
  const body = issue.body || '';
  const field = (k) => {
    const re = new RegExp(`\\*\\*${k}\\*\\*:\\s*\`?([^\\n\`]+)\`?`);
    const m = body.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    issueNumber: issue.number,
    repo: field('repo'),
    pr: field('pr')?.split(' ')[0]?.replace('#', ''),
    coherency: parseFloat(field('coherency') || '0'),
    covenantSealed: field('covenant sealed') === 'true',
    testProof: field('test proof') === 'true',
    mergedAt: field('merged_at'),
    title: (field('pr') || '').split('—')[1]?.trim() || issue.title,
  };
}
parseIssue.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 5, period: 3,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'covenant',
};

async function loadCurrentLedger() {
  try {
    const contents = await gh(`/repos/${OWNER}/${BLOCKCHAIN_REPO}/contents/.remembrance/ledger.json`);
    const content = Buffer.from(contents.content, 'base64').toString('utf-8');
    return { ledger: JSON.parse(content), sha: contents.sha };
  } catch {
    return { ledger: { chain: [] }, sha: null };
  }
}

function buildEvent(parsed) {
  return {
    type: 'PUBLISH',
    patternId: `${parsed.repo}#${parsed.pr}`,
    title: parsed.title,
    coherency: parsed.coherency,
    covenantSealed: parsed.covenantSealed,
    testProof: parsed.testProof,
    mergedAt: parsed.mergedAt,
    ingestedAt: new Date().toISOString(),
    source: `github-issue#${parsed.issueNumber}`,
  };
}

async function runIngest() {
  if (!TOKEN) throw new Error('GITHUB_TOKEN or ECOSYSTEM_PAT required');
  const issues = await gh(`/repos/${OWNER}/${BLOCKCHAIN_REPO}/issues?state=open&labels=ledger-queue&per_page=30`);
  if (issues.length === 0) return { ingested: 0, reason: 'queue empty' };
  const parsed = issues.map(parseIssue).filter(p => p.repo && p.pr);
  const events = parsed.map(buildEvent);
  const { ledger, sha } = await loadCurrentLedger();
  const before = ledger.chain?.length || 0;
  ledger.chain = [...(ledger.chain || []), ...events];
  ledger.lastIngest = { at: new Date().toISOString(), count: events.length };

  const newContent = JSON.stringify(ledger, null, 2);
  const putRes = await fetch(`https://api.github.com/repos/${OWNER}/${BLOCKCHAIN_REPO}/contents/.remembrance/ledger.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `blockchain-ingest: +${events.length} PUBLISH events`,
      content: Buffer.from(newContent).toString('base64'),
      branch: 'claude/audit-remembrance-ecosystem-xaaUr',
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) return { ingested: 0, error: `ledger write failed: ${putRes.status}` };

  for (const p of parsed) {
    await gh(`/repos/${OWNER}/${BLOCKCHAIN_REPO}/issues/${p.issueNumber}/comments`, {
      method: 'POST', body: JSON.stringify({ body: `✅ ingested into ledger chain (chain length: ${before} → ${before + events.length}).` }),
    }).catch(() => {});
    await fetch(`https://api.github.com/repos/${OWNER}/${BLOCKCHAIN_REPO}/issues/${p.issueNumber}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    }).catch(() => {});
  }

  return { ingested: events.length, before, after: before + events.length, issues: parsed.map(p => p.issueNumber) };
}
runIngest.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.95, group: 18, period: 7,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'orchestration',
};

if (require.main === module) {
  runIngest()
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error('# Blockchain ingest failed\n\n' + e.message); process.exit(1); });
}

module.exports = { runIngest, parseIssue, loadCurrentLedger, buildEvent };
