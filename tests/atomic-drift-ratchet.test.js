'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { compare, toJson, censusDrift } = require('../scripts/atomic-drift-ratchet');

/**
 * The eleventh gate: a function's declared identity vs the one the
 * substrate computes from its own body.
 *
 * Every gate here is driven through its pure surface in BOTH directions —
 * the block and the pass — because a guard proven only one way is not
 * proven.
 */

describe('atomic-drift — compare', () => {
  const base = {
    charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
    reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
    harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    domain: 'utility',
  };

  it('reports nothing when every declared dimension agrees', () => {
    assert.deepEqual(compare(base, { ...base }), []);
  });

  it('reports a disagreeing string dimension', () => {
    const d = compare(base, { ...base, mass: 'heavy' });
    assert.equal(d.length, 1);
    assert.deepEqual(d[0], { dim: 'mass', declared: 'light', computed: 'heavy' });
  });

  it('reports a disagreeing numeric dimension', () => {
    const d = compare(base, { ...base, group: 3 });
    assert.deepEqual(d[0], { dim: 'group', declared: 12, computed: 3 });
  });

  it('tolerates float noise on electronegativity', () => {
    assert.deepEqual(compare(base, { ...base, electronegativity: 0.4 + 1e-12 }), []);
  });

  it('does not compare a dimension the declaration omits', () => {
    const partial = { charge: 0, mass: 'light' };
    // computed disagrees on group, but group was never declared
    assert.deepEqual(compare(partial, { ...base, group: 3 }), []);
  });

  it('reports every disagreement, not just the first', () => {
    const d = compare(base, { ...base, mass: 'heavy', spin: 'odd', group: 3 });
    assert.equal(d.length, 3);
    assert.deepEqual(d.map((x) => x.dim).sort(), ['group', 'mass', 'spin']);
  });
});

describe('atomic-drift — toJson', () => {
  // The declarations are literal data. Reading them with eval would hand
  // arbitrary source to the interpreter inside a security gate, which is
  // the shape the covenant scanner exists to refuse.
  it('quotes bare keys and converts single quotes', () => {
    const o = JSON.parse(toJson("{ charge: 0, mass: 'light' }"));
    assert.deepEqual(o, { charge: 0, mass: 'light' });
  });

  it('survives a trailing comma', () => {
    const o = JSON.parse(toJson("{ group: 12, domain: 'core', }"));
    assert.deepEqual(o, { group: 12, domain: 'core' });
  });

  it('reads a full 13-dimension declaration', () => {
    const src = "{ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',"
      + " reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,"
      + " harmPotential: 'none', alignment: 'healing', intention: 'benevolent', domain: 'utility' }";
    const o = JSON.parse(toJson(src));
    assert.equal(Object.keys(o).length, 13);
    assert.equal(o.electronegativity, 0.4);
    assert.equal(o.domain, 'utility');
  });
});

describe('atomic-drift — census', () => {
  it('resolves nearly every declaration to a body', () => {
    const c = censusDrift();
    assert.ok(c.compared > 1500, `expected the full declaration surface, compared=${c.compared}`);
    // The parameter-list bug read `function f(opts = {}) {` bodies as "{}".
    // If it ever returns, unresolved stays low but drift explodes — so both
    // are asserted.
    assert.ok(c.unresolved < 20, `too many unresolved declarations: ${c.unresolved}`);
    assert.equal(c.unparseable.length, 0, `unparseable files: ${c.unparseable.join(', ')}`);
  });

  it('agrees with its own baseline', () => {
    const baseline = require('../.atomic-drift-baseline.json');
    const c = censusDrift();
    assert.equal(c.total, baseline.total,
      'census total moved without the baseline being re-saved');
  });
});
