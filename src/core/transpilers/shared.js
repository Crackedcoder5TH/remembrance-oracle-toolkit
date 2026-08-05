/**
 * Shared transpiler utilities — used by multiple language generators.
 */

function toSnakeCase(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Detect a for-loop range pattern (i = 0; i < n; i++).
 * @param {object} forNode - AST ForStatement node
 * @param {function} exprFn - Expression-to-string function for the target language
 * @returns {{ var: string, args: string } | null}
 */
function detectRangePattern(forNode, exprFn) {
  if (!forNode.init || !forNode.test || !forNode.update) return null;
  const init = forNode.init;
  const test = forNode.test;
  const update = forNode.update;

  if (init.type !== 'VariableDeclaration' || !init.init) return null;
  const varName = init.name;
  const start = exprFn(init.init);

  if (test.type !== 'BinaryExpression') return null;
  const op = test.operator;
  const end = exprFn(test.right);

  if (update.type === 'UpdateExpression' && update.operator === '++') {
    const rangeEnd = op === '<=' ? `${end} + 1` : end;
    const args = start === '0' ? rangeEnd : `${start}, ${rangeEnd}`;
    return { var: varName, args };
  }
  if (update.type === 'UpdateExpression' && update.operator === '--') {
    const rangeEnd = op === '>=' ? `${end} - 1` : end;
    return { var: varName, args: `${start}, ${rangeEnd}, -1` };
  }

  return null;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = {
  toSnakeCase,
  detectRangePattern,
  capitalize,
};

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
toSnakeCase.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
detectRangePattern.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
capitalize.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
