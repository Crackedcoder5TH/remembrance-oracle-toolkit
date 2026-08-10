'use strict';
const { quiet } = require('../../core/quiet');

/**
 * mcp/handlers/analysis.js — fractal, audit, lint, smell, analyze, risk
 * and the repo-audit surface. Extracted verbatim from src/mcp/handlers.js
 * in the third monolith decomposition. oracle_audit's baseline-clear
 * deletion now rides the covenant gate (sealed below) instead of a
 * file-level exemption.
 */

const fs = require('fs');

// baseline-clear removes the stored audit baseline from disk — a real mutation, so it rides the covenant gate like every other write in this codebase.
const { createGate, requireGate } = require('../../core/covenant-fractal');
const _rmBaseline = requireGate((gate, p) => fs.unlinkSync(p));
const _sealedGate = () => createGate().seal({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2, harmPotential: 'none', alignment: 'neutral', intention: 'benevolent', domain: 'audit' });

const ANALYSIS = {

  // ─── 14. Fractal (math engines + code alignment) ───
  oracle_fractal(oracle, args) {
    const { computeFractalAlignment, selectResonantFractal, FRACTAL_TEMPLATES,
            sierpinski, mandelbrot, mandelbrotResonance, juliaStabilityMap,
            lyapunov, lyapunovSequence } = require('../../fractals');

    const action = args.action || 'analyze';
    switch (action) {
      case 'analyze': {
        if (!args.code) throw new Error('code is required for analyze action');
        return computeFractalAlignment(args.code);
      }
      case 'engines': {
        const engines = {};
        for (const [key, tmpl] of Object.entries(FRACTAL_TEMPLATES)) {
          engines[key] = { name: tmpl.name, role: tmpl.role, codeSignals: tmpl.codeSignals };
        }
        return { engines, count: Object.keys(engines).length };
      }
      case 'resonance': {
        if (!args.code) throw new Error('code is required for resonance action');
        const result = selectResonantFractal(args.code, args.description || '');
        return {
          fractal: result.fractal, resonance: result.resonance,
          reason: result.reason, template: { name: result.template.name, role: result.template.role },
        };
      }
      case 'sierpinski': {
        return sierpinski(args.level || 5);
      }
      case 'mandelbrot': {
        const result = mandelbrot(args.cr ?? -0.75, args.ci ?? 0.1, args.maxIter || 100);
        result.resonance = mandelbrotResonance(args.cr ?? -0.75, args.ci ?? 0.1, args.maxIter || 100);
        return result;
      }
      case 'julia': {
        return juliaStabilityMap(args.cr ?? -0.7, args.ci ?? 0.27015);
      }
      case 'lyapunov': {
        if (args.sequence) {
          return lyapunovSequence(args.sequence, args.r ?? 3.5, args.ci ?? 3.8);
        }
        return lyapunov(args.r ?? 3.57);
      }
      default:
        throw new Error(`Unknown fractal action: ${action}. Use: analyze, engines, resonance, sierpinski, mandelbrot, julia, lyapunov`);
    }
  },

  // ─── 14. Audit (bug detection across all subcommands) ───
  oracle_audit(oracle, args) {
    const fs = require('fs');
    const path = require('path');
    const action = args.action || 'check';
    const { auditCode, auditFile, auditFiles } = require('../../audit/ast-checkers');
    const { lintFile } = require('../../audit/lint-checkers');
    const { smellFile } = require('../../audit/smell-checkers');
    const repoRoot = process.cwd();

    switch (action) {
      case 'check': {
        if (!args.file) throw new Error('audit check requires a file');
        const opts = {
          bugClasses: args.bugClass ? [args.bugClass] : undefined,
          minSeverity: args.minSeverity,
        };
        const result = auditFile(args.file, opts);

        // Baseline hiding
        if (!args.noBaseline) {
          try {
            const baselineMod = require('../../audit/baseline');
            const baseline = baselineMod.readBaseline(baselineMod.resolveBaselinePath(repoRoot));
            if (baseline) {
              const diff = baselineMod.diffAgainstBaseline(baseline, { [args.file]: result.findings }, repoRoot);
              result.findings = diff.new.map(f => ({ ...f, file: undefined }));
              result.baselineHiddenCount = diff.persisted.length;
            }
          } catch (_e) { quiet('mcp:handlers:analysis:require', _e); /* best-effort */ }
        }

        // Auto-fix
        if (args.autoFix) {
          const { autoFixFile } = require('../../audit/auto-fix');
          const r = autoFixFile(args.file, result.findings, { write: !args.dryRun });
          result.autoFixed = r.fixed;
          result.findings = r.unfixed;
        }
        return result;
      }

      case 'baseline': {
        const baselineMod = require('../../audit/baseline');
        const files = args.files || [args.file].filter(Boolean);
        const result = auditFiles(files);
        const findingsByFile = {};
        for (const fr of result.files || []) findingsByFile[fr.file] = fr.findings;
        const baseline = baselineMod.buildBaseline(findingsByFile, repoRoot);
        baselineMod.writeBaseline(baseline, baselineMod.resolveBaselinePath(repoRoot));
        return { success: true, totalFindings: baseline.totalFindings, files: Object.keys(baseline.files).length };
      }
      case 'baseline-show': {
        const baselineMod = require('../../audit/baseline');
        return baselineMod.readBaseline(baselineMod.resolveBaselinePath(repoRoot));
      }
      case 'baseline-clear': {
        const baselineMod = require('../../audit/baseline');
        const p = baselineMod.resolveBaselinePath(repoRoot);
        if (fs.existsSync(p)) _rmBaseline(_sealedGate(), p);
        return { success: true };
      }

      case 'explain': {
        const { explain, listRules } = require('../../audit/explain');
        if (!args.rule) return { rules: listRules(args.category || null) };
        return explain(args.rule) || { error: `unknown rule: ${args.rule}` };
      }

      case 'feedback-fix':
      case 'feedback-dismiss': {
        const { recordFeedback } = require('../../audit/feedback');
        const which = action === 'feedback-fix' ? 'fix' : 'dismiss';
        if (!args.rule) throw new Error(`${action} requires a rule`);
        const r = recordFeedback(repoRoot, which, args.rule, { file: args.file });
        return { success: true, rule: args.rule, action: which, stats: r };
      }
      case 'feedback-show': {
        const { summarizeStore } = require('../../audit/feedback');
        return summarizeStore(repoRoot);
      }

      case 'prior': {
        const { scorePrior, loadPrior } = require('../../audit/bayesian-prior');
        if (!args.file) return loadPrior();
        const src = fs.readFileSync(args.file, 'utf-8');
        return { file: args.file, findings: scorePrior(src, args.file) };
      }

      case 'cross-file': {
        const { analyzeFiles, crossFileCallGraph } = require('../../core/analyze');
        const files = args.files || [args.file].filter(Boolean);
        const envs = analyzeFiles(files);
        const { cascades, graph } = crossFileCallGraph(envs);
        return { cascades, functionCount: graph.defs.size };
      }

      case 'summary': {
        const { buildSummary } = require('../../audit/rich-summary');
        const files = args.files || (args.file ? [args.file] : []);
        const result = auditFiles(files);
        const flat = [];
        for (const fr of result.files || []) {
          for (const f of fr.findings) flat.push({ ...f, file: fr.file });
        }
        return buildSummary({ findings: flat });
      }

      default:
        throw new Error(`Unknown audit action: ${action}`);
    }
  },


  // ─── 15. Lint ───
  oracle_lint(oracle, args) {
    const { lintCode, lintFile } = require('../../audit/lint-checkers');
    if (args.file) return lintFile(args.file);
    if (args.code) return lintCode(args.code);
    throw new Error('oracle_lint requires file or code');
  },


  // ─── 16. Smell ───
  oracle_smell(oracle, args) {
    const { smellCode, smellFile } = require('../../audit/smell-checkers');
    const thresholds = {};
    if (args.longFunctionLines) thresholds.longFunctionLines = args.longFunctionLines;
    if (args.deepNestingDepth)  thresholds.deepNestingDepth  = args.deepNestingDepth;
    if (args.tooManyParams)     thresholds.tooManyParams     = args.tooManyParams;
    if (args.file) return smellFile(args.file, { thresholds });
    if (args.code) return smellCode(args.code, { thresholds });
    throw new Error('oracle_smell requires file or code');
  },


  // ─── 17. Analyze (unified envelope) ───
  oracle_analyze(oracle, args) {
    const fs = require('fs');
    const { analyze } = require('../../core/analyze');
    let source, filePath = null;
    if (args.file) {
      filePath = args.file;
      source = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      source = args.code;
    } else {
      throw new Error('oracle_analyze requires file or code');
    }
    const env = analyze(source, filePath, { language: args.language });
    const include = Array.isArray(args.include) && args.include.length > 0
      ? args.include
      : ['audit', 'lint', 'smell', 'coherency', 'meta', 'language'];
    const out = { language: env.language, meta: env.meta };
    if (include.includes('audit'))       out.audit = env.audit;
    if (include.includes('lint'))        out.lint  = env.lint;
    if (include.includes('smell'))       out.smell = env.smell;
    if (include.includes('coherency'))   out.coherency = env.coherency;
    if (include.includes('prior'))       out.priorRisks = env.priorRisks;
    if (include.includes('covenant'))    out.covenant = env.covenant;
    if (include.includes('fingerprint')) out.fingerprint = env.fingerprint;
    if (include.includes('functions'))   out.functionCount = env.functions.length;
    if (include.includes('allFindings')) out.allFindings = env.allFindings;
    return out;
  },


  // ─── 19. Risk (Phase 2 bug probability scorer) ───
  oracle_risk(_oracle, args) {
    const fs = require('fs');
    const { computeBugProbability } = require('../../quality/risk-score');
    const { scanDirectory } = require('../../quality/risk-scanner');

    // Directory batch mode
    if (args.dir) {
      const report = scanDirectory(args.dir, {
        topN: typeof args.topN === 'number' ? args.topN : 10,
      });
      if (args.filter && typeof args.filter === 'string') {
        const want = args.filter.toUpperCase();
        const filtered = report.files.filter(f => f.riskLevel === want);
        return { ...report, files: filtered, stats: { ...report.stats, top: filtered.slice(0, report.stats.top.length) } };
      }
      return report;
    }

    // Single-file / inline code mode
    let code = null;
    let filePath = null;
    if (args.file) {
      if (!fs.existsSync(args.file)) throw new Error(`oracle_risk: file not found: ${args.file}`);
      filePath = args.file;
      code = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      code = args.code;
    } else {
      throw new Error('oracle_risk requires one of: file, code, or dir');
    }
    return computeBugProbability(code, { filePath });
  },


  // ─── Audit a repository by URL or path (the client-audit surface) ───
  // Thin dispatch over src/audit/repo-audit.js — the same engine behind
  // the remembrance-audit CLI, so phone/chat/terminal produce one report.
  oracle_audit_repo(oracle, args) {
    const { auditRepo } = require('../../audit/repo-audit');
    return auditRepo(args.target, {
      maxCheckerFiles: args.maxCheckerFiles,
      maxFindings: args.maxFindings,
    });
  },
};

module.exports = { ANALYSIS };
