'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, quietFailures, resetQuiet } = require('../src/core/quiet');

describe('quiet — best-effort failures become measurements', () => {
  it('counts per site and never throws', () => {
    resetQuiet();
    try { JSON.parse('x'); } catch (e) { quiet('t:parse', e); }
    try { JSON.parse('y'); } catch (e) { quiet('t:parse', e); }
    try { null.z; } catch (e) { quiet('t:deref', e); }
    const tally = quietFailures();
    assert.equal(tally['t:parse'], 2);
    assert.equal(tally['t:deref'], 1);
  });

  it('is robust to edge inputs (recording a failure must not become one)', () => {
    resetQuiet();
    assert.doesNotThrow(() => { quiet(); quiet(null, { message: 'x' }); quiet('s'); quiet('s', undefined); });
    assert.equal(quietFailures()['s'], 2);
    assert.equal(quietFailures()['unlabelled'], 2);
  });

  it('resetQuiet clears the tally', () => {
    quiet('t:x');
    resetQuiet();
    assert.deepEqual(quietFailures(), {});
  });
});
