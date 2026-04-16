'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  PeriodicTable, encodeSignature, decodeSignature, GROUPS,
} = require('../src/atomic/periodic-table');
const { extractAtomicProperties } = require('../src/atomic/property-extractor');
const { runDiscovery, buildDescription } = require('../src/atomic/element-discovery');

describe('encodeSignature / decodeSignature', () => {
  it('roundtrips a property set', () => {
    const props = {
      charge: 1, valence: 3, mass: 'medium', spin: 'odd',
      phase: 'liquid', reactivity: 'high', electronegativity: 0.7,
      group: 8, period: 4,
    };
    const sig = encodeSignature(props);
    const decoded = decodeSignature(sig);
    assert.equal(decoded.charge, 1);
    assert.equal(decoded.valence, 3);
    assert.equal(decoded.mass, 'medium');
    assert.equal(decoded.spin, 'odd');
    assert.equal(decoded.phase, 'liquid');
    assert.equal(decoded.reactivity, 'high');
    assert.equal(decoded.group, 8);
    assert.equal(decoded.period, 4);
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
      phase: 'liquid', reactivity: 'high', group: 8, period: 4,
    });
    assert.ok(desc.includes('expanding'));
    assert.ok(desc.includes('heavy'));
    assert.ok(desc.includes('async'));
    assert.ok(desc.includes('side-effecting'));
  });
});
