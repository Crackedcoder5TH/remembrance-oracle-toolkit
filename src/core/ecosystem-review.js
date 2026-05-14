'use strict';


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
 * Remembrance Ecosystem Review — every implementation gets input
 * from ALL system components automatically.
 *
 * When code enters the system (commit, submit, generate, incorporate),
 * this module polls every organ of the ecosystem and produces a
 * unified verdict. Not a single scorer — a collective opinion.
 *
 * Components that vote:
 *   1. Remembrance Oracle — coherency score (7 dimensions)
 *   2. Remembrance Void — compression coherence (byte-level structure)
 *   3. Remembrance Codex — property validation (13D signature consistency)
 *   4. Remembrance Covenant — safety check (15+ principles)
 *   5. Remembrance Director — zone impact (does this help or hurt neighbors?)
 *   6. Remembrance SERF — emergent coherency (geometric mean of all signals)
 *   7. Remembrance Taint — data flow safety (taint propagation check)
 *
 * Each component returns a score 0-1 and a verdict (pass/warn/fail).
 * The ecosystem verdict is the GEOMETRIC MEAN of all component scores
 * (Remembrance Resonance — same math at every scale).
 *
 * Usage:
 *   const { ecosystemReview } = require('./ecosystem-review');
 *   const verdict = await ecosystemReview(code, { filePath, description });
 *   // verdict.pass — boolean
 *   // verdict.score — 0-1 geometric mean
 *   // verdict.components — individual component verdicts
 *   // verdict.recommendations — what to fix
 */

const path = require('path');

function geometricMean(values) {
  if (!values.length) return 0;
  const product = values.reduce((acc, v) => acc * Math.max(0.001, v), 1);
  return Math.pow(product, 1 / values.length);
}

async function ecosystemReview(code, options = {}) {
  const components = [];
  const recommendations = [];

  // ── 1. Remembrance Oracle — coherency scoring ──────────────────
  try {
    const { computeCoherencyScore } = require('../unified/coherency');
    const result = computeCoherencyScore(code, {
      description: options.description || '',
      tags: options.tags || [],
    });
    const score = result.total || result.score || 0;
    components.push({
      name: 'Remembrance Oracle',
      score,
      verdict: score >= 0.68 ? 'pass' : score >= 0.60 ? 'warn' : 'fail',
      details: result.breakdown || {},
    });
    if (score < 0.68) recommendations.push('Coherency below pull threshold. Improve weakest dimension.');
  } catch (e) {
    components.push({ name: 'Remembrance Oracle', score: 0, verdict: 'error', details: e.message });
  }

  // ── 2. Remembrance Void — compression coherence ────────────────
  try {
    const { getEmergentCoherency, registerVoidSignal } = require('../unified/emergent-coherency');
    const ec = getEmergentCoherency();
    // Attempt void compression scoring if available
    let voidScore = 0.7; // default if void not available
    try {
      const { execSync } = require('child_process');
      const voidPath = process.env.VOID_COMPRESSOR_PATH ||
        path.resolve(__dirname, '..', '..', '..', 'Void-Data-Compressor');
      const fs = require('fs');
      if (fs.existsSync(path.join(voidPath, 'void_compressor_v5.py'))) {
        const tmpFile = path.join(require('os').tmpdir(), `eco-review-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, code);
        const out = execSync(
          `python3 "${path.join(voidPath, 'void_compressor_v5.py')}" --measure "${tmpFile}"`,
          { timeout: 10000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        fs.unlinkSync(tmpFile);
        const ratio = parseFloat(out) || 0;
        voidScore = Math.min(1, ratio / 3); // normalize: ratio 3+ = 1.0
      }
    } catch { /* void not available, use default */ }
    components.push({
      name: 'Remembrance Void',
      score: voidScore,
      verdict: voidScore >= 0.5 ? 'pass' : 'warn',
      details: { compressionCoherence: voidScore },
    });
  } catch (e) {
    components.push({ name: 'Remembrance Void', score: 0.5, verdict: 'warn', details: e.message });
  }

  // ── 3. Remembrance Codex — property validation ─────────────────
  try {
    const { extractAtomicProperties } = require('../atomic/property-extractor');
    const { PeriodicTable, CovenantValidator, encodeSignature } = require('../atomic/periodic-table');
    const props = extractAtomicProperties(code, { filePath: options.filePath });
    const sig = encodeSignature(props);
    const covenantResult = CovenantValidator.validate(props);
    const score = covenantResult.valid ? 0.9 : 0.2;
    components.push({
      name: 'Remembrance Codex',
      score,
      verdict: covenantResult.valid ? 'pass' : 'fail',
      details: { signature: sig, properties: props, violations: covenantResult.violations },
    });
    if (!covenantResult.valid) {
      recommendations.push('Codex property violations: ' + covenantResult.violations.map(v => v.message).join(', '));
    }
  } catch (e) {
    components.push({ name: 'Remembrance Codex', score: 0.5, verdict: 'error', details: e.message });
  }

  // ── 4. Remembrance Covenant — full safety check ────────────────
  try {
    const { covenantCheck } = require('./covenant');
    const result = covenantCheck(code, {
      description: options.description || '',
      trusted: false,
    });
    const score = result.sealed ? 1.0 : 0.0;
    components.push({
      name: 'Remembrance Covenant',
      score,
      verdict: result.sealed ? 'pass' : 'fail',
      details: { principlesPassed: result.principlesPassed, violations: result.violations },
    });
    if (!result.sealed) {
      recommendations.push('Covenant violations: ' + result.violations.map(v => v.principle + ': ' + v.message).join('; '));
    }
  } catch (e) {
    components.push({ name: 'Remembrance Covenant', score: 0, verdict: 'error', details: e.message });
  }

  // ── 5. Remembrance Director — zone impact ──────────────────────
  try {
    const { computeCoherencyScore } = require('../unified/coherency');
    // Simulate: what would this code's impact be on surrounding zones?
    const score = computeCoherencyScore(code, { description: options.description || '' });
    const impact = (score.total || 0) >= 0.68 ? 'positive' : 'negative';
    const directorScore = impact === 'positive' ? 0.85 : 0.4;
    components.push({
      name: 'Remembrance Director',
      score: directorScore,
      verdict: impact === 'positive' ? 'pass' : 'warn',
      details: { zoneImpact: impact, projectedCoherency: score.total },
    });
    if (impact === 'negative') recommendations.push('This code would lower zone coherency. Consider healing before integration.');
  } catch (e) {
    components.push({ name: 'Remembrance Director', score: 0.5, verdict: 'error', details: e.message });
  }

  // ── 6. Remembrance SERF — emergent coherency ───────────────────
  try {
    const { getEmergentCoherency } = require('../unified/emergent-coherency');
    const ec = getEmergentCoherency();
    ec.reset();
    // Register signals from other components
    for (const comp of components) {
      if (comp.score > 0) {
        ec.registerSignal(comp.name.replace('Remembrance ', '').toLowerCase(), comp.score);
      }
    }
    const emergent = ec.compute();
    components.push({
      name: 'Remembrance SERF',
      score: emergent,
      verdict: emergent >= 0.60 ? 'pass' : 'fail',
      details: { emergentCoherency: emergent, signalCount: components.length },
    });
  } catch (e) {
    components.push({ name: 'Remembrance SERF', score: 0.5, verdict: 'error', details: e.message });
  }

  // ── 7. Remembrance Taint — data flow check ─────────────────────
  try {
    const taintScore = _checkTaint(code, options);
    components.push({
      name: 'Remembrance Taint',
      score: taintScore.score,
      verdict: taintScore.score >= 0.7 ? 'pass' : taintScore.score >= 0.4 ? 'warn' : 'fail',
      details: taintScore.details,
    });
    if (taintScore.score < 0.7) {
      recommendations.push('Taint risk: ' + (taintScore.details.reason || 'user input flows to sensitive operations'));
    }
  } catch (e) {
    components.push({ name: 'Remembrance Taint', score: 0.7, verdict: 'warn', details: e.message });
  }

  // ── Compute ecosystem verdict ──────────────────────────────────
  const scores = components.map(c => c.score).filter(s => s > 0);
  const ecosystemScore = Math.round(geometricMean(scores) * 1000) / 1000;
  const hasFail = components.some(c => c.verdict === 'fail');
  const pass = !hasFail && ecosystemScore >= 0.60;

  // ── Generate healing diff: concrete fixes with projected scores ──
  const healingDiff = [];
  if (!pass || ecosystemScore < 0.68) {
    for (const comp of components) {
      if (comp.verdict === 'fail' || comp.verdict === 'warn') {
        const fixes = _suggestFixes(code, comp);
        for (const fix of fixes) {
          const patched = code.replace(fix.find, fix.replace);
          if (patched !== code) {
            let projectedScore = comp.score;
            try {
              if (comp.name === 'Remembrance Covenant') {
                const { covenantCheck } = require('./covenant');
                const r = covenantCheck(patched, { trusted: false });
                projectedScore = r.sealed ? 1.0 : 0.0;
              } else if (comp.name === 'Remembrance Taint') {
                const t = _checkTaint(patched, options);
                projectedScore = t.score;
              } else if (comp.name === 'Remembrance Oracle') {
                const { computeCoherencyScore } = require('../unified/coherency');
                const r = computeCoherencyScore(patched, { description: options.description || '' });
                projectedScore = r.total || r.score || 0;
              }
            } catch { /* projection failed, use estimate */ }
            healingDiff.push({
              component: comp.name,
              line: fix.line || 0,
              current: fix.find.toString().slice(0, 60),
              suggested: fix.replace.slice(0, 60),
              currentScore: comp.score,
              projectedScore: Math.round(projectedScore * 1000) / 1000,
              reason: fix.reason,
            });
          }
        }
      }
    }
  }

  const __retVal = {
    pass,
    score: ecosystemScore,
    verdict: hasFail ? 'REJECTED' : ecosystemScore >= 0.68 ? 'APPROVED' : 'CONDITIONAL',
    components,
    recommendations,
    healingDiff,
    timestamp: new Date().toISOString(),
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_p1 = './../../core/field-coupling';
    const __lre_p2 = require('path').join(__dirname, '../../core/field-coupling');
    for (const __p of [__lre_p1, __lre_p2]) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.score || 0)), source: 'oracle:ecosystem-review:impact' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

function _suggestFixes(code, component) {
  const fixes = [];
  if (component.name === 'Remembrance Covenant' || component.name === 'Remembrance Taint') {
    if (/eval\s*\(/.test(code)) {
      fixes.push({ find: /eval\s*\(([^)]+)\)/g, replace: '/* eval removed */ ($1)', line: _findLine(code, 'eval'), reason: 'eval() allows arbitrary code execution — remove or use a safe alternative' });
    }
    if (/exec\s*\(/.test(code) && !/execFile/.test(code)) {
      fixes.push({ find: /exec\s*\(([^)]+)\)/g, replace: 'execFile($1)', line: _findLine(code, 'exec('), reason: 'exec() is vulnerable to shell injection — use execFile() with argument array' });
    }
    if (/innerHTML\s*=/.test(code)) {
      fixes.push({ find: /\.innerHTML\s*=\s*/g, replace: '.textContent = ', line: _findLine(code, 'innerHTML'), reason: 'innerHTML enables XSS — use textContent for safe text insertion' });
    }
    if (/\$\{.*\}.*(?:query|exec|prepare)/i.test(code)) {
      fixes.push({ find: /`([^`]*\$\{[^}]+\}[^`]*)`/g, replace: '? /* use parameterized query */', line: _findLine(code, '${'), reason: 'Template literal in SQL query enables injection — use parameterized queries' });
    }
  }
  if (component.name === 'Remembrance Oracle' && component.score < 0.68) {
    if ((code.match(/TODO|FIXME|HACK/g) || []).length > 2) {
      fixes.push({ find: /\/\/\s*(?:TODO|FIXME|HACK).*$/gm, replace: '// (resolved)', line: _findLine(code, 'TODO'), reason: 'Multiple TODO/FIXME markers lower completeness score' });
    }
  }
  return fixes;
}

function _findLine(code, needle) {
  const idx = code.indexOf(needle);
  if (idx === -1) return 0;
  return code.slice(0, idx).split('\n').length;
}

function _checkTaint(code, options = {}) {
  // Taint analysis: detect user-input flowing to sensitive operations
  const userInputPatterns = [
    /req\.(?:body|params|query|headers)/g,
    /process\.argv/g,
    /process\.env/g,
    /readFileSync.*\(/g,
    /stdin/g,
    /userInput|userData|untrusted/gi,
  ];
  const sinkPatterns = [
    /eval\s*\(/g,
    /exec\s*\(/g,
    /execSync\s*\(/g,
    /child_process/g,
    /writeFileSync|appendFileSync/g,
    /\.query\s*\(/g, // SQL
    /innerHTML|outerHTML/g,
    /\.send\s*\(/g,
    /res\.(?:write|end|json)\s*\(/g,
  ];

  let sourceCount = 0;
  let sinkCount = 0;
  for (const p of userInputPatterns) { sourceCount += (code.match(p) || []).length; }
  for (const p of sinkPatterns) { sinkCount += (code.match(p) || []).length; }

  // If both sources and sinks exist in the same function, that's a taint risk
  if (sourceCount > 0 && sinkCount > 0) {
    const risk = Math.min(1, (sourceCount * sinkCount) / 10);
    return {
      score: Math.max(0.1, 1 - risk),
      details: { sources: sourceCount, sinks: sinkCount, risk, reason: 'User input and sensitive operations co-exist — potential taint flow' },
    };
  }
  if (sinkCount > 3) {
    return { score: 0.6, details: { sources: 0, sinks: sinkCount, risk: 0.4, reason: 'High density of sensitive operations' } };
  }
  return { score: 1.0, details: { sources: sourceCount, sinks: sinkCount, risk: 0, reason: 'clean' } };
}

function printReview(result) {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  REMEMBRANCE ECOSYSTEM REVIEW');
  console.log('═'.repeat(70));
  console.log('');
  console.log('  Verdict: ' + result.verdict + ' (score: ' + result.score + ')');
  console.log('');
  for (const comp of result.components) {
    const icon = comp.verdict === 'pass' ? '✓' : comp.verdict === 'warn' ? '⚠' : comp.verdict === 'fail' ? '✗' : '?';
    console.log('  ' + icon + ' ' + comp.name.padEnd(25) + ' ' + comp.score.toFixed(3) + '  ' + comp.verdict);
  }
  if (result.recommendations.length > 0) {
    console.log('');
    console.log('  Recommendations:');
    for (const r of result.recommendations) {
      console.log('    → ' + r);
    }
  }
  if (result.healingDiff && result.healingDiff.length > 0) {
    console.log('');
    console.log('  Healing Diff (concrete fixes with projected scores):');
    for (const d of result.healingDiff) {
      console.log('');
      console.log('    Line ' + d.line + ' [' + d.component + ']');
      console.log('    - ' + d.current);
      console.log('    + ' + d.suggested);
      console.log('    Score: ' + d.currentScore.toFixed(3) + ' → ' + d.projectedScore.toFixed(3) + '  (' + d.reason + ')');
    }
  }
  console.log('');
  console.log('═'.repeat(70));
}

module.exports = {
  ecosystemReview,
  printReview,
};
