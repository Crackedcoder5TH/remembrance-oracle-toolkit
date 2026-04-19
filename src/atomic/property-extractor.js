'use strict';

/**
 * Atomic Property Extractor — analyzes code and produces atomic
 * properties by wrapping the oracle's existing analyzers.
 *
 * Uses:
 *   - audit/ground.js: for scope analysis (charge, valence)
 *   - audit/parser.js: for tokenization (mass via complexity)
 *   - audit/static-checkers.js: for reactivity (bug-class frequency)
 *   - unified/coherency.js: for overall quality signals
 *
 * The extraction is HEURISTIC — it maps observable code properties
 * to atomic properties via reasonable rules, not perfect analysis.
 * The heuristic is calibrated so that the SAME function always
 * produces the SAME signature, which is the key invariant for
 * compression (same signature = interchangeable = compressible).
 */

const { tokenize } = require('../audit/parser');

/**
 * Extract atomic properties from a code string.
 *
 * @param {string} code - source code to analyze
 * @param {object} [options]
 *   - language: 'javascript' | 'python' | 'typescript' (default: auto-detect)
 * @returns {{ charge, valence, mass, spin, phase, reactivity, electronegativity, group, period }}
 */
function extractAtomicProperties(code, options = {}) {
  if (!code || typeof code !== 'string') {
    return defaultProperties();
  }

  const tokens = safeTokenize(code);
  const lines = code.split('\n');
  const lineCount = lines.length;

  // ── Charge: does the function expand or contract scope? ─────────
  // Positive = creates new bindings / exports / expands data
  // Negative = reduces, filters, contracts data
  // Neutral = transforms in place
  const charge = computeCharge(code, tokens);

  // ── Valence: how many external dependencies? ────────────────────
  // Count require/import statements + external function calls
  const valence = computeValence(code, tokens);

  // ── Mass: complexity / payload size ─────────────────────────────
  // Light = O(1), few lines. Medium = O(n), moderate. Heavy = O(n²)+, complex.
  const mass = computeMass(code, tokens, lineCount);

  // ── Spin: reversible (pure) or irreversible (side effects)? ─────
  const spin = computeSpin(code, tokens);

  // ── Phase: cached (solid), mutable (liquid), computed (gas) ─────
  const phase = computePhase(code, tokens);

  // ── Reactivity: how much does it interact with external state? ──
  const reactivity = computeReactivity(code, tokens);

  // ── Electronegativity: how strongly does it pull deps? ──────────
  const electronegativity = computeElectronegativity(code, tokens);

  // ── Group: functional family (1-18) ─────────────────────────────
  const group = computeGroup(code, tokens);

  // ── Period: abstraction level (1-7) ─────────────────────────────
  const period = computePeriod(code, tokens, lineCount);

  return {
    charge, valence, mass, spin, phase,
    reactivity, electronegativity, group, period,
    harmPotential: computeHarmPotential(code, tokens),
    alignment: computeAlignment(code, tokens),
    intention: computeIntention(code, tokens),
    domain: computeDomain(code, tokens, options),
  };
}

// ── Individual property computers ───────────────────────────────────

function computeCharge(code, tokens) {
  // Positive indicators: creates new variables, returns larger structures
  const expansions = countMatches(code, [
    /\bnew\s+\w/g, /\.push\b/g, /\.concat\b/g, /\.assign\b/g,
    /\.create\b/g, /\.append\b/g, /\.extend\b/g, /exports\.\w/g,
    /module\.exports/g, /\.map\b/g, /\.flatMap\b/g,
  ]);
  // Negative indicators: filters, reduces, removes
  const contractions = countMatches(code, [
    /\.filter\b/g, /\.reduce\b/g, /\.slice\b/g, /\.pop\b/g,
    /\.shift\b/g, /\.splice\b/g, /delete\s/g, /\.trim\b/g,
    /\.substring\b/g, /\.replace\b/g,
  ]);
  if (expansions > contractions + 2) return 1;
  if (contractions > expansions + 2) return -1;
  return 0;
}

function computeValence(code, tokens) {
  // Count require/import statements
  const imports = (code.match(/\brequire\s*\(/g) || []).length
    + (code.match(/\bimport\s+/g) || []).length;
  // Cap at 8
  return Math.min(8, imports);
}

function computeMass(code, tokens, lineCount) {
  // Nesting depth as complexity proxy
  let maxDepth = 0;
  let currentDepth = 0;
  for (const t of tokens) {
    if (t.value === '{' || t.value === '(') currentDepth++;
    if (t.value === '}' || t.value === ')') currentDepth--;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  }
  // Loop count as another proxy
  const loops = countMatches(code, [/\bfor\s*\(/g, /\bwhile\s*\(/g, /\.forEach\b/g, /\.map\b/g]);
  const nestedLoops = maxDepth > 5 || loops > 3;

  if (lineCount < 20 && maxDepth < 4 && loops <= 1) return 'light';
  if (nestedLoops || lineCount > 100 || maxDepth > 6) return 'heavy';
  return 'medium';
}

function computeSpin(code, tokens) {
  // Side-effect indicators → odd spin (irreversible)
  const sideEffects = countMatches(code, [
    /console\.\w/g, /fs\.\w/g, /process\.\w/g,
    /\.write\b/g, /\.send\b/g, /\.emit\b/g,
    /\.delete\b/g, /\.remove\b/g, /throw\s/g,
    /Math\.random/g, /Date\.now/g, /new\s+Date/g,
  ]);
  return sideEffects > 0 ? 'odd' : 'even';
}

function computePhase(code, tokens) {
  // Solid = caching / memoization patterns
  const cachingPatterns = countMatches(code, [
    /\bcache\b/gi, /\bmemo\b/gi, /\.get\b.*\.set\b/g,
    /WeakMap|WeakSet/g, /Map\(\)/g,
  ]);
  if (cachingPatterns > 0) return 'solid';

  // Gas = computed / derived on every call
  const computedPatterns = countMatches(code, [
    /get\s+\w+\s*\(/g, /Object\.defineProperty/g,
    /=>.*=>/g, // nested arrows = functional derivation
  ]);
  if (computedPatterns > 0) return 'gas';

  // Liquid = mutable state
  const mutablePatterns = countMatches(code, [
    /\blet\s+/g, /\bvar\s+/g, /\+\+|\-\-/g,
    /\+=|\-=|\*=|\/=/g, /\.push\b/g, /\.splice\b/g,
  ]);
  if (mutablePatterns > 2) return 'liquid';

  return 'gas'; // default: computed
}

function computeReactivity(code, tokens) {
  const externalCalls = countMatches(code, [
    /fetch\b/g, /axios\b/g, /\.request\b/g,
    /child_process/g, /exec\b/g, /spawn\b/g,
    /\.connect\b/g, /\.listen\b/g, /\.on\b.*=>/g,
  ]);
  const ioOps = countMatches(code, [
    /fs\.\w/g, /readFile|writeFile/g,
    /stdin|stdout|stderr/g, /process\.env/g,
  ]);
  const total = externalCalls + ioOps;
  if (total === 0) return 'inert';
  if (total <= 2) return 'low';
  if (total <= 5) return 'medium';
  return 'high';
}

function computeElectronegativity(code, tokens) {
  // How strongly the function pulls dependencies toward itself
  // High import count relative to export count = high electronegativity
  const imports = (code.match(/\brequire\s*\(/g) || []).length
    + (code.match(/\bimport\s+/g) || []).length;
  const exports = (code.match(/exports\.\w/g) || []).length
    + (code.match(/module\.exports/g) || []).length
    + (code.match(/\bexport\s+/g) || []).length;
  if (imports + exports === 0) return 0;
  return Math.round((imports / (imports + exports)) * 100) / 100;
}

function computeGroup(code, tokens) {
  // Detect functional family by keyword presence
  const indicators = {
    1:  countMatches(code, [/Math\.\w/g, /\+\s*\d|\-\s*\d|\*\s*\d|\/\s*\d/g, /parseInt|parseFloat|Number\(/g]),
    2:  countMatches(code, [/===|!==|>=|<=|>(?!=)|<(?!=)/g, /\.includes\b/g, /\.test\b/g]),
    3:  countMatches(code, [/\.split\b/g, /\.join\b/g, /\.replace\b/g, /\.trim\b/g, /template|`/g]),
    4:  countMatches(code, [/\.map\b/g, /\.filter\b/g, /\.reduce\b/g, /\.forEach\b/g, /Array\./g, /\[\.\.\./g]),
    5:  countMatches(code, [/Object\.\w/g, /\.keys\b/g, /\.values\b/g, /\.entries\b/g, /\{\s*\.\.\./g]),
    6:  countMatches(code, [/fs\.\w/g, /readFile|writeFile/g, /\.pipe\b/g, /createReadStream/g]),
    7:  countMatches(code, [/fetch\b/g, /http\b/g, /\.request\b/g, /socket\b/g, /axios\b/g]),
    8:  countMatches(code, [/async\b/g, /await\b/g, /Promise\b/g, /\.then\b/g, /Stream\b/g]),
    9:  countMatches(code, [/try\s*\{/g, /catch\b/g, /throw\b/g, /Error\b/g, /assert\b/g]),
    10: countMatches(code, [/useState|setState/g, /\.set\b.*\.get\b/g, /cache\b/gi, /store\b/gi]),
    11: countMatches(code, [/transform\b/gi, /convert\b/gi, /encode\b/gi, /decode\b/gi, /parse\b/g]),
    12: countMatches(code, [/\.filter\b/g, /\.find\b/g, /\.some\b/g, /\.every\b/g, /\.match\b/g]),
    13: countMatches(code, [/\.reduce\b/g, /\.length\b/g, /count\b/gi, /sum\b/gi, /total\b/gi]),
    14: countMatches(code, [/\.sort\b/g, /\.reverse\b/g, /compare\b/gi, /order\b/gi]),
    15: countMatches(code, [/\.indexOf\b/g, /\.findIndex\b/g, /\.search\b/g, /Map\..*\.get/g]),
    16: countMatches(code, [/crypto\b/g, /hash\b/gi, /hmac\b/gi, /encrypt\b/gi, /sha\d/gi]),
    17: countMatches(code, [/compress\b/gi, /zlib\b/g, /deflate\b/gi, /encode\b/gi, /serialize\b/gi]),
    18: countMatches(code, [/eval\b/g, /Function\b/g, /Proxy\b/g, /Reflect\b/g, /require\b.*require/g]),
  };
  // Return the group with the highest indicator count
  let best = 11; // default: transform
  let bestCount = 0;
  for (const [g, count] of Object.entries(indicators)) {
    if (count > bestCount) { best = parseInt(g); bestCount = count; }
  }
  return best;
}

function computePeriod(code, tokens, lineCount) {
  // Abstraction level:
  //   1 = primitive (single operation, < 5 lines)
  //   2 = helper (small utility, 5-15 lines)
  //   3 = function (standard function, 15-50 lines)
  //   4 = module (multi-function, 50-150 lines)
  //   5 = component (class/large module, 150-500 lines)
  //   6 = subsystem (multi-module, 500-1500 lines)
  //   7 = framework (large system, 1500+ lines)
  if (lineCount <= 5) return 1;
  if (lineCount <= 15) return 2;
  if (lineCount <= 50) return 3;
  if (lineCount <= 150) return 4;
  if (lineCount <= 500) return 5;
  if (lineCount <= 1500) return 6;
  return 7;
}

// ── Helpers ─────────────────────────────────────────────────────────

function countMatches(code, patterns) {
  let total = 0;
  for (const p of patterns) {
    const m = code.match(p);
    if (m) total += m.length;
  }
  return total;
}

function safeTokenize(code) {
  try { return tokenize(code); }
  catch { return []; }
}

// ── Covenant dimension computers ────────────────────────────────────

function computeHarmPotential(code, tokens) {
  const dangerous = countMatches(code, [
    /eval\s*\(/g, /exec\s*\(/g, /child_process/g, /rm\s+-rf/g,
    /DROP\s+TABLE/gi, /DELETE\s+FROM/gi, /\.destroy\b/g,
    /process\.exit/g, /process\.kill/g,
  ]);
  const io = countMatches(code, [
    /fs\.write/g, /fs\.unlink/g, /\.send\b/g, /\.emit\b/g,
    /\.delete\b/g, /\.remove\b/g,
  ]);
  if (dangerous > 0) return 'dangerous';
  if (io > 3) return 'moderate';
  if (io > 0) return 'minimal';
  return 'none';
}

function computeAlignment(code, tokens) {
  const healing = countMatches(code, [
    /optimize\b/gi, /heal\b/gi, /repair\b/gi, /fix\b/gi,
    /improve\b/gi, /refine\b/gi, /clean\b/gi, /validate\b/gi,
    /coherenc/gi, /align\b/gi,
  ]);
  const degrading = countMatches(code, [
    /corrupt\b/gi, /break\b/gi, /destroy\b/gi, /pollut/gi,
    /leak\b/gi, /overflow\b/gi, /inject\b/gi,
  ]);
  if (healing > degrading + 2) return 'healing';
  if (degrading > healing + 1) return 'degrading';
  return 'neutral';
}

function computeIntention(code, tokens) {
  // Code intention is structural — benevolent code helps, malevolent code harms
  const benevolent = countMatches(code, [
    /help\b/gi, /assist\b/gi, /enable\b/gi, /protect\b/gi,
    /guard\b/gi, /safe\b/gi, /sanitize\b/gi, /verify\b/gi,
  ]);
  const malevolent = countMatches(code, [
    /exploit\b/gi, /attack\b/gi, /inject\b/gi, /bypass\b/gi,
    /escalat\b/gi, /brute\s*force/gi, /payload\b/gi,
  ]);
  if (benevolent > malevolent + 1) return 'benevolent';
  if (malevolent > benevolent) return 'malevolent';
  return 'neutral';
}

function computeDomain(code, tokens, options = {}) {
  if (options.domain) return options.domain;
  if (options.filePath) {
    const fp = options.filePath.replace(/\\/g, '/');
    if (/\/compression\/|compress|void.compressor|zlib|deflate/i.test(fp)) return 'compression';
    if (/\/quality\/|\/audit\//i.test(fp)) return 'quality';
    if (/\/orchestrator\//i.test(fp)) return 'orchestration';
    if (/\/swarm\/|\/generat/i.test(fp)) return 'generation';
    if (/\/security\/|\/covenant/i.test(fp)) return 'security';
    if (/\/search\//i.test(fp)) return 'search';
    if (/\/bridge\/|fractal.bridge/i.test(fp)) return 'bridge';
    if (/\/atomic\/|\/core\//i.test(fp)) return 'core';
    if (/\/unified\/|\/api\//i.test(fp)) return 'oracle';
    if (/\/utils\//i.test(fp)) return 'utility';
  }
  const indicators = {
    compression: countMatches(code, [/compress/gi, /decompress/gi, /encode/gi, /decode/gi, /zlib/g]),
    quality: countMatches(code, [/coherenc/gi, /lint/gi, /audit/gi, /check/gi, /validat/gi]),
    oracle: countMatches(code, [/oracle/gi, /pattern/gi, /resolve/gi, /relevance/gi]),
    search: countMatches(code, [/search/gi, /query/gi, /find/gi, /index/gi]),
    security: countMatches(code, [/covenant/gi, /security/gi, /sanitiz/gi, /protect/gi]),
    orchestration: countMatches(code, [/orchestrat/gi, /schedule/gi, /priority/gi, /heal/gi]),
    generation: countMatches(code, [/generate/gi, /create/gi, /spawn/gi, /swarm/gi]),
  };
  let best = 'utility';
  let bestCount = 0;
  for (const [domain, count] of Object.entries(indicators)) {
    if (count > bestCount) { best = domain; bestCount = count; }
  }
  return bestCount >= 3 ? best : 'utility';
}

function defaultProperties() {
  return {
    charge: 0, valence: 0, mass: 'light', spin: 'even',
    phase: 'gas', reactivity: 'inert', electronegativity: 0,
    group: 11, period: 1,
    harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
    domain: 'core',
  };
}

module.exports = {
  extractAtomicProperties,
};

// ── Atomic self-description (batch-generated) ────────────────────
extractAtomicProperties.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
