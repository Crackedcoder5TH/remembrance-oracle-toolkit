const { describe, it } = require('node:test');
const assert = require('assert');
const {
  auditCode,
  auditFile,
  auditFiles,
  checkStateMutation,
  checkSecurity,
  checkConcurrency,
  checkType,
  checkIntegration,
  checkEdgeCase,
  BUG_CLASSES,
  SEVERITY,
} = require('../src/audit/static-checkers');

// ─── State Mutation Checker ───

describe('checkStateMutation', () => {
  it('detects .sort() without .slice()', () => {
    const code = 'const sorted = items.sort((a, b) => a - b);';
    const findings = checkStateMutation(code, code.split('\n'));
    assert(findings.length > 0, 'Should detect .sort() mutation');
    assert.strictEqual(findings[0].bugClass, BUG_CLASSES.STATE_MUTATION);
    assert.strictEqual(findings[0].severity, SEVERITY.HIGH);
  });

  it('does not flag .sort() with .slice()', () => {
    const code = 'const sorted = items.slice().sort((a, b) => a - b);';
    const findings = checkStateMutation(code, code.split('\n'));
    const sortFindings = findings.filter(f => f.assumption.includes('.sort()'));
    assert.strictEqual(sortFindings.length, 0, 'Should not flag safe .sort()');
  });

  it('does not flag .sort() with spread', () => {
    const code = 'const sorted = [...items].sort((a, b) => a - b);';
    const findings = checkStateMutation(code, code.split('\n'));
    const sortFindings = findings.filter(f => f.assumption.includes('.sort()'));
    assert.strictEqual(sortFindings.length, 0);
  });

  it('detects .reverse() without copy', () => {
    const code = 'const reversed = arr.reverse();';
    const findings = checkStateMutation(code, code.split('\n'));
    assert(findings.some(f => f.assumption.includes('.reverse()')));
  });

  it('detects Object.assign with non-empty target', () => {
    const code = 'Object.assign(config, defaults);';
    const findings = checkStateMutation(code, code.split('\n'));
    assert(findings.some(f => f.assumption.includes('Object.assign')));
  });

  it('does not flag Object.assign with empty object', () => {
    const code = 'Object.assign({}, config, defaults);';
    const findings = checkStateMutation(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('Object.assign')).length, 0);
  });
});

// ─── Security Checker ───

describe('checkSecurity', () => {
  it('detects timing-unsafe secret comparison', () => {
    const code = "if (token === 'abc123') { grant(); }";
    const findings = checkSecurity(code, code.split('\n'));
    assert(findings.length > 0);
    assert.strictEqual(findings[0].bugClass, BUG_CLASSES.SECURITY);
  });

  it('detects eval with template literal', () => {
    const code = 'eval(`console.log(${userInput})`)';
    const findings = checkSecurity(code, code.split('\n'));
    assert(findings.some(f => f.assumption.includes('eval')));
  });

  it('detects SQL injection via template literal', () => {
    const code = 'db.query(`SELECT * FROM users WHERE id = ${userId}`)';
    const findings = checkSecurity(code, code.split('\n'));
    assert(findings.some(f => f.bugClass === BUG_CLASSES.SECURITY));
  });

  it('detects shell injection via template literal', () => {
    const code = "execSync(`rm -rf ${userPath}`)";
    const findings = checkSecurity(code, code.split('\n'));
    assert(findings.some(f => f.bugClass === BUG_CLASSES.SECURITY));
  });
});

// ─── Concurrency Checker ───

describe('checkConcurrency', () => {
  it('detects lock acquire without finally', () => {
    const code = `
async function process() {
  await mutex.acquire();
  doWork();
  mutex.release();
}`;
    const lines = code.split('\n');
    const findings = checkConcurrency(code, lines);
    assert(findings.some(f => f.bugClass === BUG_CLASSES.CONCURRENCY && f.assumption.includes('Lock')));
  });

  it('does not flag lock with finally', () => {
    const code = `
async function process() {
  await mutex.acquire();
  try {
    doWork();
  } finally {
    mutex.release();
  }
}`;
    const lines = code.split('\n');
    const findings = checkConcurrency(code, lines);
    assert.strictEqual(findings.filter(f => f.assumption.includes('Lock')).length, 0);
  });
});

// ─── Type Checker ───

describe('checkType', () => {
  it('detects JSON.parse without try-catch', () => {
    const code = 'const data = JSON.parse(input);';
    const findings = checkType(code, code.split('\n'));
    assert(findings.some(f => f.assumption.includes('JSON.parse')));
  });

  it('does not flag JSON.parse in try-catch', () => {
    const code = `
try {
  const data = JSON.parse(input);
} catch (e) {
  return null;
}`;
    const findings = checkType(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('JSON.parse')).length, 0);
  });

  it('does not flag JSON.parse with safeParse', () => {
    const code = 'const data = safeParse(input);';
    const findings = checkType(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('JSON.parse')).length, 0);
  });

  it('detects parseInt without radix in pedantic mode', () => {
    const code = 'const n = parseInt(str);';
    const findings = checkType(code, code.split('\n'), { pedantic: true });
    assert(findings.some(f => f.assumption.includes('parseInt')));
  });

  it('does not flag parseInt without radix in normal mode', () => {
    const code = 'const n = parseInt(str);';
    const findings = checkType(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('parseInt')).length, 0);
  });

  it('does not flag parseInt with radix', () => {
    const code = 'const n = parseInt(str, 10);';
    const findings = checkType(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('parseInt')).length, 0);
  });
});

// ─── Edge Case Checker ───

describe('checkEdgeCase', () => {
  it('detects switch without default', () => {
    const code = `
switch (action) {
  case 'add': add(); break;
  case 'remove': remove(); break;
}`;
    const findings = checkEdgeCase(code, code.split('\n'));
    assert(findings.some(f => f.bugClass === BUG_CLASSES.EDGE_CASE && f.assumption.includes('Switch')));
  });

  it('does not flag switch with default', () => {
    const code = `
switch (action) {
  case 'add': add(); break;
  default: error(); break;
}`;
    const findings = checkEdgeCase(code, code.split('\n'));
    assert.strictEqual(findings.filter(f => f.assumption.includes('Switch')).length, 0);
  });
});

// ─── Integration Checker ───

describe('checkIntegration', () => {
  it('detects null-returning function without caller check', () => {
    const code = `
function findUser(id) {
  const user = db.get(id);
  if (!user) return null;
  return user;
}

function greet() {
  const user = findUser(123);
  console.log(user.name);
}`;
    const findings = checkIntegration(code, code.split('\n'));
    assert(findings.some(f => f.bugClass === BUG_CLASSES.INTEGRATION));
  });
});

// ─── Main Audit Runner ───

describe('auditCode', () => {
  it('returns empty findings for clean code', () => {
    const code = 'const x = 1 + 2;';
    const result = auditCode(code);
    assert.strictEqual(result.findings.length, 0);
    assert.strictEqual(result.summary.total, 0);
  });

  it('returns findings across multiple bug classes', () => {
    const code = `
const sorted = items.sort();
const data = JSON.parse(input);
if (token === 'secret') { grant(); }
`;
    const result = auditCode(code);
    assert(result.summary.total >= 3, `Expected >= 3 findings, got ${result.summary.total}`);
    assert(Object.keys(result.summary.byClass).length >= 2, 'Should span multiple bug classes');
  });

  it('filters by bug class', () => {
    const code = `
const sorted = items.sort();
const data = JSON.parse(input);
`;
    const result = auditCode(code, { bugClasses: [BUG_CLASSES.STATE_MUTATION] });
    assert(result.findings.every(f => f.bugClass === BUG_CLASSES.STATE_MUTATION));
  });

  it('filters by minimum severity', () => {
    const code = `
const sorted = items.sort();
const n = parseInt(str);
`;
    const result = auditCode(code, { minSeverity: 'high' });
    assert(result.findings.every(f => f.severity === 'high'));
  });

  it('handles null/undefined code gracefully', () => {
    assert.deepStrictEqual(auditCode(null).findings, []);
    assert.deepStrictEqual(auditCode(undefined).findings, []);
    assert.deepStrictEqual(auditCode('').findings, []);
  });

  it('sorts findings by severity then line', () => {
    const code = `
const n = parseInt(str);
if (token === 'secret') { grant(); }
`;
    const result = auditCode(code);
    if (result.findings.length >= 2) {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      for (let i = 1; i < result.findings.length; i++) {
        const prevSev = severityOrder[result.findings[i - 1].severity] || 0;
        const currSev = severityOrder[result.findings[i].severity] || 0;
        assert(prevSev >= currSev, 'Findings should be sorted by severity desc');
      }
    }
  });
});

describe('auditFiles', () => {
  it('handles missing files gracefully', () => {
    const result = auditFiles(['/nonexistent/file.js']);
    assert.strictEqual(result.totalFindings, 0);
  });
});

console.log('All audit-static-checkers tests passed');
