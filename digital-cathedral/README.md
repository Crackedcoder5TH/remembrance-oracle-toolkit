# Valor Legacies

Veteran-founded life insurance lead generation and marketplace platform for military families.

## Overview

Valor Legacies connects Active Duty, National Guard, Reserve, and Veteran service members with licensed insurance professionals. It captures qualified leads through a multi-step form with full TCPA/FCC 2025 compliance, and runs a marketplace where licensed agencies purchase those leads.

## Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **PostgreSQL** (production) / **SQLite** via better-sqlite3 (local dev) — dual-mode persistence, selected by `DATABASE_URL`
- **Stripe** — Checkout sessions for lead purchases, fulfilled idempotently via webhooks
- **SMTP + Twilio SMS** — lead confirmation and admin notifications
- **SSE** — real-time admin dashboard notifications

## Structure

```
digital-cathedral/
  app/                    Next.js App Router pages and API routes
    page.tsx              Home — multi-step lead capture form
    admin/                Admin dashboard (lead management, export, stats)
    portal/               Buyer portal (lead marketplace, purchases, messaging)
    api/leads/            Lead submission + CCPA deletion endpoint
    api/agent/            Programmatic lead submission (API-key authed)
    api/client/           Buyer auth, lead purchase, returns, filters
    api/portal/           Buyer portal session + client/admin messaging
    api/webhooks/stripe/  Stripe webhook — idempotent purchase fulfillment
    api/admin/            Admin API (leads, stats, CSV export, SSE events)
    api/csrf/             CSRF token endpoint
    api/health/           Health check
  packages/
    shared/               Shared types, validation, and utilities
```

## Getting Started

```bash
cp .env.example .env.local   # Configure environment variables
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without `DATABASE_URL` set, the app uses a local SQLite database.

## Features

### Lead Capture

- **Multi-Step Lead Capture** — 3-step form: Identity, Contact, Consent
- **TCPA/FCC 2025 Compliance** — One-to-one consent with full audit trail
- **CCPA/CPRA Compliance** — Data deletion endpoint, cookie consent, Do Not Sell link
- **Bot Protection** — Honeypot fields + timing-based detection
- **Lead Scoring** — Weighted scoring algorithm for lead prioritization

### Lead Marketplace

- **Buyer Portal** — Licensed agencies browse, filter, and purchase scored leads
- **Stripe Checkout** — Card / ACH / Cash App payment, fulfilled idempotently server-side
- **Tiered Pricing** — Exclusive, Semi-Exclusive, Warm Shared, and Cool Shared tiers, each with a buyer cap and time-based price depreciation
- **Purchase Caps** — Per-buyer daily and monthly limits
- **72-Hour Returns** — Buyers can dispute a lead within the return window
- **Portal Messaging** — Client/admin messages

### Platform

- **CSRF Protection** — Double-submit cookie pattern on mutating endpoints
- **Admin Dashboard** — Real-time lead management with CSV export
- **Email + SMS Notifications** — SMTP confirmation emails, Twilio SMS alerts
- **Outbound Webhooks** — Configurable webhook delivery with HMAC signatures
- **PWA-Ready** — Service worker + manifest for mobile installation
- **Accessibility** — WCAG 2.1 AA compliant, keyboard navigation, screen reader support

## License

MIT
