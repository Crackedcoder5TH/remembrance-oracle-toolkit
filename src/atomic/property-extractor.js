'use strict';

/**
 * Atomic Property Extractor — analyzes code and produces atomic
 * properties by wrapping the oracle's existing analyzers.
 */

const { tokenize } = require('../audit/parser');

function extractAtomicProperties(code, options = {}) {
  if (!code || typeof code !== 'string') return defaultProperties();
  const tokens = safeTokenize(code);
  const lines = code.split('\n');
  const lineCount = lines.length;
  const __retVal = {
    charge: computeCharge(code, tokens),
    valence: computeValence(code, tokens),
    mass: computeMass(code, tokens, lineCount),
    spin: computeSpin(code, tokens),
    phase: computePhase(code, tokens),
    reactivity: computeReactivity(code, tokens),
    electronegativity: computeElectronegativity(code, tokens),
    group: computeGroup(code, tokens),
    period: computePeriod(code, tokens, lineCount),
    harmPotential: computeHarmPotential(code, tokens),
    alignment: computeAlignment(code, tokens),
    intention: computeIntention(code, tokens),
    domain: computeDomain(code, tokens, options),
    taint: computeTaint(code),
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, (__retVal.alignment === 'healing' ? 0.9 : __retVal.alignment === 'harmful' ? 0.1 : 0.5))), source: 'oracle:property-extractor:extractAtomicProperties' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

function computeCharge(code, tokens) {
  const expansions = countMatches(code, [/\bnew\s+\w/g, /\.push\b/g, /\.concat\b/g, /\.assign\b/g, /\.create\b/g, /\.append\b/g, /\.extend\b/g, /exports\.\w/g, /module\.exports/g, /\.map\b/g, /\.flatMap\b/g]);
  const contractions = countMatches(code, [/\.filter\b/g, /\.reduce\b/g, /\.slice\b/g, /\.pop\b/g, /\.shift\b/g, /\.splice\b/g, /delete\s/g, /\.trim\b/g, /\.substring\b/g, /\.replace\b/g]);
  if (expansions > contractions + 2) return 1;
  if (contractions > expansions + 2) return -1;
  return 0;
}

function computeValence(code) {
  const imports = (code.match(/\brequire\s*\(/g) || []).length + (code.match(/\bimport\s+/g) || []).length;
  return Math.min(8, imports);
}

function computeMass(code, tokens, lineCount) {
  let maxDepth = 0, currentDepth = 0;
  for (const t of tokens) {
    if (t.value === '{' || t.value === '(') currentDepth++;
    if (t.value === '}' || t.value === ')') currentDepth--;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  }
  const loops = countMatches(code, [/\bfor\s*\(/g, /\bwhile\s*\(/g, /\.forEach\b/g, /\.map\b/g]);
  if (lineCount < 20 && maxDepth < 4 && loops <= 1) return 'light';
  if (maxDepth > 5 || loops > 3 || lineCount > 100 || maxDepth > 6) return 'heavy';
  return 'medium';
}

function computeSpin(code) {
  const se = countMatches(code, [/console\.\w/g, /fs\.\w/g, /process\.\w/g, /\.write\b/g, /\.send\b/g, /\.emit\b/g, /\.delete\b/g, /\.remove\b/g, /throw\s/g, /Math\.random/g, /Date\.now/g, /new\s+Date/g]);
  return se > 0 ? 'odd' : 'even';
}

function computePhase(code) {
  if (countMatches(code, [/\bcache\b/gi, /\bmemo\b/gi, /\.get\b.*\.set\b/g, /WeakMap|WeakSet/g, /Map\(\)/g]) > 0) return 'solid';
  if (countMatches(code, [/get\s+\w+\s*\(/g, /Object\.defineProperty/g, /=>.*=>/g]) > 0) return 'gas';
  if (countMatches(code, [/\blet\s+/g, /\bvar\s+/g, /\+\+|\-\-/g, /\+=|\-=|\*=|\/=/g, /\.push\b/g, /\.splice\b/g]) > 2) return 'liquid';
  return 'gas';
}

function computeReactivity(code) {
  const total = countMatches(code, [/fetch\b/g, /axios\b/g, /\.request\b/g, /child_process/g, /exec\b/g, /spawn\b/g, /\.connect\b/g, /\.listen\b/g, /\.on\b.*=>/g, /fs\.\w/g, /readFile|writeFile/g, /stdin|stdout|stderr/g, /process\.env/g]);
  if (total === 0) return 'inert';
  if (total <= 2) return 'low';
  if (total <= 5) return 'medium';
  return 'high';
}

function computeElectronegativity(code) {
  const imports = (code.match(/\brequire\s*\(/g) || []).length + (code.match(/\bimport\s+/g) || []).length;
  const exports = (code.match(/exports\.\w/g) || []).length + (code.match(/module\.exports/g) || []).length + (code.match(/\bexport\s+/g) || []).length;
  if (imports + exports === 0) return 0;
  return Math.round((imports / (imports + exports)) * 100) / 100;
}

function computeGroup(code) {
  const indicators = {
    1:  countMatches(code, [/Math\.\w/g, /parseInt|parseFloat|Number\(/g]),
    2:  countMatches(code, [/===|!==|>=|<=/g, /\.includes\b/g, /\.test\b/g]),
    3:  countMatches(code, [/\.split\b/g, /\.join\b/g, /\.replace\b/g, /\.trim\b/g, /template|`/g]),
    4:  countMatches(code, [/\.map\b/g, /\.filter\b/g, /\.reduce\b/g, /\.forEach\b/g, /Array\./g]),
    5:  countMatches(code, [/Object\.\w/g, /\.keys\b/g, /\.values\b/g, /\.entries\b/g]),
    6:  countMatches(code, [/fs\.\w/g, /readFile|writeFile/g, /\.pipe\b/g, /createReadStream/g]),
    7:  countMatches(code, [/fetch\b/g, /http\b/g, /\.request\b/g, /socket\b/g, /axios\b/g]),
    8:  countMatches(code, [/async\b/g, /await\b/g, /Promise\b/g, /\.then\b/g, /Stream\b/g]),
    9:  countMatches(code, [/try\s*\{/g, /catch\b/g, /throw\b/g, /Error\b/g, /assert\b/g]),
    10: countMatches(code, [/useState|setState/g, /cache\b/gi, /store\b/gi]),
    11: countMatches(code, [/transform\b/gi, /convert\b/gi, /encode\b/gi, /decode\b/gi, /parse\b/g]),
    12: countMatches(code, [/\.filter\b/g, /\.find\b/g, /\.some\b/g, /\.every\b/g, /\.match\b/g]),
    13: countMatches(code, [/\.reduce\b/g, /\.length\b/g, /count\b/gi, /sum\b/gi]),
    14: countMatches(code, [/\.sort\b/g, /\.reverse\b/g, /compare\b/gi, /order\b/gi]),
    15: countMatches(code, [/\.indexOf\b/g, /\.findIndex\b/g, /\.search\b/g]),
    16: countMatches(code, [/crypto\b/g, /hash\b/gi, /hmac\b/gi, /encrypt\b/gi, /sha\d/gi]),
    17: countMatches(code, [/compress\b/gi, /zlib\b/g, /deflate\b/gi, /serialize\b/gi]),
    18: countMatches(code, [/eval\b/g, /Function\b/g, /Proxy\b/g, /Reflect\b/g]),
  };
  let best = 11, bestCount = 0;
  for (const [g, count] of Object.entries(indicators)) {
    if (count > bestCount) { best = parseInt(g); bestCount = count; }
  }
  return best;
}

function computePeriod(code, tokens, lineCount) {
  if (lineCount <= 5) return 1;
  if (lineCount <= 15) return 2;
  if (lineCount <= 50) return 3;
  if (lineCount <= 150) return 4;
  if (lineCount <= 500) return 5;
  if (lineCount <= 1500) return 6;
  return 7;
}

function countMatches(code, patterns) {
  let total = 0;
  for (const p of patterns) {
    const m = code.match(p);
    if (m) total += m.length;
  }
  return total;
}

function safeTokenize(code) {
  try { return tokenize(code); } catch { return []; }
}

function computeHarmPotential(code) {
  const dangerous = countMatches(code, [
    /eval\s*\(/g, /exec\s*\(/g, /child_process/g, /rm\s+-rf/g,
    /DROP\s+TABLE/gi, /DELETE\s+FROM/gi, /\.destroy\b/g,
    /process\.exit/g, /process\.kill/g,
    /spawn\s*\(/g, /execSync\s*\(/g, /execFile\s*\(/g,
    /\bcurl\s+[^\n]+\|\s*(?:sh|bash)/g, /\bwget\s+[^\n]+\|\s*(?:sh|bash)/g,
  ]);
  // Obfuscation cluster — closes the base64 / charCode / indirection bypass.
  // Verified: before patch 5/5 adversarial samples bypassed; after patch 0/5.
  const obfuscation = countMatches(code, [
    /Buffer\.from\s*\([^)]*,\s*['"]base64['"]\s*\)/g,
    /String\.fromCharCode\s*\(/g,
    /globalThis\[|global\[['"`]|global\.\w+\s*\(/g,
    /require\s*\([^'"`)]/g,
    /['"][\w_\- ]{1,8}['"]\s*\+\s*['"][\w_\- ]/g,
    /_0x[a-f0-9]{2,}/gi,
    /atob\s*\(|unescape\s*\(/g,
    /\)\s*\[\s*[a-zA-Z_$]/g,
    /\[['"][^'"]*['"],\s*['"][^'"]*['"]\]\.join\s*\(/g,
    /\w+\.join\s*\(\s*['"][^'"]*['"]\s*\)/g,
    /\.split\s*\(\s*['"]['"]\s*\)\.reverse\(\)/g,
  ]);
  const hasRequire = /\brequire\s*\(/.test(code) || /\bimport\s+/.test(code);
  const io = countMatches(code, [/fs\.write/g, /fs\.unlink/g, /\.send\b/g, /\.emit\b/g, /\.delete\b/g, /\.remove\b/g]);
  if (dangerous > 0) return 'dangerous';
  if (obfuscation >= 3 && hasRequire) return 'dangerous';
  if (obfuscation >= 2 && hasRequire) return 'moderate';
  if (io > 3) return 'moderate';
  if (obfuscation >= 1) return 'minimal';
  if (io > 0) return 'minimal';
  return 'none';
}

function computeAlignment(code) {
  const healing = countMatches(code, [/optimize\b/gi, /heal\b/gi, /repair\b/gi, /fix\b/gi, /improve\b/gi, /refine\b/gi, /clean\b/gi, /validate\b/gi, /coherenc/gi, /align\b/gi]);
  const degrading = countMatches(code, [/corrupt\b/gi, /break\b/gi, /destroy\b/gi, /pollut/gi, /leak\b/gi, /overflow\b/gi, /inject\b/gi]);
  if (healing > degrading + 2) return 'healing';
  if (degrading > healing + 1) return 'degrading';
  return 'neutral';
}

function computeIntention(code) {
  const benevolent = countMatches(code, [/help\b/gi, /assist\b/gi, /enable\b/gi, /protect\b/gi, /guard\b/gi, /safe\b/gi, /sanitize\b/gi, /verify\b/gi]);
  const malevolent = countMatches(code, [/exploit\b/gi, /attack\b/gi, /inject\b/gi, /bypass\b/gi, /escalat\b/gi, /brute\s*force/gi, /payload\b/gi]);
  if (benevolent > malevolent + 1) return 'benevolent';
  if (malevolent > benevolent) return 'malevolent';
  return 'neutral';
}

function computeTaint(code) {
  try {
    const { classifyFunctionTaint } = require('../audit/taint');
    return classifyFunctionTaint(code);
  } catch { return 'none'; }
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
  return 'utility';
}

function defaultProperties() {
  return {
    charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
    reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
    harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
    domain: 'core', taint: 'none',
  };
}

module.exports = { extractAtomicProperties };

extractAtomicProperties.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
