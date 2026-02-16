/**
 * Oracle Patterns — Security scanning and auditing.
 */

module.exports = {
  securityScan(codeOrPatternId, options = {}) {
    const { deepSecurityScan } = require('../core/covenant');

    let code, language, patternName;
    if (typeof codeOrPatternId === 'string' && codeOrPatternId.length < 32) {
      const pattern = this.patterns.getAll().find(p => p.id === codeOrPatternId || p.name === codeOrPatternId);
      if (pattern) {
        code = pattern.code;
        language = options.language || pattern.language;
        patternName = pattern.name;
      } else {
        code = codeOrPatternId;
        language = options.language || 'javascript';
      }
    } else {
      code = codeOrPatternId;
      language = options.language || 'javascript';
    }

    const result = deepSecurityScan(code, { language, runExternalTools: options.runExternalTools });

    if (result.veto && patternName) {
      this._emit({
        type: 'security_veto', patternName,
        tool: result.externalTools.length > 0 ? result.externalTools[0].tool : 'covenant',
        findings: result.totalFindings, whisper: result.whisper,
      });
    }

    return { ...result, patternName };
  },

  securityAudit(options = {}) {
    const { deepSecurityScan } = require('../core/covenant');
    const patterns = this.patterns.getAll();
    const report = { scanned: 0, clean: 0, advisory: 0, vetoed: 0, details: [] };

    for (const p of patterns) {
      const result = deepSecurityScan(p.code, { language: p.language, runExternalTools: options.runExternalTools });
      report.scanned++;
      if (result.veto) {
        report.vetoed++;
        report.details.push({ id: p.id, name: p.name, status: 'vetoed', findings: result.totalFindings, whisper: result.whisper });
      } else if (result.deepFindings.length > 0) {
        report.advisory++;
        report.details.push({ id: p.id, name: p.name, status: 'advisory', findings: result.deepFindings.length });
      } else {
        report.clean++;
      }
    }

    return report;
  },
};
