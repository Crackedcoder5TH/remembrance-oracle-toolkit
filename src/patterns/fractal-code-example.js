'use strict';

/**
 * Self-Similar Fractal Code — A Working Example
 *
 * The SAME pattern repeats at every scale:
 *
 *   Scale 1 (Function):  receive → validate → transform → emit
 *   Scale 2 (Module):    receive → validate → transform → emit
 *   Scale 3 (Service):   receive → validate → transform → emit
 *   Scale 4 (System):    receive → validate → transform → emit
 *
 * This is not a metaphor — it's actual code that works.
 * Every level has the same shape: { receive, validate, transform, emit }
 *
 * Why this matters:
 *   - You learn ONE pattern, you understand the ENTIRE system
 *   - Any level can be tested the same way
 *   - Any level can be replaced without affecting others
 *   - Debugging at any scale uses the same mental model
 *   - New developers understand everything after seeing one layer
 */

// ═══════════════════════════════════════════════════════════════════
// THE FRACTAL UNIT: This shape repeats at EVERY scale
// ═══════════════════════════════════════════════════════════════════
//
//   ┌─────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐
//   │ RECEIVE │ ──→ │ VALIDATE │ ──→ │ TRANSFORM │ ──→ │  EMIT   │
//   └─────────┘     └──────────┘     └───────────┘     └─────────┘
//
// ═══════════════════════════════════════════════════════════════════


// ─── Scale 1: FUNCTION level ─────────────────────────────────────
// A single function that receives, validates, transforms, and emits.

function processValue(input) {
  // Receive
  const received = input;

  // Validate
  if (received === null || received === undefined) {
    return { ok: false, error: 'Invalid input', data: null };
  }

  // Transform
  const transformed = typeof received === 'string'
    ? received.trim().toLowerCase()
    : String(received);

  // Emit
  return { ok: true, error: null, data: transformed };
}


// ─── Scale 2: MODULE level ───────────────────────────────────────
// A module that receives requests, validates them, transforms data,
// and emits results. SAME SHAPE as the function above.

class DataProcessor {
  constructor(config = {}) {
    this._validators = config.validators || [];
    this._transformers = config.transformers || [];
    this._emitters = config.emitters || [];
  }

  // Receive
  receive(input) {
    return { source: 'module', timestamp: Date.now(), payload: input };
  }

  // Validate
  validate(received) {
    for (const validator of this._validators) {
      const result = validator(received.payload);
      if (!result.ok) return { ok: false, error: result.error, data: null };
    }
    return { ok: true, error: null, data: received };
  }

  // Transform
  transform(validated) {
    let data = validated.data.payload;
    for (const transformer of this._transformers) {
      data = transformer(data);
    }
    return { ok: true, error: null, data };
  }

  // Emit
  emit(transformed) {
    for (const emitter of this._emitters) {
      emitter(transformed.data);
    }
    return transformed;
  }

  // The fractal pipeline — same at every scale
  process(input) {
    const received = this.receive(input);
    const validated = this.validate(received);
    if (!validated.ok) return validated;
    const transformed = this.transform(validated);
    if (!transformed.ok) return transformed;
    return this.emit(transformed);
  }
}


// ─── Scale 3: SERVICE level ──────────────────────────────────────
// A service that receives HTTP requests, validates them, transforms
// via business logic, and emits responses. SAME SHAPE.

class ServicePipeline {
  constructor(modules = {}) {
    this._modules = modules;
  }

  // Receive — from HTTP/WebSocket/MCP
  receive(request) {
    return {
      source: 'service',
      timestamp: Date.now(),
      method: request.method || 'unknown',
      path: request.path || '/',
      payload: request.body || null,
      headers: request.headers || {},
    };
  }

  // Validate — auth, rate limiting, schema
  validate(received) {
    // Auth check
    if (received.headers.authorization === undefined && received.path !== '/health') {
      return { ok: false, error: 'Unauthorized', status: 401, data: null };
    }

    // Rate limit check
    if (this._modules.rateLimiter) {
      const ip = received.headers['x-forwarded-for'] || 'unknown';
      if (!this._modules.rateLimiter.isAllowed(ip)) {
        return { ok: false, error: 'Rate limited', status: 429, data: null };
      }
    }

    // Schema validation
    if (this._modules.validator && received.payload) {
      const result = this._modules.validator.validate(received.payload);
      if (!result.ok) {
        return { ok: false, error: result.error, status: 400, data: null };
      }
    }

    return { ok: true, error: null, data: received };
  }

  // Transform — business logic (delegates to a DataProcessor — fractal!)
  transform(validated) {
    const processor = this._modules.processor;
    if (processor) {
      return processor.process(validated.data.payload);
    }
    return { ok: true, error: null, data: validated.data.payload };
  }

  // Emit — send response, log, notify
  emit(transformed) {
    if (this._modules.logger) {
      this._modules.logger.info('Response', { data: transformed.data });
    }
    if (this._modules.notifier) {
      this._modules.notifier.send(transformed.data);
    }
    return { ok: true, status: 200, data: transformed.data };
  }

  // The fractal pipeline — identical shape to module and function level
  handle(request) {
    const received = this.receive(request);
    const validated = this.validate(received);
    if (!validated.ok) return validated;
    const transformed = this.transform(validated);
    if (!transformed.ok) return transformed;
    return this.emit(transformed);
  }
}


// ─── Scale 4: SYSTEM level ───────────────────────────────────────
// The entire system receives events from the outside world,
// validates them, transforms via services, and emits results.
// SAME SHAPE — it's turtles all the way down.

class SystemOrchestrator {
  constructor(services = {}) {
    this._services = services;
  }

  // Receive — from external world (webhook, cron, user action)
  receive(event) {
    return {
      source: 'system',
      timestamp: Date.now(),
      type: event.type || 'unknown',
      payload: event.payload || null,
      metadata: event.metadata || {},
    };
  }

  // Validate — system-level checks (circuit breaker, quota, health)
  validate(received) {
    // Circuit breaker
    if (this._services.circuitBreaker) {
      const state = this._services.circuitBreaker.state;
      if (state === 'open') {
        return { ok: false, error: 'System circuit open', data: null };
      }
    }

    // Health check
    if (this._services.healthCheck) {
      const health = this._services.healthCheck();
      if (!health.healthy) {
        return { ok: false, error: 'System unhealthy: ' + health.reason, data: null };
      }
    }

    return { ok: true, error: null, data: received };
  }

  // Transform — route to the right service (which uses SAME pattern internally)
  transform(validated) {
    const event = validated.data;
    const service = this._services[event.type];

    if (!service) {
      return { ok: false, error: 'No service for event type: ' + event.type, data: null };
    }

    // The service.handle() call is ITSELF a receive→validate→transform→emit pipeline
    return service.handle({
      method: 'POST',
      path: '/' + event.type,
      body: event.payload,
      headers: { ...event.metadata, authorization: 'system' },
    });
  }

  // Emit — system-level output (metrics, audit trail, external notification)
  emit(transformed) {
    if (this._services.metrics) {
      this._services.metrics.record('system.processed', 1);
    }
    if (this._services.auditLog) {
      this._services.auditLog.append({
        timestamp: Date.now(),
        result: transformed.ok ? 'success' : 'failure',
        data: transformed.data,
      });
    }
    return transformed;
  }

  // The fractal pipeline — SAME SHAPE at system level
  orchestrate(event) {
    const received = this.receive(event);
    const validated = this.validate(received);
    if (!validated.ok) return validated;
    const transformed = this.transform(validated);
    if (!transformed.ok) return transformed;
    return this.emit(transformed);
  }
}


// ═══════════════════════════════════════════════════════════════════
// PROOF: Wire it all together — fractals composing fractals
// ═══════════════════════════════════════════════════════════════════

function buildFractalSystem() {
  // Scale 1: Functions as validators/transformers
  const validators = [
    (input) => input ? { ok: true } : { ok: false, error: 'Empty input' },
  ];
  const transformers = [
    (data) => typeof data === 'string' ? data.trim() : data,
    (data) => typeof data === 'string' ? data.toLowerCase() : data,
  ];

  // Scale 2: Module (uses Scale 1 functions)
  const processor = new DataProcessor({
    validators,
    transformers,
    emitters: [],
  });

  // Scale 3: Service (uses Scale 2 module)
  const service = new ServicePipeline({
    processor,
    rateLimiter: null,
    validator: null,
    logger: null,
  });

  // Scale 4: System (uses Scale 3 services)
  const system = new SystemOrchestrator({
    data: service,           // "data" events route to the data service
    circuitBreaker: null,
    healthCheck: () => ({ healthy: true }),
    metrics: null,
    auditLog: null,
  });

  return system;
}


// ═══════════════════════════════════════════════════════════════════
// TEST: Prove it works at every scale
// ═══════════════════════════════════════════════════════════════════

function selfTest() {
  const results = [];

  // Test Scale 1: Function
  const r1 = processValue('  HELLO  ');
  results.push({ scale: 'function', ok: r1.ok, data: r1.data, expected: 'hello' });

  // Test Scale 2: Module
  const processor = new DataProcessor({
    validators: [(v) => v ? { ok: true } : { ok: false, error: 'empty' }],
    transformers: [(d) => typeof d === 'string' ? d.toUpperCase() : d],
    emitters: [],
  });
  const r2 = processor.process('test');
  results.push({ scale: 'module', ok: r2.ok, data: r2.data, expected: 'TEST' });

  // Test Scale 3: Service
  const service = new ServicePipeline({ processor });
  const r3 = service.handle({ method: 'POST', path: '/process', body: 'hello', headers: { authorization: 'Bearer x' } });
  results.push({ scale: 'service', ok: r3.ok, data: r3.data, expected: 'HELLO' });

  // Test Scale 4: System
  const system = buildFractalSystem();
  const r4 = system.orchestrate({ type: 'data', payload: '  World  ' });
  results.push({ scale: 'system', ok: r4.ok, data: r4.data, expected: 'world' });

  return results;
}


module.exports = {
  processValue,
  DataProcessor,
  ServicePipeline,
  SystemOrchestrator,
  buildFractalSystem,
  selfTest,
};
