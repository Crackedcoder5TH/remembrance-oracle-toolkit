/**
 * Stripe Server-Side Configuration
 *
 * Initializes the Stripe SDK for server-side usage (API routes, webhooks).
 * Uses STRIPE_SECRET_KEY from environment variables.
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});
