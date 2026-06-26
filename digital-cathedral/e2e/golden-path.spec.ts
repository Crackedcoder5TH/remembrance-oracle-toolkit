import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";

/**
 * Golden path — the load-bearing buyer flow, end to end against the running app:
 *
 *   submit lead → admin sees it → buyer registers (both cookies) → session authed
 *   → Stripe webhook fulfils a purchase → ledger records it → LOGOUT → no access
 *
 * The logout step is the regression guard for the cookie bug: register/login mint
 * BOTH __portal_session and __client_session, so logout must clear BOTH. We assert
 * the logout response clears both cookies AND that the portal session reports
 * signed-out afterward (the symptom the bug would have left live).
 */

const ADMIN_KEY = "e2e-admin-key";
const WEBHOOK_SECRET = "whsec_e2e_test_secret";
const admin = { headers: { authorization: `Bearer ${ADMIN_KEY}` } };

// Unique per run so re-runs don't collide on the email unique constraint.
const STAMP = Date.now().toString(36);
const buyerEmail = `e2e-buyer-${STAMP}@example.com`;
const leadEmail = `e2e-lead-${STAMP}@example.com`;

function leadBody() {
  return {
    firstName: "Dana",
    lastName: "Rivera",
    email: leadEmail,
    phone: "5125550143",
    dateOfBirth: "1985-04-12",
    state: "TX",
    coverageInterest: "final-expense",
    purchaseIntent: "protect-family",
    veteranStatus: "non-military",
    tcpaConsent: true,
    privacyConsent: true,
    consentTimestamp: new Date().toISOString(),
    consentText: "I agree to be contacted by a licensed agent at the number provided (TCPA).",
  };
}

function setCookieNames(res: { headersArray(): { name: string; value: string }[] }) {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
}

test.describe.serial("Valor Legacies — golden path", () => {
  let ctx: APIRequestContext;
  let csrf = "";
  let leadId = "";
  let clientId = "";

  // Mutating endpoints use the double-submit CSRF pattern: GET /api/csrf sets the
  // __csrf cookie (carried by the context jar) and returns the token, which must
  // be echoed in the x-csrf-token header.
  const csrfHeaders = (extra: Record<string, string> = {}) => ({ "x-csrf-token": csrf, ...extra });

  test.beforeAll(async () => {
    ctx = await pwRequest.newContext({ baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 3210}` });
    const res = await ctx.get("/api/csrf");
    expect(res.ok(), await res.text()).toBeTruthy();
    csrf = (await res.json()).token;
    expect(csrf).toBeTruthy();
  });
  test.afterAll(async () => { await ctx.dispose(); });

  test("1 · prospect submits a lead", async () => {
    const res = await ctx.post("/api/leads", { headers: csrfHeaders(), data: leadBody() });
    expect(res.status(), await res.text()).toBe(200);
  });

  test("2 · admin sees the lead", async () => {
    const res = await ctx.get("/api/admin/leads?limit=100", admin);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const leads = body.leads ?? body.data ?? body ?? [];
    const mine = (Array.isArray(leads) ? leads : []).find((l: { email?: string }) => l.email === leadEmail);
    expect(mine, "submitted lead should appear in the admin list").toBeTruthy();
    leadId = mine.leadId ?? mine.id;
    expect(leadId).toBeTruthy();
  });

  test("3 · buyer registers and gets BOTH session cookies", async () => {
    const res = await ctx.post("/api/portal/register", {
      headers: csrfHeaders(),
      data: { email: buyerEmail, password: "e2e-passw0rd!", firstName: "Sam", lastName: "Buyer", state: "TX" },
    });
    expect(res.status(), await res.text()).toBe(200);
    const cookies = setCookieNames(res).join("\n");
    expect(cookies).toContain("__portal_session");
    expect(cookies).toContain("__client_session");
  });

  test("4 · the portal session is authenticated", async () => {
    const res = await ctx.get("/api/portal/session");
    expect(res.status()).toBe(200);
    expect((await res.json()).authenticated).toBe(true);
  });

  test("5 · admin can resolve the new buyer's clientId", async () => {
    const res = await ctx.get("/api/admin/clients", admin);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const clients = body.clients ?? body.data ?? body ?? [];
    const mine = (Array.isArray(clients) ? clients : []).find((c: { email?: string }) => c.email === buyerEmail);
    expect(mine, "registered buyer should appear in admin clients").toBeTruthy();
    clientId = mine.clientId ?? mine.id;
    expect(clientId).toBeTruthy();
  });

  test("6 · a signed Stripe webhook fulfils the purchase", async () => {
    const stripe = new Stripe("sk_test_e2e", { apiVersion: "2024-06-20" as Stripe.LatestApiVersion });
    const event = {
      id: `evt_e2e_${STAMP}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_e2e_${STAMP}`,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 6000,
          metadata: {
            clientId,
            leadId,
            exclusive: "false",
            price: "6000",
            tierName: "Cool Shared",
            maxBuyers: "4",
          },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await ctx.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      data: payload,
    });
    expect(res.status(), await res.text()).toBe(200);
  });

  test("7 · the purchase reaches the ledger", async () => {
    const res = await ctx.get("/api/admin/ledger", admin);
    expect(res.ok(), await res.text()).toBeTruthy();
    const text = await res.text();
    // The covenant ledger records the fulfilment; the lead id is the durable ref.
    expect(text).toContain(leadId.slice(0, 12));
  });

  test("8 · logout clears BOTH session cookies (the regression guard)", async () => {
    const res = await ctx.post("/api/portal/logout", { headers: csrfHeaders() });
    expect(res.status()).toBe(200);
    const cleared = setCookieNames(res);
    const portal = cleared.find((c) => c.startsWith("__portal_session="));
    const client = cleared.find((c) => c.startsWith("__client_session="));
    expect(portal, "logout must clear __portal_session").toBeTruthy();
    expect(client, "logout must clear __client_session — the bug left this alive").toBeTruthy();
    // Cleared cookies carry an empty value and an immediate expiry.
    expect(portal).toMatch(/__portal_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(client).toMatch(/__client_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  test("9 · after logout, the portal session is gone", async () => {
    const res = await ctx.get("/api/portal/session");
    expect(res.status()).toBe(401);
    expect((await res.json()).authenticated).toBe(false);
  });
});
