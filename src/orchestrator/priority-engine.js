'use strict';

/**
 * Priority Engine — decides WHERE coherency intervention has the
 * highest impact.
 *
 * Not all low-coherency zones are equal. A zone that:
 *   - Is called by many other zones (high reachability)
 *   - Has a large coherency deficit (far below threshold)
 *   - Is in a critical functional group (meta, compression, search)
 *   - Has high emergence potential (covenant-aligned properties)
 *
 * ...deserves healing BEFORE a zone that is isolated, slightly below
 * threshold, in a non-critical group, with low emergence potential.
 *
 * The priority engine ranks zones by a composite priority score and
 * returns an ordered healing queue. The coherency director processes
 * the queue top-to-bottom.
 */

/**
 * Compute the priority score for a single zone.
 *
 * @param {CoherencyZone} zone
 * @param {object} [context]
 *   - totalZones: total number of zones in the field
 *   - globalCoherency: current global coherency
 *   - atomicProperties: the zone's atomic properties (if available)
 * @returns {number} 0-1, higher = more urgent
 */
function computeZonePriority(zone, context = {}) {
  let priority = 0;
  let dimensions = 0;

  // 1. Coherency deficit (0-1, higher = further below threshold)
  const deficit = Math.max(0, 0.68 - zone.coherency);
  priority += deficit / 0.68; // normalize to 0-1
  dimensions++;

  // 2. Gradient steepness (how fast coherency is falling)
  if (zone.gradient < 0) {
    priority += Math.min(1, Math.abs(zone.gradient) * 5);
    dimensions++;
  }

  // 3. Emergence potential from atomic properties
  if (zone.data && zone.data.atomicProperties) {
    const ep = zone.data.atomicProperties.emergencePotential;
    if (typeof ep === 'number') {
      priority += ep;
      dimensions++;
    }
  }

  // 4. Covenant alignment boost — healing-aligned zones get priority
  if (zone.data && zone.data.atomicProperties) {
    const props = zone.data.atomicProperties;
    if (props.alignment === 'healing') priority += 0.8;
    else if (props.alignment === 'neutral') priority += 0.4;
    if (props.harmPotential === 'none') priority += 0.3;
    if (props.intention === 'benevolent') priority += 0.3;
    dimensions++;
  }

  // 5. Time since last healing (avoid healing the same zone repeatedly)
  if (zone.healingHistory && zone.healingHistory.length > 0) {
    const lastHeal = zone.healingHistory[zone.healingHistory.length - 1];
    const timeSince = Date.now() - (lastHeal.ts ? new Date(lastHeal.ts).getTime() : 0);
    const cooldown = 1 - Math.min(1, timeSince / (60 * 60 * 1000)); // 1 hour cooldown
    priority -= cooldown * 0.3; // Recently healed → lower priority
    dimensions++;
  }

  return dimensions > 0 ? Math.max(0, Math.min(1, priority / dimensions)) : 0;
}

/**
 * Rank all zones in a field by priority and return an ordered
 * healing queue.
 *
 * @param {CoherencyField} field
 * @param {object} [options]
 *   - maxResults: max zones to return (default: 10)
 *   - onlyHealable: only include zones below healing threshold (default: true)
 * @returns {Array<{zone, priority, reason}>}
 */
function rankZones(field, options = {}) {
  const maxResults = options.maxResults || 10;
  const onlyHealable = options.onlyHealable !== false;

  const ranked = [];

  for (const zone of field.zones.values()) {
    if (!zone.lastMeasured) continue;
    if (onlyHealable && !zone.needsHealing) continue;

    const priority = computeZonePriority(zone, {
      totalZones: field.size,
      globalCoherency: field.globalCoherency,
    });

    const reasons = [];
    if (zone.coherency < 0.5) reasons.push('critical coherency deficit');
    else if (zone.coherency < 0.68) reasons.push('below healing threshold');
    if (zone.gradient < -0.1) reasons.push('coherency falling rapidly');
    if (zone.healingHistory.length === 0) reasons.push('never healed');

    ranked.push({
      zoneId: zone.id,
      coherency: Math.round(zone.coherency * 1000) / 1000,
      priority: Math.round(priority * 1000) / 1000,
      reason: reasons.join('; ') || 'general maintenance',
    });
  }

  return ranked
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxResults);
}

/**
 * Compute the optimal healing budget — how many zones to heal in
 * this cycle given the current global coherency and the number of
 * zones needing healing.
 *
 * Higher global coherency → smaller budget (less urgent).
 * More healing targets → larger budget (more work to do).
 *
 * @param {CoherencyField} field
 * @returns {{ budget: number, reason: string }}
 */
function computeHealingBudget(field) {
  const targets = field.findHealingTargets();
  if (targets.length === 0) return { budget: 0, reason: 'No zones need healing' };

  const urgency = 1 - field.globalCoherency; // 0 = perfect, 1 = terrible
  const scale = targets.length;

  // Budget: at least 1, at most 5, scaled by urgency × target count
  const budget = Math.max(1, Math.min(5, Math.ceil(urgency * scale)));

  return {
    budget,
    reason: `${targets.length} zones below threshold, urgency ${(urgency * 100).toFixed(0)}%, healing top ${budget}`,
  };
}

module.exports = {
  computeZonePriority,
  rankZones,
  computeHealingBudget,
};

// ── Atomic self-description (batch-generated) ────────────────────
computeZonePriority.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'orchestration',
};
rankZones.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'orchestration',
};
computeHealingBudget.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'orchestration',
};
