const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  progressBar,
  scoreIndicator,
  deltaIndicator,
  formatPRComment,
  formatFileComment,
  formatCheckRun,
} = require('../src/reflector/report');

// ─── Progress Bar ───

describe('progressBar', () => {
  it('should return full bar for value 1.0', () => {
    const bar = progressBar(1.0, 10);
    assert.equal(bar.length, 10);
    assert.ok(bar.includes('\u2588'));
    assert.ok(!bar.includes('\u2591'));
  });

  it('should return empty bar for value 0', () => {
    const bar = progressBar(0, 10);
    assert.equal(bar.length, 10);
    assert.ok(!bar.includes('\u2588'));
    assert.ok(bar.includes('\u2591'));
  });

  it('should return mixed bar for value 0.5', () => {
    const bar = progressBar(0.5, 10);
    assert.equal(bar.length, 10);
    assert.ok(bar.includes('\u2588'));
    assert.ok(bar.includes('\u2591'));
  });

  it('should use default width of 20', () => {
    const bar = progressBar(0.5);
    assert.equal(bar.length, 20);
  });
});

// ─── Score Indicator ───

describe('scoreIndicator', () => {
  it('should show green for score >= 0.9', () => {
    const result = scoreIndicator(0.95);
    assert.ok(result.includes('0.950'));
    assert.ok(result.includes('\u{1F7E2}'));
  });

  it('should show yellow for score >= 0.7', () => {
    const result = scoreIndicator(0.75);
    assert.ok(result.includes('0.750'));
    assert.ok(result.includes('\u{1F7E1}'));
  });

  it('should show orange for score >= 0.5', () => {
    const result = scoreIndicator(0.55);
    assert.ok(result.includes('0.550'));
    assert.ok(result.includes('\u{1F7E0}'));
  });

  it('should show red for score < 0.5', () => {
    const result = scoreIndicator(0.3);
    assert.ok(result.includes('0.300'));
    assert.ok(result.includes('\u{1F534}'));
  });

  it('should handle non-number input', () => {
    const result = scoreIndicator(null);
    assert.ok(result.includes('N/A'));
  });
});

// ─── Delta Indicator ───

describe('deltaIndicator', () => {
  it('should show up arrow for positive delta', () => {
    const result = deltaIndicator(0.05);
    assert.ok(result.includes('\u25B2'));
    assert.ok(result.includes('+'));
  });

  it('should show down arrow for negative delta', () => {
    const result = deltaIndicator(-0.05);
    assert.ok(result.includes('\u25BC'));
  });

  it('should show diamond for near-zero delta', () => {
    const result = deltaIndicator(0.005);
    assert.ok(result.includes('\u25C6'));
  });

  it('should return empty string for non-number', () => {
    assert.equal(deltaIndicator(null), '');
    assert.equal(deltaIndicator(undefined), '');
  });
});

// ─── formatPRComment ───

describe('formatPRComment', () => {
  it('should generate markdown with header and footer', () => {
    const md = formatPRComment({});
    assert.ok(md.includes('## Remembrance Pull: Healed Refinement'));
    assert.ok(md.includes('Approve to manifest this remembrance'));
    assert.ok(md.includes('Remembrance Self-Reflector Bot'));
  });

  it('should include coherence section with before/after', () => {
    const md = formatPRComment({
      coherence: { before: 0.6, after: 0.8, delta: 0.2 },
    });
    assert.ok(md.includes('### Coherence'));
    assert.ok(md.includes('Before'));
    assert.ok(md.includes('After'));
    assert.ok(md.includes('Delta'));
  });

  it('should include top healed changes', () => {
    const md = formatPRComment({
      changes: [
        { path: 'src/a.js', before: 0.5, after: 0.8, improvement: 0.3, strategy: 'refactor' },
        { path: 'src/b.js', before: 0.6, after: 0.7, improvement: 0.1 },
      ],
    });
    assert.ok(md.includes('### Top Changes'));
    assert.ok(md.includes('src/a.js'));
    assert.ok(md.includes('src/b.js'));
    assert.ok(md.includes('Strategy: refactor'));
  });

  it('should show "and N more" for > 3 changes', () => {
    const changes = Array.from({ length: 5 }, (_, i) => ({
      path: `src/file${i}.js`,
      before: 0.5,
      after: 0.7,
      improvement: 0.2,
    }));
    const md = formatPRComment({ changes });
    assert.ok(md.includes('...and 2 more file(s) healed.'));
  });

  it('should include healing summary when present', () => {
    const md = formatPRComment({
      healing: { filesScanned: 10, filesBelowThreshold: 3, filesHealed: 2, avgImprovement: 0.15 },
    });
    assert.ok(md.includes('### Healing Summary'));
    assert.ok(md.includes('Files Scanned'));
    assert.ok(md.includes('Files Healed'));
    assert.ok(md.includes('+0.150'));
  });

  it('should include deep score analysis', () => {
    const md = formatPRComment({
      deepScore: {
        aggregate: 0.85,
        health: 'healthy',
        dimensions: { complexity: 0.9, commentDensity: 0.8 },
        worstFiles: [{ path: 'src/bad.js', score: 0.3 }],
      },
    });
    assert.ok(md.includes('### Deep Score Analysis'));
    assert.ok(md.includes('healthy'));
    assert.ok(md.includes('complexity'));
    assert.ok(md.includes('Worst Files'));
    assert.ok(md.includes('src/bad.js'));
  });

  it('should skip deep score when includeDeepScore is false', () => {
    const md = formatPRComment(
      { deepScore: { aggregate: 0.85, health: 'healthy' } },
      { includeDeepScore: false },
    );
    assert.ok(!md.includes('### Deep Score Analysis'));
  });

  it('should include security findings', () => {
    const md = formatPRComment({
      securityFindings: [
        { severity: 'critical', message: 'Hardcoded secret', file: 'config.js' },
        { severity: 'high', message: 'SQL injection risk' },
      ],
    });
    assert.ok(md.includes('### Security Findings'));
    assert.ok(md.includes('Hardcoded secret'));
    assert.ok(md.includes('config.js'));
  });

  it('should skip security when includeSecurity is false', () => {
    const md = formatPRComment(
      { securityFindings: [{ severity: 'high', message: 'test' }] },
      { includeSecurity: false },
    );
    assert.ok(!md.includes('### Security Findings'));
  });

  it('should include collapsible changed files table', () => {
    const md = formatPRComment({
      changes: [{ path: 'src/a.js', before: 0.5, after: 0.8 }],
    });
    assert.ok(md.includes('<details>'));
    assert.ok(md.includes('All Changed Files'));
    assert.ok(md.includes('</details>'));
  });

  it('should skip file table when includeFiles is false', () => {
    const md = formatPRComment(
      { changes: [{ path: 'src/a.js', before: 0.5, after: 0.8 }] },
      { includeFiles: false },
    );
    assert.ok(!md.includes('All Changed Files'));
  });

  it('should include whisper section', () => {
    const md = formatPRComment({ whisper: 'The codebase grows stronger.' });
    assert.ok(md.includes('### Whisper'));
    assert.ok(md.includes('The codebase grows stronger.'));
  });

  it('should include safety alerts', () => {
    const md = formatPRComment({
      safety: { autoRolledBack: true, backup: 'backup-123' },
    });
    assert.ok(md.includes('Auto-rollback triggered'));
    assert.ok(md.includes('backup-123'));
  });

  it('should truncate files list with maxFiles option', () => {
    const changes = Array.from({ length: 15 }, (_, i) => ({
      path: `src/file${i}.js`,
      before: 0.5,
      after: 0.7,
    }));
    const md = formatPRComment({ changes }, { maxFiles: 5 });
    assert.ok(md.includes('...10 more'));
  });

  it('should handle report with healings key instead of changes', () => {
    const md = formatPRComment({
      healings: [{ path: 'src/x.js', originalCoherence: 0.4, healedCoherence: 0.7 }],
    });
    assert.ok(md.includes('src/x.js'));
  });

  it('should handle collectiveWhisper object', () => {
    const md = formatPRComment({
      collectiveWhisper: { message: 'All systems stable.' },
    });
    assert.ok(md.includes('All systems stable.'));
  });
});

// ─── formatFileComment ───

describe('formatFileComment', () => {
  it('should format per-file healing comment', () => {
    const comment = formatFileComment({
      before: 0.5,
      after: 0.8,
      improvement: 0.3,
      strategy: 'inline-docs',
    });
    assert.ok(comment.includes('Remembrance Healed'));
    assert.ok(comment.includes('0.500'));
    assert.ok(comment.includes('0.800'));
    assert.ok(comment.includes('+0.300'));
    assert.ok(comment.includes('inline-docs'));
  });

  it('should handle originalCoherence/healedCoherence fields', () => {
    const comment = formatFileComment({
      originalCoherence: 0.4,
      healedCoherence: 0.7,
    });
    assert.ok(comment.includes('0.400'));
    assert.ok(comment.includes('0.700'));
  });

  it('should include whisper when present', () => {
    const comment = formatFileComment({
      before: 0.5,
      after: 0.8,
      whisper: 'This file is now coherent.',
    });
    assert.ok(comment.includes('This file is now coherent.'));
  });

  it('should omit strategy when not present', () => {
    const comment = formatFileComment({ before: 0.5, after: 0.8 });
    assert.ok(!comment.includes('Strategy'));
  });
});

// ─── formatCheckRun ───

describe('formatCheckRun', () => {
  it('should return success for coherence >= 0.8', () => {
    const result = formatCheckRun({
      coherence: { after: 0.85 },
      healing: { filesHealed: 3 },
      whisper: 'All good.',
    });
    assert.equal(result.conclusion, 'success');
    assert.ok(result.title.includes('0.850'));
    assert.ok(result.title.includes('3 file(s) healed'));
    assert.ok(result.summary.includes('All good.'));
  });

  it('should return neutral for coherence >= 0.6', () => {
    const result = formatCheckRun({
      coherence: { after: 0.65 },
      healing: { filesHealed: 1 },
      whisper: 'Stable.',
    });
    assert.equal(result.conclusion, 'neutral');
  });

  it('should return failure for coherence < 0.6', () => {
    const result = formatCheckRun({
      coherence: { after: 0.4 },
      healing: { filesHealed: 0 },
      whisper: 'Needs work.',
    });
    assert.equal(result.conclusion, 'failure');
  });

  it('should handle missing coherence gracefully', () => {
    const result = formatCheckRun({});
    assert.equal(result.conclusion, 'failure');
    assert.ok(result.title.includes('0.000'));
  });

  it('should handle whisper as object', () => {
    const result = formatCheckRun({
      coherence: { after: 0.9 },
      whisper: { message: 'Object whisper.' },
    });
    assert.ok(result.summary.includes('Object whisper.'));
  });
});

// ─── Exports ───

describe('PR Formatter — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorFormatPRComment, 'function');
    assert.strictEqual(typeof index.reflectorFormatFileComment, 'function');
    assert.strictEqual(typeof index.reflectorFormatCheckRun, 'function');
    assert.strictEqual(typeof index.reflectorProgressBar, 'function');
    assert.strictEqual(typeof index.reflectorScoreIndicator, 'function');
  });
});

// ─── MCP Tool ───

describe('PR Formatter — MCP tool', () => {
  it('should have oracle_reflector_format_pr tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_format_pr');
    assert.ok(tool);
    assert.ok(tool.description.includes('PR'));
    assert.ok(tool.inputSchema.properties.report);
  });
});
