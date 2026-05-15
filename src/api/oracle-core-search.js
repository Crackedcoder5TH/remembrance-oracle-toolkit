/**
 * Oracle Core — Search and query (Quantum Observation).
 *
 * Search is a quantum OBSERVATION — measuring the field collapses matching
 * patterns from superposition into definite states. The observation:
 *   1. Applies decoherence to stale patterns before scoring
 *   2. Uses the Born rule (P ∝ amplitude²) to weight results
 *   3. Enables quantum tunneling for serendipitous discovery
 *   4. Applies interference between competing results
 *   5. Collapses observed patterns (updates quantum state)
 */

const { rankEntries } = require('../core/relevance');
const { semanticSearch: semanticSearchEngine, buildIDF, tokenNgramScore } = require('../search/embeddings');
const { smartSearch: intelligentSearch, parseIntent } = require('../core/search-intelligence');
const { EmbeddingEngine } = require('../search/embedding-engine');
const { trackSearch } = require('../core/session-tracker');

// Quantum observation engine
const {
  PLANCK_AMPLITUDE,
  QUANTUM_STATES,
  applyDecoherence,
  canTunnel,
  applyFieldInterference,
  COLLAPSE_BOOST,
} = require('../quantum/quantum-core');

// Holographic search integration (graceful — routes through FractalStore when available,
// falls back to direct compression/index import for non-FractalStore setups)
let _holoSearchPatterns;
try {
  ({ holoSearchPatterns: _holoSearchPatterns } = require('../compression/index'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-search:init] silent failure:', e?.message || e);
  _holoSearchPatterns = null;
}

module.exports = {
  /**
   * Queries the verified history store for matching code entries.
   */
  query(query = {}) {
    const { description = '', tags = [], language, limit = 5, minCoherency = 0.5 } = query;
    const allEntries = this.store.getAll();
    const ranked = rankEntries({ description, tags, language }, allEntries, { limit, minCoherency });

    return ranked.map(entry => ({
      id: entry.id, code: entry.code, language: entry.language, description: entry.description,
      tags: entry.tags, coherencyScore: entry.coherencyScore?.total,
      relevanceScore: entry._relevance?.relevance, reliability: entry.reliability?.historicalScore,
      author: entry.author,
    }));
  },

  /**
   * Searches both patterns and verified history using hybrid keyword + semantic matching.
   */
  search(term, options = {}) {
    if (term == null || typeof term !== 'string') return [];
    const { limit = 10, language, mode = 'hybrid' } = options;

    const items = this._gatherSearchItems(language);

    if (mode === 'semantic') {
      return this._semanticOnly(items, term, limit);
    }

    // Hybrid: blend keyword + semantic scores
    const lower = term.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 1);

    const keywordScore = (text) => {
      const t = text.toLowerCase();
      if (t.includes(lower)) return 1.0;
      const hits = words.filter(w => t.includes(w)).length;
      return words.length > 0 ? hits / words.length : 0;
    };

    // Build TF-IDF weights from corpus for IDF-weighted keyword scoring
    const idfWeights = buildIDF(items);

    const semanticResults = semanticSearchEngine(items, term, { limit: items.length, minScore: 0, language, idf: idfWeights });
    const semanticMap = new Map(semanticResults.map(r => [r.id, r.semanticScore]));

    // Holographic search (third signal — graceful degradation)
    // Prefer FractalStore.holoSearch() if available, else fall back to direct import.
    let holoMap = new Map();
    if (this.store) {
      try {
        let holoResults;
        if (typeof this.store.holoSearch === 'function') {
          holoResults = this.store.holoSearch(term, { topK: 5 });
        } else if (_holoSearchPatterns) {
          holoResults = _holoSearchPatterns(this.store, term, { topK: 5 });
        }
        if (holoResults) {
          holoMap = new Map(holoResults.map(r => [r.patternId, r.score]));
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-search:holoSearch] fall through:', e?.message || e);
      }
    }
    const hasHolo = holoMap.size > 0;

    const now = new Date().toISOString();

    const scored = items.map(item => {
      const nameKw = keywordScore(item.name || '') * 1.5;
      const descKw = keywordScore(item.description || '');
      const tagKw = keywordScore((item.tags || []).join(' '));
      const codeKw = keywordScore(item.code || '') * 0.3;
      const kwScore = Math.min(1.0, Math.max(nameKw, descKw, tagKw, codeKw));
      const semScore = semanticMap.get(item.id) || 0;
      const holoScore = holoMap.get(item.id) || 0;

      // Token n-gram score — structural similarity at the token level
      const docText = [
        item.name || '',
        item.description || '',
        (item.tags || []).join(' '),
        (item.code || '').slice(0, 500),
      ].join(' ');
      const ngramScore = tokenNgramScore(docText, term);

      // Classical signal blend (with n-gram)
      const classicalScore = hasHolo
        ? kwScore * 0.25 + semScore * 0.40 + holoScore * 0.20 + ngramScore * 0.15
        : kwScore * 0.30 + semScore * 0.50 + ngramScore * 0.20;

      // ─── Quantum Observation ───
      // Apply decoherence to amplitude before scoring
      const rawAmplitude = item.amplitude || item.coherency || PLANCK_AMPLITUDE;
      const decoheredAmplitude = applyDecoherence(rawAmplitude, item.lastObservedAt, now);

      // Born rule: probability ∝ amplitude² — quantum weighting of results
      const bornProbability = decoheredAmplitude * decoheredAmplitude;

      // Observation frequency boost
      const observationBoost = Math.min(0.1, (item.observationCount || 0) * 0.01);

      // Language match bonus
      const languageBonus = language && item.language === language ? 0.05 : 0;

      // Quantum-classical blend: 70% classical signals, 30% quantum amplitude
      const matchScore = Math.round(
        Math.min(1, classicalScore * 0.70 + bornProbability * 0.20 + observationBoost + languageBonus) * 1000
      ) / 1000;

      const __retVal = {
        source: item.source, id: item.id, name: item.name, description: item.description,
        language: item.language, tags: item.tags, coherency: item.coherency, code: item.code,
        matchScore, keywordScore: kwScore, semanticScore: semScore, holoScore, ngramScore,
        // Quantum state
        amplitude: rawAmplitude,
        decoheredAmplitude,
        bornProbability,
        quantumState: item.quantumState || QUANTUM_STATES.SUPERPOSITION,
        phase: item.phase || 0,
      };
      // ── LRE field-coupling (auto-wired) ──
      try {
        const __lre_p1 = '../core/field-coupling';
        const __lre_p2 = require('path').join(__dirname, '../core/field-coupling');
        for (const __p of [__lre_p1, __lre_p2]) {
          try {
            const { contribute: __contribute } = require(__p);
            __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:oracle-core-search:search' });
            break;
          } catch (_) { /* try next */ }
        }
      } catch (_) { /* best-effort */ }
      return __retVal;
    }).filter(r => r.matchScore > 0);

    // ─── Quantum Tunneling ───
    // Low-amplitude items that didn't score high enough can still tunnel through
    const scoredIds = new Set(scored.map(s => s.id));
    const tunneled = items
      .filter(item => {
        const amp = item.amplitude || item.coherency || PLANCK_AMPLITUDE;
        return amp < 0.3 && amp > 0 && !scoredIds.has(item.id);
      })
      .filter(item => canTunnel(item.amplitude || item.coherency || PLANCK_AMPLITUDE, 0.3))
      .slice(0, Math.ceil(limit * 0.2));

    for (const item of tunneled) {
      scored.push({
        source: item.source, id: item.id, name: item.name, description: item.description,
        language: item.language, tags: item.tags, coherency: item.coherency, code: item.code,
        matchScore: 0.15, // Tunneled items get a modest base score
        keywordScore: 0, semanticScore: 0, holoScore: 0,
        amplitude: item.amplitude || item.coherency || PLANCK_AMPLITUDE,
        decoheredAmplitude: item.amplitude || item.coherency || PLANCK_AMPLITUDE,
        bornProbability: 0,
        quantumState: QUANTUM_STATES.SUPERPOSITION,
        phase: item.phase || 0,
        tunneled: true,
      });
    }

    // ─── Quantum Interference ───
    // Apply only to top candidates (O(k²) not O(n²))
    const topK = scored
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.min(50, limit * 3));
    applyFieldInterference(topK);

    const seen = new Set();
    const finalResults = topK
      .sort((a, b) => b.matchScore - a.matchScore || (b.amplitude ?? 0) - (a.amplitude ?? 0))
      .filter(r => {
        const key = r.id || (r.code || '').slice(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    // ─── Collapse Observed Patterns ───
    // Observation updates quantum state for patterns that were seen
    if (this._quantumField) {
      const patternIds = finalResults.filter(r => r.source === 'pattern').map(r => r.id).filter(Boolean);
      const historyIds = finalResults.filter(r => r.source === 'history').map(r => r.id).filter(Boolean);
      if (patternIds.length > 0) this._quantumField.observe('patterns', patternIds);
      if (historyIds.length > 0) this._quantumField.observe('entries', historyIds);
    }

    // Track search interaction for session summary
    try { trackSearch(term, finalResults, { mode, language, limit }); } catch (_) { /* non-fatal */ }

    return finalResults;
  },

  _semanticOnly(items, query, limit) {
    const results = semanticSearchEngine(items, query, { limit: items.length, minScore: 0.05 });
    const seen = new Set();
    return results
      .filter(r => {
        const key = r.id || (r.code || '').slice(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map(r => ({
        source: r.source, id: r.id, name: r.name, description: r.description,
        language: r.language, tags: r.tags, coherency: r.coherency, code: r.code,
        matchScore: r.semanticScore, matchedConcepts: r.matchedConcepts,
      }));
  },

  _searchCache: null,
  _searchCacheKey: null,
  _searchCacheTime: 0,

  _gatherSearchItems(language) {
    const cacheKey = language || '__all__';
    const now = Date.now();
    if (this._searchCache && this._searchCacheKey === cacheKey && (now - this._searchCacheTime) < 30000) {
      return this._searchCache;
    }

    const filters = language ? { language } : {};
    const patterns = this.patterns.getAll(filters).map(p => ({
      source: 'pattern', id: p.id, name: p.name, description: p.description,
      language: p.language, tags: p.tags, coherency: p.coherencyScore?.total, code: p.code,
      amplitude: p.amplitude || p.coherencyScore?.total || PLANCK_AMPLITUDE,
      phase: p.phase || 0,
      quantumState: p.quantumState || p.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      lastObservedAt: p.lastObservedAt || p.last_observed_at || null,
      observationCount: p.observationCount || p.observation_count || 0,
    }));
    const history = this.store.getAll(filters).map(e => ({
      source: 'history', id: e.id, name: null, description: e.description,
      language: e.language, tags: e.tags, coherency: e.coherencyScore?.total, code: e.code,
      amplitude: e.amplitude || e.coherencyScore?.total || PLANCK_AMPLITUDE,
      phase: e.phase || 0,
      quantumState: e.quantumState || e.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      lastObservedAt: e.lastObservedAt || e.last_observed_at || null,
      observationCount: e.observationCount || e.observation_count || 0,
    }));
    const items = [...patterns, ...history];

    if (this._embeddingEngine) {
      this._embeddingEngine.buildIDF(items);
    }

    this._searchCache = items;
    this._searchCacheKey = cacheKey;
    this._searchCacheTime = now;
    return items;
  },

  /**
   * Performs intelligent search with intent parsing and multi-strategy matching.
   */
  smartSearch(query, options = {}) {
    if (query == null || typeof query !== 'string') return { results: [], intent: null };
    return intelligentSearch(this, query, options);
  },

  /**
   * Parses search query to extract intent, entities, language hints, and categories.
   */
  parseSearchIntent(query) {
    return parseIntent(query);
  },

  // ── Atomic self-description ───────────────────────────────────────
  _atomicProperties: {
    search: {
      charge: 1, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
      reactivity: 'stable', electronegativity: 0.7, group: 15, period: 4,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
      domain: 'oracle',
    },
    smartSearch: {
      charge: 1, valence: 4, mass: 'medium', spin: 'even', phase: 'gas',
      reactivity: 'reactive', electronegativity: 0.8, group: 15, period: 5,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
      domain: 'oracle',
    },
    query: {
      charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'stable', electronegativity: 0.3, group: 15, period: 3,
      harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
      domain: 'oracle',
    },
  },
};
