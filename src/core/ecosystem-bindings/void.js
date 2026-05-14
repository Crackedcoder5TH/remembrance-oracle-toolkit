'use strict';

/**
 * Oracle ↔ Void Compressor auto-wire binding.
 *
 * Called by `ecosystem.autoWireAll` when a live Void Compressor is
 * detected in the environment. Flips the Oracle's Bayesian bug prior
 * from local-seed-file mode into substrate-backed mode: cross-domain
 * resonance scoring via POST http://<void-host>:<void-port>/cascade.
 *
 * Specifically:
 *
 *   1. Saves the Void host:port into the shared `modules` storage
 *      namespace so any subsystem can look it up later.
 *   2. Monkey-patches `src/audit/bayesian-prior.scorePrior` to try
 *      the HTTP cascade first, fall back to the local seed file on
 *      any error.
 *   3. Subscribes to `ecosystem.peer.lost` — if the Void Compressor
 *      drops out of the registry, the patch self-uninstalls and the
 *      prior reverts to local-seed mode so the Oracle keeps working.
 *
 * Idempotent: running wire() twice has the same effect as once.
 */

const http = require('http');

let _installed = false;
let _originalScorePrior = null;
let _voidEndpoint = null;

function wire(peer, opts = {}) {
  if (!peer || !peer.live) return;
  const host = peer.live.host || 'localhost';
  const port = peer.live.port;
  if (!port) return;

  _voidEndpoint = { host, port };

  // Persist the endpoint so other commands can read it without
  // re-running discovery.
  try {
    const { getStorage } = require('../storage');
    const storage = getStorage(opts.repoRoot || process.cwd());
    storage.namespace('modules').set('void-endpoint', {
      host, port,
      connectedAt: new Date().toISOString(),
      capabilities: peer.capabilities || [],
    });
  } catch { /* non-fatal */ }

  if (_installed) return;

  // Monkey-patch scorePrior in bayesian-prior so it prefers the
  // substrate-backed cascade path. The local seed file stays as the
  // fallback — if the HTTP call fails we still return something.
  try {
    const prior = require('../../audit/bayesian-prior');
    if (typeof prior.scorePrior !== 'function') return;
    _originalScorePrior = prior.scorePrior;
    prior.scorePrior = function voidBackedScorePrior(source, filePath, options = {}) {
      if (options.skipVoid) return _originalScorePrior(source, filePath, options);
      const remote = trySubstrateCascade(source, filePath, _voidEndpoint);
      if (remote && remote.length > 0) return remote;
      return _originalScorePrior(source, filePath, options);
    };
    _installed = true;
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[binding:void]', e.message);
  }

  // Auto-unwire if the Void drops out of the registry.
  try {
    const { getEventBus } = require('../events');
    const bus = getEventBus();
    bus.on('ecosystem.peer.lost', (p) => {
      if (p?.name === 'void-data-compressor') unwire();
    });
  } catch { /* ignore */ }
}

function unwire() {
  if (!_installed) return;
  try {
    const prior = require('../../audit/bayesian-prior');
    if (_originalScorePrior) prior.scorePrior = _originalScorePrior;
  } catch { /* ignore */ }
  _installed = false;
  _originalScorePrior = null;
  _voidEndpoint = null;
}

/**
 * Synchronous HTTP POST to Void /cascade. We intentionally block
 * because the audit check is itself synchronous — making it async
 * would ripple through every caller. The block is capped at 2s.
 *
 * Returns an array of bayesian-style findings (with `ruleId`,
 * `severity`, `confidence`, etc.) or null on any failure.
 */
function trySubstrateCascade(source, filePath, endpoint) {
  if (!endpoint) return null;
  try {
    const body = JSON.stringify({ text: source.slice(0, 50_000), name: filePath || '' });
    const data = httpPostSync(endpoint.host, endpoint.port, '/cascade', body, 2000);
    if (!data) return null;
    const matches = Array.isArray(data.matches) ? data.matches : [];
    return matches
      .filter(m => Math.abs(m.correlation) >= 0.30)
      .slice(0, 10)
      .map(m => ({
        line: 1,
        column: 1,
        bugClass: 'bayesian',
        ruleId: `bayesian/void-${m.type || 'cascade'}`,
        severity: Math.abs(m.correlation) >= 0.6 ? 'medium' : 'low',
        assumption: `File shape is unrelated to ${m.domain || 'any known domain'}`,
        reality: `Cross-domain cascade match against ${m.domain} at r=${m.correlation.toFixed(3)} (Void substrate)`,
        suggestion: 'Cross-domain match detected. Review the flagged fragment for structural similarity to known patterns in the matched domain.',
        confidence: Math.min(1, Math.abs(m.correlation)),
        source: 'void-substrate',
        evidence: {
          domain: m.domain,
          correlation: m.correlation,
          type: m.type,
        },
      }));
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[binding:void:cascade]', e.message);
    return null;
  }
}

/**
 * Synchronous HTTP POST. We use `curl` because Node's built-in http
 * module is async-only, and we need a blocking call to match the
 * existing sync audit path. Curl is available in every environment
 * the toolkit runs in, and it gives us real timeout control.
 *
 * Returns parsed JSON body or null on any failure.
 */
function httpPostSync(host, port, path, body, timeoutMs) {
  try {
    const { execFileSync } = require('child_process');
    const url = `http://${host}:${port}${path}`;
    const out = execFileSync('curl', [
      '-fsS',
      '--max-time', String(Math.max(1, Math.floor(timeoutMs / 1000))),
      '-H', 'Content-Type: application/json',
      '-H', 'X-API-Key: ' + (process.env.VOID_API_KEY || 'anonymous'),
      '-X', 'POST',
      '--data-binary', body,
      url,
    ], { stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs });
    return JSON.parse(out.toString('utf-8'));
  } catch {
    return null;
  }
}

module.exports = {
  wire,
  unwire,
  _trySubstrateCascade: trySubstrateCascade,
};
