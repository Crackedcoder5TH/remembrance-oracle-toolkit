# ValorLegacy

Veteran-founded life insurance lead generation platform for military families.

## Overview

ValorLegacy connects Active Duty, National Guard, Reserve, and Veteran service members with licensed insurance professionals. It captures qualified leads through a multi-step form with full TCPA/FCC 2025 compliance.

## Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **SQLite** (better-sqlite3) — Embedded lead storage
- **SMTP** — Lead confirmation and admin notification emails
- **SSE** — Real-time admin dashboard notifications

## Structure

```
digital-cathedral/
  app/                    Next.js App Router pages and API routes
    page.tsx              Home — multi-step lead capture form
    about/                About page
    privacy/              Privacy policy (CCPA/CPRA compliant)
    terms/                Terms of service
    admin/                Admin dashboard (lead management, export, stats)
    api/leads/            Lead submission + CCPA deletion endpoint
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

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Multi-Step Lead Capture** — 3-step form: Identity, Contact, Consent
- **TCPA/FCC 2025 Compliance** — One-to-one consent with full audit trail
- **CCPA/CPRA Compliance** — Data deletion endpoint, cookie consent, Do Not Sell link
- **Bot Protection** — Honeypot fields + timing-based detection
- **CSRF Protection** — Double-submit cookie pattern
- **Lead Scoring** — Weighted scoring algorithm for lead prioritization
- **Admin Dashboard** — Real-time lead management with CSV export
- **Email Notifications** — SMTP confirmation emails + admin alerts
- **Webhook Support** — Configurable webhook delivery with HMAC signatures
- **PWA-Ready** — Service worker + manifest for mobile installation
- **Accessibility** — WCAG 2.1 AA compliant, keyboard navigation, screen reader support

## License

MIT
