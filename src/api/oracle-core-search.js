/**
 * Oracle Core — Search and query.
 * Hybrid keyword + semantic search across patterns and verified history.
 */

const { rankEntries } = require('../core/relevance');
const { semanticSearch: semanticSearchEngine } = require('../search/embeddings');
const { smartSearch: intelligentSearch, parseIntent } = require('../core/search-intelligence');
const { trackSearch } = require('../core/session-tracker');

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

    const semanticResults = semanticSearchEngine(items, term, { limit: items.length, minScore: 0, language });
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

    const scored = items.map(item => {
      const nameKw = keywordScore(item.name || '') * 1.5;
      const descKw = keywordScore(item.description || '');
      const tagKw = keywordScore((item.tags || []).join(' '));
      const codeKw = keywordScore(item.code || '') * 0.3;
      const kwScore = Math.max(nameKw, descKw, tagKw, codeKw);
      const semScore = semanticMap.get(item.id) || 0;
      const holoScore = holoMap.get(item.id) || 0;

      // Three-signal blend when holo data exists, otherwise fallback to two-signal
      const matchScore = hasHolo
        ? kwScore * 0.30 + semScore * 0.45 + holoScore * 0.25
        : kwScore * 0.40 + semScore * 0.60;

      return {
        source: item.source, id: item.id, name: item.name, description: item.description,
        language: item.language, tags: item.tags, coherency: item.coherency, code: item.code,
        matchScore, keywordScore: kwScore, semanticScore: semScore, holoScore,
      };
    }).filter(r => r.matchScore > 0);

    const seen = new Set();
    const finalResults = scored
      .sort((a, b) => b.matchScore - a.matchScore || (b.coherency ?? 0) - (a.coherency ?? 0))
      .filter(r => {
        const key = (r.code || '').slice(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    // Track search interaction for session summary
    try { trackSearch(term, finalResults, { mode, language, limit }); } catch (_) { /* non-fatal */ }

    return finalResults;
  },

  _semanticOnly(items, query, limit) {
    const results = semanticSearchEngine(items, query, { limit: items.length, minScore: 0.05 });
    const seen = new Set();
    return results
      .filter(r => {
        const key = (r.code || '').slice(0, 100);
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

  _gatherSearchItems(language) {
    const filters = language ? { language } : {};
    const patterns = this.patterns.getAll(filters).map(p => ({
      source: 'pattern', id: p.id, name: p.name, description: p.description,
      language: p.language, tags: p.tags, coherency: p.coherencyScore?.total, code: p.code,
    }));
    const history = this.store.getAll(filters).map(e => ({
      source: 'history', id: e.id, name: null, description: e.description,
      language: e.language, tags: e.tags, coherency: e.coherencyScore?.total, code: e.code,
    }));
    return [...patterns, ...history];
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
};
