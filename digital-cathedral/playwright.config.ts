import { defineConfig } from "@playwright/test";

/**
 * E2E config — drives the real Next.js app over HTTP.
 *
 * The golden-path suite is API-level (Playwright's `request` fixture, no
 * browser needed), so it pins the backend contract: lead intake → admin
 * visibility → buyer auth → Stripe webhook fulfilment → ledger → logout.
 *
 * The webServer runs `next dev` with SQLite (no DATABASE_URL) and the env the
 * flow needs: an admin key (bearer), a client-session secret, and a Stripe
 * webhook secret so the test can post a properly-signed event.
 */
const PORT = Number(process.env.E2E_PORT || 3210);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    extraHTTPHeaders: { "content-type": "application/json" },
  },
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: "development",
      ADMIN_API_KEY: "e2e-admin-key",
      CLIENT_SESSION_SECRET: "e2e-client-secret-please-rotate",
      STRIPE_WEBHOOK_SECRET: "whsec_e2e_test_secret",
      // Test key only — constructEvent verifies the signature locally (no
      // network); the SDK just needs a key to initialize.
      STRIPE_SECRET_KEY: "sk_test_e2e_placeholder",
      // Keep the field/email/sms side-effects quiet and offline.
      REMEMBRANCE_FIELD_URL: "",
    },
  },
});
