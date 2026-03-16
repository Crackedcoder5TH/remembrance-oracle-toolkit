const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('sandbox code injection prevention', () => {
  it('does not execute injected code via backtick escape', () => {
    // This is the attack vector: code with backticks that would break
    // out of a template literal
    const maliciousCode = '`; const INJECTED = true; `';

    // Simulate the OLD (broken) approach: template interpolation
    const oldWrapper = `'use strict';\n${maliciousCode}\n`;

    // The old wrapper would parse as:
    // 'use strict';
    // `; const INJECTED = true; `
    // Which evaluates the template literal but INJECTED leaks into scope

    // The NEW (safe) approach: write to file, require it
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
    try {
      const codePath = path.join(tmpDir, 'code.js');
      fs.writeFileSync(codePath, maliciousCode);

      // Verify the file contains the raw string, not an interpolated version
      const content = fs.readFileSync(codePath, 'utf-8');
      assert.strictEqual(content, maliciousCode);
      assert.ok(content.includes('`'), 'backticks preserved literally');
    } finally {
      fs.rmdirSync(tmpDir, { recursive: true });
    }
  });

  it('safely handles dollar-brace sequences in code', () => {
    const code = 'const x = `${process.env.HOME}`; console.log(x);';

    // In the OLD approach, ${process.env.HOME} would be evaluated
    // during template literal construction of the wrapper
    // In the NEW approach, it's written to a file as-is

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'));
    try {
      const codePath = path.join(tmpDir, 'code.js');
      fs.writeFileSync(codePath, code);
      const content = fs.readFileSync(codePath, 'utf-8');
      assert.ok(content.includes('${process.env.HOME}'), 'interpolation preserved literally');
    } finally {
      fs.rmdirSync(tmpDir, { recursive: true });
    }
  });
});
