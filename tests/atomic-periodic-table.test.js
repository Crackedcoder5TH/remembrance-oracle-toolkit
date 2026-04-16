'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  PeriodicTable, CovenantValidator, encodeSignature, decodeSignature, GROUPS,
} = require('../src/atomic/periodic-table');
const { extractAtomicProperties } = require('../src/atomic/property-extractor');
const { runDiscovery, buildDescription } = require('../src/atomic/element-discovery');

describe('encodeSignature / decodeSignature', () => {
  it('roundtrips a property set', () => {
    const props = {
      charge: 1, valence: 3, mass: 'medium', spin: 'odd',
      phase: 'liquid', reactivity: 'reactive', electronegativity: 0.7,
      group: 8, period: 4,
      harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
    };
    const sig = encodeSignature(props);
    const decoded = decodeSignature(sig);
    assert.equal(decoded.charge, 1);
    assert.equal(decoded.valence, 3);
    assert.equal(decoded.mass, 'medium');
    assert.equal(decoded.spin, 'odd');
    assert.equal(decoded.phase, 'liquid');
    assert.equal(decoded.reactivity, 'reactive');
    assert.equal(decoded.group, 8);
    assert.equal(decoded.period, 4);
    assert.equal(decoded.harmPotential, 'minimal');
    assert.equal(decoded.alignment, 'healing');
    assert.equal(decoded.intention, 'benevolent');
  });

  it('encodes negative charge correctly', () => {
    const sig = encodeSignature({ charge: -1, valence: 0, mass: 'light', spin: 'even', phase: 'gas', reactivity: 'inert', electronegativity: 0, group: 12, period: 2 });
    assert.ok(sig.startsWith('C-'));
  });

  it('returns null for malformed signature', () => {
    assert.equal(decodeSignature('garbage'), null);
  });
});

describe('PeriodicTable', () => {
  let table;
  beforeEach(() => { table = new PeriodicTable(); });

  it('starts empty', () => {
    assert.equal(table.size, 0);
  });

  it('adds and retrieves elements', () => {
    const props = { charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 };
    const el = table.addElement(props, { name: 'add' });
    assert.equal(table.size, 1);
    assert.equal(el.name, 'add');
    const retrieved = table.getByProperties(props);
    assert.ok(retrieved);
    assert.equal(retrieved.name, 'add');
  });

  it('finds gaps between realized elements', () => {
    // Add three elements with similar properties
    table.addElement({ charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    table.addElement({ charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    table.addElement({ charge: 0, valence: 3, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    const gaps = table.findGaps({ maxGaps: 10 });
    assert.ok(gaps.length > 0);
    // Gaps should be neighbors of the realized elements
    for (const gap of gaps) {
      assert.ok(gap.neighborCount >= 2);
      assert.ok(gap.signature);
      assert.ok(gap.properties);
    }
  });

  it('computes interaction coherence between balanced elements', () => {
    table.addElement({ charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 }, { name: 'positive' });
    table.addElement({ charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 }, { name: 'negative' });
    const posEl = table.elements.find(e => e.name === 'positive');
    const negEl = table.elements.find(e => e.name === 'negative');
    const coherence = table.interactionCoherence(posEl.signature, negEl.signature);
    // Balanced charge + same valence + same phase = high coherence
    assert.ok(coherence > 0.7, `Expected high coherence, got ${coherence}`);
  });

  it('returns stats with group breakdown', () => {
    table.addElement({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas', reactivity: 'inert', electronegativity: 0, group: 1, period: 1 });
    table.addElement({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas', reactivity: 'inert', electronegativity: 0, group: 4, period: 2 });
    const stats = table.stats();
    assert.equal(stats.totalElements, 2);
    assert.ok(stats.byGroup.math >= 1);
    assert.ok(stats.byGroup.array >= 1);
  });

  it('records usage counts', () => {
    const props = { charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas', reactivity: 'inert', electronegativity: 0, group: 1, period: 1 };
    table.addElement(props);
    const sig = encodeSignature(props);
    table.recordUsage(sig);
    table.recordUsage(sig);
    assert.equal(table.getElement(sig).usageCount, 2);
  });

  it('exports JSON with element data', () => {
    table.addElement({ charge: 1, valence: 1, mass: 'medium', spin: 'odd', phase: 'liquid', reactivity: 'low', electronegativity: 0.5, group: 7, period: 3 });
    const json = table.exportJSON();
    assert.equal(json.elementCount, 1);
    assert.ok(json.elements[0].signature);
    assert.ok(json.elements[0].properties);
  });
});

describe('extractAtomicProperties', () => {
  it('extracts properties from a pure math function', () => {
    const code = `function add(a, b) { return a + b; }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.spin, 'even'); // no side effects
    assert.equal(props.reactivity, 'inert'); // no external calls
    assert.equal(props.mass, 'light'); // tiny function
  });

  it('detects side effects (odd spin)', () => {
    const code = `function log(msg) { console.log(msg); }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.spin, 'odd');
  });

  it('detects high reactivity from io operations', () => {
    const code = `const fs = require('fs'); function read() { return fs.readFileSync('x', 'utf-8'); }`;
    const props = extractAtomicProperties(code);
    assert.notEqual(props.reactivity, 'inert');
  });

  it('counts imports as valence', () => {
    const code = `const a = require('a'); const b = require('b'); const c = require('c');`;
    const props = extractAtomicProperties(code);
    assert.ok(props.valence >= 3);
  });

  it('returns default properties for empty input', () => {
    const props = extractAtomicProperties('');
    assert.equal(props.charge, 0);
    assert.equal(props.mass, 'light');
  });

  it('classifies heavy code correctly', () => {
    // Generate a deeply nested function
    const nested = 'function go() {\n' + '  if (true) {\n'.repeat(10) + '    x++;\n' + '  }\n'.repeat(10) + '}';
    const props = extractAtomicProperties(nested);
    assert.ok(props.mass === 'heavy' || props.mass === 'medium');
  });
});

describe('runDiscovery', () => {
  it('discovers gaps in a populated table', () => {
    const table = new PeriodicTable();
    // Seed with enough elements for dense neighborhoods
    for (let g = 1; g <= 3; g++) {
      for (const charge of [-1, 0, 1]) {
        for (const mass of ['light', 'medium', 'heavy']) {
          table.addElement({
            charge, valence: 2, mass, spin: 'even',
            phase: 'gas', reactivity: 'inert', electronegativity: 0.3,
            group: g, period: 2,
          });
        }
      }
    }
    // 3 groups × 3 charges × 3 masses = 27 elements → dense enough for gaps
    const predictions = runDiscovery(table, { maxResults: 20 });
    assert.ok(predictions.length > 0, `Expected gaps from 27 elements, got ${predictions.length}`);
    for (const pred of predictions) {
      assert.ok(pred.signature);
      assert.ok(pred.properties);
      assert.ok(pred.priority >= 0);
      assert.ok(pred.strategy);
      assert.ok(pred.description);
      assert.ok(pred.generationSpec);
    }
  });

  it('produces valid generation specs', () => {
    const table = new PeriodicTable();
    table.addElement({ charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    table.addElement({ charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    table.addElement({ charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1 });
    const preds = runDiscovery(table, { maxResults: 5 });
    for (const pred of preds) {
      const spec = pred.generationSpec;
      assert.ok(spec.prompt);
      assert.ok(spec.constraints);
      assert.ok(spec.targetGroup);
    }
  });

  it('returns empty array for an empty table', () => {
    const table = new PeriodicTable();
    const preds = runDiscovery(table);
    assert.equal(preds.length, 0);
  });
});

describe('buildDescription', () => {
  it('produces readable descriptions', () => {
    const desc = buildDescription({
      charge: 1, valence: 3, mass: 'heavy', spin: 'odd',
      phase: 'liquid', reactivity: 'reactive', group: 8, period: 4,
    });
    assert.ok(desc.includes('expanding'));
    assert.ok(desc.includes('heavy'));
    assert.ok(desc.includes('async'));
    assert.ok(desc.includes('side-effecting'));
  });
});

describe('CovenantValidator', () => {
  it('validates covenant-aligned properties', () => {
    const result = CovenantValidator.validate({
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    });
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });

  it('rejects dangerous harm potential', () => {
    const result = CovenantValidator.validate({
      harmPotential: 'dangerous', alignment: 'neutral', intention: 'neutral',
    });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.property === 'harmPotential'));
  });

  it('rejects degrading alignment', () => {
    const result = CovenantValidator.validate({
      harmPotential: 'none', alignment: 'degrading', intention: 'neutral',
    });
    assert.equal(result.valid, false);
  });

  it('rejects malevolent intention', () => {
    const result = CovenantValidator.validate({
      harmPotential: 'none', alignment: 'neutral', intention: 'malevolent',
    });
    assert.equal(result.valid, false);
  });

  it('enforce() throws on critical violations', () => {
    assert.throws(() => {
      CovenantValidator.enforce({ harmPotential: 'dangerous', alignment: 'degrading', intention: 'malevolent' });
    }, /COVENANT VIOLATION/);
  });

  it('enforce() passes on safe properties', () => {
    const result = CovenantValidator.enforce({
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    });
    assert.equal(result.valid, true);
  });
});

describe('PeriodicTable — covenant enforcement', () => {
  it('rejects elements with dangerous harm potential at registration', () => {
    const table = new PeriodicTable();
    const result = table.addElement({
      charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
      harmPotential: 'dangerous', alignment: 'neutral', intention: 'neutral',
    });
    assert.ok(result.rejected, 'Should reject dangerous elements');
    assert.equal(table.size, 0, 'Table should not grow from rejected element');
  });

  it('accepts elements with healing alignment', () => {
    const table = new PeriodicTable();
    const result = table.addElement({
      charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    });
    assert.ok(!result.rejected);
    assert.equal(table.size, 1);
  });

  it('canBond returns false when either element violates covenant', () => {
    const table = new PeriodicTable();
    // Both safe elements
    table.addElement({
      charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    }, { name: 'safe1' });
    table.addElement({
      charge: -1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'inert', electronegativity: 0.3, group: 1, period: 1,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    }, { name: 'safe2' });
    const sigs = table.signatures;
    assert.ok(table.canBond(sigs[0], sigs[1]), 'Safe elements should bond');
  });
});

describe('PeriodicTable — emergence', () => {
  it('emerges new elements when coherence threshold is crossed', () => {
    const table = new PeriodicTable();
    const emerged = table.checkEmergence(0.72, 100);
    assert.ok(emerged.length > 0, 'Should emerge at least one element at 0.72');
    assert.ok(emerged[0].isEmergent);
  });

  it('does not re-emerge at the same threshold', () => {
    const table = new PeriodicTable();
    table.checkEmergence(0.72, 100);
    const second = table.checkEmergence(0.72, 100);
    assert.equal(second.length, 0, 'Should not re-emerge');
  });

  it('emerges multiple elements at high coherence', () => {
    const table = new PeriodicTable();
    const emerged = table.checkEmergence(0.96, 500);
    assert.ok(emerged.length >= 5, `Expected 5+ emerged at 0.96, got ${emerged.length}`);
  });

  it('emerged elements have high emergence potential', () => {
    const table = new PeriodicTable();
    const emerged = table.checkEmergence(0.92, 200);
    for (const el of emerged) {
      assert.ok(el.emergencePotential >= 0.7, `Expected high potential, got ${el.emergencePotential}`);
    }
  });
});

describe('extractAtomicProperties — covenant dimensions', () => {
  it('detects dangerous harm potential from eval/exec patterns', () => {
    const code = `function danger() { eval(userInput); child_process.exec(cmd); }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.harmPotential, 'dangerous');
  });

  it('detects healing alignment from optimization patterns', () => {
    const code = `function optimize(data) { return refine(clean(validate(data))); }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.alignment, 'healing');
  });

  it('detects benevolent intention from protective patterns', () => {
    const code = `function protect(input) { return sanitize(guard(verify(input))); }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.intention, 'benevolent');
  });

  it('defaults covenant to safe values for simple code', () => {
    const code = `function add(a, b) { return a + b; }`;
    const props = extractAtomicProperties(code);
    assert.equal(props.harmPotential, 'none');
    assert.equal(props.alignment, 'neutral');
    assert.equal(props.intention, 'neutral');
  });
});
