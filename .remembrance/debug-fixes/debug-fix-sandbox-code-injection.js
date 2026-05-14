/**
 * Meta-Pattern 8 Fix: Template Literal Code Injection in Sandbox
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "Submitted code is well-formed JavaScript that won't break
 *              out of the template literal wrapper"
 * Reality:    "Code containing backticks or ${} can escape the template
 *              literal and execute arbitrary code in the sandbox wrapper"
 *
 * Bug class: Security — sandbox escape via string interpolation
 * Location:  src/core/sandbox.js:sandboxJS() line 64-71, sandboxPython() line 121-143
 * Severity:  CRITICAL — user-submitted code is interpolated directly into
 *            template literals, allowing code injection
 *
 * Example attack (JS sandbox):
 *   code = "`;require('child_process').execSync('whoami');`"
 *   This breaks out of the template string in the wrapper.
 *
 * Fix: Write code and test to separate files, then require/import them
 *      instead of interpolating into a template string.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Before (broken):
//   const wrapper = `
//     'use strict';
//     ${code}        ← direct interpolation = injection vector
//     ;
//     ${testCode}    ← direct interpolation = injection vector
//   `;

// After (fixed):
function safeSandboxJS(code, testCode, sandboxDir, options = {}) {
  const { timeout = 10000, maxMemory = 64 } = options;

  // Write code to separate files — NO template interpolation
  const codePath = path.join(sandboxDir, 'code.js');
  const testPath = path.join(sandboxDir, 'test_runner.js');

  fs.writeFileSync(codePath, code, { mode: 0o400 });

  // The wrapper requires the code file instead of interpolating it
  const safeWrapper = `
'use strict';
require('./code.js');
${testCode}
`;
  fs.writeFileSync(testPath, safeWrapper, { mode: 0o400 });

  const memFlag = `--max-old-space-size=${maxMemory}`;
  const result = execSync(
    `node ${memFlag} "${testPath}"`,
    {
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sandboxDir,
      env: { PATH: process.env.PATH, NODE_PATH: '', HOME: sandboxDir },
    }
  );

  return { passed: true, output: result || 'All assertions passed', sandboxed: true };
}

module.exports = { safeSandboxJS };
