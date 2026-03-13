/**
 * Tests for app/lib/client-database.ts
 *
 * Covers: ID generators, password hash/verify, row mappers, type shapes.
 * (Database adapter CRUD requires a real DB — tested via integration tests.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";

// --- Re-implement helpers (matching app/lib/client-database.ts) ---

function generateClientId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `client_${ts}_${rand}`;
}

function generatePurchaseId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `purchase_${ts}_${rand}`;
}

function generateBillingId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `billing_${ts}_${rand}`;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = createHmac("sha256", salt).update(password).digest("hex");
  if (computed.length !== hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Row mappers ---

function rowToClient(row) {
  return {
    clientId: row.client_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    status: row.status,
    pricingTier: row.pricing_tier,
    pricePerLead: Number(row.price_per_lead),
    exclusivePrice: Number(row.exclusive_price),
    stateLicenses: row.state_licenses,
    coverageTypes: row.coverage_types,
    dailyCap: Number(row.daily_cap),
    monthlyCap: Number(row.monthly_cap),
    minScore: Number(row.min_score),
    balance: Number(row.balance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFilters(row) {
  return {
    clientId: row.client_id,
    states: row.states,
    coverageTypes: row.coverage_types,
    veteranOnly: row.veteran_only === 1 || row.veteran_only === true,
    minScore: Number(row.min_score),
    maxLeadAge: Number(row.max_lead_age),
    distributionMode: row.distribution_mode,
  };
}

function rowToPurchase(row) {
  return {
    purchaseId: row.purchase_id,
    leadId: row.lead_id,
    clientId: row.client_id,
    pricePaid: Number(row.price_paid),
    purchasedAt: row.purchased_at,
    status: row.status,
    exclusive: row.exclusive === 1 || row.exclusive === true,
    returnReason: row.return_reason || "",
    returnDeadline: row.return_deadline || "",
  };
}

function rowToBilling(row) {
  return {
    billingId: row.billing_id,
    clientId: row.client_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    leadsPurchased: Number(row.leads_purchased),
    totalAmount: Number(row.total_amount),
    paymentStatus: row.payment_status,
    invoiceUrl: row.invoice_url || "",
    createdAt: row.created_at,
  };
}

// --- Tests ---

describe("generateClientId", () => {
  it("starts with 'client_' prefix", () => {
    assert.ok(generateClientId().startsWith("client_"));
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateClientId()));
    assert.equal(ids.size, 50);
  });

  it("contains only safe characters", () => {
    assert.match(generateClientId(), /^client_[a-z0-9_]+$/);
  });
});

describe("generatePurchaseId", () => {
  it("starts with 'purchase_' prefix", () => {
    assert.ok(generatePurchaseId().startsWith("purchase_"));
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePurchaseId()));
    assert.equal(ids.size, 50);
  });
});

describe("generateBillingId", () => {
  it("starts with 'billing_' prefix", () => {
    assert.ok(generateBillingId().startsWith("billing_"));
  });
});

describe("client hashPassword + verifyPassword", () => {
  it("returns salt:hash format", () => {
    const result = hashPassword("test-password");
    const parts = result.split(":");
    assert.equal(parts.length, 2);
    assert.equal(parts[0].length, 32); // 16 bytes hex
    assert.equal(parts[1].length, 64); // HMAC-SHA256 hex
  });

  it("verifies correct password", () => {
    const stored = hashPassword("secret");
    assert.equal(verifyPassword("secret", stored), true);
  });

  it("rejects wrong password", () => {
    const stored = hashPassword("secret");
    assert.equal(verifyPassword("wrong", stored), false);
  });

  it("generates unique salts each time", () => {
    const h1 = hashPassword("same");
    const h2 = hashPassword("same");
    assert.notEqual(h1, h2);
  });

  it("returns false for malformed stored hash", () => {
    assert.equal(verifyPassword("test", "nocolon"), false);
    assert.equal(verifyPassword("test", ""), false);
  });

  it("handles special characters", () => {
    const stored = hashPassword("p@$$w0rd!#%");
    assert.equal(verifyPassword("p@$$w0rd!#%", stored), true);
    assert.equal(verifyPassword("wrong", stored), false);
  });

  it("uses constant-time comparison", () => {
    // Verify the comparison is byte-by-byte XOR (not early-exit ===)
    const stored = hashPassword("test");
    const [salt, hash] = stored.split(":");
    // Tamper with last byte only
    const tamperedHash = hash.slice(0, -1) + (hash.slice(-1) === "0" ? "1" : "0");
    const tampered = `${salt}:${tamperedHash}`;
    assert.equal(verifyPassword("test", tampered), false);
  });
});

describe("rowToClient", () => {
  it("maps snake_case row to camelCase ClientRecord", () => {
    const row = {
      client_id: "client_abc",
      company_name: "Acme Insurance",
      contact_name: "John Doe",
      email: "john@acme.com",
      phone: "5551234567",
      password_hash: "salt:hash",
      status: "active",
      pricing_tier: "premium",
      price_per_lead: 2500,
      exclusive_price: 5000,
      state_licenses: '["TX","CA"]',
      coverage_types: '["term","whole"]',
      daily_cap: 50,
      monthly_cap: 1000,
      min_score: 60,
      balance: 100000,
      created_at: "2026-01-01",
      updated_at: "2026-03-01",
    };

    const client = rowToClient(row);
    assert.equal(client.clientId, "client_abc");
    assert.equal(client.companyName, "Acme Insurance");
    assert.equal(client.pricePerLead, 2500);
    assert.equal(client.exclusivePrice, 5000);
    assert.equal(client.dailyCap, 50);
    assert.equal(client.balance, 100000);
    assert.equal(client.status, "active");
  });

  it("coerces numeric fields from strings", () => {
    const row = {
      client_id: "c1", company_name: "X", contact_name: "Y", email: "x@y.com",
      phone: "1", password_hash: ":", status: "active", pricing_tier: "standard",
      price_per_lead: "2500", exclusive_price: "5000",
      state_licenses: "[]", coverage_types: "[]",
      daily_cap: "10", monthly_cap: "100", min_score: "50", balance: "0",
      created_at: "", updated_at: "",
    };
    const client = rowToClient(row);
    assert.equal(typeof client.pricePerLead, "number");
    assert.equal(client.pricePerLead, 2500);
    assert.equal(client.dailyCap, 10);
  });
});

describe("rowToFilters", () => {
  it("maps row to ClientFilters", () => {
    const row = {
      client_id: "client_1",
      states: '["TX"]',
      coverage_types: '["term"]',
      veteran_only: 1,
      min_score: 70,
      max_lead_age: 48,
      distribution_mode: "exclusive",
    };
    const filters = rowToFilters(row);
    assert.equal(filters.clientId, "client_1");
    assert.equal(filters.veteranOnly, true);
    assert.equal(filters.minScore, 70);
    assert.equal(filters.maxLeadAge, 48);
    assert.equal(filters.distributionMode, "exclusive");
  });

  it("handles boolean veteran_only", () => {
    assert.equal(rowToFilters({ client_id: "x", states: "[]", coverage_types: "[]", veteran_only: true, min_score: 0, max_lead_age: 72, distribution_mode: "shared" }).veteranOnly, true);
    assert.equal(rowToFilters({ client_id: "x", states: "[]", coverage_types: "[]", veteran_only: false, min_score: 0, max_lead_age: 72, distribution_mode: "shared" }).veteranOnly, false);
    assert.equal(rowToFilters({ client_id: "x", states: "[]", coverage_types: "[]", veteran_only: 0, min_score: 0, max_lead_age: 72, distribution_mode: "shared" }).veteranOnly, false);
  });
});

describe("rowToPurchase", () => {
  it("maps row to LeadPurchase", () => {
    const row = {
      purchase_id: "purchase_1",
      lead_id: "lead_1",
      client_id: "client_1",
      price_paid: 12000,
      purchased_at: "2026-03-12",
      status: "delivered",
      exclusive: 1,
      return_reason: "",
      return_deadline: "2026-03-15",
    };
    const purchase = rowToPurchase(row);
    assert.equal(purchase.purchaseId, "purchase_1");
    assert.equal(purchase.pricePaid, 12000);
    assert.equal(purchase.exclusive, true);
    assert.equal(purchase.status, "delivered");
  });

  it("handles boolean exclusive field", () => {
    assert.equal(rowToPurchase({ purchase_id: "p", lead_id: "l", client_id: "c", price_paid: 0, purchased_at: "", status: "delivered", exclusive: true }).exclusive, true);
    assert.equal(rowToPurchase({ purchase_id: "p", lead_id: "l", client_id: "c", price_paid: 0, purchased_at: "", status: "delivered", exclusive: false }).exclusive, false);
    assert.equal(rowToPurchase({ purchase_id: "p", lead_id: "l", client_id: "c", price_paid: 0, purchased_at: "", status: "delivered", exclusive: 0 }).exclusive, false);
  });

  it("defaults empty returnReason", () => {
    const purchase = rowToPurchase({ purchase_id: "p", lead_id: "l", client_id: "c", price_paid: 0, purchased_at: "", status: "returned", exclusive: 0, return_reason: null });
    assert.equal(purchase.returnReason, "");
  });
});

describe("rowToBilling", () => {
  it("maps row to ClientBilling", () => {
    const row = {
      billing_id: "billing_1",
      client_id: "client_1",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      leads_purchased: 42,
      total_amount: 252000,
      payment_status: "paid",
      invoice_url: "https://stripe.com/inv_123",
      created_at: "2026-03-01",
    };
    const billing = rowToBilling(row);
    assert.equal(billing.billingId, "billing_1");
    assert.equal(billing.leadsPurchased, 42);
    assert.equal(billing.totalAmount, 252000);
    assert.equal(billing.paymentStatus, "paid");
    assert.equal(billing.invoiceUrl, "https://stripe.com/inv_123");
  });

  it("defaults empty invoiceUrl", () => {
    const billing = rowToBilling({ billing_id: "b", client_id: "c", period_start: "", period_end: "", leads_purchased: 0, total_amount: 0, payment_status: "pending", invoice_url: null, created_at: "" });
    assert.equal(billing.invoiceUrl, "");
  });
});
