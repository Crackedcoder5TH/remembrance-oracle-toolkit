/**
 * Stripe Billing Integration
 *
 * Production-quality Stripe integration using ONLY Node.js built-in modules.
 * No external dependencies — all HTTP calls use the `https` module directly.
 *
 * Components:
 *   StripeClient    — Low-level HTTPS client for the Stripe API (api.stripe.com)
 *   BillingManager  — Business logic layer with SQLite persistence
 *   billingMiddleware — Attaches plan/feature info to requests
 *   billingRoutes   — Function-based route handler (no Express)
 *   PLANS           — Three-tier plan definitions (Free / Pro / Team)
 *
 * Webhook signatures are verified using crypto.timingSafeEqual with HMAC-SHA256
 * per Stripe's specification. All webhook processing is idempotent.
 */

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// ─── Plan Definitions ───

const PLANS = Object.freeze({
  FREE: Object.freeze({
    name: 'Free',
    priceId: null,
    patterns: 50,
    members: 1,
    features: ['local-store', 'search', 'basic-analytics'],
  }),
  PRO: Object.freeze({
    name: 'Pro',
    priceId: 'price_pro_monthly',
    patterns: 5000,
    members: 10,
    features: [
      'local-store', 'personal-store', 'search', 'analytics',
      'federation', 'mcp-server', 'debug-oracle',
    ],
  }),
  TEAM: Object.freeze({
    name: 'Team',
    priceId: 'price_team_monthly',
    patterns: -1,
    members: -1,
    features: [
      'local-store', 'personal-store', 'community-store', 'search',
      'analytics', 'federation', 'mcp-server', 'debug-oracle',
      'hosted-hub', 'priority-support', 'sso',
    ],
  }),
});

/** Map Stripe price IDs to plan keys. */
const PRICE_TO_PLAN = new Map();
for (const [key, plan] of Object.entries(PLANS)) {
  if (plan.priceId) PRICE_TO_PLAN.set(plan.priceId, key);
}

// ─── StripeClient ───

class StripeClient {
  /**
   * @param {object} [options]
   * @param {string} [options.secretKey] — Stripe secret key (defaults to STRIPE_SECRET_KEY env)
   * @param {string} [options.apiVersion] — Stripe API version header
   */
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.STRIPE_SECRET_KEY || '';
    this.apiVersion = options.apiVersion || '2024-12-18.acacia';
    this.baseHost = 'api.stripe.com';

    if (!this.secretKey) {
      throw new Error('Stripe secret key is required. Set STRIPE_SECRET_KEY env var or pass options.secretKey.');
    }
  }

  // ─── Core HTTP ───

  /**
   * Make an HTTPS request to the Stripe API.
   *
   * @param {string} method — HTTP method
   * @param {string} path — API path (e.g., /v1/customers)
   * @param {object|null} params — Form-encoded body params (for POST/DELETE) or query params (for GET)
   * @returns {Promise<object>} Parsed JSON response
   */
  _request(method, path, params = null) {
    return new Promise((resolve, reject) => {
      const isGet = method === 'GET';
      let fullPath = path;
      let body = null;

      if (params && Object.keys(params).length > 0) {
        const encoded = this._encodeParams(params);
        if (isGet) {
          fullPath = `${path}?${encoded}`;
        } else {
          body = encoded;
        }
      }

      const options = {
        hostname: this.baseHost,
        port: 443,
        path: fullPath,
        method,
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Stripe-Version': this.apiVersion,
          'User-Agent': 'remembrance-oracle-toolkit/1.0',
        },
      };

      if (body) {
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              const err = new Error(parsed.error.message || 'Stripe API error');
              err.type = parsed.error.type;
              err.code = parsed.error.code;
              err.statusCode = res.statusCode;
              err.stripeError = parsed.error;
              reject(err);
            } else {
              resolve(parsed);
            }
          } catch (parseErr) {
            const err = new Error(`Failed to parse Stripe response: ${parseErr.message}`);
            err.statusCode = res.statusCode;
            err.rawBody = data;
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('Stripe API request timed out after 30s'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * Encode parameters for Stripe's form-encoded API.
   * Handles nested objects and arrays using Stripe's bracket notation.
   *
   * @param {object} params
   * @param {string} [prefix]
   * @returns {string}
   */
  _encodeParams(params, prefix = '') {
    const parts = [];

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        parts.push(this._encodeParams(value, fullKey));
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'object') {
            parts.push(this._encodeParams(value[i], `${fullKey}[${i}]`));
          } else {
            parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(value[i])}`);
          }
        }
      } else {
        parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`);
      }
    }

    return parts.filter(Boolean).join('&');
  }

  // ─── Customer Methods ───

  /**
   * Create a Stripe customer.
   *
   * @param {string} email
   * @param {object} [metadata] — Key-value metadata
   * @returns {Promise<object>} Stripe Customer object
   */
  createCustomer(email, metadata = {}) {
    const params = { email };
    if (Object.keys(metadata).length > 0) {
      params.metadata = metadata;
    }
    return this._request('POST', '/v1/customers', params);
  }

  /**
   * Retrieve a Stripe customer by ID.
   *
   * @param {string} customerId
   * @returns {Promise<object>} Stripe Customer object
   */
  getCustomer(customerId) {
    if (!customerId) return Promise.reject(new Error('customerId is required'));
    return this._request('GET', `/v1/customers/${encodeURIComponent(customerId)}`);
  }

  // ─── Checkout Session ───

  /**
   * Create a Stripe Checkout session for subscription signup.
   *
   * @param {string} customerId — Stripe customer ID
   * @param {string} priceId — Stripe price ID
   * @param {string} successUrl — Redirect URL on success
   * @param {string} cancelUrl — Redirect URL on cancel
   * @returns {Promise<object>} Stripe Checkout Session object
   */
  createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    if (!customerId) return Promise.reject(new Error('customerId is required'));
    if (!priceId) return Promise.reject(new Error('priceId is required'));
    if (!successUrl) return Promise.reject(new Error('successUrl is required'));
    if (!cancelUrl) return Promise.reject(new Error('cancelUrl is required'));

    return this._request('POST', '/v1/checkout/sessions', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  // ─── Customer Portal ───

  /**
   * Create a Stripe Customer Portal session.
   *
   * @param {string} customerId — Stripe customer ID
   * @param {string} returnUrl — URL to return to after portal
   * @returns {Promise<object>} Stripe Portal Session object
   */
  createPortalSession(customerId, returnUrl) {
    if (!customerId) return Promise.reject(new Error('customerId is required'));
    if (!returnUrl) return Promise.reject(new Error('returnUrl is required'));

    return this._request('POST', '/v1/billing_portal/sessions', {
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // ─── Subscriptions ───

  /**
   * Retrieve a subscription by ID.
   *
   * @param {string} subscriptionId
   * @returns {Promise<object>} Stripe Subscription object
   */
  getSubscription(subscriptionId) {
    if (!subscriptionId) return Promise.reject(new Error('subscriptionId is required'));
    return this._request('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  /**
   * Cancel a subscription immediately.
   *
   * @param {string} subscriptionId
   * @returns {Promise<object>} Cancelled Stripe Subscription object
   */
  cancelSubscription(subscriptionId) {
    if (!subscriptionId) return Promise.reject(new Error('subscriptionId is required'));
    return this._request('DELETE', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  /**
   * List subscriptions for a customer.
   *
   * @param {string} customerId
   * @returns {Promise<object>} Stripe list of Subscription objects
   */
  listSubscriptions(customerId) {
    if (!customerId) return Promise.reject(new Error('customerId is required'));
    return this._request('GET', '/v1/subscriptions', { customer: customerId });
  }

  // ─── Webhook Verification ───

  /**
   * Verify and construct a Stripe webhook event from the raw payload and signature.
   *
   * Uses HMAC-SHA256 with crypto.timingSafeEqual to prevent timing attacks,
   * per Stripe's webhook signature verification specification.
   *
   * @param {string|Buffer} payload — Raw request body (NOT parsed JSON)
   * @param {string} signature — Stripe-Signature header value
   * @param {string} webhookSecret — Webhook endpoint signing secret (whsec_...)
   * @param {number} [tolerance=300] — Maximum age in seconds (default 5 minutes)
   * @returns {object} Parsed event object
   * @throws {Error} If signature is invalid or timestamp is outside tolerance
   */
  constructEvent(payload, signature, webhookSecret, tolerance = 300) {
    if (!payload) throw new Error('Webhook payload is required');
    if (!signature) throw new Error('Webhook signature header is required');
    if (!webhookSecret) throw new Error('Webhook signing secret is required');

    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');

    // Parse the Stripe-Signature header
    // Format: t=<timestamp>,v1=<sig1>,v1=<sig2>,...
    const elements = signature.split(',');
    const sigMap = {};
    const signatures = [];

    for (const element of elements) {
      const [key, value] = element.split('=');
      const trimmedKey = key.trim();
      const trimmedValue = (value || '').trim();

      if (trimmedKey === 't') {
        sigMap.timestamp = trimmedValue;
      } else if (trimmedKey === 'v1') {
        signatures.push(trimmedValue);
      }
    }

    if (!sigMap.timestamp) {
      throw new Error('Unable to extract timestamp from Stripe-Signature header');
    }

    if (signatures.length === 0) {
      throw new Error('No v1 signatures found in Stripe-Signature header');
    }

    // Check timestamp tolerance
    const timestamp = parseInt(sigMap.timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (isNaN(timestamp)) {
      throw new Error('Invalid timestamp in Stripe-Signature header');
    }

    if (tolerance > 0 && Math.abs(now - timestamp) > tolerance) {
      throw new Error(
        `Webhook timestamp is outside tolerance of ${tolerance}s. ` +
        `Event timestamp: ${timestamp}, current time: ${now}`
      );
    }

    // Compute expected signature
    const signedPayload = `${sigMap.timestamp}.${payloadStr}`;
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Verify at least one v1 signature matches using timing-safe comparison
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    let verified = false;

    for (const sig of signatures) {
      try {
        const sigBuf = Buffer.from(sig, 'hex');
        if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
          verified = true;
          break;
        }
      } catch {
        // Buffer length mismatch or invalid hex — skip this signature
        continue;
      }
    }

    if (!verified) {
      throw new Error('Webhook signature verification failed. No matching v1 signature found.');
    }

    // Parse and return the event
    try {
      return JSON.parse(payloadStr);
    } catch (err) {
      throw new Error(`Failed to parse webhook payload as JSON: ${err.message}`);
    }
  }
}

// ─── BillingManager ───

class BillingManager {
  /**
   * @param {StripeClient} stripe — StripeClient instance
   * @param {object} sqliteDb — DatabaseSync instance (node:sqlite)
   */
  constructor(stripe, sqliteDb) {
    if (!stripe) throw new Error('StripeClient instance is required');
    if (!sqliteDb) throw new Error('SQLite database instance is required');

    this.stripe = stripe;
    this.db = sqliteDb;

    /** Set of processed webhook event IDs for idempotency. */
    this._processedEvents = new Set();

    this._initSchema();
  }

  /**
   * Initialize the billing table schema.
   */
  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS billing (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        stripe_customer_id TEXT,
        plan TEXT NOT NULL DEFAULT 'FREE',
        subscription_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Ensure indexes for fast lookups
    try { this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_user_id ON billing(user_id)'); } catch { /* already exists */ }
    try { this.db.exec('CREATE INDEX IF NOT EXISTS idx_billing_stripe_customer ON billing(stripe_customer_id)'); } catch { /* already exists */ }
    try { this.db.exec('CREATE INDEX IF NOT EXISTS idx_billing_subscription ON billing(subscription_id)'); } catch { /* already exists */ }

    // Idempotency tracking for webhook events
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS billing_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at TEXT NOT NULL
      )
    `);
  }

  // ─── Customer Management ───

  /**
   * Get or create a Stripe customer for a user.
   * Persists the mapping in the billing table.
   *
   * @param {string} userId — Internal user ID
   * @param {string} email — User email for Stripe
   * @returns {Promise<object>} — { userId, stripeCustomerId, plan, status }
   */
  async getOrCreateCustomer(userId, email) {
    if (!userId) throw new Error('userId is required');
    if (!email) throw new Error('email is required');

    // Check for existing record
    const existing = this.db.prepare('SELECT * FROM billing WHERE user_id = ?').get(userId);

    if (existing && existing.stripe_customer_id) {
      return {
        userId: existing.user_id,
        stripeCustomerId: existing.stripe_customer_id,
        plan: existing.plan,
        status: existing.status,
      };
    }

    // Create Stripe customer
    const customer = await this.stripe.createCustomer(email, {
      oracle_user_id: userId,
    });

    const now = new Date().toISOString();
    const id = crypto.randomBytes(16).toString('hex');

    if (existing) {
      // Update existing record with Stripe customer ID
      this.db.prepare(
        'UPDATE billing SET stripe_customer_id = ?, updated_at = ? WHERE user_id = ?'
      ).run(customer.id, now, userId);
    } else {
      // Insert new billing record
      this.db.prepare(
        'INSERT INTO billing (id, user_id, stripe_customer_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, userId, customer.id, 'FREE', 'active', now, now);
    }

    return {
      userId,
      stripeCustomerId: customer.id,
      plan: existing ? existing.plan : 'FREE',
      status: existing ? existing.status : 'active',
    };
  }

  // ─── Checkout ───

  /**
   * Start a Stripe Checkout session for a plan upgrade.
   *
   * @param {string} userId — Internal user ID
   * @param {string} planKey — Plan key (PRO, TEAM)
   * @param {string} successUrl — Redirect on success
   * @param {string} cancelUrl — Redirect on cancel
   * @returns {Promise<object>} — { sessionId, url }
   */
  async startCheckout(userId, planKey, successUrl, cancelUrl) {
    if (!userId) throw new Error('userId is required');
    if (!planKey) throw new Error('planKey is required');
    if (!successUrl) throw new Error('successUrl is required');
    if (!cancelUrl) throw new Error('cancelUrl is required');

    const plan = PLANS[planKey.toUpperCase()];
    if (!plan) throw new Error(`Unknown plan: ${planKey}`);
    if (!plan.priceId) throw new Error(`Plan ${planKey} does not have a price (free tier)`);

    // Ensure customer exists
    const billing = this.db.prepare('SELECT * FROM billing WHERE user_id = ?').get(userId);
    if (!billing || !billing.stripe_customer_id) {
      throw new Error('Customer not found. Call getOrCreateCustomer first.');
    }

    const session = await this.stripe.createCheckoutSession(
      billing.stripe_customer_id,
      plan.priceId,
      successUrl,
      cancelUrl
    );

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  // ─── Customer Portal ───

  /**
   * Create a Stripe Customer Portal session for managing subscriptions.
   *
   * @param {string} userId — Internal user ID
   * @param {string} returnUrl — URL to return to after portal
   * @returns {Promise<object>} — { url }
   */
  async openPortal(userId, returnUrl) {
    if (!userId) throw new Error('userId is required');
    if (!returnUrl) throw new Error('returnUrl is required');

    const billing = this.db.prepare('SELECT * FROM billing WHERE user_id = ?').get(userId);
    if (!billing || !billing.stripe_customer_id) {
      throw new Error('Customer not found. Call getOrCreateCustomer first.');
    }

    const session = await this.stripe.createPortalSession(
      billing.stripe_customer_id,
      returnUrl
    );

    return { url: session.url };
  }

  // ─── Webhook Processing ───

  /**
   * Process a verified Stripe webhook event.
   * Idempotent — duplicate events are safely ignored.
   *
   * Supported events:
   *   - checkout.session.completed
   *   - customer.subscription.updated
   *   - customer.subscription.deleted
   *   - invoice.payment_failed
   *
   * @param {object} event — Verified Stripe event (from constructEvent)
   * @returns {{ handled: boolean, action: string }}
   */
  handleWebhook(event) {
    if (!event || !event.id || !event.type) {
      return { handled: false, action: 'invalid_event' };
    }

    // Idempotency check — DB-level
    const existing = this.db.prepare(
      'SELECT event_id FROM billing_events WHERE event_id = ?'
    ).get(event.id);

    if (existing) {
      return { handled: false, action: 'duplicate_event' };
    }

    // Also check in-memory set for rapid duplicates
    if (this._processedEvents.has(event.id)) {
      return { handled: false, action: 'duplicate_event' };
    }

    let result;

    switch (event.type) {
      case 'checkout.session.completed':
        result = this._handleCheckoutCompleted(event);
        break;
      case 'customer.subscription.updated':
        result = this._handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        result = this._handleSubscriptionDeleted(event);
        break;
      case 'invoice.payment_failed':
        result = this._handlePaymentFailed(event);
        break;
      default:
        result = { handled: false, action: 'unhandled_event_type' };
        break;
    }

    // Record event for idempotency
    const now = new Date().toISOString();
    try {
      this.db.prepare(
        'INSERT OR IGNORE INTO billing_events (event_id, event_type, processed_at) VALUES (?, ?, ?)'
      ).run(event.id, event.type, now);
    } catch { /* idempotency insert failed — not critical */ }

    this._processedEvents.add(event.id);

    // Cap in-memory set size to prevent unbounded growth
    if (this._processedEvents.size > 10000) {
      const iter = this._processedEvents.values();
      for (let i = 0; i < 5000; i++) {
        this._processedEvents.delete(iter.next().value);
      }
    }

    return result;
  }

  /**
   * Handle checkout.session.completed — activate subscription and upgrade plan.
   */
  _handleCheckoutCompleted(event) {
    const session = event.data && event.data.object;
    if (!session) return { handled: false, action: 'missing_session_data' };

    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!customerId) return { handled: false, action: 'missing_customer_id' };

    const billing = this.db.prepare(
      'SELECT * FROM billing WHERE stripe_customer_id = ?'
    ).get(customerId);

    if (!billing) return { handled: false, action: 'customer_not_found' };

    // Determine plan from price
    const planKey = this._resolvePlanFromSession(session);
    const now = new Date().toISOString();

    this.db.prepare(
      'UPDATE billing SET plan = ?, subscription_id = ?, status = ?, updated_at = ? WHERE stripe_customer_id = ?'
    ).run(planKey, subscriptionId || null, 'active', now, customerId);

    return { handled: true, action: 'subscription_activated', plan: planKey };
  }

  /**
   * Handle customer.subscription.updated — sync plan changes.
   */
  _handleSubscriptionUpdated(event) {
    const subscription = event.data && event.data.object;
    if (!subscription) return { handled: false, action: 'missing_subscription_data' };

    const customerId = subscription.customer;
    if (!customerId) return { handled: false, action: 'missing_customer_id' };

    const billing = this.db.prepare(
      'SELECT * FROM billing WHERE stripe_customer_id = ?'
    ).get(customerId);

    if (!billing) return { handled: false, action: 'customer_not_found' };

    // Resolve new plan from subscription items
    const planKey = this._resolvePlanFromSubscription(subscription);
    const status = this._mapSubscriptionStatus(subscription.status);
    const now = new Date().toISOString();

    this.db.prepare(
      'UPDATE billing SET plan = ?, subscription_id = ?, status = ?, updated_at = ? WHERE stripe_customer_id = ?'
    ).run(planKey, subscription.id, status, now, customerId);

    return { handled: true, action: 'subscription_updated', plan: planKey, status };
  }

  /**
   * Handle customer.subscription.deleted — downgrade to free plan.
   */
  _handleSubscriptionDeleted(event) {
    const subscription = event.data && event.data.object;
    if (!subscription) return { handled: false, action: 'missing_subscription_data' };

    const customerId = subscription.customer;
    if (!customerId) return { handled: false, action: 'missing_customer_id' };

    const billing = this.db.prepare(
      'SELECT * FROM billing WHERE stripe_customer_id = ?'
    ).get(customerId);

    if (!billing) return { handled: false, action: 'customer_not_found' };

    const now = new Date().toISOString();

    this.db.prepare(
      'UPDATE billing SET plan = ?, subscription_id = NULL, status = ?, updated_at = ? WHERE stripe_customer_id = ?'
    ).run('FREE', 'canceled', now, customerId);

    return { handled: true, action: 'subscription_canceled' };
  }

  /**
   * Handle invoice.payment_failed — mark billing as past_due.
   */
  _handlePaymentFailed(event) {
    const invoice = event.data && event.data.object;
    if (!invoice) return { handled: false, action: 'missing_invoice_data' };

    const customerId = invoice.customer;
    if (!customerId) return { handled: false, action: 'missing_customer_id' };

    const billing = this.db.prepare(
      'SELECT * FROM billing WHERE stripe_customer_id = ?'
    ).get(customerId);

    if (!billing) return { handled: false, action: 'customer_not_found' };

    const now = new Date().toISOString();

    this.db.prepare(
      'UPDATE billing SET status = ?, updated_at = ? WHERE stripe_customer_id = ?'
    ).run('past_due', now, customerId);

    return { handled: true, action: 'payment_failed' };
  }

  /**
   * Resolve plan key from a Checkout Session object.
   */
  _resolvePlanFromSession(session) {
    // Check line items if available (expanded)
    if (session.line_items && session.line_items.data) {
      for (const item of session.line_items.data) {
        const priceId = item.price && item.price.id;
        if (priceId && PRICE_TO_PLAN.has(priceId)) {
          return PRICE_TO_PLAN.get(priceId);
        }
      }
    }

    // Check metadata for plan hint
    if (session.metadata && session.metadata.plan) {
      const key = session.metadata.plan.toUpperCase();
      if (PLANS[key]) return key;
    }

    // Default to PRO if we can't determine
    return 'PRO';
  }

  /**
   * Resolve plan key from a Subscription object.
   */
  _resolvePlanFromSubscription(subscription) {
    if (subscription.items && subscription.items.data) {
      for (const item of subscription.items.data) {
        const priceId = item.price && item.price.id;
        if (priceId && PRICE_TO_PLAN.has(priceId)) {
          return PRICE_TO_PLAN.get(priceId);
        }
      }
    }

    return 'FREE';
  }

  /**
   * Map Stripe subscription status to internal status.
   */
  _mapSubscriptionStatus(stripeStatus) {
    const statusMap = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'past_due',
      incomplete: 'incomplete',
      incomplete_expired: 'canceled',
      trialing: 'active',
      paused: 'paused',
    };
    return statusMap[stripeStatus] || 'unknown';
  }

  // ─── Plan & Feature Access ───

  /**
   * Get the current plan for a user.
   *
   * @param {string} userId
   * @returns {{ plan: string, planDetails: object, status: string, subscriptionId: string|null }}
   */
  getUserPlan(userId) {
    if (!userId) throw new Error('userId is required');

    const billing = this.db.prepare('SELECT * FROM billing WHERE user_id = ?').get(userId);

    if (!billing) {
      return {
        plan: 'FREE',
        planDetails: PLANS.FREE,
        status: 'active',
        subscriptionId: null,
      };
    }

    const planKey = billing.plan || 'FREE';
    const planDetails = PLANS[planKey] || PLANS.FREE;

    return {
      plan: planKey,
      planDetails,
      status: billing.status,
      subscriptionId: billing.subscription_id || null,
    };
  }

  /**
   * Check if a user's plan includes a specific feature.
   *
   * @param {string} userId
   * @param {string} feature — Feature key to check
   * @returns {boolean}
   */
  canAccess(userId, feature) {
    if (!userId || !feature) return false;

    const { planDetails, status } = this.getUserPlan(userId);

    // Deny access if billing is not in good standing
    if (status !== 'active') return false;

    return planDetails.features.includes(feature);
  }

  /**
   * Get pattern usage for a user vs their plan limit.
   *
   * @param {string} userId
   * @returns {{ used: number, limit: number, remaining: number, unlimited: boolean }}
   */
  getUsage(userId) {
    if (!userId) throw new Error('userId is required');

    const { planDetails } = this.getUserPlan(userId);
    const limit = planDetails.patterns;
    const unlimited = limit === -1;

    // Count patterns owned by this user
    // Look in the patterns table — count entries matching the user
    let used = 0;
    try {
      const row = this.db.prepare(
        "SELECT COUNT(*) as count FROM patterns WHERE json_extract(coherency_json, '$.author') = ? OR id LIKE ?"
      ).get(userId, `${userId}%`);
      used = row ? row.count : 0;
    } catch {
      // patterns table might not have author tracking — count all as fallback
      try {
        const row = this.db.prepare('SELECT COUNT(*) as count FROM patterns').get();
        used = row ? row.count : 0;
      } catch {
        used = 0;
      }
    }

    return {
      used,
      limit: unlimited ? -1 : limit,
      remaining: unlimited ? -1 : Math.max(0, limit - used),
      unlimited,
    };
  }

  /**
   * Get full billing information for a user.
   *
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getBillingInfo(userId) {
    if (!userId) throw new Error('userId is required');

    const billing = this.db.prepare('SELECT * FROM billing WHERE user_id = ?').get(userId);
    const userPlan = this.getUserPlan(userId);
    const usage = this.getUsage(userId);

    const info = {
      userId,
      plan: userPlan.plan,
      planName: userPlan.planDetails.name,
      features: userPlan.planDetails.features,
      status: userPlan.status,
      subscriptionId: userPlan.subscriptionId,
      stripeCustomerId: billing ? billing.stripe_customer_id : null,
      usage,
      createdAt: billing ? billing.created_at : null,
      updatedAt: billing ? billing.updated_at : null,
    };

    // Fetch live subscription details from Stripe if available
    if (userPlan.subscriptionId) {
      try {
        const subscription = await this.stripe.getSubscription(userPlan.subscriptionId);
        info.subscription = {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };
      } catch {
        // Stripe call failed — continue without live data
        info.subscription = null;
      }
    } else {
      info.subscription = null;
    }

    return info;
  }
}

// ─── Middleware ───

/**
 * Express-style middleware that attaches billing info to authenticated requests.
 *
 * After this middleware runs, `req.billing` contains:
 *   - plan: string (FREE/PRO/TEAM)
 *   - features: string[] (feature keys)
 *   - canAccess(feature): boolean
 *
 * @param {BillingManager} billingManager
 * @returns {function} Middleware function (req, res, next)
 */
function billingMiddleware(billingManager) {
  if (!billingManager) throw new Error('BillingManager instance is required');

  return function _billingMiddleware(req, res, next) {
    const userId = (req.headers && req.headers['x-user-id']) ||
                   (req.user && req.user.id) ||
                   null;

    if (!userId) {
      // No user identified — attach free tier defaults
      req.billing = {
        plan: 'FREE',
        features: PLANS.FREE.features,
        canAccess(feature) { return PLANS.FREE.features.includes(feature); },
      };
      if (typeof next === 'function') next();
      return;
    }

    try {
      const userPlan = billingManager.getUserPlan(userId);
      req.billing = {
        plan: userPlan.plan,
        features: userPlan.planDetails.features,
        canAccess(feature) {
          return billingManager.canAccess(userId, feature);
        },
      };
    } catch {
      // Billing lookup failed — default to free
      req.billing = {
        plan: 'FREE',
        features: PLANS.FREE.features,
        canAccess(feature) { return PLANS.FREE.features.includes(feature); },
      };
    }

    if (typeof next === 'function') next();
  };
}

// ─── Route Handler ───

/**
 * Read the raw request body as a string (for webhook signature verification).
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function _readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Read and parse JSON body from request.
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
function _readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Send a JSON response.
 *
 * @param {http.ServerResponse} res
 * @param {object} data
 * @param {number} [statusCode=200]
 */
function _sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Function-based route handler for billing endpoints.
 * Matches the project's convention of dispatching by pathname and method.
 *
 * Routes:
 *   POST /api/billing/checkout  — Start checkout flow
 *   POST /api/billing/portal    — Redirect to customer portal
 *   GET  /api/billing/plan      — Get current plan details
 *   GET  /api/billing/usage     — Get pattern usage vs limits
 *   POST /api/billing/webhook   — Stripe webhook (no auth, signature verified)
 *
 * @param {BillingManager} billingManager
 * @returns {function} Route handler (req, res, pathname, method) => boolean
 */
function billingRoutes(billingManager) {
  if (!billingManager) throw new Error('BillingManager instance is required');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {string} pathname
   * @param {string} method
   * @returns {boolean} true if the route was handled
   */
  return async function handleBillingRoute(req, res, pathname, method) {

    // ─── POST /api/billing/checkout ───
    if (pathname === '/api/billing/checkout' && method === 'POST') {
      const userId = _getUserId(req);
      if (!userId) {
        _sendJSON(res, { error: 'Authentication required' }, 401);
        return true;
      }

      try {
        const body = await _readJsonBody(req);

        if (!body.plan) {
          _sendJSON(res, { error: 'plan is required (PRO or TEAM)' }, 400);
          return true;
        }

        if (!body.successUrl || !body.cancelUrl) {
          _sendJSON(res, { error: 'successUrl and cancelUrl are required' }, 400);
          return true;
        }

        // Ensure customer exists (create if needed)
        if (body.email) {
          await billingManager.getOrCreateCustomer(userId, body.email);
        }

        const result = await billingManager.startCheckout(
          userId,
          body.plan,
          body.successUrl,
          body.cancelUrl
        );

        _sendJSON(res, result);
      } catch (err) {
        const statusCode = err.statusCode || 400;
        _sendJSON(res, { error: err.message }, statusCode);
      }
      return true;
    }

    // ─── POST /api/billing/portal ───
    if (pathname === '/api/billing/portal' && method === 'POST') {
      const userId = _getUserId(req);
      if (!userId) {
        _sendJSON(res, { error: 'Authentication required' }, 401);
        return true;
      }

      try {
        const body = await _readJsonBody(req);

        if (!body.returnUrl) {
          _sendJSON(res, { error: 'returnUrl is required' }, 400);
          return true;
        }

        const result = await billingManager.openPortal(userId, body.returnUrl);
        _sendJSON(res, result);
      } catch (err) {
        const statusCode = err.statusCode || 400;
        _sendJSON(res, { error: err.message }, statusCode);
      }
      return true;
    }

    // ─── GET /api/billing/plan ───
    if (pathname === '/api/billing/plan' && method === 'GET') {
      const userId = _getUserId(req);
      if (!userId) {
        _sendJSON(res, { error: 'Authentication required' }, 401);
        return true;
      }

      try {
        const plan = billingManager.getUserPlan(userId);
        _sendJSON(res, plan);
      } catch (err) {
        _sendJSON(res, { error: err.message }, 500);
      }
      return true;
    }

    // ─── GET /api/billing/usage ───
    if (pathname === '/api/billing/usage' && method === 'GET') {
      const userId = _getUserId(req);
      if (!userId) {
        _sendJSON(res, { error: 'Authentication required' }, 401);
        return true;
      }

      try {
        const usage = billingManager.getUsage(userId);
        _sendJSON(res, usage);
      } catch (err) {
        _sendJSON(res, { error: err.message }, 500);
      }
      return true;
    }

    // ─── POST /api/billing/webhook ───
    if (pathname === '/api/billing/webhook' && method === 'POST') {
      // Webhook endpoint — NO authentication required
      // Security comes from Stripe signature verification
      try {
        const rawBody = await _readRawBody(req);
        const signature = req.headers['stripe-signature'];

        if (!signature) {
          _sendJSON(res, { error: 'Missing Stripe-Signature header' }, 400);
          return true;
        }

        if (!webhookSecret) {
          _sendJSON(res, { error: 'Webhook secret not configured' }, 500);
          return true;
        }

        // Verify signature and parse event
        let event;
        try {
          event = billingManager.stripe.constructEvent(rawBody, signature, webhookSecret);
        } catch (verifyErr) {
          _sendJSON(res, { error: `Webhook verification failed: ${verifyErr.message}` }, 400);
          return true;
        }

        // Process the event
        const result = billingManager.handleWebhook(event);

        // Always return 200 to Stripe to acknowledge receipt
        _sendJSON(res, { received: true, ...result });
      } catch (err) {
        // Return 200 even on internal errors to prevent Stripe retries
        // Log the error for debugging but don't expose internals
        _sendJSON(res, { received: true, error: 'Internal processing error' });
      }
      return true;
    }

    // Route not handled by billing
    return false;
  };
}

/**
 * Extract user ID from request (X-User-Id header or req.user.id).
 *
 * @param {http.IncomingMessage} req
 * @returns {string|null}
 */
function _getUserId(req) {
  if (req.headers && req.headers['x-user-id']) {
    return req.headers['x-user-id'];
  }
  if (req.user && req.user.id) {
    return req.user.id;
  }
  return null;
}

// ─── Exports ───

module.exports = {
  StripeClient,
  BillingManager,
  billingMiddleware,
  billingRoutes,
  PLANS,
};
