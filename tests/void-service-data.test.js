/**
 * The container rule at the field's door (void-service dataSeriesOf):
 * a record's data is found exactly the way Void scripts/read-signal.py
 * finds it in a JSON value — numeric arrays of >= 8 finite, non-constant
 * values are series; arrays of records yield their numeric columns;
 * text, short arrays, constants and non-finite values carry no data.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dataSeriesOf } = require('../src/core/void-service');

const ramp = (n, k = 1) => Array.from({ length: n }, (_, i) => i * k + 0.5);

test('a God’s Eye View layer snapshot yields one series per numeric field', () => {
  const snapshot = JSON.stringify({
    layer: 'earthquakes', at: '2026-10-01T00:00:00Z', count: 12,
    series: { latitude: ramp(12, 1.5), longitude: ramp(12, -2), magnitude: ramp(12, 0.1) },
  });
  const names = dataSeriesOf(snapshot).map(([n]) => n);
  assert.deepStrictEqual(names, ['$.series.latitude', '$.series.longitude', '$.series.magnitude']);
});

test('an array of records yields its numeric columns', () => {
  const recs = JSON.stringify(ramp(9).map((v, i) => ({ id: 'e' + i, depthKm: v * 3, label: 'x' })));
  const found = dataSeriesOf(recs);
  assert.ok(found.some(([n, s]) => n === '$[*].depthKm' && s.length === 9));
  assert.ok(!found.some(([n]) => n.endsWith('.label')));
});

test('text, short series, constants and non-finite values carry no data', () => {
  assert.deepStrictEqual(dataSeriesOf('plain prose, not a container'), []);
  assert.deepStrictEqual(dataSeriesOf(JSON.stringify({ s: ramp(7) })), []);
  assert.deepStrictEqual(dataSeriesOf(JSON.stringify({ s: Array(20).fill(3) })), []);
  assert.deepStrictEqual(dataSeriesOf('{"s":[1,2,3,4,5,6,7,"8"]}'), []);
  assert.deepStrictEqual(dataSeriesOf('{not json'), []);
});

test('a single birth record (scalars only) carries no series', () => {
  const birth = JSON.stringify({ layer: 'earthquakes', latitude: 10.5, longitude: 20.25, properties: { magnitude: 5.0 } });
  assert.deepStrictEqual(dataSeriesOf(birth), []);
});
