'use strict';

/**
 * Remembrance Auto-Workflow Engine
 *
 * Runs the FULL coding workflow automatically on every interaction:
 *
 *   1. SEARCH  — Find matching patterns before writing code
 *   2. DECIDE  — PULL / EVOLVE / GENERATE recommendation
 *   3. SCORE   — 7-dimension coherency on save
 *   4. HEAL    — SERF auto-fix if below threshold
 *   5. CASCADE — Void Compressor cross-domain validation
 *   6. REGISTER— Store successful patterns for future use
 *
 * ON BY DEFAULT. Disable with:
 *   - Environment: REMEMBRANCE_AUTO_WORKFLOW=false
 *   - Config:      { "autoWorkflow": false } in .remembrance/config.json
 *   - CLI:         oracle config set autoWorkflow false
 *
 * This module is the "always-on" brain of the ecosystem.
 * It hooks into git (post-commit), file save (VS Code), and API calls.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Configuration ───────────────────────────────────────────────

const DEFAULT_CONFIG = {
  autoWorkflow: true,          // Master switch — ON by default
  autoScore: true,             // Score files on save
  autoHeal: true,              // Heal files below threshold
  autoCascade: true,           // Run cascade validation
  autoRegister: true,          // Register successful patterns
  autoSearch: true,            // Search before generating

  coherenceThreshold: 0.68,    // Below this → auto-heal
  cascadeThreshold: 0.30,      // Below this → flag as divergent
  healMaxLoops: 3,             // Max SERF iterations
  healTarget: 0.80,            // Target coherency after healing

  registerMinCoherency: 0.80,  // Only register high-quality patterns
  registerOnCommit: true,      // Register patterns on git commit
  registerOnHeal: true,        // Register healed patterns

  voidUrl: null,               // Void Compressor URL (auto-detected)
  oracleUrl: null,             // Oracle API URL (local by default)

  excludePatterns: [           // Files to skip
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '*.min.js',
    '*.bundle.js',
  ],

  supportedExtensions: ['.js', '.ts', '.py', '.go', '.rs', '.jsx', '.tsx'],
};

function loadWorkflowConfig(rootDir) {
  const config = { ...DEFAULT_CONFIG };

  // 1. Config file
  const configPath = path.join(rootDir || process.cwd(), '.remembrance', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      Object.assign(config, fileConfig);
    }
  } catch {}

  // 2. Environment overrides (highest priority)
  if (process.env.REMEMBRANCE_AUTO_WORKFLOW === 'false') config.autoWorkflow = false;
  if (process.env.REMEMBRANCE_AUTO_SCORE === 'false') config.autoScore = false;
  if (process.env.REMEMBRANCE_AUTO_HEAL === 'false') config.autoHeal = false;
  if (process.env.REMEMBRANCE_AUTO_CASCADE === 'false') config.autoCascade = false;
  if (process.env.REMEMBRANCE_AUTO_REGISTER === 'false') config.autoRegister = false;
  if (process.env.REMEMBRANCE_AUTO_SEARCH === 'false') config.autoSearch = false;
  if (process.env.VOID_COMPRESSOR_URL) config.voidUrl = process.env.VOID_COMPRESSOR_URL;
  if (process.env.ORACLE_TOOLKIT_URL) config.oracleUrl = process.env.ORACLE_TOOLKIT_URL;
  if (process.env.REMEMBRANCE_THRESHOLD) config.coherenceThreshold = parseFloat(process.env.REMEMBRANCE_THRESHOLD);

  return config;
}

function saveWorkflowConfig(rootDir, updates) {
  const configDir = path.join(rootDir || process.cwd(), '.remembrance');
  const configPath = path.join(configDir, 'config.json');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  const merged = { ...existing, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

// ─── Auto-Workflow Engine ────────────────────────────────────────

class AutoWorkflow {
  constructor(oracle, options = {}) {
    this._oracle = oracle;
    this._config = loadWorkflowConfig(options.rootDir);
    this._rootDir = options.rootDir || process.cwd();
    this._stats = { scored: 0, healed: 0, cascaded: 0, registered: 0, searched: 0 };
    this._active = this._config.autoWorkflow;
  }

  get isActive() { return this._active; }
  get stats() { return { ...this._stats }; }

  /** Disable the workflow (user can turn it off) */
  disable() {
    this._active = false;
    saveWorkflowConfig(this._rootDir, { autoWorkflow: false });
  }

  /** Enable the workflow */
  enable() {
    this._active = true;
    saveWorkflowConfig(this._rootDir, { autoWorkflow: true });
  }

  /**
   * Run the FULL workflow on a single file.
   * This is what fires on every save, commit, or API call.
   *
   * @param {string} filePath - Path to the file
   * @param {object} options - { trigger: 'save'|'commit'|'api'|'manual' }
   * @returns {object} Workflow result with all step outcomes
   */
  async processFile(filePath, options = {}) {
    if (!this._active) return { skipped: true, reason: 'workflow disabled' };

    const ext = path.extname(filePath).toLowerCase();
    if (!this._config.supportedExtensions.includes(ext)) {
      return { skipped: true, reason: 'unsupported extension: ' + ext };
    }

    const trigger = options.trigger || 'manual';
    const startTime = Date.now();
    const result = {
      file: filePath,
      trigger,
      timestamp: new Date().toISOString(),
      steps: {},
    };

    let code;
    try {
      code = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return { ...result, error: 'Cannot read file: ' + err.message };
    }

    if (!code.trim()) return { ...result, skipped: true, reason: 'empty file' };

    const language = this._detectLanguage(filePath);

    // ─── Step 1: SEARCH (before writing, suggest existing patterns) ──
    if (this._config.autoSearch && trigger !== 'commit') {
      try {
        const description = this._extractDescription(code, filePath);
        if (this._oracle.search) {
          const matches = this._oracle.search(description, { limit: 3, language });
          result.steps.search = {
            query: description,
            matches: matches.length,
            topMatch: matches[0] ? { name: matches[0].name, coherency: matches[0].coherencyScore?.total || matches[0].coherency || 0 } : null,
          };
          this._stats.searched++;
        }
      } catch {}
    }

    // ─── Step 2: DECIDE (PULL/EVOLVE/GENERATE recommendation) ────────
    if (this._config.autoSearch && result.steps.search?.topMatch) {
      const topScore = result.steps.search.topMatch.coherency;
      result.steps.decide = {
        decision: topScore >= 0.68 ? 'PULL' : topScore >= 0.50 ? 'EVOLVE' : 'GENERATE',
        confidence: topScore,
        pattern: result.steps.search.topMatch.name,
      };
    }

    // ─── Step 3: SCORE (7-dimension coherency) ───────────────────────
    if (this._config.autoScore) {
      try {
        let scoreResult;
        if (this._oracle.computeCoherencyScore) {
          scoreResult = this._oracle.computeCoherencyScore(code, { language });
        } else if (this._oracle.scoreCoherency) {
          scoreResult = this._oracle.scoreCoherency(code, { language });
        } else {
          scoreResult = this._fallbackScore(code);
        }
        const total = scoreResult.total || scoreResult.composite || 0;
        result.steps.score = {
          coherency: total,
          dimensions: scoreResult.dimensions || scoreResult.breakdown || {},
          verdict: total >= 0.68 ? 'PULL-READY' : total >= 0.50 ? 'EVOLVE-NEEDED' : 'REGENERATE',
        };
        this._stats.scored++;
      } catch {}
    }

    // ─── Step 4: HEAL (auto-fix if below threshold) ──────────────────
    const currentScore = result.steps.score?.coherency || 0;
    if (this._config.autoHeal && currentScore > 0 && currentScore < this._config.coherenceThreshold) {
      try {
        let healedCode = code;
        if (this._oracle.reflect) {
          const healResult = this._oracle.reflect(code, {
            language,
            maxIterations: this._config.healMaxLoops,
            targetCoherence: this._config.healTarget,
          });
          healedCode = healResult.finalCode || healResult.code || code;
        }

        if (healedCode !== code) {
          // Re-score healed code
          let healedScore = currentScore;
          if (this._oracle.computeCoherencyScore) {
            healedScore = (this._oracle.computeCoherencyScore(healedCode, { language })).total || 0;
          }

          if (healedScore > currentScore) {
            // Write healed code back
            fs.writeFileSync(filePath, healedCode, 'utf-8');
            result.steps.heal = {
              before: currentScore,
              after: healedScore,
              improvement: Math.round((healedScore - currentScore) * 1000) / 1000,
              written: true,
            };
            code = healedCode;
            this._stats.healed++;
          }
        }
      } catch {}
    }

    // ─── Step 5: CASCADE (cross-domain validation via Void) ──────────
    if (this._config.autoCascade && this._config.voidUrl) {
      try {
        const cascadeResult = await this._cascade(code, path.basename(filePath));
        if (cascadeResult) {
          result.steps.cascade = {
            coherence: cascadeResult.coherence || 0,
            topMatch: cascadeResult.matches?.[0]?.domain || 'none',
            resonanceCount: (cascadeResult.matches || []).filter(m => Math.abs(m.correlation) >= 0.3).length,
          };
          this._stats.cascaded++;
        }
      } catch {}
    }

    // ─── Step 6: REGISTER (store successful patterns) ────────────────
    const finalScore = result.steps.heal?.after || result.steps.score?.coherency || 0;
    if (this._config.autoRegister && finalScore >= this._config.registerMinCoherency) {
      if (trigger === 'commit' && this._config.registerOnCommit) {
        try {
          if (this._oracle.submit) {
            const name = path.basename(filePath, path.extname(filePath));
            this._oracle.submit(code, {
              language,
              description: this._extractDescription(code, filePath),
              tags: this._extractTags(code, filePath),
              author: 'auto-workflow',
            });
            result.steps.register = { registered: true, name, coherency: finalScore };
            this._stats.registered++;
          }
        } catch {}
      }
    }

    result.durationMs = Date.now() - startTime;
    result.finalCoherency = finalScore;
    return result;
  }

  /**
   * Run workflow on all changed files in a git commit.
   * Called by the post-commit hook.
   */
  async processCommit(rootDir) {
    if (!this._active) return { skipped: true };

    const { execFileSync } = require('child_process');
    let changedFiles;
    try {
      const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACM', 'HEAD~1..HEAD'], {
        cwd: rootDir || this._rootDir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      changedFiles = output ? output.split('\n').filter(f => this._config.supportedExtensions.includes(path.extname(f).toLowerCase())) : [];
    } catch {
      return { skipped: true, reason: 'git diff failed' };
    }

    const results = [];
    for (const file of changedFiles) {
      const fullPath = path.join(rootDir || this._rootDir, file);
      if (fs.existsSync(fullPath)) {
        const result = await this.processFile(fullPath, { trigger: 'commit' });
        results.push(result);
      }
    }

    return { files: results.length, results };
  }

  /**
   * Run workflow on a batch of files (for API/dashboard use).
   */
  async processBatch(files, options = {}) {
    const results = [];
    for (const file of files) {
      const result = await this.processFile(file, { trigger: options.trigger || 'api' });
      results.push(result);
    }
    return {
      total: results.length,
      scored: results.filter(r => r.steps?.score).length,
      healed: results.filter(r => r.steps?.heal).length,
      registered: results.filter(r => r.steps?.register).length,
      results,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.go': 'go', '.rs': 'rust', '.jsx': 'javascript', '.tsx': 'typescript' };
    return map[ext] || 'unknown';
  }

  _extractDescription(code, filePath) {
    const name = path.basename(filePath, path.extname(filePath));
    // Try to get from JSDoc/docstring
    const jsdoc = code.match(/\/\*\*\s*\n?\s*\*?\s*(.+?)[\n*]/);
    if (jsdoc) return jsdoc[1].trim();
    const pyDoc = code.match(/"""(.+?)"""/);
    if (pyDoc) return pyDoc[1].trim();
    return name.replace(/[-_]/g, ' ');
  }

  _extractTags(code, filePath) {
    const tags = [];
    const name = path.basename(filePath, path.extname(filePath));
    tags.push(this._detectLanguage(filePath));
    tags.push(...name.split(/[-_.]/).filter(t => t.length > 2));
    // Extract function/class names as tags
    const fns = code.match(/(?:function|class|def)\s+(\w+)/g) || [];
    tags.push(...fns.map(f => f.split(/\s+/)[1]).filter(Boolean).slice(0, 5));
    return [...new Set(tags)];
  }

  _fallbackScore(code) {
    const lines = code.split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    const opens = (code.match(/[{(]/g) || []).length;
    const closes = (code.match(/[})]/g) || []).length;
    const syntax = Math.max(0, 1 - Math.abs(opens - closes) * 0.02);
    const todos = (code.match(/TODO|FIXME/gi) || []).length;
    const completeness = Math.max(0, 1 - todos * 0.05);
    const comments = nonEmpty.filter(l => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
    const readability = (comments / Math.max(nonEmpty.length, 1)) >= 0.05 ? 1.0 : 0.85;
    let maxD = 0, d = 0;
    for (const ch of code) { if (ch === '{') { d++; maxD = Math.max(maxD, d); } else if (ch === '}') d = Math.max(0, d - 1); }
    const simplicity = Math.max(0, 1 - Math.max(0, maxD - 5) * 0.1);
    const total = (syntax + completeness + readability + simplicity) / 4;
    return { total: Math.round(total * 1000) / 1000, dimensions: { syntax, completeness, readability, simplicity } };
  }

  async _cascade(code, name) {
    if (!this._config.voidUrl) return null;
    const http = require(this._config.voidUrl.startsWith('https') ? 'https' : 'http');
    return new Promise((resolve) => {
      const body = JSON.stringify({ text: code, name });
      const url = new URL('/cascade', this._config.voidUrl);
      const req = http.request({
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }
}

// ─── Auto-Setup on Install ───────────────────────────────────────

/**
 * Called when remembrance-oracle-toolkit is first required/imported.
 * Sets up the auto-workflow if not explicitly disabled.
 *
 * This is what makes it "automatic on download."
 */
function initAutoWorkflow(oracle, rootDir) {
  const config = loadWorkflowConfig(rootDir);
  if (!config.autoWorkflow) return null;

  const workflow = new AutoWorkflow(oracle, { rootDir });

  // Install git hooks automatically (if in a git repo)
  try {
    const hooksModule = require('../ci/hooks');
    if (hooksModule.installHooks && !hooksModule.hooksInstalled(rootDir)) {
      hooksModule.installHooks(rootDir);
    }
  } catch {}

  return workflow;
}

module.exports = {
  AutoWorkflow,
  loadWorkflowConfig,
  saveWorkflowConfig,
  initAutoWorkflow,
  DEFAULT_CONFIG,
};

// ── Atomic self-description (batch-generated) ────────────────────
loadWorkflowConfig.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'high', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
saveWorkflowConfig.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'high', electronegativity: 0, group: 6, period: 2,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
initAutoWorkflow.atomicProperties = {
  charge: 0, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 1, group: 9, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
