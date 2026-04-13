'use strict';

/**
 * Reflector ↔ core spine bridge.
 *
 * The goal: whenever the Reflector subsystem (internal or external)
 * needs to analyze a file, it should go through the unified analysis
 * envelope instead of re-parsing, re-tokenizing, and re-scoring on
 * its own. This bridge is the seam.
 *
 * Before the bridge, src/reflector/scoring-coherence.js and friends
 * each instantiated their own parser, security scanner, covenant
 * check, etc. Different invocations of the same function produced
 * slightly different results depending on the code path. That
 * drift is exactly what the analysis envelope is meant to eliminate.
 *
 * After the bridge, every internal Reflector entry point has a
 * paired envelope-based alternative:
 *
 *   reflectorScore(source, filePath)   → envelope.coherency
 *   reflectorScan(source, filePath)    → envelope.audit + envelope.covenant
 *   reflectorAnalyze(source, filePath) → the full envelope
 *   reflectorHeal(source, filePath)    → unified heal pipeline
 *
 * The external Reflector repo (Crackedcoder5TH/Reflector-oracle-)
 * imports this module instead of re-implementing the analysis
 * logic: its coherenceScorer, engine, securityScanner, and ci-pipeline
 * all ride this bridge.
 *
 * Example usage in the Reflector repo:
 *
 *   const { reflectorAnalyze, reflectorHeal } = require(
 *     'remembrance-oracle-toolkit/reflector'
 *   );
 *   const env = reflectorAnalyze(source, filePath);
 *   if (env.audit.findings.length > 0) {
 *     const healed = await reflectorHeal(source, { filePath });
 *   }
 */

const { analyze } = require('../core/analyze');
const { heal } = require('../core/heal');
const { getEventBus, EVENTS } = require('../core/events');

/**
 * Produce a Reflector-style coherency score for a file.
 *
 * The returned shape mirrors what the legacy `scoring-coherence.js`
 * returned so Reflector callers can drop this in without changing
 * their downstream consumers.
 *
 *   {
 *     filePath,
 *     language,
 *     score: 0..1,
 *     dimensions: { syntaxValidity, readability, security, testProof, historicalReliability },
 *     findings: { audit, covenant }
 *   }
 */
function reflectorScore(source, filePath) {
  const env = analyze(source, filePath);
  const coherency = env.coherency || { total: 0, dimensions: {} };
  return {
    filePath,
    language: env.language,
    score: coherency.total,
    dimensions: coherency.dimensions,
    findings: {
      audit: env.audit.findings || [],
      covenant: env.covenant.violations || [],
      lint: env.lint.findings || [],
      smell: env.smell.findings || [],
    },
    meta: env.meta,
  };
}

/**
 * Produce a Reflector-style scan report (findings only, no score).
 * Used by ci-pipeline.js where we don't need the weighted score,
 * just the structural issues that should be fixed or flagged.
 */
function reflectorScan(source, filePath) {
  const env = analyze(source, filePath);
  return {
    filePath,
    language: env.language,
    findings: env.allFindings,
    covenant: env.covenant,
    coherency: env.coherency,
  };
}

/**
 * Return the raw analysis envelope. Most Reflector code paths should
 * use this directly so every downstream consumer can pull whichever
 * field it needs without the bridge adding a layer.
 */
function reflectorAnalyze(source, filePath, options) {
  return analyze(source, filePath, options);
}

/**
 * Run the unified heal pipeline on a Reflector target.
 *
 * Forwards directly to src/core/heal.js. Reflector callers get the
 * full escalation ladder (confident → serf → llm → swarm → generate)
 * for free, along with event emission so the toolkit's learning
 * subsystems (calibration, pattern reliability, quantum field) all
 * observe the attempt.
 */
async function reflectorHeal(source, options = {}) {
  // Emit a reflector-specific event so the history log can distinguish
  // Reflector-driven heals from CLI/API heals.
  const bus = getEventBus();
  bus.emitSync('reflector.heal.start', { filePath: options.filePath });
  const result = await heal(source, options);
  bus.emitSync('reflector.heal.end', { filePath: options.filePath, level: result.level, success: result.success });
  return result;
}

/**
 * Walk a directory and produce an envelope per matching file.
 * Replaces Reflector's `takeSnapshot` + `scanDirectory` combination
 * for the common "scan a repo" use case.
 */
function reflectorScanDirectory(rootDir, options = {}) {
  const fs = require('fs');
  const path = require('path');
  const { analyzeFiles } = require('../core/analyze');

  const exts = new Set(options.extensions || ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']);
  const ignoreDirs = new Set(options.ignoreDirs || ['node_modules', '.git', 'dist', 'build', 'coverage', '.remembrance']);

  const files = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && exts.has(path.extname(entry.name))) files.push(full);
    }
  }
  walk(rootDir);

  return analyzeFiles(files, options);
}

/**
 * Produce a compact Reflector-style report from a set of envelopes.
 * Mirrors the shape that Reflector's `engine.takeSnapshot` returns
 * so existing callers stay unchanged.
 */
function reflectorReport(envelopes) {
  const files = envelopes.map(env => ({
    path: env.filePath,
    coherence: env.coherency.total,
    dimensions: env.coherency.dimensions,
    audit: env.audit.findings.length,
    covenantSealed: env.covenant.sealed,
    covenantViolations: env.covenant.violations || [],
    error: null,
  }));
  const valid = files.filter(f => !f.error);
  const avg = valid.length > 0
    ? valid.reduce((s, f) => s + (f.coherence || 0), 0) / valid.length
    : 0;
  return {
    files,
    aggregate: {
      totalFiles: files.length,
      validFiles: valid.length,
      avgCoherence: Math.round(avg * 1000) / 1000,
      covenantViolations: files.filter(f => !f.covenantSealed).length,
    },
  };
}

module.exports = {
  reflectorScore,
  reflectorScan,
  reflectorAnalyze,
  reflectorHeal,
  reflectorScanDirectory,
  reflectorReport,
};
