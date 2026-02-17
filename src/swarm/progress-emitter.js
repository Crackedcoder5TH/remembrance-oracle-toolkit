'use strict';

const { EventEmitter } = require('events');

/**
 * Swarm Progress Emitter
 *
 * Emits real-time events as the swarm pipeline progresses.
 * Consumers (CLI, WebSocket dashboard, MCP) subscribe to events.
 *
 * Oracle lineage: PULL from pipe (0.970) for composition,
 *   typed-event-emitter-ts (0.960) for event pattern,
 *   websocket (0.900) for dashboard integration.
 *
 * Events emitted:
 *   swarm:start        — Pipeline begins
 *   swarm:step:start   — Step N begins (name, index)
 *   swarm:step:end     — Step N ends (name, status, durationMs)
 *   swarm:agent:send   — Agent prompt dispatched
 *   swarm:agent:done   — Agent response received
 *   swarm:agent:error  — Agent error occurred
 *   swarm:scoring      — Scoring in progress (agent, score)
 *   swarm:consensus    — Consensus reached (winner, agreement)
 *   swarm:escalation   — Escalation triggered (mode, attempt)
 *   swarm:complete     — Pipeline finished (result summary)
 */

class SwarmProgressEmitter extends EventEmitter {
  constructor() {
    super();
    this._startTime = null;
    this._stepIndex = 0;
  }

  /**
   * Emit pipeline start event.
   * @param {object} info - { id, task, agentCount }
   */
  start(info) {
    this._startTime = Date.now();
    this._stepIndex = 0;
    this.emit('swarm:start', {
      type: 'swarm:start',
      timestamp: new Date().toISOString(),
      ...info,
    });
  }

  /**
   * Emit step start event.
   * @param {string} name - Step name (configure, assemble, dispatch, etc.)
   */
  stepStart(name) {
    this._stepIndex++;
    this.emit('swarm:step:start', {
      type: 'swarm:step:start',
      timestamp: new Date().toISOString(),
      step: name,
      index: this._stepIndex,
    });
  }

  /**
   * Emit step end event.
   * @param {string} name - Step name
   * @param {string} status - 'ok' or 'error'
   * @param {number} durationMs - Duration in milliseconds
   * @param {object} [meta] - Additional step metadata
   */
  stepEnd(name, status, durationMs, meta = {}) {
    this.emit('swarm:step:end', {
      type: 'swarm:step:end',
      timestamp: new Date().toISOString(),
      step: name,
      status,
      durationMs,
      ...meta,
    });
  }

  /**
   * Emit agent dispatch event.
   * @param {string} agent - Agent name
   * @param {string[]} dimensions - Assigned dimensions
   */
  agentSend(agent, dimensions) {
    this.emit('swarm:agent:send', {
      type: 'swarm:agent:send',
      timestamp: new Date().toISOString(),
      agent,
      dimensions,
    });
  }

  /**
   * Emit agent response event.
   * @param {string} agent - Agent name
   * @param {number} durationMs - Response time
   * @param {boolean} hasCode - Whether response contains code
   */
  agentDone(agent, durationMs, hasCode) {
    this.emit('swarm:agent:done', {
      type: 'swarm:agent:done',
      timestamp: new Date().toISOString(),
      agent,
      durationMs,
      hasCode,
    });
  }

  /**
   * Emit agent error event.
   * @param {string} agent - Agent name
   * @param {string} error - Error message
   * @param {string} [errorClass] - From classifyError()
   */
  agentError(agent, error, errorClass) {
    this.emit('swarm:agent:error', {
      type: 'swarm:agent:error',
      timestamp: new Date().toISOString(),
      agent,
      error,
      errorClass,
    });
  }

  /**
   * Emit scoring progress event.
   * @param {string} agent - Agent being scored
   * @param {number} score - Coherency score
   * @param {string} [phase] - 'coherency' or 'peer'
   */
  scoring(agent, score, phase = 'coherency') {
    this.emit('swarm:scoring', {
      type: 'swarm:scoring',
      timestamp: new Date().toISOString(),
      agent,
      score,
      phase,
    });
  }

  /**
   * Emit consensus event.
   * @param {object} info - { winner, winnerScore, agreement, agentCount }
   */
  consensus(info) {
    this.emit('swarm:consensus', {
      type: 'swarm:consensus',
      timestamp: new Date().toISOString(),
      ...info,
    });
  }

  /**
   * Emit escalation event.
   * @param {object} info - { mode, attempt, reason }
   */
  escalation(info) {
    this.emit('swarm:escalation', {
      type: 'swarm:escalation',
      timestamp: new Date().toISOString(),
      ...info,
    });
  }

  /**
   * Emit pipeline complete event.
   * @param {object} summary - { id, winner, score, agreement, durationMs }
   */
  complete(summary) {
    this.emit('swarm:complete', {
      type: 'swarm:complete',
      timestamp: new Date().toISOString(),
      totalDurationMs: this._startTime ? Date.now() - this._startTime : 0,
      ...summary,
    });
  }
}

/**
 * Create a progress emitter that also broadcasts to a WebSocket server.
 * Bridges the swarm emitter to the existing dashboard WebSocket system.
 *
 * @param {object} [wsServer] - WebSocket server with broadcast(data) method
 * @returns {SwarmProgressEmitter}
 */
function createSwarmEmitter(wsServer) {
  const emitter = new SwarmProgressEmitter();

  if (wsServer && typeof wsServer.broadcast === 'function') {
    // Forward all swarm events to WebSocket clients
    const events = [
      'swarm:start', 'swarm:step:start', 'swarm:step:end',
      'swarm:agent:send', 'swarm:agent:done', 'swarm:agent:error',
      'swarm:scoring', 'swarm:consensus', 'swarm:escalation', 'swarm:complete',
    ];
    for (const event of events) {
      emitter.on(event, (data) => {
        wsServer.broadcast(data);
      });
    }
  }

  return emitter;
}

/**
 * Create a simple CLI progress reporter that prints step updates.
 *
 * @param {SwarmProgressEmitter} emitter - Swarm emitter to listen to
 * @param {object} [options] - { quiet: boolean }
 * @returns {SwarmProgressEmitter} Same emitter (for chaining)
 */
function attachCliReporter(emitter, options = {}) {
  if (options.quiet) return emitter;

  emitter.on('swarm:start', (data) => {
    process.stdout.write(`[swarm] Starting: ${(data.task || '').slice(0, 60)}...\n`);
  });

  emitter.on('swarm:step:start', (data) => {
    process.stdout.write(`[swarm] Step ${data.index}: ${data.step}...\n`);
  });

  emitter.on('swarm:agent:done', (data) => {
    const icon = data.hasCode ? '+' : '-';
    process.stdout.write(`[swarm]   [${icon}] ${data.agent} responded (${data.durationMs}ms)\n`);
  });

  emitter.on('swarm:agent:error', (data) => {
    process.stdout.write(`[swarm]   [!] ${data.agent} failed: ${data.error}\n`);
  });

  emitter.on('swarm:scoring', (data) => {
    process.stdout.write(`[swarm]   Scoring ${data.agent}: ${data.score.toFixed(3)} (${data.phase})\n`);
  });

  emitter.on('swarm:consensus', (data) => {
    process.stdout.write(`[swarm] Consensus: ${data.winner} (${data.winnerScore?.toFixed(3)}) — ${(data.agreement * 100).toFixed(0)}% agreement\n`);
  });

  emitter.on('swarm:escalation', (data) => {
    process.stdout.write(`[swarm] Escalating: ${data.mode} (attempt ${data.attempt}) — ${data.reason}\n`);
  });

  emitter.on('swarm:complete', (data) => {
    process.stdout.write(`[swarm] Complete in ${data.totalDurationMs}ms\n`);
  });

  return emitter;
}

module.exports = {
  SwarmProgressEmitter,
  createSwarmEmitter,
  attachCliReporter,
};
