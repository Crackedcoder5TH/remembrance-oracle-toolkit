'use strict';

/**
 * Tier-coverage check — architectural self-similarity enforcement.
 *
 * Catches the failure mode where a new module uses only a strict
 * subset of a multi-tier codebase's architecture. For example: a
 * new residual compressor that only calls into the L1 pattern layer
 * when the parent codebase exposes L1, L2, and L3 tiers. That's
 * flat-against-fractal, and the symbol-grounding checks we already
 * have will NOT catch it because every symbol the new module calls
 * is real — the problem is at a higher abstraction level than
 * "does this name exist."
 *
 * How it works
 * ------------
 * 1. Reads a per-codebase `architecture.json` manifest that declares
 *    the tiers and their entry points.
 * 2. Extracts the set of symbols a target file actually calls (via
 *    a language-agnostic regex pass — JavaScript, Python, TypeScript
 *    all work because we look for `name(` and `.name(` patterns).
 * 3. For each declared tier, checks whether the target file calls
 *    any of that tier's entry points.
 * 4. Flags a finding when the target uses a STRICT SUBSET of the
 *    available tiers, unless the file contains an explicit opt-out
 *    marker `# single-tier-by-design: <reason>` / `// single-tier-by-design: <reason>`.
 *
 * The manifest shape
 * ------------------
 * {
 *   "codebase": "Void-Data-Compressor",
 *   "tiers": [
 *     {
 *       "name": "L1",
 *       "description": "Base pattern library and L1 projection",
 *       "entry_points": ["pattern_library", "_find_best_blend", "_find_top_k_singles"]
 *     },
 *     {
 *       "name": "L2",
 *       "description": "Meta-patterns and recursive L2 projection",
 *       "entry_points": ["l2_library", "_find_l2_blend", "compress_recursive",
 *                        "compress_whole_recursive"],
 *       "composes": ["L1"]
 *     },
 *     {
 *       "name": "L3",
 *       "description": "Meta-meta-patterns and adaptive depth",
 *       "entry_points": ["l3_library", "compress_adaptive",
 *                        "AdaptiveVoidCompressor"],
 *       "composes": ["L1", "L2"]
 *     }
 *   ],
 *   "min_coverage": 2,
 *   "gap_severity": "medium"
 * }
 *
 * `composes` is a list of tier names that are transitively engaged
 * when this tier is touched. This models the fractal-composition
 * property: calling a top-tier API like `compress_adaptive` (L3)
 * internally composes L1 and L2, so a module that calls only
 * `compress_adaptive` is still engaging the full stack — the
 * composition is inside the call, not at the call site.
 *
 * `min_coverage` is the minimum number of tiers a new file should
 * touch (counting transitive composition) to be considered fractal-
 * aligned. If not specified, defaults to `max(1, total_tiers - 1)`
 * — touching all but one tier is fine; touching only one tier when
 * there are three or more is the gap.
 *
 * The opt-out
 * -----------
 * Files can mark themselves as intentionally single-tier with a
 * comment at the top:
 *
 *   // single-tier-by-design: this is a pure L1 utility, does not
 *   //   need L2/L3 machinery
 *
 * or in Python:
 *
 *   # single-tier-by-design: this is a pure L1 utility
 *
 * The opt-out is NOT silent — it produces a log entry in the
 * compliance ledger so post-hoc audits can see every place the
 * tier-coverage check was explicitly bypassed.
 */

const fs = require('fs');
const path = require('path');

const OPT_OUT_MARKER = /(?:\/\/|#)\s*single-tier-by-design\s*:\s*(.*)/i;

/**
 * Load an architecture manifest from the given path. Returns null
 * if the file doesn't exist — tier-coverage is opt-in, so the
 * absence of a manifest means "no check to run."
 *
 * @param {string} manifestPath - path to architecture.json
 * @returns {object|null} parsed manifest or null
 */
function loadArchitectureManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tiers)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Walk up from a file path looking for an architecture.json in the
 * same directory, then the parent, etc. Returns the first found
 * manifest path or null.
 *
 * This is how the check decides WHICH manifest to apply to WHICH
 * file: the nearest ancestor manifest wins, which means monorepos
 * can have per-package manifests without collision.
 */
function findManifestForFile(filePath, { stopDir } = {}) {
  let dir = path.dirname(path.resolve(filePath));
  const root = stopDir ? path.resolve(stopDir) : path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, 'architecture.json');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root || dir === path.dirname(dir)) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Extract the set of identifiers that appear in call position or
 * attribute-access position in a source file. Language-agnostic:
 * we match `name(` and `.name` patterns directly, which covers
 * JavaScript, TypeScript, Python, and most C-family languages.
 *
 * This is intentionally approximate — we don't need perfect AST
 * extraction. We need to know "does the text of this file contain
 * a call or reference to any of these tier entry points." A regex
 * pass gives us that with essentially zero false negatives (we
 * might include a few false positives from comments or strings,
 * but those only HELP the file pass the check, not fail it, so
 * they're on the safe side of the error bar).
 *
 * @param {string} code - source code text
 * @returns {Set<string>} set of identifiers found
 */
function extractCalledIdentifiers(code) {
  const found = new Set();

  // `name(` — function/method call position
  const callRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match;
  while ((match = callRegex.exec(code)) !== null) {
    found.add(match[1]);
  }

  // `.name` — attribute access (covers things like `self.l2_library`)
  const attrRegex = /\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  while ((match = attrRegex.exec(code)) !== null) {
    found.add(match[1]);
  }

  // bare `name` on its own line (import references, class names, etc.)
  // only the first identifier on a `from X import Y` / `import X` line
  const importRegex = /\b(?:from|import)\s+([A-Za-z_][A-Za-z0-9_.]*)/g;
  while ((match = importRegex.exec(code)) !== null) {
    // Handle dotted paths: void_compressor_v3 → just that
    const parts = match[1].split('.');
    for (const p of parts) found.add(p);
  }

  return found;
}

/**
 * Check whether a file explicitly opts out of the tier-coverage
 * check. The marker must appear in the first 50 lines so casual
 * readers see it at the top of the file, not buried.
 *
 * Returns the opt-out reason string if found, null otherwise.
 */
function findOptOut(code) {
  const head = code.split('\n').slice(0, 50).join('\n');
  const m = head.match(OPT_OUT_MARKER);
  return m ? m[1].trim() : null;
}

/**
 * Given a set of called identifiers and a tier manifest, return the
 * list of tier names that the file touches, INCLUDING transitively-
 * composed tiers.
 *
 * A tier is "directly touched" if the file calls any of its declared
 * entry points. It is "transitively touched" if a directly-touched
 * tier declares it in `composes`.
 *
 * Composition is transitive: if L3 composes [L1, L2] and L2 composes
 * [L1], touching L3 implies L1+L2+L3, and touching L2 implies L1+L2.
 * The transitive closure is computed by iteratively expanding the
 * touched set until it stops growing.
 */
function tiersTouched(calledIds, manifest) {
  const byName = new Map();
  for (const tier of manifest.tiers) byName.set(tier.name, tier);

  const directlyTouched = new Set();
  for (const tier of manifest.tiers) {
    const entryPoints = tier.entry_points || [];
    if (entryPoints.some(ep => calledIds.has(ep))) {
      directlyTouched.add(tier.name);
    }
  }

  // Transitive closure over the `composes` relation.
  const touched = new Set(directlyTouched);
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of Array.from(touched)) {
      const tier = byName.get(name);
      if (!tier || !Array.isArray(tier.composes)) continue;
      for (const composed of tier.composes) {
        if (!touched.has(composed)) {
          touched.add(composed);
          changed = true;
        }
      }
    }
  }

  // Return in manifest order for stable, readable output.
  return manifest.tiers.map(t => t.name).filter(n => touched.has(n));
}

/**
 * Run the tier-coverage check on a single file. Returns an array
 * of findings in the same shape as the other audit checkers
 * (line, column, bugClass, severity, assumption, reality, suggestion).
 *
 * If no manifest is found for the file, returns [] (no check to run).
 * If the file opts out explicitly, returns [] and attaches the
 * opt-out reason to the returned metadata.
 *
 * @param {string} filePath - absolute path to the file to check
 * @param {object} [options]
 *   - manifestPath: override auto-discovery with an explicit manifest
 *   - stopDir: directory to stop walking up at during auto-discovery
 * @returns {{ findings: Array, tiersTouched: string[], optOut: string|null, manifestPath: string|null }}
 */
function checkFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { findings: [], tiersTouched: [], optOut: null, manifestPath: null };
  }
  const code = fs.readFileSync(filePath, 'utf-8');

  const manifestPath = options.manifestPath
    || findManifestForFile(filePath, { stopDir: options.stopDir });
  if (!manifestPath) {
    return { findings: [], tiersTouched: [], optOut: null, manifestPath: null };
  }

  const manifest = loadArchitectureManifest(manifestPath);
  if (!manifest || !Array.isArray(manifest.tiers) || manifest.tiers.length === 0) {
    return { findings: [], tiersTouched: [], optOut: null, manifestPath };
  }

  // Files ignored by the manifest — never run the check on them.
  const ignored = manifest.ignore || [];
  const rel = path.relative(path.dirname(manifestPath), filePath);
  if (ignored.some(g => rel === g || rel.startsWith(g + '/'))) {
    return { findings: [], tiersTouched: [], optOut: null, manifestPath };
  }

  const optOut = findOptOut(code);
  if (optOut != null) {
    return { findings: [], tiersTouched: [], optOut, manifestPath };
  }

  const called = extractCalledIdentifiers(code);
  const touched = tiersTouched(called, manifest);

  // Files that don't touch the architecture at all (e.g. a pure
  // utility that doesn't import from the parent package) are not
  // the concern of this check.
  if (touched.length === 0) {
    return { findings: [], tiersTouched: [], optOut: null, manifestPath };
  }

  const totalTiers = manifest.tiers.length;
  const minCoverage = Number.isInteger(manifest.min_coverage)
    ? manifest.min_coverage
    : Math.max(1, totalTiers - 1);
  const severity = manifest.gap_severity || 'medium';

  // ─── Emergent SERF: register tier-coverage signal ────────────────
  try {
    const { registerTierCoverageSignal } = require('../unified/emergent-coherency');
    registerTierCoverageSignal(touched.length, totalTiers);
  } catch { /* emergent module not available */ }

  // If the file meets the coverage minimum, it passes.
  if (touched.length >= minCoverage) {
    return { findings: [], tiersTouched: touched, optOut: null, manifestPath };
  }

  // Coverage gap — emit a finding.
  const missingTiers = manifest.tiers
    .map(t => t.name)
    .filter(n => !touched.includes(n));

  const finding = {
    line: 1,
    column: 1,
    bugClass: 'tier-coverage',
    ruleId: 'tier-coverage',
    severity,
    assumption: `New module ${path.basename(filePath)} only engages ${touched.length} of ${totalTiers} declared architectural tiers: [${touched.join(', ')}]`,
    reality: `Parent codebase '${manifest.codebase || path.basename(path.dirname(manifestPath))}' exposes ${totalTiers} tiers [${manifest.tiers.map(t => t.name).join(', ')}]. Missing engagement: [${missingTiers.join(', ')}]`,
    suggestion: buildSuggestion(manifest, touched, missingTiers),
    code: '',
    fractalGap: {
      tiersTouched: touched,
      tiersMissing: missingTiers,
      minCoverageRequired: minCoverage,
    },
  };

  return {
    findings: [finding],
    tiersTouched: touched,
    optOut: null,
    manifestPath,
  };
}

function buildSuggestion(manifest, touched, missing) {
  const missingDescriptions = manifest.tiers
    .filter(t => missing.includes(t.name))
    .map(t => `  - ${t.name}: ${t.description || '(no description)'}${t.entry_points && t.entry_points.length ? ` [entry points: ${t.entry_points.slice(0, 3).join(', ')}]` : ''}`);
  return [
    `Engage the missing tiers or explicitly opt out with an "single-tier-by-design: <reason>" comment at the top of the file.`,
    `Missing tiers:`,
    ...missingDescriptions,
    `If the module is intentionally single-tier (pure utility, bootstrap scaffolding, etc.), document the reason in the opt-out marker so post-hoc audits see the decision.`,
  ].join('\n');
}

/**
 * Convenience: run the check across multiple files and aggregate.
 * Useful for the audit CLI and the stop hook.
 */
function checkFiles(files, options = {}) {
  const results = [];
  let totalFindings = 0;
  for (const file of files || []) {
    const r = checkFile(file, options);
    results.push({ file, ...r });
    totalFindings += r.findings.length;
  }
  return { files: results, totalFindings };
}

module.exports = {
  checkFile,
  checkFiles,
  loadArchitectureManifest,
  findManifestForFile,
  extractCalledIdentifiers,
  tiersTouched,
  findOptOut,
};

// ── Atomic self-description (batch-generated) ────────────────────
checkFile.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
checkFiles.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
loadArchitectureManifest.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'medium', electronegativity: 0, group: 6, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
findManifestForFile.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
extractCalledIdentifiers.atomicProperties = {
  charge: 0, valence: 3, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'medium', electronegativity: 1, group: 3, period: 3,
  harmPotential: 'dangerous', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
tiersTouched.atomicProperties = {
  charge: 1, valence: 0, mass: 'heavy', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0, group: 4, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
findOptOut.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
