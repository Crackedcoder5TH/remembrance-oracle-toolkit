/**
 * Covenant Evolution — The Living Law
 *
 * The 15 covenant principles are eternal, but the law must grow.
 * When new vulnerability classes emerge, the covenant learns new principles
 * by analyzing patterns of failures.
 *
 * Discovery Process:
 *   1. Collect covenant violations and rejection reasons
 *   2. Cluster similar violations by pattern
 *   3. If a new cluster has >= threshold occurrences, propose a new principle
 *   4. The new principle gets a detection regex and description
 *   5. It's registered via setPrincipleRegistry as an evolved principle
 *
 * This doesn't modify the original 15 — it extends them.
 */

const fs = require('fs');
const path = require('path');

// ─── Evolved Principle Store ───

const EVOLVED_PRINCIPLES_FILE = '.remembrance/evolved-principles.json';

/**
 * Load evolved principles from disk.
 */
function loadEvolvedPrinciples(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, EVOLVED_PRINCIPLES_FILE);
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { principles: [], violations: [], version: 1 };
  }
}

/**
 * Save evolved principles to disk.
 */
function saveEvolvedPrinciples(data, rootDir = process.cwd()) {
  const filePath = path.join(rootDir, EVOLVED_PRINCIPLES_FILE);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Record a violation that the current covenant didn't catch.
 * These are "near-misses" — code that passed covenant but caused problems later.
 *
 * @param {string} code — The code that caused the issue
 * @param {string} reason — Why it was problematic
 * @param {string} category — Category of the issue (e.g., 'prompt-injection', 'resource-leak')
 */
function recordViolation(code, reason, category, rootDir = process.cwd()) {
  const data = loadEvolvedPrinciples(rootDir);
  data.violations.push({
    timestamp: new Date().toISOString(),
    category,
    reason,
    codeSnippet: code.slice(0, 200),
    codeLength: code.length,
  });
  // Keep last 500 violations
  if (data.violations.length > 500) {
    data.violations = data.violations.slice(-500);
  }
  saveEvolvedPrinciples(data, rootDir);
}

/**
 * Analyze recorded violations and discover potential new principles.
 * Returns proposed principles based on recurring violation patterns.
 *
 * @param {object} options — { minOccurrences, rootDir }
 */
function discoverPrinciples(options = {}) {
  const { minOccurrences = 3, rootDir = process.cwd() } = options;
  const data = loadEvolvedPrinciples(rootDir);

  // Cluster violations by category
  const clusters = {};
  for (const v of data.violations) {
    const cat = v.category || 'unknown';
    if (!clusters[cat]) {
      clusters[cat] = { category: cat, count: 0, reasons: [], snippets: [] };
    }
    clusters[cat].count++;
    if (clusters[cat].reasons.length < 5) clusters[cat].reasons.push(v.reason);
    if (clusters[cat].snippets.length < 3) clusters[cat].snippets.push(v.codeSnippet);
  }

  // Find clusters with enough occurrences that aren't already evolved principles
  const existingCategories = new Set(data.principles.map(p => p.category));
  const proposals = [];

  for (const [cat, cluster] of Object.entries(clusters)) {
    if (cluster.count >= minOccurrences && !existingCategories.has(cat)) {
      // Generate a detection pattern from common code snippets
      const pattern = _inferPattern(cluster.snippets);
      proposals.push({
        category: cat,
        occurrences: cluster.count,
        reasons: cluster.reasons,
        suggestedPattern: pattern,
        suggestedName: _categoryToName(cat),
        suggestedSeal: `Code must not contain ${cat} patterns. Discovered from ${cluster.count} violations.`,
      });
    }
  }

  return proposals;
}

/**
 * Promote a discovered principle to an evolved covenant principle.
 * This makes it active — future covenant checks will include it.
 */
function promotePrinciple(proposal, rootDir = process.cwd()) {
  const data = loadEvolvedPrinciples(rootDir);

  const principle = {
    id: 100 + data.principles.length + 1, // IDs start at 101 to not conflict with core 15
    name: proposal.suggestedName,
    seal: proposal.suggestedSeal,
    category: proposal.category,
    pattern: proposal.suggestedPattern,
    discoveredAt: new Date().toISOString(),
    discoveredFrom: proposal.occurrences,
    active: true,
  };

  data.principles.push(principle);
  data.version++;
  saveEvolvedPrinciples(data, rootDir);

  return principle;
}

/**
 * Create a PrincipleRegistry adapter for evolved principles.
 * Pass this to setPrincipleRegistry() to make evolved principles active.
 */
function createEvolvedRegistry(rootDir = process.cwd()) {
  const data = loadEvolvedPrinciples(rootDir);
  const activePrinciples = data.principles.filter(p => p.active);

  return {
    check(code) {
      const violations = [];
      for (const p of activePrinciples) {
        if (p.pattern) {
          try {
            const regex = new RegExp(p.pattern, 'i');
            if (regex.test(code)) {
              violations.push({
                principle: p.id,
                name: p.name,
                seal: p.seal,
                reason: `Evolved principle "${p.name}" violated (category: ${p.category})`,
              });
            }
          } catch {
            // Invalid regex — skip
          }
        }
      }
      return violations;
    },
    list() {
      return activePrinciples;
    },
  };
}

/**
 * Get summary of the evolved covenant.
 */
function evolvedCovenantStats(rootDir = process.cwd()) {
  const data = loadEvolvedPrinciples(rootDir);
  return {
    evolvedPrinciples: data.principles.length,
    activePrinciples: data.principles.filter(p => p.active).length,
    totalViolations: data.violations.length,
    categories: [...new Set(data.violations.map(v => v.category))],
    version: data.version,
  };
}

// ─── Helpers ───

function _inferPattern(snippets) {
  if (snippets.length === 0) return null;
  // Look for common suspicious keywords across snippets
  const allText = snippets.join(' ').toLowerCase();
  const suspicious = [
    'eval\\s*\\(', 'Function\\s*\\(', 'innerHTML',
    'document\\.write', 'window\\.location', '__proto__',
    'constructor\\[', 'process\\.exit', 'require\\s*\\(',
  ];
  const matched = suspicious.filter(p => new RegExp(p, 'i').test(allText));
  return matched.length > 0 ? matched.join('|') : null;
}

function _categoryToName(category) {
  const words = category.replace(/[-_]/g, ' ').split(' ');
  return 'The ' + words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ') + ' Guard';
}

module.exports = {
  recordViolation,
  discoverPrinciples,
  promotePrinciple,
  createEvolvedRegistry,
  evolvedCovenantStats,
  loadEvolvedPrinciples,
};
