'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { registerElement, defaultTable } = require('../src/atomic/element-growth');
const { PeriodicTable, encodeSignature } = require('../src/atomic/periodic-table');

/**
 * The periodic table's growth door.
 *
 * codex-ingest renders approved lexicon proposals into
 * src/atomic/periodic-table-additions.js as registerElement({...}) calls, and
 * that file requires the name from periodic-table. It was never defined:
 * the first active proposal would have thrown `registerElement is not a
 * function` at require time. The count had been 0 since generation, so the
 * growth path had never actually grown and nothing noticed.
 *
 * These tests hold the door open, and — more importantly — hold the covenant
 * gate shut behind it. A table that can grow without a gate is not a
 * periodic table, it is a list.
 */

describe('periodic table — the growth door', () => {
  const benevolent = (over = {}) => ({
    charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
    reactivity: 'inert', electronegativity: 0.3, group: 11, period: 1,
    harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    domain: 'utility', ...over,
  });

  it('registerElement exists and is callable', () => {
    // The exact failure the additions file would have hit.
    assert.equal(typeof registerElement, 'function');
  });

  it('admits an element and keys it by its computed signature', () => {
    const table = new PeriodicTable();          // in-memory: no storagePath
    const props = benevolent();
    const el = registerElement({ name: 'growthProbe', source: 'test', ...props }, table);
    assert.ok(!el.rejected, 'a benevolent element must be admitted');
    assert.equal(el.signature, encodeSignature(props));
    assert.equal(table.getElement(el.signature).name, 'growthProbe');
  });

  it('separates identity from the 13 properties', () => {
    const table = new PeriodicTable();
    const el = registerElement({
      name: 'metaSplit', source: 'codex', approvedAt: '2026-08-11T00:00:00Z',
      ...benevolent(),
    }, table);
    assert.equal(el.name, 'metaSplit');
    assert.equal(el.source, 'codex');
    // Identity fields must not leak into the properties that form the signature.
    for (const k of ['name', 'source', 'approvedAt']) {
      assert.equal(el.properties[k], undefined, `${k} leaked into atomic properties`);
    }
  });

  it('defaults the source when the proposal omits it', () => {
    const table = new PeriodicTable();
    const el = registerElement({ name: 'noSource', ...benevolent() }, table);
    assert.equal(el.source, 'codex-ingest');
  });

  it('REJECTS a malevolent element at the covenant gate', () => {
    // The gate is the point. Growth that admits anything is not growth.
    const table = new PeriodicTable();
    const el = registerElement({
      name: 'harmful', source: 'test',
      ...benevolent({ harmPotential: 'severe', alignment: 'harmful', intention: 'malevolent' }),
    }, table);
    assert.equal(el.rejected, true, 'a malevolent element must not enter the table');
    assert.ok(el.violations.length > 0);
    assert.equal(table.getElement(encodeSignature(benevolent({
      harmPotential: 'severe', alignment: 'harmful', intention: 'malevolent',
    }))), null, 'a rejected element must leave no trace in the table');
  });

  it('re-registering the same shape is idempotent, not duplicative', () => {
    const table = new PeriodicTable();
    const props = benevolent({ group: 12 });
    const a = registerElement({ name: 'twiceA', source: 'test', ...props }, table);
    const b = registerElement({ name: 'twiceB', source: 'test', ...props }, table);
    assert.equal(a.signature, b.signature, 'same properties must yield one signature');
    assert.equal(table.size, 1, 'one signature must occupy one slot');
    assert.equal(table.getGroup(12).length, 1, 'and appear once in its group');
  });

  it('the canonical table is the one the CLI reads', () => {
    // Growth has to land where `oracle atomic table` looks, or it is invisible.
    const table = defaultTable();
    assert.ok(table instanceof PeriodicTable);
    assert.equal(table._storagePath,
      path.join(process.cwd(), '.remembrance', 'atomic-table.json'));
    assert.equal(defaultTable(), table, 'the default table must be one instance');
  });

  it('the generated additions file loads', () => {
    // periodic-table-additions.js is machine-written and requires the door.
    // Requiring it is the regression test for the seam that was broken.
    const additions = require('../src/atomic/periodic-table-additions');
    assert.equal(typeof additions.ingested, 'number');
  });
});
