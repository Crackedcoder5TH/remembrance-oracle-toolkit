'use strict';
const { quiet } = require('../../core/quiet');

/**
 * mcp/handlers/field.js — the Remembrance Field (LRE) MCP surface, one
 * tool dispatched by action. Extracted verbatim from src/mcp/handlers.js
 * in the third monolith decomposition. The 100-line 'audit' case moved to
 * field-audit.js so this organ stays under the size ratchet; everything
 * else is byte-identical modulo require repathing.
 */

const path = require('path');
const { _scanJsZones } = require('./helpers');
const { _fieldAudit } = require('./field-audit');

const FIELD = {

  // ─── field: the Remembrance Field (LRE), one tool dispatched by action ───
  async field(_oracle, args) {
    const action = (args && args.action) || 'state';
    const fc = require('../../core/field-coupling');

    switch (action) {
      // ── recall the field ──
      case 'state': {
        const state = fc.peekField();
        if (!state) return { error: 'field not reachable (LRE module unavailable)' };
        const out = {
          coherence: state.coherence,
          coherenceIntegral: state.coherenceIntegral,
          globalEntropy: state.globalEntropy,
          cascadeFactor: state.cascadeFactor,
          updateCount: state.updateCount,
          timestamp: state.timestamp,
        };
        if (args?.includeSources !== false) {
          out.sources = state.sources || {};
          out.distinctSources = Object.keys(state.sources || {}).length;
        }
        return out;
      }

      // ── participate as a producer ──
      case 'contribute': {
        if (typeof args?.coherence !== 'number') {
          throw new Error('field action "contribute" requires "coherence" (number)');
        }
        if (typeof args?.source !== 'string' || !args.source) {
          throw new Error('field action "contribute" requires "source" (non-empty string)');
        }
        const before = fc.peekField();
        const result = fc.contribute({
          cost: typeof args.cost === 'number' ? args.cost : 1.0,
          coherence: args.coherence,
          source: args.source,
        });
        if (!result) return { error: 'field unreachable; contribution skipped' };
        return {
          newState: {
            coherence: result.coherence,
            coherenceIntegral: result.coherenceIntegral,
            globalEntropy: result.globalEntropy,
            cascadeFactor: result.cascadeFactor,
            updateCount: result.updateCount,
          },
          derived: {
            r_eff: result.r_eff,
            delta_void: result.delta_void,
            p: result.p,
          },
          delta: before ? {
            coherence: result.coherence - before.coherence,
            updateCount: result.updateCount - before.updateCount,
          } : null,
          source: args.source,
        };
      }

      // ── field-driven backpressure ──
      case 'pressure':
        return fc.fieldPressure({
          entropyThreshold: typeof args?.entropyThreshold === 'number' ? args.entropyThreshold : 10,
          cascadeThreshold: typeof args?.cascadeThreshold === 'number' ? args.cascadeThreshold : 4,
        });

      // ── who has been contributing ──
      case 'introspect': {
        const state = fc.peekField();
        if (!state) return { error: 'field not reachable' };
        const sources = state.sources || {};
        const prefix = args?.prefix || '';
        const topN = (typeof args?.topN === 'number') ? args.topN : 25;
        const entries = Object.entries(sources)
          .filter(([k]) => !prefix || k.startsWith(prefix))
          .sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
        const sliced = topN > 0 ? entries.slice(0, topN) : entries;
        return {
          totalDistinctSources: entries.length,
          totalContributions: entries.reduce((sum, [, info]) => sum + (info.count || 0), 0),
          filter: { prefix: prefix || null, topN: topN || 'all' },
          topSources: sliced.map(([source, info]) => ({
            source,
            count: info.count,
            lastCoherence: info.lastCoherence,
            lastTimestamp: info.lastTimestamp,
          })),
        };
      }

      // ── expected source labels vs what's firing ──
      case 'sources-diff': {
        const state = fc.peekField();
        if (!state) return { error: 'field not reachable' };
        const expected = Array.isArray(args?.expected) ? args.expected : [];
        if (expected.length === 0) {
          throw new Error('field action "sources-diff" requires "expected" (non-empty array of source labels)');
        }
        const fired = new Set(Object.keys(state.sources || {}));
        const firing = [];
        const silent = [];
        for (const label of expected) {
          if (fired.has(label)) {
            firing.push({ source: label, count: state.sources[label].count });
          } else {
            silent.push(label);
          }
        }
        return {
          expected: expected.length,
          firing: firing.length,
          silent: silent.length,
          firingDetails: firing,
          silentSources: silent,
        };
      }

      // ── the signal-validity oracle ──
      // Classify a candidate contribution (or batch) against the field's
      // expected input shape without committing. The empirical basis for
      // the variance-signature thresholds is in
      // docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md (H3).
      case 'validate': {
        const hasArray = Array.isArray(args?.coherence);
        const hasNumber = typeof args?.coherence === 'number';
        if (!hasArray && !hasNumber) {
          throw new Error('field action "validate" requires "coherence" (number or number[])');
        }
        const obs = {
          source: args.source || 'mcp:field:validate',
          coherence: args.coherence,
          cost: typeof args.cost === 'number' ? args.cost : 1.0,
        };
        const result = fc.validateContribution(obs, { commit: args.commit === true });
        return {
          accepted: result.accepted,
          shapeClass: result.shapeClass,
          suspect: result.suspect,
          reason: result.reason,
          inputStats: result.inputStats,
          baseline: result.baseline,
          projected: result.projected,
          committed: result.committed,
          source: obs.source,
        };
      }

      // ── the pressure-release signal ──
      // Take a pressure snapshot and detect whether a release event
      // just occurred since the previous snapshot. Cascade saturation
      // dropping sharply (e.g. 4.13 → 1.04 on a single contribution)
      // is the substrate telling you it was holding tension and your
      // contribution released it. Operationally meaningful — this is
      // how the field signals "yes, that was the right shape."
      case 'pressure-release': {
        const snap = fc.pressureSnapshot();
        if (!snap) return { error: 'field not reachable' };
        return {
          cascade: snap.cascade,
          entropy: snap.entropy,
          release: snap.release,
          recentReleases: fc.cascadeReleaseHistory().slice(-10),
        };
      }

      // ── record a cost contribution (entropy side) ──
      // Compute time, money, energy, swarm-run cost — anything that
      // consumed resources. Raises entropy without claiming a coherency
      // benefit. Pair with record-benefit when the cost produced an
      // outcome; the engine auto-balances the two against each other.
      case 'record-cost': {
        if (typeof args?.units !== 'number') {
          throw new Error('field action "record-cost" requires "units" (number)');
        }
        const result = fc.recordCost({
          units: args.units,
          source: args.source,
          kind: args.kind,
        });
        if (!result) return { error: 'field unreachable; cost not recorded' };
        return {
          recorded: true,
          source: args.source || ('cost:' + (args.kind || 'work')),
          newState: {
            coherence: result.coherence,
            globalEntropy: result.globalEntropy,
            cascadeFactor: result.cascadeFactor,
            updateCount: result.updateCount,
          },
        };
      }

      // ── record a benefit contribution (coherency side) ──
      // A verified pattern, a healed file, a passed audit — anything
      // that adds order to the substrate. Raises the coherence integral.
      case 'record-benefit': {
        if (typeof args?.coherence !== 'number') {
          throw new Error('field action "record-benefit" requires "coherence" (number)');
        }
        const result = fc.recordBenefit({
          coherence: args.coherence,
          source: args.source,
          cost: typeof args.cost === 'number' ? args.cost : 1.0,
        });
        if (!result) return { error: 'field unreachable; benefit not recorded' };
        return {
          recorded: true,
          source: args.source || 'benefit:unspecified',
          newState: {
            coherence: result.coherence,
            globalEntropy: result.globalEntropy,
            cascadeFactor: result.cascadeFactor,
            updateCount: result.updateCount,
          },
        };
      }

      // ── record a meta-observation (the substrate measuring itself) ──
      // Aggregate a trajectory of scores, classify it via the dual oracle,
      // contribute the classification back to the field as a structured
      // observation. The recursion gets a permanent fixed point in the
      // histogram. The same pattern emerges every time a session of
      // work is being read by the field — this makes it a normal type
      // of contribution rather than a one-off ritual.
      case 'record-meta-observation': {
        if (!Array.isArray(args?.scores)) {
          throw new Error('field action "record-meta-observation" requires "scores" (number[])');
        }
        const result = fc.recordMetaObservation({
          scores: args.scores,
          source: args.source,
          sessionId: args.sessionId,
        });
        return result;
      }

      // ── the four-outcome consensus histogram (environmental sensor) ──
      // Returns counts and ratios of the four absorption outcomes over a
      // recent window. Watch the ratios drift to read what kind of pressure
      // the substrate is under:
      //   both-accept rising  → healthy growth
      //   A-yes-B-no rising   → adversarial / sophisticated-injection pressure
      //   A-no-B-yes rising   → incoming supply quality degrading
      //   both-reject rising  → noise spike / wrong-substrate pressure
      case 'consensus-histogram': {
        const { consensusHistogram } = require('../../core/covenant-trust');
        return consensusHistogram(typeof args?.windowN === 'number' ? args.windowN : undefined);
      }

      // ── read the goggles cognition buffer ──
      // What is this session's signature so far? Returns the rolling buffer
      // of edit scores plus aggregated stats and shape class.
      case 'cognition-trajectory': {
        return fc.cognitionTrajectory(args?.statePath ? { statePath: args.statePath } : undefined);
      }

      // ── learned shape signatures grouped by source-prefix domain ──
      // Which domains have taught the variance gate what natural shapes look
      // like? Returns { 'void': [...], 'agent': [...], ... }.
      case 'learned-shapes': {
        return { domains: fc.learnedShapesByDomain() };
      }

      // ── direction-of-flow readout (healing / degrading / saturating / etc.) ──
      // Single readout combining (coherence, entropy, cascade) deltas into a
      // human-readable verdict over a recent window of snapshots.
      case 'direction': {
        return fc.fieldDirection(typeof args?.windowN === 'number' ? args.windowN : 5);
      }

      // ── continuous temporal-coherency self-measurement ──
      // Walk a file's git history, compute adjacent-step + long-arc fractal
      // coherency, contribute as temporal:* sources. The same machinery as
      // experiment H1, callable for any file in any ecosystem repo.
      case 'temporal-snapshot': {
        if (!args?.repoDir || !args?.filePath) {
          throw new Error('field action "temporal-snapshot" requires "repoDir" and "filePath"');
        }
        return fc.recordTemporalSnapshot({
          repoDir: args.repoDir,
          filePath: args.filePath,
          maxVersions: typeof args.maxVersions === 'number' ? args.maxVersions : undefined,
        });
      }

      // ── fire the reflex engine (the actor side) ──
      // Run all reflexes once and return their structured verdicts. The
      // substrate stops being a pure observer here — it tightens or
      // restores the variance gate in response to consensusHistogram drift,
      // warns when cognitionTrajectory variance rises, and relaxes the
      // field when direction reports degrading. Each reflex is independent,
      // cooldown-managed, and best-effort: failures return structured
      // {triggered:false} verdicts and never raise.
      case 'reflexes': {
        const { fireReflexes } = require('../../orchestrator/reflex-engine');
        return await fireReflexes(args || {});
      }

      // ── read the current variance-gate mode (set by the reflex engine) ──
      case 'gate-mode': {
        return fc.getVarianceGateMode();
      }

      // ── orchestrator self-introspection ──
      // What can the orchestrator do? The method registry lists every
      // tool with its triggers, effect, cost, reversibility. The
      // 'methods' action returns the catalog; 'respond' returns the
      // tools whose triggers match the live field state — the
      // orchestrator's "given how I feel right now, what should I do?"
      // call.
      case 'methods': {
        const reg = require('../../orchestrator/method-registry');
        if (args?.name) {
          const desc = reg.describeMethod(args.name);
          if (!desc) return { error: 'unknown method', name: args.name, available: reg.listMethods() };
          return desc;
        }
        return { methods: reg.listMethods().map(n => reg.describeMethod(n)) };
      }

      case 'respond': {
        const { selectResponseFor } = require('../../orchestrator/method-registry');
        return selectResponseFor();
      }

      // ── commit the field state to the blockchain ──
      case 'checkpoint': {
        const state = fc.peekField();
        if (!state) return { error: 'field not reachable' };
        // Sibling-clone Publisher load (BLOCKCHAIN is a peer repo)
        const enginePaths = [
          'remembrance-blockchain/src/publisher',
          path.join(__dirname, '..', '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'src', 'publisher'),
        ];
        let Publisher = null;
        for (const p of enginePaths) {
          try { ({ Publisher } = require(p)); break; } catch (_) { quiet('mcp:handlers:field:require', _); /* try next */ }
        }
        if (!Publisher) {
          return {
            error: 'REMEMBRANCE-BLOCKCHAIN Publisher not reachable',
            hint: 'Ensure REMEMBRANCE-BLOCKCHAIN is cloned alongside this repo, or configured via env',
          };
        }
        const publisher = new Publisher({ oracleRoot: path.join(__dirname, '..', '..', '..') });
        const checkpointInput = {
          coherence: state.coherence,
          coherenceIntegral: state.coherenceIntegral,
          globalEntropy: state.globalEntropy,
          cascadeFactor: state.cascadeFactor,
          updateCount: state.updateCount,
        };
        if (args?.includeSources) checkpointInput.sources = state.sources;
        return await publisher.publishFieldCheckpoint(checkpointInput);
      }

      // ── coherence-gated ecosystem audit; cost balanced into the field ──
      // (the 100-line case body lives in field-audit.js — same organ family)
      case 'audit':
        return _fieldAudit(fc, args);

      // ── the orchestrator's authoritative ruling — the final voice on
      //    how coherency should flow and what should be fixed next ──
      case 'direct': {
        const { CoherencyDirector } = require('../../orchestrator/coherency-director');
        const scanDir = (typeof args?.dir === 'string' && args.dir) ? args.dir : 'src';
        const items = _scanJsZones(scanDir);

        if (items && items.length) {
          const ruling = new CoherencyDirector().ruling(items);
          const pressure = fc.fieldPressure();
          return {
            authority: 'coherency-orchestrator',
            ruling,
            field: { backpressure: pressure.hot ? `hot — ${pressure.reason}` : 'nominal' },
          };
        }
        return { error: `field action "direct": no .js zones found under "${scanDir}"` };
      }

      // ── offload a unit of work to the shared queue; coherency-judged ──
      case 'offload': {
        const kind = (typeof args?.kind === 'string' && args.kind) ? args.kind : null;
        if (!kind) throw new Error('field action "offload" requires "kind" (string)');
        const wq = require('../../core/field-workqueue');
        return await wq.offload(kind, args?.payload, {
          timeoutMs: typeof args?.timeoutMs === 'number' ? args.timeoutMs : undefined,
        });
      }

      // ── throttle-up entropy relaxation when the field is hot ──
      case 'relax': {
        const { relaxIfHot } = require('../../orchestrator/entropy-relaxer');
        return await relaxIfHot({
          entropyThreshold: args?.entropyThreshold,
          cascadeThreshold: args?.cascadeThreshold,
          cooldownMs: args?.cooldownMs,
          topK: args?.topK,
          timeoutMs: args?.timeoutMs,
        });
      }

      default:
        throw new Error(`Unknown field action: "${action}". Use: state, contribute, pressure, introspect, sources-diff, checkpoint, audit, direct, offload, relax.`);
    }
  },
};

module.exports = { FIELD };
