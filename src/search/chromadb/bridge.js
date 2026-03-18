'use strict';

/**
 * ChromaDB Bridge — Node.js interface to the Python ChromaDB search engine.
 *
 * Communicates with engine.py via JSON-over-stdin/stdout subprocess calls.
 * Drop-in enhancement for the existing EmbeddingEngine — does NOT replace it,
 * adds a higher-quality search tier on top.
 *
 * Usage:
 *   const { ChromaDBBridge } = require('./bridge');
 *   const bridge = new ChromaDBBridge();
 *   const results = await bridge.search('rate limiter', { nResults: 5 });
 *   const decision = await bridge.resolve('debounce function', 'javascript');
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const ENGINE_SCRIPT = path.join(__dirname, 'engine.py');
const DEFAULT_DB_PATH = '.remembrance/chromadb';

class ChromaDBBridge {
  constructor(options = {}) {
    this._dbPath = options.dbPath || DEFAULT_DB_PATH;
    // Validate pythonBin: must be a simple command name or absolute path to a real file
    const pythonBin = options.pythonBin || 'python3';
    if (path.isAbsolute(pythonBin)) {
      if (!fs.existsSync(pythonBin)) throw new Error(`pythonBin not found: ${pythonBin}`);
    } else if (/[/\\]/.test(pythonBin) || /[;&|`$]/.test(pythonBin)) {
      throw new Error(`Invalid pythonBin: must be a simple command name or absolute path`);
    }
    this._pythonBin = pythonBin;
    this._timeout = options.timeout || 60000; // 60s for model loading on first call
    this._available = null; // null = unchecked
  }

  /**
   * Check if the Python engine is available.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (this._available !== null) return this._available;
    try {
      const result = await this._call({ action: 'stats' });
      this._available = !result.error;
      return this._available;
    } catch {
      this._available = false;
      return false;
    }
  }

  /**
   * Index a pattern into ChromaDB.
   */
  async indexPattern(pattern) {
    // Handle coherency from various field formats
    let coherence = 0;
    if (pattern.coherencyScore && typeof pattern.coherencyScore === 'object') {
      coherence = pattern.coherencyScore.total || 0;
    } else {
      coherence = pattern.coherency_total || pattern.coherence || 0;
    }

    return this._call({
      action: 'index',
      pattern: {
        id: pattern.id,
        code: pattern.code || '',
        description: pattern.description || '',
        tags: _parseTags(pattern.tags),
        coherence,
        language: pattern.language || 'unknown',
        name: pattern.name || '',
        pattern_type: pattern.patternType || pattern.pattern_type || 'utility',
        test_code: pattern.testCode || pattern.test_code || '',
        usage_count: pattern.usageCount || pattern.usage_count || 0,
        success_count: pattern.successCount || pattern.success_count || 0,
      },
    });
  }

  /**
   * Semantic search for patterns.
   */
  async search(query, options = {}) {
    return this._call({
      action: 'search',
      query,
      n_results: options.nResults || options.limit || 5,
      min_coherence: options.minCoherence || 0.0,
      language: options.language || null,
      include_candidates: options.includeCandidates || false,
    });
  }

  /**
   * Smart resolve — PULL/EVOLVE/GENERATE decision.
   */
  async resolve(description, language, minCoherency) {
    return this._call({
      action: 'resolve',
      description,
      language: language || null,
      min_coherency: minCoherency || 0.6,
    });
  }

  /**
   * Bulk sync from SQLite patterns array.
   * Uses extended timeout since encoding hundreds of patterns takes time.
   */
  async syncFromSQLite(patterns) {
    const origTimeout = this._timeout;
    this._timeout = Math.max(this._timeout, 300000); // 5 min for bulk sync
    try {
      return await this._call({
        action: 'sync',
        patterns,
      });
    } finally {
      this._timeout = origTimeout;
    }
  }

  /**
   * Remove a pattern from the index.
   */
  async removePattern(id) {
    return this._call({ action: 'remove', id });
  }

  /**
   * Get engine stats.
   */
  async stats() {
    return this._call({ action: 'stats' });
  }

  /**
   * Call the Python engine via subprocess.
   * @private
   */
  _call(command) {
    command.db_path = this._dbPath;
    const input = JSON.stringify(command);

    return new Promise((resolve, reject) => {
      const proc = execFile(
        this._pythonBin,
        [ENGINE_SCRIPT],
        {
          timeout: this._timeout,
          maxBuffer: 50 * 1024 * 1024, // 50MB for large sync results
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          // Try to parse stdout even if there's a non-zero exit code,
          // since Python stderr warnings (model loading, deprecations)
          // can trigger error despite valid output.
          if (stdout && stdout.trim()) {
            try {
              const result = JSON.parse(stdout.trim());
              resolve(result);
              return;
            } catch (e) {
              // Fall through to error handling
            }
          }

          if (error) {
            if (process.env.ORACLE_DEBUG && stderr) {
              console.warn('[chromadb-bridge] stderr:', stderr);
            }
            reject(new Error(`ChromaDB engine error: ${error.message}`));
            return;
          }

          reject(new Error(`ChromaDB: no output received`));
        }
      );

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }
}

/**
 * Sanitize a tag string: strip path traversal sequences and control characters.
 */
function _sanitizeTag(tag) {
  if (typeof tag !== 'string') return String(tag || '');
  return tag.replace(/\.\.\//g, '').replace(/[/\\]/g, '-').replace(/[\x00-\x1f]/g, '').trim();
}

/**
 * Parse tags from various formats (string, JSON string, array).
 */
function _parseTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => _sanitizeTag(t));
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed.map(t => _sanitizeTag(t));
    } catch {
      // comma-separated fallback
    }
    return tags.split(',').map(t => _sanitizeTag(t.trim())).filter(Boolean);
  }
  return [];
}

module.exports = { ChromaDBBridge };
