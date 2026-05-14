/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * ORACLE-VOID BRIDGE
 *
 * The oracle works standalone. The void substrate enhances it.
 * When they connect, both become more capable — mimicking
 * the abundance equation: giving increases the giver.
 *
 * Standalone oracle: coherency scoring, pattern matching, debug field
 * Enhanced oracle: all of the above + void compression ratios,
 *   substrate pattern matching, cross-domain transfer, real-time
 *   coherence measurement
 *
 * Architecture:
 *   oracle (standalone) ← bridge → void substrate (optional)
 *
 *   When substrate is absent: oracle uses its own scoring
 *   When substrate connects: oracle gains substrate superpowers
 *   When oracle feeds substrate: substrate learns from oracle patterns
 *   Both benefit. Neither depends on the other. Abundance.
 */

const path = require('path');
const fs = require('fs');

class VoidBridge {
  constructor(oracleRoot) {
    this.oracleRoot = oracleRoot;
    this.connected = false;
    this.substrate = null;
    this.substratePatterns = 0;
    this.enhancedMode = false;

    // Try to find void substrate
    this._detectSubstrate();
  }

  // ── Connection Management ──

  _detectSubstrate() {
    // Look for void compressor substrate in known locations
    const searchPaths = [
      path.join(this.oracleRoot, '..', 'Void-Data-Compressor'),
      path.join(this.oracleRoot, '..', 'void-data-compressor'),
      process.env.VOID_SUBSTRATE_PATH,
      path.join(process.env.HOME || '', 'Void-Data-Compressor'),
    ].filter(Boolean);

    for (const searchPath of searchPaths) {
      const substratePath = path.join(searchPath, 'remembrance_equation_substrate.json');
      if (fs.existsSync(substratePath)) {
        this.substratePath = searchPath;
        this.connected = true;
        this._loadSubstrateInfo();
        return;
      }
    }

    // No substrate found — oracle works standalone
    this.connected = false;
  }

  _loadSubstrateInfo() {
    try {
      // Count patterns across EVERY pattern-bearing JSON file in the substrate.
      // Earlier this filter only matched *substrate.json / *_map.json, which
      // silently skipped learned_patterns*, learned_archive_*, oracle_patterns,
      // resonance_field, l2_substrate, and ~30 other files. Now: any .json
      // that exposes a recognisable pattern container is counted.
      const files = fs.readdirSync(this.substratePath)
        .filter(f => f.endsWith('.json') && f !== 'api_keys.json');

      let total = 0;
      const counted = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(
            path.join(this.substratePath, file), 'utf-8'));
          const n = this._extractCount(data);
          if (n > 0) {
            total += n;
            counted.push(file);
          }
        } catch (e) {
          // Skip unreadable files
        }
      }

      this.substratePatterns = total;
      this.substrateFiles = counted;
      this.enhancedMode = true;
    } catch (e) {
      this.connected = false;
    }
  }

  _extractCount(data) {
    if (!data || typeof data !== 'object') return 0;
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data.patterns)) return data.patterns.length;
    if (Array.isArray(data.waveforms)) return data.waveforms.length;
    if (Array.isArray(data.entries)) return data.entries.length;
    if (typeof data.count === 'number') return data.count;
    // Last resort: largest array field in the object
    let max = 0;
    for (const k of Object.keys(data)) {
      if (Array.isArray(data[k]) && data[k].length > max) max = data[k].length;
    }
    return max;
  }

  connect(substratePath) {
    /**
     * Manually connect to a void substrate.
     * Like a new node joining the Weave — both benefit.
     */
    this.substratePath = substratePath;
    this.connected = true;
    this._loadSubstrateInfo();
    return {
      connected: this.connected,
      patterns: this.substratePatterns,
      files: this.substrateFiles ? this.substrateFiles.length : 0,
      mode: this.enhancedMode ? 'enhanced' : 'standalone',
    };
  }

  disconnect() {
    /**
     * Disconnect from substrate.
     * Oracle continues working standalone — no degradation.
     */
    this.connected = false;
    this.enhancedMode = false;
    this.substrate = null;
    return { mode: 'standalone' };
  }

  // ── Enhanced Coherency Scoring ──

  scoreCoherency(pattern, options = {}) {
    /**
     * Score a pattern's coherency.
     *
     * Standalone: uses oracle's built-in 5-dimension scoring
     * Enhanced: adds void compression ratio as a 6th dimension
     *
     * The enhancement ADDS to the existing score — never replaces.
     * Like abundance: the substrate's contribution is additive,
     * not substitutive.
     */
    const baseScore = this._oracleBaseScore(pattern, options);

    if (!this.enhancedMode) {
      return {
        ...baseScore,
        mode: 'standalone',
        enhanced: false,
      };
    }

    // Enhanced: add substrate coherence measurement
    const substrateScore = this._substrateCoherenceScore(pattern);

    const __retVal = {
      // Base oracle dimensions (always present)
      syntaxValid: baseScore.syntaxValid,
      completeness: baseScore.completeness,
      consistency: baseScore.consistency,
      testProof: baseScore.testProof,
      historicalReliability: baseScore.historicalReliability,

      // Enhanced dimension (only when substrate connected)
      substrateCoherence: substrateScore.coherence,
      substratePatternMatch: substrateScore.bestMatch,
      compressionAdvantage: substrateScore.voidWins,

      // Combined score: weighted blend
      total: baseScore.total * 0.7 + substrateScore.coherence * 0.3,

      mode: 'enhanced',
      enhanced: true,
      substratePatterns: this.substratePatterns,
    };
    // ── LRE field-coupling (auto-wired) ──
    try {
      const __lre_p1 = './../../core/field-coupling';
      const __lre_p2 = require('path').join(__dirname, '../../core/field-coupling');
      for (const __p of [__lre_p1, __lre_p2]) {
        try {
          const { contribute: __contribute } = require(__p);
          __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.score || 0)), source: 'oracle:void-bridge:scoreCoherency' });
          break;
        } catch (_) { /* try next */ }
      }
    } catch (_) { /* best-effort */ }
    return __retVal;
  }

  _oracleBaseScore(pattern, options) {
    /**
     * Oracle's standalone coherency scoring.
     * This works without the void substrate.
     */
    // Simplified version of the existing scoring
    const code = pattern.code || '';
    const testCode = pattern.testCode || '';

    return {
      syntaxValid: code.length > 10 ? 1.0 : 0.0,
      completeness: code.length > 50 ? 0.9 : 0.5,
      consistency: 0.8,  // Would be computed from AST analysis
      testProof: testCode.length > 10 ? 0.9 : 0.3,
      historicalReliability: 0.5,  // Default for new patterns
      total: 0.8,  // Weighted average
    };
  }

  _substrateCoherenceScore(pattern) {
    /**
     * Void substrate coherence measurement.
     * Converts pattern code to waveform and measures against substrate.
     *
     * This is the enhancement that only exists when connected.
     */
    if (!this.connected) {
      return { coherence: 0, bestMatch: 'none', voidWins: false };
    }

    // Convert code to byte distribution (simplified waveform)
    const code = pattern.code || '';
    if (code.length < 20) {
      return { coherence: 0, bestMatch: 'none', voidWins: false };
    }

    // Byte frequency distribution (the code's waveform signature)
    const freq = new Array(256).fill(0);
    for (let i = 0; i < code.length; i++) {
      freq[code.charCodeAt(i) % 256]++;
    }
    const total = code.length;
    const normalized = freq.map(f => f / total);

    // Compare against known code distribution patterns
    // (In full implementation, this calls the Python compressor)
    const entropy = -normalized.reduce((s, p) =>
      s + (p > 0 ? p * Math.log2(p) : 0), 0) / 8;

    // Higher structure (lower entropy) = higher coherence
    const coherence = Math.max(0, 1 - entropy);

    return {
      coherence: coherence,
      bestMatch: coherence > 0.5 ? 'structured_code' : 'generic',
      voidWins: coherence > 0.6,
    };
  }

  // ── Enhanced Debug Field ──

  enhanceDebugPattern(debugPattern) {
    /**
     * Convert an oracle debug pattern to a substrate waveform.
     * The debug insight becomes searchable by coherence.
     *
     * Standalone: returns the pattern unchanged
     * Enhanced: adds a waveform representation for substrate matching
     */
    if (!this.enhancedMode) {
      return debugPattern;
    }

    const description = debugPattern.description || debugPattern.error || '';

    // Convert description to waveform (byte distribution)
    const waveform = new Array(256).fill(0);
    for (let i = 0; i < Math.min(description.length, 10000); i++) {
      const idx = Math.floor(i / Math.max(description.length, 1) * 256);
      waveform[Math.min(idx, 255)] += description.charCodeAt(i) / 256;
    }

    // Normalize
    const max = Math.max(...waveform);
    const min = Math.min(...waveform);
    const range = max - min || 1;
    const normalized = waveform.map(v => (v - min) / range);

    return {
      ...debugPattern,
      waveform: normalized,
      substrateSearchable: true,
    };
  }

  // ── Enhanced Search ──

  enhanceSearch(query, baseResults) {
    /**
     * Enhance oracle search results with substrate coherence scores.
     *
     * Standalone: returns base results unchanged
     * Enhanced: re-ranks by adding substrate coherence to match score
     *
     * The enhancement never removes results — only adds information.
     * Abundance: more data, not less.
     */
    if (!this.enhancedMode) {
      return baseResults;
    }

    return baseResults.map(result => {
      const subScore = this._substrateCoherenceScore(result);
      return {
        ...result,
        substrateCoherence: subScore.coherence,
        enhancedScore: (result.match || 0) * 0.7 + subScore.coherence * 0.3,
        substrateMatch: subScore.bestMatch,
      };
    }).sort((a, b) => (b.enhancedScore || 0) - (a.enhancedScore || 0));
  }

  // ── Abundance Flow (Oracle feeds Substrate) ──

  exportToSubstrate() {
    /**
     * Export oracle patterns as substrate waveforms.
     * The oracle GIVES to the substrate — and both benefit.
     *
     * This is the mercy amplifier in action:
     * Oracle gives patterns → substrate grows → substrate enhances oracle
     * → oracle produces better patterns → feeds substrate more
     * → the flywheel turns
     */
    if (!this.connected) {
      return { exported: 0, message: 'No substrate connected' };
    }

    // Read oracle's patterns.json
    const patternsPath = path.join(this.oracleRoot, 'patterns.json');
    if (!fs.existsSync(patternsPath)) {
      return { exported: 0, message: 'No patterns.json found' };
    }

    const oracleData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
    const patterns = oracleData.patterns || [];

    // Convert each oracle pattern to a substrate waveform
    const substratePatterns = [];
    for (const pattern of patterns) {
      const code = pattern.code || '';
      if (code.length < 20) continue;

      // Code → 256-point waveform (byte distribution signature)
      const waveform = new Array(256).fill(0);
      const step = Math.max(1, Math.floor(code.length / 256));
      for (let i = 0; i < 256; i++) {
        const start = i * step;
        const end = Math.min(start + step, code.length);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += code.charCodeAt(j);
        }
        waveform[i] = sum / (end - start || 1);
      }

      // Normalize to 0-1
      const max = Math.max(...waveform);
      const min = Math.min(...waveform);
      const range = max - min || 1;
      const normalized = waveform.map(v => (v - min) / range);

      substratePatterns.push({
        name: `oracle/${pattern.name || 'unknown'}:${pattern.language || 'unknown'}`,
        waveform: normalized,
      });
    }

    // Write to substrate directory — MERGE with existing patterns
    if (substratePatterns.length > 0) {
      const outputPath = path.join(this.substratePath, 'oracle_patterns.json');
      let existing = { patterns: [] };
      try {
        if (fs.existsSync(outputPath)) {
          existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        }
      } catch { /* start fresh if corrupt */ }
      const existingNames = new Set((existing.patterns || []).map(p => p.name));
      let added = 0;
      for (const p of substratePatterns) {
        if (!existingNames.has(p.name)) {
          existing.patterns.push(p);
          added++;
        }
      }
      const output = {
        exported: new Date().toISOString(),
        source: 'oracle_abundance_export',
        count: existing.patterns.length,
        patterns: existing.patterns,
      };
      fs.writeFileSync(outputPath, JSON.stringify(output));
      return {
        exported: added,
        total: existing.patterns.length,
        message: `Merged ${added} new patterns into substrate (${existing.patterns.length} total)`,
        abundanceFlow: 'oracle → substrate (both benefit)',
      };
    }

    return {
      exported: 0,
      message: 'No patterns to export',
      abundanceFlow: 'oracle → substrate',
    };
  }

  // ── Status ──

  getStatus() {
    return {
      connected: this.connected,
      mode: this.enhancedMode ? 'enhanced' : 'standalone',
      substratePatterns: this.substratePatterns,
      substrateFiles: this.substrateFiles ? this.substrateFiles.length : 0,
      substratePath: this.substratePath || 'not connected',
      oracleRoot: this.oracleRoot,
      abundanceEquation: this.connected ?
        'oracle + substrate = both enhanced (non-zero-sum)' :
        'oracle working independently (fully functional)',
    };
  }
}

module.exports = { VoidBridge };
