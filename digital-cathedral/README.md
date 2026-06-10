# Valor Legacies

Veteran-founded life insurance lead generation and marketplace for military
families. Prospects fill a TCPA-compliant form on the public site; licensed
agencies buy scored leads through a separate operator/buyer portal.

```
www.valorlegacies.com  →  prospect lead capture  (PRIMARY)
www.valorlegacies.xyz  →  admin + buyer portal   (PORTAL)
other .xyz hosts       →  funnel to PRIMARY with src/from attribution
```

This is a Next.js 14 App Router app deployed to Vercel, backed by Postgres in
production (SQLite locally), with Stripe for purchases and an audit ledger
that writes in parallel to every lead row.

## Quickstart

```bash
cp .env.example .env.local
npm install
npm run dev
```

Without `DATABASE_URL` the app uses a local SQLite file. The lead form,
admin dashboard, and buyer portal all work locally; Stripe and email require
the relevant env vars to actually fire.

## Documentation altitude

This README is fractal. Read at the altitude you need:

- **L1 — what it is.** You just read it. Stop here if you're orienting.
- **L2 — what it does.** [Lead flow](#lead-flow), [domains](#domain-routing),
  [auth](#authentication), [features](#features-by-surface),
  [deploy](#deploy).
- **L3 — how it holds together.** The
  [architectural decisions](#architectural-decisions-l3) section. Read this
  before you change anything load-bearing.
- **L4 — where the code is.** [File map](#file-map), [env reference](#environment-variables),
  [status enums](#status-lifecycles), [test surface](#test-surface).
- **Recommendations.** [What I'd touch next](#recommendations) after a full
  audit pass.

---

## Lead flow

```
prospect  ─┐
           ▼
   /  (public lead form, 3 steps)
           │
           ▼  POST /api/leads
   ┌─────────────────────────┐
   │  validation             │  Zod-shaped, honeypot + timing bot check
   │  covenant gate          │  evaluateCovenant() — archetype coherency
   │  lead persisted         │  insertLead (returns Err on noop adapter)
   │  ledger appended        │  appendLedgerEntry (non-blocking)
   │  email + SMS dispatched │  fire-and-forget, circuit-broken
   └─────────────────────────┘
           │
           ▼
   admin sees it at /admin (SSE)
           │
           ▼
   buyer browses at /portal/marketplace, buys via Stripe Checkout
           │
           ▼
   /api/webhooks/stripe → idempotent fulfillment → ledger entry
```

The covenant gate runs **before** persistence. Bot/fraud submissions return
HTTP 200 with no signal (silent-reject), so an adversary can't distinguish
"my fake worked" from "my fake was caught." Low-coherency human submissions
soft-reject with an explanation.

## Domain routing

Routing is enforced in `middleware.ts` at the edge, before any page logic.

| Host pattern              | Type    | Behavior                                                                 |
| ------------------------- | ------- | ------------------------------------------------------------------------ |
| `valorlegacies.com`       | PRIMARY | Public lead form, marketing pages                                        |
| `www.valorlegacies.com`   | PRIMARY | Same as above                                                            |
| `valorlegacies.xyz`       | PORTAL  | Admin + buyer surfaces (`/admin/*`, `/portal/*`, login)                   |
| `www.valorlegacies.xyz`   | PORTAL  | Same as above                                                            |
| Other `.xyz` hosts        | VIRAL   | 302 → `https://www.valorlegacies.com/?src=<host>&from=<path>`            |

The PORTAL check runs before the `.xyz` catch-all so the operator domain is
never funneled. VIRAL attribution is captured into lead rows as `latticeSrc`
and `latticeFrom` so we can later measure which hosts converted.

## Authentication

Four auth surfaces coexist by design — they protect different boundaries.

| Surface                | Mechanism                                | Where                                              |
| ---------------------- | ---------------------------------------- | -------------------------------------------------- |
| Admin (browser)        | Google OAuth → `__admin_session` cookie  | `app/api/auth/*`, `app/lib/admin-session.ts`        |
| Admin (programmatic)   | `ADMIN_API_KEY` bearer, constant-time     | `app/lib/admin-auth.ts`                            |
| Buyer portal           | `__portal_session` (HMAC-signed)         | `app/lib/portal-session.ts`                        |
| Buyer client API       | `__client_session` (HMAC-signed)         | `app/lib/client-auth.ts`                           |

Buyer registration mints **both** the portal and client cookies. See the
[dual-cookie register fix](#dual-cookie-register-fix-buyer-debt) under
recommendations.

## Features by surface

### `/` (public, `.com`)

- 3-step lead form (Identity → Contact → Consent)
- TCPA/FCC 2025 one-to-one consent with the **exact consent text** stored
  in the lead row at submission time
- Honeypot + submission-timing bot detection
- CCPA/CPRA Do-Not-Sell flow at `/do-not-sell`
- PWA manifest + service worker

### `/admin` (PORTAL, Google OAuth or API key)

- **Dashboard** — leads table, source filter (human/agent/lattice),
  CSV export with attribution columns, Real-time SSE event stream
- **Clients** — buyer roster, license verification (pending→active),
  approval/suspension flow with email side-effects
- **Field** — `/admin/field`, the fractal control surface: lead/buyer
  stats, substrate field coherence, env readiness, recent ledger entries,
  jump-links to every sub-surface
- **Seed** — `/admin/seed`, dev-only test data tool

### `/portal` (PORTAL, buyer login)

- Marketplace with filter + sort
- Stripe Checkout for purchase (card / ACH / Cash App)
- 72-hour return window with admin review
- Messaging thread per lead
- Daily/monthly purchase caps enforced server-side

### API namespaces

| Path                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `/api/leads`             | Public lead submission, CCPA deletion                    |
| `/api/agent/leads`       | Programmatic lead submission, API-key authed             |
| `/api/admin/*`           | Admin surface (leads, stats, export, events, field, ops) |
| `/api/portal/*`          | Buyer session, register, login, dashboard data           |
| `/api/client/*`          | Buyer marketplace, purchase, returns, filters            |
| `/api/webhooks/stripe`   | Idempotent purchase fulfillment from Stripe events       |
| `/api/csrf`              | Double-submit cookie token mint                          |
| `/api/health`            | Liveness + DB ping                                       |
| `/api/coherency-vitals`  | Field coherence ping for upstream monitors               |

## Deploy

Production targets Vercel. The minimum env set:

```
DATABASE_URL          # Supabase pooler URL with ?sslmode=require
ADMIN_API_KEY         # Comma-separated for rotation: "new,old"
```

Recommended additions:

```
NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   # Google admin login
ADMIN_EMAILS                                              # Comma-separated allowlist
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                  # Purchase pipeline
SMTP_HOST/PORT/USER/PASS, ADMIN_EMAIL                     # Notifications
TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM                        # SMS confirmation
SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN                        # Error monitoring
PORTAL_DOMAIN=valorlegacies.xyz                           # Portal host
PRIMARY_DOMAIN=valorlegacies.com                          # Prospect host
```

DNS: point both apex + `www` of both domains at the Vercel project. Stripe
webhook endpoint: `https://www.valorlegacies.xyz/api/webhooks/stripe`. Vercel
KV (rate-limit backend) and Vercel Blob (covenant ledger) are recommended but
optional — both degrade gracefully when missing.

---

## Architectural decisions (L3)

These are the decisions you should understand before changing anything. Each
is a load-bearing piece of the system's shape.

### Covenant gate runs before persistence

`evaluateCovenant()` is called on every lead submission **before** the row
is written. The verdict determines what happens next:

- `accept` — persist + notify
- `soft-reject-low` — return 422 with a recoverable explanation
- `silent-reject-bot` / `silent-reject-fraud` — return 200 with no signal

The silent-reject path is deliberate: an attacker probing the form sees
exactly the same response as a real user. There's no oracle.

`app/api/leads/route.ts:129`, gate impl in `app/lib/valor/covenant-gate.ts`.

### Covenant ledger is a parallel writer

Every accepted submission writes twice: once to the lead DB, once to the
covenant ledger via `appendLedgerEntry()`. The ledger write is non-blocking
and degrades gracefully when storage is unavailable. The pattern is the same
one banks use for transaction logs — a tamper-evident audit trail that
survives DB drift.

`app/lib/valor/lead-ledger.ts`.

### TCPA consent text lives in the lead row

The consent text the user saw at submission time is stored **in the row**,
not in a config table. A consent template change three months from now does
not retroactively rewrite history. If a regulator subpoenas the consent
record for a specific lead, what they get is exactly what that user agreed
to on that day.

### Admin API key uses constant-time comparison

`app/lib/admin-auth.ts:124` — `safeEqual()` wraps `crypto.timingSafeEqual`.
String `===` short-circuits on the first mismatch; an attacker measuring
response time can extract the key one character at a time. Constant-time
defeats this by walking the full buffer regardless of where (or if) the
mismatch occurs. The function also supports comma-separated keys for
zero-downtime rotation.

### Stripe webhook fulfillment is idempotent

Stripe will retry webhook deliveries on any non-2xx. The webhook handler
uses the Stripe event ID as an idempotency key, so a replayed event does
not re-charge or re-fulfill. The fulfillment write to the ledger is also
idempotent.

`app/api/webhooks/stripe/route.ts`, `app/lib/purchase-fulfillment.ts`.

### CSRF is double-submit cookie

`/api/csrf` mints a token bound to a session-scoped cookie. Mutating
endpoints require the token in a header that the cookie value matches. No
library dependency, no server-side token store — the defense is purely in
the shape of the request.

`app/lib/csrf.ts`.

### Rate limiting degrades from Vercel KV to per-Lambda

When Vercel KV is linked, rate limits are shared across all Lambdas. When
it isn't, each Lambda keeps an in-memory limit (less strict, but still
non-zero). Lead form: 5/min/IP. Registration: 3/min/IP. Login: 5/min/IP.

`app/lib/rate-limit.ts`.

### NoopAdapter returns Err in production

If `DATABASE_URL` is missing in production, `insertLead()` returns `Err`,
not `Ok`. The form visibly breaks instead of silently dropping leads. In
development the SQLite adapter is the default, so this only fires in a
mis-configured production environment.

`app/lib/database.ts`.

### Buyer verification lifecycle: pending → active

`/api/portal/register` creates buyers with `status: "pending"`. They can
sign in (both cookies are minted) but `verifyClient` only authorizes
`status === "active"`, so all `/api/client/*` calls 401 with an
"awaiting verification" banner on the dashboard. Admin approves at
`/admin/clients`, which fires `sendBuyerApprovedEmail` exactly on
pending → active. Other transitions (re-save, reactivation, suspension)
do not retrigger the email. See `tests/buyer-verification.test.js` for
the eight scenarios that pin this rule.

`app/api/admin/clients/[id]/route.ts`, `app/lib/email.ts`.

### Lattice attribution is a non-exclusive cut

`LeadFilters.source` enum is `human | agent | lattice` but a single lead
can carry attribution from more than one of these. The CSV export keeps
them as separate columns rather than collapsing them, so post-hoc analysis
can slice attribution any way it wants. `latticeSrc` and `latticeFrom`
are persisted from the VIRAL domain redirect's query params.

`app/lib/database.ts`, `app/api/admin/export/route.ts`.

### Field substrate as a control surface

`/admin/field` renders a unified view computed by `/api/admin/field`, which
fans out `getLeadStats`, `getClientStats`, `readDiagnostic`,
`listLedgerMonths`, `readRecentEntries`, and `peekField` in `Promise.all`.
The page surfaces L1 (hero coherence + readiness), L2 (source split,
pipeline, substrate, ledger), and L3 (top contributors, env readiness,
recent entries). Same fractal altitude pattern as this README.

`app/admin/field/page.tsx`, `app/api/admin/field/route.ts`.

---

## File map (L4)

```
digital-cathedral/
├── app/
│   ├── page.tsx                      Lead capture form
│   ├── admin/
│   │   ├── page.tsx                  Dashboard
│   │   ├── field/page.tsx            Fractal control surface
│   │   ├── clients/page.tsx          Buyer roster + verification
│   │   ├── seed/page.tsx             Dev seed tool
│   │   └── login/                    Google + API-key entry
│   ├── portal/
│   │   ├── dashboard/page.tsx        Buyer dashboard (status-gated)
│   │   ├── marketplace/page.tsx      Lead browse + buy
│   │   ├── register/page.tsx         Buyer signup
│   │   └── login/page.tsx            Buyer login
│   ├── api/
│   │   ├── leads/route.ts            Public lead submission
│   │   ├── agent/leads/route.ts      Programmatic submission
│   │   ├── admin/                    Admin API surface
│   │   ├── portal/                   Buyer portal API
│   │   ├── client/                   Buyer client API
│   │   ├── webhooks/stripe/route.ts  Idempotent fulfillment
│   │   └── csrf/route.ts             Token mint
│   └── lib/
│       ├── valor/                    Covenant gate, ledger, archetype map
│       ├── database.ts               Lead persistence (PG + SQLite)
│       ├── client-database/          Buyer record persistence
│       ├── admin-auth.ts             Constant-time bearer + session
│       ├── csrf.ts                   Double-submit token
│       ├── rate-limit.ts             KV-or-Lambda degradation
│       ├── email.ts                  SMTP + circuit-breaker fallbacks
│       ├── ops-snapshot.ts           Env + readiness diagnostic
│       └── ...
├── middleware.ts                     Domain routing at the edge
├── tests/                            Node test runner
└── packages/shared/                  Shared types + validation
```

## Environment variables

Grouped by what they unlock. Absent variables degrade rather than crash;
`/api/health` and `/admin/field` will tell you what's missing.

**Required**

- `DATABASE_URL` — Postgres connection string (production)
- `ADMIN_API_KEY` — bearer key, comma-separated for rotation

**Domains**

- `PRIMARY_DOMAIN`, `PORTAL_DOMAIN`, `VIRAL_LATTICE_DOMAINS`,
  `NEXT_PUBLIC_PORTAL_URL`

**Admin login**

- `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`

**Purchases**

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`

**Notifications**

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`

**Substrate**

- `HOST_REGISTRY_DIR`, `PROVENANCE_SECRET`, field server URL (optional —
  `/admin/field` degrades when unreachable)

**Observability**

- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`

## Status lifecycles

**Lead** (`app/lib/database.ts`):
`new → qualified → sold → returned → archived`

**Buyer** (`app/lib/client-database/types.ts`):
`pending → active → suspended → closed`

Only `pending → active` fires the approval email. `suspended → active`
(reactivation) does not, by design.

## Test surface

```bash
npm test                              # node --test
npm run test:e2e                      # Playwright (currently empty)
npm run typecheck                     # tsc --noEmit
npm run lint                          # next lint
```

Notable suites:

- `tests/buyer-verification.test.js` — status union + email transition rule
- `tests/covenant-gate.test.js` — verdict matrix
- `tests/lead-scoring.test.js` — weighted scoring fixtures
- `tests/csrf.test.js` — double-submit pattern
- `tests/rate-limit.test.js` — KV + Lambda degradation

---

## Recommendations

After a full audit pass, these are the items I'd queue, ordered by what
each costs to leave in.

### Consolidate auth surfaces (medium debt, low risk)

Four auth methods exist (Google OAuth, HMAC admin session, bearer token,
NextAuth JWT in middleware). For a single-operator + buyer-pool system,
the steady state is Google OAuth for humans + `ADMIN_API_KEY` for
programmatic. The HMAC admin session and the NextAuth JWT path can be
deleted once Google OAuth is stable in production. Plan the deletion;
don't do it under pressure.

### Dual-cookie register fix (buyer debt)

`/api/portal/register` mints `__portal_session` and `__client_session`
because two parallel buyer-auth systems coexist. The comment in the
register route explains exactly why. Long-term fix: unify on one cookie
+ one verifier, delete the other. Short-term: the current dual-mint is
correct and tested — leave it until the auth consolidation above is done.

### Coherency mapper ORPHAN threshold (tool miscalibration)

The coherency mapper flags 55 files in `app/lib/` as ORPHAN. Many of those
files (`stripe.ts`, `password.ts`, `email.ts`) intentionally don't
structurally resemble each other — they wrap orthogonal subsystems. The
fix is to relax the mapper's ORPHAN threshold for the `lib` category, not
to restructure the library. This is a toolkit-side change, not a website
change.

### Playwright coverage (zero today)

The `playwright.config.ts` exists but the suite is empty. The golden path
worth pinning first: prospect submits → row in DB → admin sees it → buyer
buys → Stripe webhook → ledger entry. That single E2E test would catch
any regression in the load-bearing flow.

### Monitoring (no signal today)

`SENTRY_DSN` slots are present but unset. Without Sentry, the only
production signal is Vercel logs + `/api/health`. At launch, set Sentry
and route covenant-gate silent rejects to a separate breadcrumb so
abnormal bot pressure is visible.

### A/B infrastructure (deferred)

The A/B harness was deleted because nothing was wired up. Leave it
deleted until there's actual hypothesis volume to test against. A/B
infrastructure with no experiments is just dead code.

### Field server deployment

`/admin/field` degrades gracefully when the Remembrance field server is
unreachable, but the substrate panel goes blank. Deploying the field
server next to the website (or co-hosting in the same Vercel project)
turns the substrate panel into actionable signal rather than a "field
offline" placeholder.

---

## License

MIT
