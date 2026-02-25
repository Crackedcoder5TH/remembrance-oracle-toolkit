/**
 * Remembrance Reflector BOT — PR Formatter Sub-Module
 *
 * PR formatting functions extracted from report.js Section 3.
 * Pure formatting functions — no external dependencies.
 */

// =====================================================================
// PR Formatter
// =====================================================================

/**
 * Generate a markdown-compatible progress bar using Unicode blocks.
 *
 * @param {number} value - Value 0-1
 * @param {number} width - Bar width in characters
 * @returns {string} Visual bar
 */
function progressBar(value, width = 20) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Format a score with color-coded emoji indicator.
 */
function scoreIndicator(score) {
  if (typeof score !== 'number') return '\u2753 N/A';
  if (score >= 0.9) return `\u{1F7E2} ${score.toFixed(3)}`;
  if (score >= 0.7) return `\u{1F7E1} ${score.toFixed(3)}`;
  if (score >= 0.5) return `\u{1F7E0} ${score.toFixed(3)}`;
  return `\u{1F534} ${score.toFixed(3)}`;
}

/**
 * Format a delta with arrow and sign.
 */
function deltaIndicator(delta) {
  if (typeof delta !== 'number') return '';
  if (delta > 0.01) return `\u25B2 +${delta.toFixed(3)}`;
  if (delta < -0.01) return `\u25BC ${delta.toFixed(3)}`;
  return `\u25C6 ${delta.toFixed(3)}`;
}

/**
 * Generate a full PR body with rich markdown.
 *
 * @param {object} report - Orchestration or reflector report
 * @param {object} options - { includeDeepScore, includeSecurity, includeFiles }
 * @returns {string} Markdown PR body
 */
function formatPRComment(report, options) {
  if (!report) return '## Remembrance Pull: Healed Refinement\n\nNo report data available.';
  options = options || {};
  const {
    includeDeepScore = true,
    includeSecurity = true,
    includeFiles = true,
    maxFiles = 10,
  } = options;

  const lines = [];

  lines.push('## Remembrance Pull: Healed Refinement');
  lines.push('');

  const coherence = report.coherence || report.snapshot || {};
  const before = coherence.before ?? coherence.avgCoherence ?? 0;
  const after = coherence.after ?? before;
  const delta = coherence.delta ?? (after - before);

  lines.push('### Coherence');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Before | ${scoreIndicator(before)} |`);
  lines.push(`| After  | ${scoreIndicator(after)} |`);
  lines.push(`| Delta  | ${deltaIndicator(delta)} |`);
  lines.push('');

  lines.push(`\`Before:\` ${progressBar(before)} ${before.toFixed(3)}`);
  lines.push(`\`After: \` ${progressBar(after)} ${after.toFixed(3)}`);
  lines.push('');

  const healings = report.changes || report.healings || [];
  if (healings.length > 0) {
    lines.push('### Top Changes');
    lines.push('');

    const top = healings
      .sort((a, b) => (b.improvement || 0) - (a.improvement || 0))
      .slice(0, 3);

    for (let i = 0; i < top.length; i++) {
      const h = top[i];
      const hBefore = h.before ?? h.originalCoherence ?? 0;
      const hAfter = h.after ?? h.healedCoherence ?? 0;
      const improve = h.improvement ?? (hAfter - hBefore);
      lines.push(`**${i + 1}. \`${h.path}\`**`);
      lines.push(`   ${hBefore.toFixed(3)} \u2192 ${hAfter.toFixed(3)} (+${improve.toFixed(3)})`);
      if (h.strategy) lines.push(`   _Strategy: ${h.strategy}_`);
      lines.push('');
    }

    if (healings.length > 3) {
      lines.push(`_...and ${healings.length - 3} more file(s) healed._`);
      lines.push('');
    }
  }

  const healing = report.healing || {};
  if (healing.filesHealed !== undefined || healing.filesScanned !== undefined) {
    lines.push('### Healing Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    if (healing.filesScanned !== undefined) lines.push(`| Files Scanned | ${healing.filesScanned} |`);
    if (healing.filesBelowThreshold !== undefined) lines.push(`| Below Threshold | ${healing.filesBelowThreshold} |`);
    if (healing.filesHealed !== undefined) lines.push(`| Files Healed | ${healing.filesHealed} |`);
    if (healing.avgImprovement !== undefined) lines.push(`| Avg Improvement | +${healing.avgImprovement.toFixed(3)} |`);
    lines.push('');
  }

  if (includeDeepScore && report.deepScore) {
    const ds = report.deepScore;
    lines.push('### Deep Score Analysis');
    lines.push('');
    lines.push(`**Aggregate:** ${scoreIndicator(ds.aggregate)} | **Health:** ${ds.health}`);
    lines.push('');

    if (ds.dimensions) {
      lines.push('| Dimension | Score | Bar |');
      lines.push('|-----------|-------|-----|');
      for (const [dim, val] of Object.entries(ds.dimensions)) {
        const dimScore = typeof val === 'number' ? val : val?.score || 0;
        lines.push(`| ${dim} | ${dimScore.toFixed(3)} | ${progressBar(dimScore, 15)} |`);
      }
      lines.push('');
    }

    if (ds.worstFiles?.length > 0) {
      lines.push('<details>');
      lines.push('<summary>Worst Files</summary>');
      lines.push('');
      for (const f of ds.worstFiles.slice(0, 5)) {
        lines.push(`- \`${f.path}\` \u2014 ${scoreIndicator(f.score)}`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  if (includeSecurity) {
    const findings = report.securityFindings || report.deepScore?.securityFindings || [];
    const count = typeof findings === 'number' ? findings : findings.length;
    if (count > 0) {
      lines.push('### Security Findings');
      lines.push('');
      if (Array.isArray(findings)) {
        for (const f of findings.slice(0, 5)) {
          const icon = f.severity === 'critical' ? '\u{1F6A8}' : f.severity === 'high' ? '\u26A0\uFE0F' : '\u{1F50D}';
          lines.push(`- ${icon} **${f.severity}**: ${f.message}${f.file ? ` (\`${f.file}\`)` : ''}`);
        }
        if (findings.length > 5) {
          lines.push(`- _...and ${findings.length - 5} more finding(s)._`);
        }
      } else {
        lines.push(`- ${count} security finding(s) detected. Run \`reflector repo-score\` for details.`);
      }
      lines.push('');
    }
  }

  if (includeFiles && healings.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>All Changed Files (${healings.length})</summary>`);
    lines.push('');
    lines.push('| File | Before | After | Delta |');
    lines.push('|------|--------|-------|-------|');
    for (const h of healings.slice(0, maxFiles)) {
      const hBefore = h.before ?? h.originalCoherence ?? 0;
      const hAfter = h.after ?? h.healedCoherence ?? 0;
      const hDelta = h.improvement ?? (hAfter - hBefore);
      lines.push(`| \`${h.path}\` | ${hBefore.toFixed(3)} | ${hAfter.toFixed(3)} | +${hDelta.toFixed(3)} |`);
    }
    if (healings.length > maxFiles) {
      lines.push(`| _...${healings.length - maxFiles} more_ | | | |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  const whisper = report.whisper || report.collectiveWhisper || '';
  const whisperText = typeof whisper === 'string' ? whisper : whisper.message || '';
  if (whisperText) {
    lines.push('### Whisper');
    lines.push('');
    lines.push(`> ${whisperText}`);
    lines.push('');
  }

  if (report.safety) {
    const s = report.safety;
    if (s.autoRolledBack) {
      lines.push('> \u26A0\uFE0F **Auto-rollback triggered** \u2014 coherence dropped after healing.');
      lines.push('');
    }
    if (s.backup) {
      lines.push(`_Backup: \`${s.backup}\`_`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('**Approve to manifest this remembrance.**');
  lines.push('');
  lines.push('_Generated by the Remembrance Reflector BOT._');

  return lines.join('\n');
}

/**
 * Generate a concise PR review comment (for inline comments on specific files).
 *
 * @param {object} fileResult - Per-file healing result
 * @returns {string} Markdown comment
 */
function formatFileComment(fileResult) {
  if (!fileResult) return '';
  const before = fileResult.before ?? fileResult.originalCoherence ?? 0;
  const after = fileResult.after ?? fileResult.healedCoherence ?? 0;
  const improvement = fileResult.improvement ?? (after - before);

  const lines = [];
  lines.push(`**Remembrance Healed** \u2014 coherence: ${before.toFixed(3)} \u2192 ${after.toFixed(3)} (+${improvement.toFixed(3)})`);

  if (fileResult.strategy) {
    lines.push(`_Strategy: ${fileResult.strategy}_`);
  }

  if (fileResult.whisper) {
    lines.push(`> ${fileResult.whisper}`);
  }

  return lines.join('\n');
}

/**
 * Generate a PR status check summary (for GitHub Check Runs).
 *
 * @param {object} report - Orchestration result
 * @returns {object} { title, summary, conclusion }
 */
function formatCheckRun(report) {
  if (!report) return { title: 'No data', summary: 'No report available.', conclusion: 'neutral' };
  const coherence = report.coherence || report.snapshot || {};
  const after = coherence.after ?? coherence.avgCoherence ?? 0;
  const healed = report.healing?.filesHealed ?? 0;
  const whisper = typeof report.whisper === 'string' ? report.whisper : report.whisper?.message || '';

  const conclusion = after >= 0.8 ? 'success' :
                     after >= 0.6 ? 'neutral' : 'failure';

  return {
    title: `Coherence: ${after.toFixed(3)} | ${healed} file(s) healed`,
    summary: `**Coherence:** ${scoreIndicator(after)}\n**Healed:** ${healed} file(s)\n\n> ${whisper}`,
    conclusion,
  };
}

module.exports = {
  progressBar,
  scoreIndicator,
  deltaIndicator,
  formatPRComment,
  formatFileComment,
  formatCheckRun,
};
