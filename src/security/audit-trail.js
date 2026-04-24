'use strict';

/**
 * Audit trail — covenant-domain elements. Group 11 transform + group 13
 * aggregate. Positive charge (they grow the audit record).
 */

function correlateEvents(events, windowMs = 60000) {
  if (!Array.isArray(events)) return [];
  const byKey = new Map();
  for (const e of events) {
    const key = `${e.type || 'unknown'}:${e.actor || 'anon'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  const clusters = [];
  for (const [key, list] of byKey) {
    list.sort((a, b) => (a.at || 0) - (b.at || 0));
    let cluster = [list[0]];
    for (let i = 1; i < list.length; i++) {
      if ((list[i].at - cluster[cluster.length - 1].at) <= windowMs) cluster.push(list[i]);
      else { clusters.push({ key, count: cluster.length, events: cluster }); cluster = [list[i]]; }
    }
    clusters.push({ key, count: cluster.length, events: cluster });
  }
  return clusters.filter(c => c.count > 1);
}
correlateEvents.atomicProperties = {
  charge: 1, valence: 3, mass: 'heavy', spin: 'even', phase: 'plasma',
  reactivity: 'stable', electronegativity: 0.7, group: 13, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function aggregateMetrics(events, aggregator = 'count') {
  if (!Array.isArray(events)) return {};
  const buckets = {};
  for (const e of events) {
    const k = e.bucket || e.type || 'total';
    if (!buckets[k]) buckets[k] = { count: 0, firstAt: e.at, lastAt: e.at, values: [] };
    buckets[k].count++;
    if (e.at < buckets[k].firstAt) buckets[k].firstAt = e.at;
    if (e.at > buckets[k].lastAt) buckets[k].lastAt = e.at;
    if (typeof e.value === 'number') buckets[k].values.push(e.value);
  }
  for (const k of Object.keys(buckets)) {
    const b = buckets[k];
    if (aggregator === 'sum') b.sum = b.values.reduce((s, v) => s + v, 0);
    else if (aggregator === 'avg') b.avg = b.values.length ? b.values.reduce((s, v) => s + v, 0) / b.values.length : 0;
    delete b.values;
  }
  return buckets;
}
aggregateMetrics.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'stable', electronegativity: 0.6, group: 13, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function scrubStackTrace(error) {
  if (!error) return null;
  const stack = String(error.stack || error.message || error);
  return stack
    .split('\n')
    .map(line => line.replace(/(\/[\w.-]+)+\//g, '.../').replace(/:\d+:\d+/g, ':L:C'))
    .join('\n')
    .slice(0, 2000);
}
scrubStackTrace.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { correlateEvents, aggregateMetrics, scrubStackTrace };
