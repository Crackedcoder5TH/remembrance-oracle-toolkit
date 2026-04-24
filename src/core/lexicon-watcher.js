'use strict';

/**
 * Lexicon Watcher — auto-detects new functions, terms, architectural shifts,
 * AND atomicProperties declarations. Queues proposals; auto-promotes at
 * synergy coherency.
 *
 * When a scanned function carries an atomicProperties block, the proposal is
 * upgraded with the 13D signature and kind='element' — this is what makes
 * the Codex (periodic table) auto-grow across repo boundaries, not just via
 * the local post-commit hook.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SEAL_REGISTRY } = require('./seal-registry');

const PROPOSAL_FILE = path.join(process.cwd(), '.remembrance', 'lexicon-proposals.json');
const FLUCTUATION_THRESHOLD = 0.03;
const SYNERGY_COHERENCY = 0.85;
const RECENT_WINDOW = 8;

const history = [];

function observe(score, context = {}) {
  history.push({ score, at: Date.now(), context });
  if (history.length > RECENT_WINDOW * 4) history.shift();
  return detectFluctuation();
}
observe.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.75, group: 13, period: 4,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

function detectFluctuation() {
  if (history.length < 2) return { fluctuated: false, reason: 'insufficient samples' };
  const recent = history.slice(-RECENT_WINDOW);
  const mean = recent.reduce((s, h) => s + h.score, 0) / recent.length;
  const current = recent[recent.length - 1].score;
  const delta = Math.abs(current - mean);
  return { fluctuated: delta >= FLUCTUATION_THRESHOLD, delta: Math.round(delta * 1000) / 1000, current, mean: Math.round(mean * 1000) / 1000, direction: current > mean ? 'rising' : 'falling' };
}

/**
 * Parse an atomicProperties object literal into a JS object.
 * Handles key: 'string', key: number, key: unquoted-identifier.
 * Returns {} on parse failure — never throws.
 */
function parseAtomicBlock(body) {
  const out = {};
  const KEYS = ['charge','valence','mass','spin','phase','reactivity','electronegativity','group','period','harmPotential','alignment','intention','domain'];
  for (const key of KEYS) {
    const m = body.match(new RegExp(`\\b${key}\\s*:\\s*([^,\\n}]+)`));
    if (!m) continue;
    let v = m[1].trim().replace(/,$/, '').trim();
    const str = v.match(/^['"](.*)['"]\s*$/);
    if (str) { out[key] = str[1]; continue; }
    const num = v.match(/^-?\d+(?:\.\d+)?$/);
    if (num) { out[key] = parseFloat(v); continue; }
    out[key] = v;
  }
  return out;
}
parseAtomicBlock.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 3, period: 2,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'covenant',
};

function scanChanges(opts = {}) {
  const findings = { functions: [], elements: [], terms: [], architectural: [] };
  let diffOutput;
  try {
    diffOutput = execSync(opts.ref ? `git show ${opts.ref} --name-only` : 'git diff HEAD~1 HEAD --name-only', { encoding: 'utf-8' });
  } catch { return findings; }
  const files = diffOutput.split('\n').filter(f => f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.py'));
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf-8');
    const fnMatches = code.matchAll(/(?:module\.exports\.|export\s+(?:const|function|default\s+function|class)\s+|exports\.)(\w+)/g);
    for (const m of fnMatches) {
      const name = m[1];
      if (!name || name.startsWith('_')) continue;
      const atomicRe = new RegExp(`${name}\\.atomicProperties\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`);
      const atomicMatch = code.match(atomicRe);
      if (atomicMatch) {
        findings.elements.push({ name, file, atomicProperties: parseAtomicBlock(atomicMatch[1]) });
      } else {
        findings.functions.push({ name, file });
      }
    }
    const termMatches = code.matchAll(/(?:const|let)\s+([A-Z_][A-Z0-9_]{4,})\s*=/g);
    for (const m of termMatches) findings.terms.push({ name: m[1], file });
    if (/class\s+\w+|extends\s+EventEmitter|new\s+Worker|new\s+MCPServer/.test(code)) {
      findings.architectural.push({ file, hint: 'class/emitter/worker detected' });
    }
  }
  return findings;
}
scanChanges.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.8, group: 15, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

function proposeLexiconEntries(findings, coherencyContext = {}) {
  const now = new Date().toISOString();
  const proposals = [];
  for (const e of findings.elements || []) {
    proposals.push({ kind: 'element', name: e.name, source: e.file, atomicProperties: e.atomicProperties, proposedAt: now, status: 'pending', coherencyContext });
  }
  for (const f of findings.functions || []) {
    proposals.push({ kind: 'function', name: f.name, source: f.file, proposedAt: now, status: 'pending', coherencyContext });
  }
  for (const t of findings.terms || []) {
    proposals.push({ kind: 'term', name: t.name, source: t.file, proposedAt: now, status: 'pending', coherencyContext });
  }
  for (const a of findings.architectural || []) {
    proposals.push({ kind: 'architectural', name: `arch:${path.basename(a.file)}`, source: a.file, hint: a.hint, proposedAt: now, status: 'pending', coherencyContext });
  }
  return proposals;
}

function persist(proposals) {
  const dir = path.dirname(PROPOSAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let existing = [];
  if (fs.existsSync(PROPOSAL_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf-8')); }
    catch { existing = []; }
  }
  const seen = new Set(existing.map(p => `${p.kind}:${p.name}:${p.source}`));
  const fresh = proposals.filter(p => !seen.has(`${p.kind}:${p.name}:${p.source}`));
  const merged = [...existing, ...fresh];
  fs.writeFileSync(PROPOSAL_FILE, JSON.stringify(merged, null, 2));
  return { added: fresh.length, total: merged.length, elements: fresh.filter(p => p.kind === 'element').length };
}

function autoApproveIfCoherent(currentCoherency) {
  if (currentCoherency < SYNERGY_COHERENCY) return { promoted: 0, reason: 'below synergy threshold' };
  if (!fs.existsSync(PROPOSAL_FILE)) return { promoted: 0, reason: 'no proposals' };
  const all = JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf-8'));
  let promoted = 0, elementsPromoted = 0;
  for (const p of all) {
    if (p.status === 'pending') {
      p.status = 'active';
      p.approvedBy = 'lexicon-watcher';
      p.approvedAt = new Date().toISOString();
      promoted++;
      if (p.kind === 'element') elementsPromoted++;
    }
  }
  fs.writeFileSync(PROPOSAL_FILE, JSON.stringify(all, null, 2));
  return { promoted, elementsPromoted, totalActive: all.filter(p => p.status === 'active').length };
}

function runCycle({ coherency, ref }) {
  const fluctuation = coherency != null ? observe(coherency, { ref }) : { fluctuated: true, reason: 'no coherency supplied, running anyway' };
  if (!fluctuation.fluctuated) return { action: 'skipped', fluctuation };
  const findings = scanChanges({ ref });
  const proposals = proposeLexiconEntries(findings, fluctuation);
  const persistResult = persist(proposals);
  const promotion = coherency != null ? autoApproveIfCoherent(coherency) : { promoted: 0, reason: 'no coherency' };
  return { action: 'scanned', fluctuation, findings: { functionCount: findings.functions.length, elementCount: findings.elements.length, termCount: findings.terms.length, archCount: findings.architectural.length }, proposals: proposals.length, persistResult, promotion, sealCount: SEAL_REGISTRY.length };
}
runCycle.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 6,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--scan-head') console.log(JSON.stringify(runCycle({ ref: 'HEAD' }), null, 2));
  else console.log('Usage: node lexicon-watcher.js --scan-head');
}

module.exports = { observe, detectFluctuation, scanChanges, parseAtomicBlock, proposeLexiconEntries, persist, autoApproveIfCoherent, runCycle, FLUCTUATION_THRESHOLD, SYNERGY_COHERENCY };
