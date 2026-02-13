const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const {
  StripeClient,
  BillingManager,
  billingMiddleware,
  billingRoutes,
  PLANS,
} = require('../src/billing/stripe');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

// ─── Helpers ───

/**
 * Create a fresh in-memory SQLite database for testing.
 * Returns null if DatabaseSync is unavailable.
 */
function createTestDb() {
  if (!DatabaseSync) return null;
  return new DatabaseSync(':memory:');
}

/**
 * Build a valid Stripe webhook signature for a given payload and secret.
 * Mirrors the HMAC-SHA256 scheme that StripeClient.constructEvent expects.
 */
function signPayload(payload, secret, timestamp) {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return { header: `t=${ts},v1=${sig}`, timestamp: ts };
}

/**
 * Create a mock StripeClient that returns canned responses
 * instead of making real HTTPS requests to Stripe.
 */
function createMockStripe() {
  const client = new StripeClient({ secretKey: 'sk_test_mock_key_for_testing' });

  // Override the real _request to never hit the network
  client._request = async (method, path, params) => {
    if (path === '/v1/customers' && method === 'POST') {
      return { id: 'cus_mock_123', object: 'customer', email: params && params.email };
    }
    if (path.startsWith('/v1/customers/') && method === 'GET') {
      return { id: path.split('/').pop(), object: 'customer' };
    }
    if (path === '/v1/checkout/sessions' && method === 'POST') {
      return { id: 'cs_mock_session_1', url: 'https://checkout.stripe.com/mock' };
    }
    if (path === '/v1/billing_portal/sessions' && method === 'POST') {
      return { url: 'https://billing.stripe.com/portal/mock' };
    }
    if (path.startsWith('/v1/subscriptions/') && method === 'GET') {
      return {
        id: path.split('/').pop(),
        status: 'active',
        current_period_start: 1700000000,
        current_period_end: 1702600000,
        cancel_at_period_end: false,
      };
    }
    if (path === '/v1/subscriptions' && method === 'GET') {
      return { data: [] };
    }
    return {};
  };

  return client;
}

/**
 * Insert a billing record directly into the database for test setup.
 */
function insertBillingRecord(db, { userId, stripeCustomerId, plan, status, subscriptionId }) {
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO billing (id, user_id, stripe_customer_id, plan, status, subscription_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, stripeCustomerId || null, plan || 'FREE', status || 'active', subscriptionId || null, now, now);
}

function mockReq(headers = {}, opts = {}) {
  const req = new EventEmitter();
  req.headers = headers;
  req.url = opts.url || '/api/test';
  if (opts.user) req.user = opts.user;
  return req;
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, hdrs) {
      res.statusCode = code;
      if (hdrs) Object.assign(res.headers, hdrs);
    },
    setHeader(k, v) { res.headers[k] = v; },
    end(body) { res.body = body || ''; },
  };
  return res;
}

// ─── PLANS Constant ───

describe('PLANS', () => {
  it('has exactly three tiers: FREE, PRO, TEAM', () => {
    const keys = Object.keys(PLANS);
    assert.deepStrictEqual(keys.sort(), ['FREE', 'PRO', 'TEAM']);
  });

  it('each plan has required fields: name, priceId, patterns, members, features', () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      assert.ok(typeof plan.name === 'string', `${key}.name should be a string`);
      assert.ok('priceId' in plan, `${key} should have priceId`);
      assert.ok(typeof plan.patterns === 'number', `${key}.patterns should be a number`);
      assert.ok(typeof plan.members === 'number', `${key}.members should be a number`);
      assert.ok(Array.isArray(plan.features), `${key}.features should be an array`);
    }
  });

  it('FREE plan has no priceId', () => {
    assert.equal(PLANS.FREE.priceId, null);
  });

  it('FREE plan allows 50 patterns and 1 member', () => {
    assert.equal(PLANS.FREE.patterns, 50);
    assert.equal(PLANS.FREE.members, 1);
  });

  it('PRO plan has a priceId and allows 5000 patterns', () => {
    assert.ok(PLANS.PRO.priceId, 'PRO should have a priceId');
    assert.equal(PLANS.PRO.patterns, 5000);
    assert.equal(PLANS.PRO.members, 10);
  });

  it('TEAM plan has unlimited patterns and members (-1)', () => {
    assert.equal(PLANS.TEAM.patterns, -1);
    assert.equal(PLANS.TEAM.members, -1);
  });

  it('TEAM plan includes all features including sso and hosted-hub', () => {
    assert.ok(PLANS.TEAM.features.includes('sso'));
    assert.ok(PLANS.TEAM.features.includes('hosted-hub'));
    assert.ok(PLANS.TEAM.features.includes('priority-support'));
  });

  it('plans are frozen (immutable)', () => {
    assert.ok(Object.isFrozen(PLANS));
    assert.ok(Object.isFrozen(PLANS.FREE));
    assert.ok(Object.isFrozen(PLANS.PRO));
    assert.ok(Object.isFrozen(PLANS.TEAM));
  });
});

// ─── StripeClient ───

describe('StripeClient', () => {
  it('constructor reads secretKey from options', () => {
    const client = new StripeClient({ secretKey: 'sk_test_abc123' });
    assert.equal(client.secretKey, 'sk_test_abc123');
  });

  it('constructor reads apiVersion from options', () => {
    const client = new StripeClient({ secretKey: 'sk_test_abc', apiVersion: '2025-01-01' });
    assert.equal(client.apiVersion, '2025-01-01');
  });

  it('constructor throws when no secret key is provided', () => {
    const original = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      assert.throws(
        () => new StripeClient({ secretKey: '' }),
        (err) => err.message.includes('Stripe secret key is required')
      );
    } finally {
      if (original !== undefined) process.env.STRIPE_SECRET_KEY = original;
    }
  });

  it('constructor falls back to STRIPE_SECRET_KEY env var', () => {
    const original = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_from_env';
    try {
      const client = new StripeClient();
      assert.equal(client.secretKey, 'sk_test_from_env');
    } finally {
      if (original !== undefined) {
        process.env.STRIPE_SECRET_KEY = original;
      } else {
        delete process.env.STRIPE_SECRET_KEY;
      }
    }
  });

  describe('constructEvent', () => {
    const webhookSecret = 'whsec_test_secret_for_verification';
    let client;

    beforeEach(() => {
      client = new StripeClient({ secretKey: 'sk_test_mock' });
    });

    it('verifies a valid signature and returns parsed event', () => {
      const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed', data: {} });
      const { header } = signPayload(payload, webhookSecret);

      const event = client.constructEvent(payload, header, webhookSecret);
      assert.equal(event.id, 'evt_123');
      assert.equal(event.type, 'checkout.session.completed');
    });

    it('accepts Buffer payloads', () => {
      const payloadStr = JSON.stringify({ id: 'evt_buf', type: 'test', data: {} });
      const payloadBuf = Buffer.from(payloadStr, 'utf8');
      const { header } = signPayload(payloadStr, webhookSecret);

      const event = client.constructEvent(payloadBuf, header, webhookSecret);
      assert.equal(event.id, 'evt_buf');
    });

    it('rejects an invalid signature', () => {
      const payload = JSON.stringify({ id: 'evt_bad', type: 'test', data: {} });
      const ts = Math.floor(Date.now() / 1000);
      const fakeHeader = `t=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`;

      assert.throws(
        () => client.constructEvent(payload, fakeHeader, webhookSecret),
        (err) => err.message.includes('signature verification failed')
      );
    });

    it('rejects when no v1 signatures are present', () => {
      const payload = JSON.stringify({ id: 'evt_nosig', type: 'test' });
      const ts = Math.floor(Date.now() / 1000);
      const header = `t=${ts}`;

      assert.throws(
        () => client.constructEvent(payload, header, webhookSecret),
        (err) => err.message.includes('No v1 signatures found')
      );
    });

    it('rejects an expired timestamp beyond tolerance', () => {
      const payload = JSON.stringify({ id: 'evt_old', type: 'test', data: {} });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const { header } = signPayload(payload, webhookSecret, oldTimestamp);

      assert.throws(
        () => client.constructEvent(payload, header, webhookSecret, 300),
        (err) => err.message.includes('outside tolerance')
      );
    });

    it('accepts a timestamp within custom tolerance', () => {
      const payload = JSON.stringify({ id: 'evt_recent', type: 'test', data: {} });
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const { header } = signPayload(payload, webhookSecret, recentTimestamp);

      const event = client.constructEvent(payload, header, webhookSecret, 300);
      assert.equal(event.id, 'evt_recent');
    });

    it('bypasses timestamp check when tolerance is 0', () => {
      const payload = JSON.stringify({ id: 'evt_notol', type: 'test', data: {} });
      const ancientTimestamp = 1000000; // way in the past
      const { header } = signPayload(payload, webhookSecret, ancientTimestamp);

      const event = client.constructEvent(payload, header, webhookSecret, 0);
      assert.equal(event.id, 'evt_notol');
    });

    it('throws on missing payload', () => {
      assert.throws(
        () => client.constructEvent(null, 'sig', webhookSecret),
        (err) => err.message.includes('payload is required')
      );
    });

    it('throws on missing signature header', () => {
      assert.throws(
        () => client.constructEvent('{}', null, webhookSecret),
        (err) => err.message.includes('signature header is required')
      );
    });

    it('throws on missing webhook secret', () => {
      assert.throws(
        () => client.constructEvent('{}', 'sig', null),
        (err) => err.message.includes('signing secret is required')
      );
    });
  });

  describe('_encodeParams', () => {
    let client;

    beforeEach(() => {
      client = new StripeClient({ secretKey: 'sk_test_mock' });
    });

    it('encodes simple key-value pairs', () => {
      const result = client._encodeParams({ email: 'test@example.com', name: 'Alice' });
      assert.ok(result.includes('email=test%40example.com'));
      assert.ok(result.includes('name=Alice'));
    });

    it('encodes nested objects with bracket notation', () => {
      const result = client._encodeParams({ metadata: { user_id: '42', plan: 'pro' } });
      assert.ok(result.includes('metadata%5Buser_id%5D=42'));
      assert.ok(result.includes('metadata%5Bplan%5D=pro'));
    });

    it('encodes arrays with indexed bracket notation', () => {
      const result = client._encodeParams({ items: ['a', 'b', 'c'] });
      assert.ok(result.includes('items%5B0%5D=a'));
      assert.ok(result.includes('items%5B1%5D=b'));
      assert.ok(result.includes('items%5B2%5D=c'));
    });

    it('skips null and undefined values', () => {
      const result = client._encodeParams({ a: 'yes', b: null, c: undefined, d: 'ok' });
      assert.ok(result.includes('a=yes'));
      assert.ok(result.includes('d=ok'));
      assert.ok(!result.includes('b='));
      assert.ok(!result.includes('c='));
    });

    it('encodes deeply nested objects', () => {
      const result = client._encodeParams({ outer: { inner: { deep: 'value' } } });
      assert.ok(result.includes('outer%5Binner%5D%5Bdeep%5D=value'));
    });

    it('returns empty string for empty params', () => {
      const result = client._encodeParams({});
      assert.equal(result, '');
    });
  });
});

// ─── BillingManager ───

describe('BillingManager', () => {
  if (!DatabaseSync) {
    it('skips BillingManager tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  let db;
  let stripe;
  let manager;

  beforeEach(() => {
    db = createTestDb();
    stripe = createMockStripe();
    manager = new BillingManager(stripe, db);
  });

  it('constructor creates billing tables', () => {
    // Verify billing table exists by querying it
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='billing'").get();
    assert.ok(result, 'billing table should exist');

    const eventsResult = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='billing_events'").get();
    assert.ok(eventsResult, 'billing_events table should exist');
  });

  it('constructor throws without StripeClient', () => {
    assert.throws(
      () => new BillingManager(null, db),
      (err) => err.message.includes('StripeClient instance is required')
    );
  });

  it('constructor throws without SQLite database', () => {
    assert.throws(
      () => new BillingManager(stripe, null),
      (err) => err.message.includes('SQLite database instance is required')
    );
  });

  describe('getUserPlan', () => {
    it('returns FREE plan for unknown user', () => {
      const result = manager.getUserPlan('user_unknown');
      assert.equal(result.plan, 'FREE');
      assert.deepStrictEqual(result.planDetails, PLANS.FREE);
      assert.equal(result.status, 'active');
      assert.equal(result.subscriptionId, null);
    });

    it('returns correct plan for known user', () => {
      insertBillingRecord(db, {
        userId: 'user_pro',
        stripeCustomerId: 'cus_pro_1',
        plan: 'PRO',
        status: 'active',
        subscriptionId: 'sub_pro_1',
      });

      const result = manager.getUserPlan('user_pro');
      assert.equal(result.plan, 'PRO');
      assert.deepStrictEqual(result.planDetails, PLANS.PRO);
      assert.equal(result.status, 'active');
      assert.equal(result.subscriptionId, 'sub_pro_1');
    });

    it('throws when userId is missing', () => {
      assert.throws(
        () => manager.getUserPlan(null),
        (err) => err.message.includes('userId is required')
      );
    });
  });

  describe('canAccess', () => {
    it('returns true for FREE features on FREE plan', () => {
      assert.equal(manager.canAccess('user_free', 'search'), true);
      assert.equal(manager.canAccess('user_free', 'local-store'), true);
      assert.equal(manager.canAccess('user_free', 'basic-analytics'), true);
    });

    it('returns false for PRO features on FREE plan', () => {
      assert.equal(manager.canAccess('user_free', 'federation'), false);
      assert.equal(manager.canAccess('user_free', 'mcp-server'), false);
      assert.equal(manager.canAccess('user_free', 'debug-oracle'), false);
    });

    it('returns true for PRO features on PRO plan', () => {
      insertBillingRecord(db, {
        userId: 'user_pro',
        stripeCustomerId: 'cus_pro_2',
        plan: 'PRO',
        status: 'active',
      });

      assert.equal(manager.canAccess('user_pro', 'federation'), true);
      assert.equal(manager.canAccess('user_pro', 'mcp-server'), true);
      assert.equal(manager.canAccess('user_pro', 'analytics'), true);
    });

    it('returns false when billing status is not active', () => {
      insertBillingRecord(db, {
        userId: 'user_pastdue',
        stripeCustomerId: 'cus_pd',
        plan: 'PRO',
        status: 'past_due',
      });

      assert.equal(manager.canAccess('user_pastdue', 'federation'), false);
    });

    it('returns false for null userId or feature', () => {
      assert.equal(manager.canAccess(null, 'search'), false);
      assert.equal(manager.canAccess('user_1', null), false);
      assert.equal(manager.canAccess(null, null), false);
    });

    it('returns true for TEAM features on TEAM plan', () => {
      insertBillingRecord(db, {
        userId: 'user_team',
        stripeCustomerId: 'cus_team',
        plan: 'TEAM',
        status: 'active',
      });

      assert.equal(manager.canAccess('user_team', 'sso'), true);
      assert.equal(manager.canAccess('user_team', 'hosted-hub'), true);
      assert.equal(manager.canAccess('user_team', 'priority-support'), true);
    });
  });

  describe('handleWebhook', () => {
    it('processes checkout.session.completed and activates subscription', () => {
      insertBillingRecord(db, {
        userId: 'user_checkout',
        stripeCustomerId: 'cus_checkout_1',
        plan: 'FREE',
        status: 'active',
      });

      const event = {
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_checkout_1',
            subscription: 'sub_new_1',
            metadata: { plan: 'PRO' },
          },
        },
      };

      const result = manager.handleWebhook(event);
      assert.equal(result.handled, true);
      assert.equal(result.action, 'subscription_activated');

      // Verify DB was updated
      const billing = db.prepare('SELECT * FROM billing WHERE stripe_customer_id = ?').get('cus_checkout_1');
      assert.equal(billing.subscription_id, 'sub_new_1');
      assert.equal(billing.status, 'active');
    });

    it('processes customer.subscription.deleted and downgrades to FREE', () => {
      insertBillingRecord(db, {
        userId: 'user_cancel',
        stripeCustomerId: 'cus_cancel_1',
        plan: 'PRO',
        status: 'active',
        subscriptionId: 'sub_cancel_1',
      });

      const event = {
        id: 'evt_cancel_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_cancel_1',
            customer: 'cus_cancel_1',
          },
        },
      };

      const result = manager.handleWebhook(event);
      assert.equal(result.handled, true);
      assert.equal(result.action, 'subscription_canceled');

      // Verify downgraded to FREE
      const billing = db.prepare('SELECT * FROM billing WHERE stripe_customer_id = ?').get('cus_cancel_1');
      assert.equal(billing.plan, 'FREE');
      assert.equal(billing.status, 'canceled');
      assert.equal(billing.subscription_id, null);
    });

    it('handles duplicate events idempotently', () => {
      insertBillingRecord(db, {
        userId: 'user_dup',
        stripeCustomerId: 'cus_dup_1',
        plan: 'FREE',
        status: 'active',
      });

      const event = {
        id: 'evt_dup_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_dup_1',
            subscription: 'sub_dup_1',
            metadata: { plan: 'PRO' },
          },
        },
      };

      // First call should process
      const first = manager.handleWebhook(event);
      assert.equal(first.handled, true);
      assert.equal(first.action, 'subscription_activated');

      // Second call with same event ID should be a duplicate
      const second = manager.handleWebhook(event);
      assert.equal(second.handled, false);
      assert.equal(second.action, 'duplicate_event');
    });

    it('rejects events with missing id or type via in-memory set', () => {
      // Also test the in-memory duplicate path by sending the same id again
      // after it was recorded in the Set
      insertBillingRecord(db, {
        userId: 'user_inmem',
        stripeCustomerId: 'cus_inmem',
        plan: 'FREE',
        status: 'active',
      });

      const event = {
        id: 'evt_inmem_1',
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_inmem', subscription: 'sub_inmem' } },
      };

      manager.handleWebhook(event);

      // Now the event is in both DB and in-memory set
      const dup = manager.handleWebhook(event);
      assert.equal(dup.handled, false);
      assert.equal(dup.action, 'duplicate_event');
    });

    it('returns invalid_event for null or missing event fields', () => {
      assert.deepStrictEqual(manager.handleWebhook(null), { handled: false, action: 'invalid_event' });
      assert.deepStrictEqual(manager.handleWebhook({}), { handled: false, action: 'invalid_event' });
      assert.deepStrictEqual(manager.handleWebhook({ id: 'x' }), { handled: false, action: 'invalid_event' });
    });

    it('returns unhandled_event_type for unknown event types', () => {
      const event = { id: 'evt_unknown_1', type: 'some.unknown.event', data: {} };
      const result = manager.handleWebhook(event);
      assert.equal(result.handled, false);
      assert.equal(result.action, 'unhandled_event_type');
    });

    it('processes customer.subscription.updated with plan change', () => {
      insertBillingRecord(db, {
        userId: 'user_upgrade',
        stripeCustomerId: 'cus_upgrade_1',
        plan: 'PRO',
        status: 'active',
        subscriptionId: 'sub_old_1',
      });

      const event = {
        id: 'evt_upgrade_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_upgraded_1',
            customer: 'cus_upgrade_1',
            status: 'active',
            items: {
              data: [
                { price: { id: 'price_team_monthly' } },
              ],
            },
          },
        },
      };

      const result = manager.handleWebhook(event);
      assert.equal(result.handled, true);
      assert.equal(result.action, 'subscription_updated');
      assert.equal(result.plan, 'TEAM');

      const billing = db.prepare('SELECT * FROM billing WHERE stripe_customer_id = ?').get('cus_upgrade_1');
      assert.equal(billing.plan, 'TEAM');
      assert.equal(billing.subscription_id, 'sub_upgraded_1');
    });

    it('processes invoice.payment_failed and marks past_due', () => {
      insertBillingRecord(db, {
        userId: 'user_fail',
        stripeCustomerId: 'cus_fail_1',
        plan: 'PRO',
        status: 'active',
      });

      const event = {
        id: 'evt_fail_1',
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: 'cus_fail_1',
            id: 'in_fail_1',
          },
        },
      };

      const result = manager.handleWebhook(event);
      assert.equal(result.handled, true);
      assert.equal(result.action, 'payment_failed');

      const billing = db.prepare('SELECT * FROM billing WHERE stripe_customer_id = ?').get('cus_fail_1');
      assert.equal(billing.status, 'past_due');
    });

    it('returns customer_not_found when customer does not exist in DB', () => {
      const event = {
        id: 'evt_noc_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_nonexistent',
            subscription: 'sub_noc',
          },
        },
      };

      const result = manager.handleWebhook(event);
      assert.equal(result.handled, false);
      assert.equal(result.action, 'customer_not_found');
    });
  });

  describe('getUsage', () => {
    it('returns correct limits for FREE plan user', () => {
      const usage = manager.getUsage('user_new');
      assert.equal(usage.limit, 50);
      assert.equal(usage.unlimited, false);
      assert.equal(typeof usage.used, 'number');
      assert.equal(typeof usage.remaining, 'number');
    });

    it('returns unlimited for TEAM plan user', () => {
      insertBillingRecord(db, {
        userId: 'user_team_usage',
        stripeCustomerId: 'cus_team_u',
        plan: 'TEAM',
        status: 'active',
      });

      const usage = manager.getUsage('user_team_usage');
      assert.equal(usage.limit, -1);
      assert.equal(usage.unlimited, true);
      assert.equal(usage.remaining, -1);
    });

    it('returns 5000 limit for PRO plan user', () => {
      insertBillingRecord(db, {
        userId: 'user_pro_usage',
        stripeCustomerId: 'cus_pro_u',
        plan: 'PRO',
        status: 'active',
      });

      const usage = manager.getUsage('user_pro_usage');
      assert.equal(usage.limit, 5000);
      assert.equal(usage.unlimited, false);
    });

    it('throws when userId is missing', () => {
      assert.throws(
        () => manager.getUsage(null),
        (err) => err.message.includes('userId is required')
      );
    });
  });

  describe('getBillingInfo', () => {
    it('returns default FREE info for non-existent user', async () => {
      const info = await manager.getBillingInfo('user_ghost');
      assert.equal(info.userId, 'user_ghost');
      assert.equal(info.plan, 'FREE');
      assert.equal(info.planName, 'Free');
      assert.deepStrictEqual(info.features, PLANS.FREE.features);
      assert.equal(info.status, 'active');
      assert.equal(info.subscriptionId, null);
      assert.equal(info.stripeCustomerId, null);
      assert.equal(info.subscription, null);
      assert.ok(info.usage, 'should include usage data');
    });

    it('returns full info for subscribed user', async () => {
      insertBillingRecord(db, {
        userId: 'user_info',
        stripeCustomerId: 'cus_info_1',
        plan: 'PRO',
        status: 'active',
        subscriptionId: 'sub_info_1',
      });

      const info = await manager.getBillingInfo('user_info');
      assert.equal(info.plan, 'PRO');
      assert.equal(info.planName, 'Pro');
      assert.equal(info.stripeCustomerId, 'cus_info_1');
      assert.equal(info.subscriptionId, 'sub_info_1');
      assert.ok(info.subscription, 'should have live subscription data');
      assert.equal(info.subscription.id, 'sub_info_1');
      assert.equal(info.subscription.status, 'active');
    });

    it('throws when userId is missing', async () => {
      await assert.rejects(
        () => manager.getBillingInfo(null),
        (err) => err.message.includes('userId is required')
      );
    });
  });
});

// ─── billingMiddleware ───

describe('billingMiddleware', () => {
  if (!DatabaseSync) {
    it('skips middleware tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  let db;
  let stripe;
  let manager;
  let middleware;

  beforeEach(() => {
    db = createTestDb();
    stripe = createMockStripe();
    manager = new BillingManager(stripe, db);
    middleware = billingMiddleware(manager);
  });

  it('throws when BillingManager is not provided', () => {
    assert.throws(
      () => billingMiddleware(null),
      (err) => err.message.includes('BillingManager instance is required')
    );
  });

  it('attaches billing info to request for known user', () => {
    insertBillingRecord(db, {
      userId: 'user_mw',
      stripeCustomerId: 'cus_mw_1',
      plan: 'PRO',
      status: 'active',
    });

    const req = mockReq({ 'x-user-id': 'user_mw' });
    const res = mockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'next() should be called');
    assert.equal(req.billing.plan, 'PRO');
    assert.ok(Array.isArray(req.billing.features));
    assert.equal(typeof req.billing.canAccess, 'function');
    assert.equal(req.billing.canAccess('federation'), true);
    assert.equal(req.billing.canAccess('sso'), false);
  });

  it('falls back to FREE tier when no user is identified', () => {
    const req = mockReq({});
    const res = mockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'next() should be called');
    assert.equal(req.billing.plan, 'FREE');
    assert.deepStrictEqual(req.billing.features, PLANS.FREE.features);
    assert.equal(req.billing.canAccess('search'), true);
    assert.equal(req.billing.canAccess('federation'), false);
  });

  it('reads user ID from req.user.id as fallback', () => {
    const req = mockReq({}, { user: { id: 'user_from_obj' } });
    const res = mockRes();
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled);
    assert.equal(req.billing.plan, 'FREE');
  });

  it('defaults to FREE tier when getUserPlan throws', () => {
    // Force getUserPlan to throw by closing the db
    db.close();
    const freshDb = createTestDb();
    const brokenManager = new BillingManager(stripe, freshDb);
    brokenManager.getUserPlan = () => { throw new Error('DB exploded'); };
    const brokenMiddleware = billingMiddleware(brokenManager);

    const req = mockReq({ 'x-user-id': 'user_broken' });
    const res = mockRes();
    let nextCalled = false;

    brokenMiddleware(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'next() should still be called on error');
    assert.equal(req.billing.plan, 'FREE');
  });

  it('works without a next callback', () => {
    const req = mockReq({});
    const res = mockRes();

    // Should not throw when next is undefined
    middleware(req, res);
    assert.equal(req.billing.plan, 'FREE');
  });
});

// ─── billingRoutes ───

describe('billingRoutes', () => {
  if (!DatabaseSync) {
    it('skips routes tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  let db;
  let stripe;
  let manager;
  let handler;
  const webhookSecret = 'whsec_test_route_secret';

  beforeEach(() => {
    db = createTestDb();
    stripe = createMockStripe();
    manager = new BillingManager(stripe, db);

    // Set webhook secret env for routes
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    handler = billingRoutes(manager);
  });

  it('throws when BillingManager is not provided', () => {
    assert.throws(
      () => billingRoutes(null),
      (err) => err.message.includes('BillingManager instance is required')
    );
  });

  it('returns false for non-billing routes', async () => {
    const req = mockReq({});
    const res = mockRes();

    const handled = await handler(req, res, '/api/patterns', 'GET');
    assert.equal(handled, false);
  });

  it('returns false for unknown billing sub-paths', async () => {
    const req = mockReq({});
    const res = mockRes();

    const handled = await handler(req, res, '/api/billing/unknown', 'GET');
    assert.equal(handled, false);
  });

  describe('GET /api/billing/plan', () => {
    it('returns plan info for authenticated user', async () => {
      insertBillingRecord(db, {
        userId: 'user_route_plan',
        stripeCustomerId: 'cus_rp',
        plan: 'PRO',
        status: 'active',
      });

      const req = mockReq({ 'x-user-id': 'user_route_plan' });
      const res = mockRes();

      const handled = await handler(req, res, '/api/billing/plan', 'GET');
      assert.equal(handled, true);
      assert.equal(res.statusCode, 200);

      const body = JSON.parse(res.body);
      assert.equal(body.plan, 'PRO');
      assert.ok(body.planDetails);
      assert.equal(body.status, 'active');
    });

    it('returns 401 when no user is authenticated', async () => {
      const req = mockReq({});
      const res = mockRes();

      const handled = await handler(req, res, '/api/billing/plan', 'GET');
      assert.equal(handled, true);
      assert.equal(res.statusCode, 401);

      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Authentication required'));
    });
  });

  describe('GET /api/billing/usage', () => {
    it('returns usage data for authenticated user', async () => {
      const req = mockReq({ 'x-user-id': 'user_route_usage' });
      const res = mockRes();

      const handled = await handler(req, res, '/api/billing/usage', 'GET');
      assert.equal(handled, true);
      assert.equal(res.statusCode, 200);

      const body = JSON.parse(res.body);
      assert.ok('used' in body);
      assert.ok('limit' in body);
      assert.ok('remaining' in body);
      assert.ok('unlimited' in body);
    });

    it('returns 401 when no user is authenticated', async () => {
      const req = mockReq({});
      const res = mockRes();

      const handled = await handler(req, res, '/api/billing/usage', 'GET');
      assert.equal(handled, true);
      assert.equal(res.statusCode, 401);
    });
  });

  describe('POST /api/billing/webhook', () => {
    it('processes a valid webhook event with correct signature', async () => {
      insertBillingRecord(db, {
        userId: 'user_wh',
        stripeCustomerId: 'cus_wh_1',
        plan: 'FREE',
        status: 'active',
      });

      const event = {
        id: 'evt_wh_route_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_wh_1',
            subscription: 'sub_wh_1',
            metadata: { plan: 'PRO' },
          },
        },
      };

      const payload = JSON.stringify(event);
      const { header } = signPayload(payload, webhookSecret);

      const req = mockReq({ 'stripe-signature': header });
      const res = mockRes();

      // Simulate streaming the body
      const handled = handler(req, res, '/api/billing/webhook', 'POST');
      req.emit('data', Buffer.from(payload));
      req.emit('end');

      await handled;

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.received, true);
      assert.equal(body.handled, true);
      assert.equal(body.action, 'subscription_activated');
    });

    it('rejects webhook with invalid signature', async () => {
      const payload = JSON.stringify({ id: 'evt_bad_sig', type: 'test' });
      const ts = Math.floor(Date.now() / 1000);
      const fakeHeader = `t=${ts},v1=deadbeef0000000000000000000000000000000000000000000000000000dead`;

      const req = mockReq({ 'stripe-signature': fakeHeader });
      const res = mockRes();

      const handled = handler(req, res, '/api/billing/webhook', 'POST');
      req.emit('data', Buffer.from(payload));
      req.emit('end');

      await handled;

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Webhook verification failed'));
    });

    it('returns 400 when Stripe-Signature header is missing', async () => {
      const req = mockReq({});
      const res = mockRes();

      const handled = handler(req, res, '/api/billing/webhook', 'POST');
      req.emit('data', Buffer.from('{}'));
      req.emit('end');

      await handled;

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Missing Stripe-Signature'));
    });

    it('returns 500 when webhook secret is not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const routeHandler = billingRoutes(manager);

      const req = mockReq({ 'stripe-signature': 't=123,v1=abc' });
      const res = mockRes();

      const handled = routeHandler(req, res, '/api/billing/webhook', 'POST');
      req.emit('data', Buffer.from('{}'));
      req.emit('end');

      await handled;

      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Webhook secret not configured'));

      // Restore for other tests
      process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    });
  });
});
