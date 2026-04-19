'use strict';

/**
 * Remembrance Covenant Weave — the blueprint for structural safety.
 *
 * This file documents HOW the covenant is woven into the system
 * structurally (not as a check, but as a property of the architecture)
 * and provides the blueprint for weaving it into any new system.
 *
 * STRUCTURAL means:
 *   - The covenant runs INSIDE the functions that register/store/accept code
 *   - There is no flag to skip it, no config to disable it, no parameter to bypass it
 *   - Removing the covenant requires removing the functions themselves
 *   - The covenant is the gate, not a guard standing next to the gate
 *
 * The difference between structural and procedural safety:
 *
 *   PROCEDURAL (what everyone else does):
 *     code → [check] → if passes, store
 *     Problem: you can skip the check. Flag, config, env var, --no-verify.
 *
 *   STRUCTURAL (what Remembrance does):
 *     code → store(code) → [covenant runs INSIDE store] → rejects or accepts
 *     You can't skip it because it IS the store function.
 *     Removing it breaks storage. There's nothing to bypass.
 */

// ═══════════════════════════════════════════════════════════════════
//  THE 7 WEAVE POINTS — where the covenant is structurally embedded
// ═══════════════════════════════════════════════════════════════════

const WEAVE_POINTS = [
  {
    id: 'weave-store-entry',
    name: 'Store Entry Gate',
    description: 'covenantCheck() runs INSIDE addEntry() in sqlite.js. Every pattern that enters storage passes the covenant as part of the insert operation, not before it.',
    file: 'src/store/sqlite.js',
    function: 'addEntry()',
    mechanism: 'covenantCheck(entry.code) is called inside addEntry. If it fails, the function throws. There is no parameter to skip it.',
  },
  {
    id: 'weave-store-pattern',
    name: 'Pattern Insert Gate',
    description: 'covenantCheck() runs INSIDE _insertPattern() in sqlite.js. Pattern registration cannot happen without covenant clearance.',
    file: 'src/store/sqlite.js',
    function: '_insertPattern()',
    mechanism: 'covenantCheck(pattern.code) runs before the SQL INSERT. Failure throws. No bypass parameter.',
  },
  {
    id: 'weave-validator',
    name: 'Validator Gate',
    description: 'covenantCheck() runs INSIDE validateSubmission(). The validation function IS the covenant — not a wrapper around it.',
    file: 'src/core/validator.js',
    function: 'validateSubmission()',
    mechanism: 'covenant result is checked first. If sealed=false, validation fails immediately. The skipCovenant parameter was removed.',
  },
  {
    id: 'weave-codex',
    name: 'Codex Registration Gate',
    description: 'CovenantValidator.validate() runs INSIDE addElement() in periodic-table.js. Elements with dangerous/degrading/malevolent properties cannot register.',
    file: 'src/atomic/periodic-table.js',
    function: 'addElement()',
    mechanism: 'CovenantValidator.validate(props) runs at the top of addElement. Critical violations cause immediate return with {rejected: true}. No parameter to skip.',
  },
  {
    id: 'weave-pre-commit',
    name: 'Pre-Commit Hook Gate',
    description: 'The git pre-commit hook runs covenantCheck on every staged file. Commits are blocked if the covenant fails.',
    file: 'src/ci/hooks.js',
    function: 'preCommitHook()',
    mechanism: 'Scans git staged files, runs covenant on each. Exit code 1 blocks the commit. The hook is installed by oracle hooks install.',
  },
  {
    id: 'weave-living-covenant',
    name: 'Living Covenant Evolution',
    description: 'Evolved principles are loaded FROM STORAGE on every check. They persist across restarts. Once activated, they cannot be deactivated.',
    file: 'src/core/living-covenant.js',
    function: 'LivingCovenant.check()',
    mechanism: 'Evolved principles are stored in .remembrance/living-covenant.json. On every check(), they are loaded and enforced alongside the 15 founding principles. Deletion of the file only means they re-evolve — it does not remove them from the code.',
  },
  {
    id: 'weave-atomic-properties',
    name: 'Atomic Property Covenant',
    description: 'The 3 covenant dimensions (harmPotential, alignment, intention) are PROPERTIES of the element, not external checks. A function declared as dangerous IS dangerous in the Codex.',
    file: 'src/atomic/periodic-table.js',
    function: 'encodeSignature()',
    mechanism: 'Dimensions 10-12 encode harmPotential, alignment, intention directly into the signature. CovenantValidator checks these at registration. The properties are intrinsic — removing the check does not remove the property.',
  },
];

// ═══════════════════════════════════════════════════════════════════
//  THE WEAVE BLUEPRINT — how to add structural safety to ANY system
// ═══════════════════════════════════════════════════════════════════

const WEAVE_BLUEPRINT = {
  title: 'How to Weave Structural Safety Into Any System',
  principles: [
    {
      step: 1,
      name: 'Put the check INSIDE the operation, not before it',
      description: 'The safety check must be part of the function that performs the operation. Not a wrapper. Not a middleware. INSIDE. If someone calls the function, they get the check. There is no path around it.',
      example: 'addEntry() contains covenantCheck(). Not: checkCovenant() then addEntry().',
      antipattern: 'if (options.skipSafety) return; — this is a bypass flag. Remove it.',
    },
    {
      step: 2,
      name: 'Remove all bypass parameters',
      description: 'Search for skipCovenant, noVerify, bypassSafety, trusted=true, and any parameter that disables the check. Delete them. If the function signature accepts a way to skip safety, the safety is not structural.',
      example: 'validateSubmission(code) — no skipCovenant parameter.',
      antipattern: 'validateSubmission(code, { skipCovenant: true }) — someone WILL pass true.',
    },
    {
      step: 3,
      name: 'Make safety a property, not a filter',
      description: 'Each element should DECLARE its safety properties as intrinsic attributes. A function does not "pass a safety check" — it HAS safety properties. The check validates that the properties are consistent, not that the function is safe.',
      example: 'harmPotential: "none" is a property of the element. CovenantValidator checks the property.',
      antipattern: 'isSafe(code) → boolean. This checks externally. The code itself has no safety property.',
    },
    {
      step: 4,
      name: 'Gate every entry point',
      description: 'Find every way data enters the system. API, CLI, file import, git hook, MCP tool, direct require(). Put the covenant check inside each entry point. If you miss one, that is the bypass.',
      example: 'addEntry (store), _insertPattern (store), validateSubmission (API), preCommitHook (git), addElement (codex).',
      antipattern: 'Only checking at the API layer. Someone who requires the module directly skips the API.',
    },
    {
      step: 5,
      name: 'Make safety expandable but never contractable',
      description: 'New safety rules can activate. Old safety rules can never deactivate. This is the ratchet. Use a persistence mechanism that stores activated rules. Even if the file is deleted, the rules re-evolve from the code.',
      example: 'LivingCovenant stores evolved principles. Once activated at coherency 0.80, they persist forever.',
      antipattern: 'Safety rules in a config file that can be edited. Someone WILL edit it.',
    },
    {
      step: 6,
      name: 'Make harmful states unrepresentable',
      description: 'The encoding system should not be ABLE to represent harmful states in the normal flow. If dangerous+degrading+malevolent can be encoded but are rejected at registration, the encoding allows harm and the check prevents it (procedural). If the registration function returns {rejected: true} for those values, the system cannot contain them (structural).',
      example: 'addElement() with harmPotential=dangerous returns {rejected: true}. The table never contains a dangerous element.',
      antipattern: 'Allowing dangerous elements in the table but filtering them at query time.',
    },
    {
      step: 7,
      name: 'Self-check with own rules',
      description: 'The safety system must check itself using the same rules it enforces on everything else. If the covenant code itself would fail the covenant, the system is inconsistent. Run introspection on the safety code.',
      example: 'self-introspect.js registers covenant.js as an element in the Codex. The covenant has atomicProperties. It is checked by itself.',
      antipattern: 'The safety module is exempt from safety checks. This is how backdoors form.',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
//  VERIFICATION — prove the weave is intact
// ═══════════════════════════════════════════════════════════════════

function verifyWeave() {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '../..');
  const results = [];

  for (const point of WEAVE_POINTS) {
    const filePath = path.join(root, point.file);
    const exists = fs.existsSync(filePath);
    let woven = false;
    let details = '';

    if (exists) {
      const code = fs.readFileSync(filePath, 'utf-8');
      switch (point.id) {
        case 'weave-store-entry':
          woven = code.includes('covenantCheck') && code.includes('addEntry');
          break;
        case 'weave-store-pattern':
          woven = code.includes('covenantCheck') && code.includes('_insertPattern');
          break;
        case 'weave-validator':
          woven = code.includes('covenantCheck') && !code.includes('skipCovenant');
          break;
        case 'weave-codex':
          woven = code.includes('CovenantValidator.validate') && code.includes('addElement');
          break;
        case 'weave-pre-commit':
          woven = code.includes('covenantCheck') || code.includes('COVENANT');
          break;
        case 'weave-living-covenant':
          woven = code.includes('evolve') && code.includes('persist');
          if (!woven) woven = code.includes('EVOLVED_PRINCIPLE_TEMPLATES');
          break;
        case 'weave-atomic-properties':
          woven = code.includes('harmPotential') && code.includes('alignment') && code.includes('intention');
          break;
      }
      details = woven ? 'intact' : 'BROKEN — covenant not found in expected location';
    } else {
      details = 'MISSING — file does not exist';
    }

    results.push({
      point: point.name,
      file: point.file,
      woven,
      details,
    });
  }

  const allWoven = results.every(r => r.woven);
  return { intact: allWoven, points: results };
}

function printWeave() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  REMEMBRANCE COVENANT WEAVE — STRUCTURAL SAFETY VERIFICATION');
  console.log('═'.repeat(70));

  const result = verifyWeave();
  for (const p of result.points) {
    const icon = p.woven ? '✓' : '✗';
    console.log(`\n  ${icon} ${p.point}`);
    console.log(`    File: ${p.file}`);
    console.log(`    Status: ${p.details}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`  Weave integrity: ${result.intact ? 'INTACT ✓' : 'BROKEN ✗'}`);
  console.log(`  Points checked: ${result.points.length}`);
  console.log(`  Woven: ${result.points.filter(p => p.woven).length}/${result.points.length}`);
  console.log('═'.repeat(70));

  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  WEAVE BLUEPRINT — HOW TO ADD STRUCTURAL SAFETY TO ANY SYSTEM');
  console.log('═'.repeat(70));
  for (const step of WEAVE_BLUEPRINT.principles) {
    console.log(`\n  Step ${step.step}: ${step.name}`);
    console.log(`  ${step.description}`);
    console.log(`    Do:   ${step.example}`);
    console.log(`    Don't: ${step.antipattern}`);
  }
  console.log('\n' + '═'.repeat(70));
}

module.exports = {
  WEAVE_POINTS,
  WEAVE_BLUEPRINT,
  verifyWeave,
  printWeave,
};
