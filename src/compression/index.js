/**
 * Compression Pipeline — Public API for fractal compression and holographic encoding.
 *
 * Orchestrates the full pipeline:
 *   1. Detect fractal families (structural fingerprinting)
 *   2. Extract templates and store deltas (dual-write: raw code stays intact)
 *   3. Compute 128-dim holographic embeddings for all patterns
 *   4. Build holographic pages from families for fast two-pass search
 *
 * All operations are additive — existing patterns/search behavior is unchanged
 * unless compression data exists.
 */

const { structuralFingerprint, extractTemplates, detectFamilies, compressionStats, reconstruct } = require('./fractal');
const { holoEmbed, createPage, holoSearch, cosineSimilarity, HOLO_DIMS } = require('./holographic');
const {
  prioritizeForCompression, partitionByReadiness,
  healFamily, serfDimensions, serfEmbeddingDims,
  validateReconstruction, validateAllReconstructions,
} = require('./serf-integration');

/**
 * Run the full compression pipeline on a store.
 * Analyzes all patterns, detects families, extracts templates,
 * computes embeddings, and builds holographic pages.
 *
 * @param {Object} store — SQLiteStore instance
 * @param {Object} [options] — { dryRun: boolean, verbose: boolean }
 * @returns {Object} Pipeline results
 */
function compressStore(store, options = {}) {
  const { dryRun = false, verbose = false } = options;

  // Load all patterns, prioritized by SERF coherence (stable patterns first)
  const rawPatterns = store.getAllPatterns ? store.getAllPatterns() : [];
  if (rawPatterns.length === 0) {
    return { success: true, message: 'No patterns to compress', stats: {} };
  }

  const patterns = prioritizeForCompression(rawPatterns);
  const { ready, healing } = partitionByReadiness(rawPatterns);

  // Step 1: Extract templates and detect families using tiered matching
  // Tier 1: Exact structural matching (most precise, smallest families)
  const exactResult = extractTemplates(patterns);

  // Tier 2: Fuzzy matching on singletons (abstracts operators — broader families)
  const fuzzyResult = extractTemplates(exactResult.singletons, { fuzzy: true });

  // Tier 3: Canonical matching on remaining singletons (cross-language families)
  const canonicalResult = extractTemplates(fuzzyResult.singletons, { canonical: true });

  // Merge all family tiers
  const families = [
    ...exactResult.families,
    ...fuzzyResult.families,
    ...canonicalResult.families,
  ];
  const singletons = canonicalResult.singletons;

  if (verbose) {
    console.log(`  SERF ready: ${ready.length} patterns, healing: ${healing.length} patterns`);
    console.log(`  Exact families: ${exactResult.families.length}, Fuzzy: ${fuzzyResult.families.length}, Canonical: ${canonicalResult.families.length}`);
    console.log(`  Total families: ${families.length}, singletons: ${singletons.length}`);
  }

  // Step 2: Validate reconstructions BEFORE storing, exclude broken families
  const validFamilies = [];
  let validationResults = { passed: 0, failed: 0 };

  for (const family of families) {
    let familyValid = true;
    for (const member of family.members) {
      const reconstructed = reconstruct(family.skeleton, member.delta);
      // Validate that re-fingerprinting the reconstruction produces the same skeleton hash
      // (exact character match isn't possible since the skeleton is space-joined tokens)
      const refp = structuralFingerprint(reconstructed, family.language || 'javascript');
      if (refp.hash !== family.templateId) {
        familyValid = false;
        validationResults.failed++;
        if (verbose) {
          console.log(`  ⚠ Reconstruction hash mismatch for ${member.patternId} in family ${family.templateId}`);
        }
        break;
      }
      validationResults.passed++;
    }
    if (familyValid) validFamilies.push(family);
  }

  // Store only validated templates and deltas
  if (!dryRun) {
    for (const family of validFamilies) {
      store.storeTemplate({
        id: family.templateId,
        skeleton: family.skeleton,
        language: family.language,
        memberCount: family.members.length,
        avgCoherency: _avgCoherency(family.members, patterns),
      });

      for (const member of family.members) {
        store.storeDelta({
          patternId: member.patternId,
          templateId: family.templateId,
          delta: member.delta,
          originalSize: member.originalSize,
          deltaSize: member.deltaSize,
        });
      }
    }
  }

  // Step 3: Compute holographic embeddings for all patterns
  const embeddingMap = new Map();
  const familyHashMap = new Map();  // patternId → familyHash for consistent family encoding

  // Build family hash map (only from validated families)
  for (const family of validFamilies) {
    for (const member of family.members) {
      familyHashMap.set(member.patternId, family.templateId);
    }
  }

  for (const pattern of patterns) {
    const familyHash = familyHashMap.get(pattern.id);
    const embedding = holoEmbed(pattern, { familyHash });
    embeddingMap.set(pattern.id, embedding);

    if (!dryRun) {
      store.storeHoloEmbedding(pattern.id, embedding);
    }
  }

  // Step 4: Build holographic pages from validated families
  const pages = [];

  for (const family of validFamilies) {
    const members = family.members
      .map(m => ({ patternId: m.patternId, embedding: embeddingMap.get(m.patternId) }))
      .filter(m => m.embedding && Array.isArray(m.embedding) && m.embedding.length > 0);

    if (members.length >= 2) {
      const page = createPage(family.templateId, members, family.templateId);
      if (page) {
        pages.push(page);
        if (!dryRun) {
          store.storeHoloPage(page);
        }
      }
    }
  }

  // Build singleton pages (one per singleton or small groups by concept similarity)
  // Group singletons into concept-based clusters for better page coverage
  const singletonPages = _clusterSingletons(singletons, embeddingMap);
  for (const sp of singletonPages) {
    pages.push(sp);
    if (!dryRun) {
      store.storeHoloPage(sp);
    }
  }

  const stats = compressionStats(patterns);
  stats.holoPages = pages.length;
  stats.holoEmbeddings = embeddingMap.size;
  stats.embeddingDims = HOLO_DIMS;
  stats.serfReady = ready.length;
  stats.serfHealing = healing.length;
  stats.validationPassed = validationResults.passed;
  stats.validationFailed = validationResults.failed;

  return {
    success: true,
    familyCount: validFamilies.length,
    singletonCount: singletons.length,
    pageCount: pages.length,
    embeddingCount: embeddingMap.size,
    serfReady: ready.length,
    serfHealing: healing.length,
    validationPassed: validationResults.passed,
    validationFailed: validationResults.failed,
    stats,
  };
}

/**
 * Decompress a pattern from its fractal template + delta.
 * Falls back to the pattern's raw code if no delta exists.
 *
 * @param {Object} store — SQLiteStore instance
 * @param {string} patternId — Pattern ID
 * @returns {string|null} Reconstructed code or null
 */
function decompressPattern(store, patternId) {
  const delta = store.getDelta(patternId);
  if (!delta) return null;

  const template = store.getTemplate(delta.templateId);
  if (!template) return null;

  return reconstruct(template.skeleton, delta.delta);
}

/**
 * Holographic search across stored pages.
 *
 * @param {Object} store — SQLiteStore instance
 * @param {string} query — Search query text
 * @param {Object} [options] — { topK, minScore }
 * @returns {Array<{ patternId: string, score: number, pageId: string }>}
 */
function holoSearchPatterns(store, query, options = {}) {
  const pages = store.getAllHoloPages();
  if (!pages || pages.length === 0) return [];

  // Compute query embedding
  const queryEmbedding = holoEmbed({ code: query, name: query, description: query, tags: [] });

  // Build embedding map from stored embeddings
  const storedEmbeddings = store.getAllHoloEmbeddings();
  const embeddingMap = new Map();
  for (const se of storedEmbeddings) {
    embeddingMap.set(se.patternId, se.embeddingVec);
  }

  return holoSearch(queryEmbedding, pages, embeddingMap, options);
}

/**
 * Get comprehensive compression and holographic statistics.
 *
 * @param {Object} store — SQLiteStore instance
 * @returns {Object} Combined stats
 */
function getCompressionStats(store) {
  const patterns = store.getAllPatterns ? store.getAllPatterns() : [];
  const fractal = compressionStats(patterns);
  const dbStats = store.fractalStats();

  return {
    ...fractal,
    ...dbStats,
    embeddingDims: HOLO_DIMS,
  };
}

// ─── Internal helpers ───

/**
 * Compute average coherency for family members.
 */
function _avgCoherency(members, patterns) {
  const patternMap = new Map();
  for (const p of patterns) patternMap.set(p.id, p);

  let sum = 0;
  let count = 0;
  for (const m of members) {
    const p = patternMap.get(m.patternId);
    if (!p) continue;
    // coherencyScore can be an object with .total or a plain number
    const score = p.coherencyScore;
    const val = score && typeof score === 'object' ? score.total : (typeof score === 'number' ? score : null);
    if (val != null) {
      sum += val;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Cluster singleton patterns into concept-based pages.
 * Groups singletons by highest cosine similarity to create small pages.
 */
function _clusterSingletons(singletons, embeddingMap) {
  if (singletons.length === 0) return [];

  const pages = [];
  const used = new Set();

  // Simple greedy clustering: pick a seed, find closest neighbors
  for (const seed of singletons) {
    if (used.has(seed.id)) continue;

    const seedEmb = embeddingMap.get(seed.id);
    if (!seedEmb || !Array.isArray(seedEmb) || seedEmb.length === 0) { used.add(seed.id); continue; }

    const cluster = [{ patternId: seed.id, embedding: seedEmb }];
    used.add(seed.id);

    // Find up to 4 nearest unused singletons
    const candidates = singletons
      .filter(s => {
        if (used.has(s.id)) return false;
        const emb = embeddingMap.get(s.id);
        return emb && Array.isArray(emb) && emb.length > 0;
      })
      .map(s => ({ id: s.id, sim: cosineSimilarity(seedEmb, embeddingMap.get(s.id)) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 4);

    for (const c of candidates) {
      if (c.sim >= 0.3) {  // Only cluster if reasonably similar
        cluster.push({ patternId: c.id, embedding: embeddingMap.get(c.id) });
        used.add(c.id);
      }
    }

    if (cluster.length >= 1) {
      const pageId = `singleton-${seed.id.slice(0, 8)}`;
      const page = createPage(pageId, cluster);
      if (page) pages.push(page);
    }
  }

  return pages;
}

module.exports = {
  compressStore,
  decompressPattern,
  holoSearchPatterns,
  getCompressionStats,
  // Re-export for direct access
  structuralFingerprint,
  extractTemplates,
  detectFamilies,
  reconstruct,
  holoEmbed,
  createPage,
  holoSearch,
  // SERF integration
  prioritizeForCompression,
  partitionByReadiness,
  healFamily,
  serfDimensions,
  serfEmbeddingDims,
  validateReconstruction,
  validateAllReconstructions,
};
