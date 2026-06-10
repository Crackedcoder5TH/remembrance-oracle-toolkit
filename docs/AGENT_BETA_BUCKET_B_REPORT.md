# Agent-Beta Bucket B Report — API Route Coherency Audit

Branch: `claude/audit-remembrance-ecosystem-xaaUr`
Scope: 8 API routes flagged INCONSISTENT in `docs/website-fix-map.json` → `buckets.B`.

## Per-route findings

### 1. `app/api/webhooks/stripe/route.ts` → `website/app/api/admin/clients/route.ts` @ 0.989
- **Category:** INTENTIONAL-COUSIN (false-positive shape match)
- **Action:** LEAVE-BE
- **Notes:** The Stripe webhook does signature verification via
  `stripe.webhooks.constructEvent`, dispatches on `checkout.session.completed`
  / `async_payment_succeeded`, and calls `fulfillCheckoutSession`. It has no
  auth gate — it relies on the HMAC signature. The cousin (`admin/clients`)
  is a bearer-auth CRUD route. The 0.989 similarity is from shared
  `NextRequest/NextResponse` boilerplate, `req.text()` body parsing, and
  early-return error-shape patterns — not from shared semantics. No
  embedded auth flow to extract; no hidden duplication. Architecturally
  distinct and correctly placed under `webhooks/`.

### 2. `app/api/image/route.ts` → `oracle/src/auth/teams.js` @ 0.965
- **Category:** INTENTIONAL-COUSIN (false-positive)
- **Action:** LEAVE-BE
- **Notes:** Image route is a thin Vercel Blob proxy: validates `slot`
  against an allowlist, `list()` + `get()` + streams the blob with a
  `Cache-Control` header. The cousin is in a completely different
  language (JS) and domain. The score comes from shared "validate input,
  fetch resource, stream/return" structure. Correctly categorized as
  `api/other`.

### 3. `app/api/csrf/route.ts` → `rmb-interface/src/app/layout.tsx` @ 0.984
- **Category:** INTENTIONAL-COUSIN (false-positive — 17-line file)
- **Action:** LEAVE-BE
- **Notes:** Tiny endpoint (17 lines) that generates a CSRF token and
  sets it as an httpOnly cookie. Cousin is a Next.js root layout — both
  are short, declarative, single-purpose files which makes the embedding
  noisy. Implementation is canonical and matches `app/lib/csrf.ts`.

### 4. `app/api/agent/schema/route.ts` → `solana/transaction-status/parse_accounts.rs` @ 0.965
- **Category:** INTENTIONAL-COUSIN (false-positive — large static data structure)
- **Action:** LEAVE-BE
- **Notes:** Serves an OpenAPI schema as a large object literal (260
  lines, 95% data). The cousin is a Rust file that also parses a
  schema-shaped structure. Same "static data declaration + getter"
  shape; no semantic relationship. The route correctly implements
  ETag/304 conditional GET and CORS for AI-agent discovery — well
  designed.

### 5. `app/api/admin/substrate/state/route.ts` → `oracle/src/core/covenant-checks.js` @ 0.967
- **Category:** **LEGITIMATE-BUG** (inverted auth check)
- **Action:** **REFACTORED**
- **Notes:** The route called `if (!verifyAdmin(req))` and returned 401
  inside that branch. But `verifyAdmin` returns `NextResponse | null`
  (null=success, NextResponse=error). The inverted check meant:
  - Authenticated admins → `!null = true` → got 401.
  - Unauthenticated callers → `!NextResponse = false` → execution
    continued into the substrate-state body, leaking field state,
    learned shapes, method registry, and Sun status without auth.
  Fixed to the canonical pattern used everywhere else in `api/admin/*`:
  `const authError = verifyAdmin(req); if (authError) return authError;`.
  The same inverted check existed in the sibling
  `app/api/admin/substrate/control/route.ts` (POST that can fire reflexes,
  trigger relaxes, and write to the field) — fixed there too. That sibling
  is not in Bucket B but shares the same root cause and severity; safer
  to fix together than to ship a half-patched substrate surface.

### 6. `app/api/admin/logout/route.ts` → `website/app/api/portal/logout/route.ts` @ 0.996
- **Category:** HIDDEN-DUPLICATION (legitimate but minor)
- **Action:** PROPOSED (not refactored — intentional separation)
- **Notes:** Admin-logout and portal-logout are 14-line files that are
  near-identical structurally — both clear a session cookie with
  `httpOnly/secure/sameSite=strict/maxAge=0`. They differ only in the
  cookie constant they reference (`ADMIN_SESSION_COOKIE` vs
  `PORTAL_SESSION_COOKIE`) because admin and portal use HMAC-distinct
  session systems with different secrets. A shared helper
  `clearSessionCookie(cookieName: string)` in `app/lib/session-cookies.ts`
  would DRY this, but the duplication is so small (7 lines each) and
  the architectural separation between admin and portal auth domains
  is so important that extracting feels like premature consolidation.
  Left as-is. Flagged for future review if a third session domain
  (e.g., agent-session) emerges.

### 7. `app/api/admin/leads/route.ts` → `oracle/src/core/pattern-uri-lookup.js` @ 0.982
- **Category:** INTENTIONAL-COUSIN (false-positive)
- **Action:** LEAVE-BE
- **Notes:** Admin-leads is a typical "auth → validate filters → fetch
  → enrich → return" CRUD handler. Cousin is an oracle pattern-URI
  lookup — different language, different domain. Shape match comes from
  the "filter-allowlist guard / fetch / map results / return JSON"
  shape that's common to many "list with filter" handlers. The route
  is correctly structured: uses `verifyAdmin` per canon, validates
  enums against `VALID_STATES/COVERAGE/VETERAN_STATUS`, caps search
  length, and the covenant-ledger enrichment is properly wrapped in
  try/catch with a "best-effort" comment.

### 8. `app/api/admin/events/route.ts` → `oracle/src/core/field-ingest.js` @ 0.942
- **Category:** INTENTIONAL-COUSIN (false-positive — SSE shape)
- **Action:** LEAVE-BE
- **Notes:** SSE endpoint for real-time admin notifications. Uses a
  ReadableStream with a 30s heartbeat, subscribes to `lead-events`, and
  cleans up on `req.signal.abort`. Cousin is field-ingest in the oracle
  — a continuous-feed module. Shape match is "subscribe / stream / fan
  out / cleanup-on-end", which is genuinely shared topology, but the
  semantics are unrelated. Auth flow uses the canonical
  `verifyAdmin` pattern with a token-query fallback for programmatic
  consumers; that's correct (cookie won't reach EventSource in all
  proxy paths).

## Most suspicious finding

**The inverted auth check in `app/api/admin/substrate/state/route.ts` and
`app/api/admin/substrate/control/route.ts`.** Authenticated admins were
locked out; unauthenticated callers could read the entire substrate state
(field coherence, entropy, cascade, learned shapes, methods) and could POST
to the control surface (fire-reflexes, trigger-relax, set-gate-mode,
temporal-snapshot) — i.e., write arbitrary field state from the public
internet. Severity: high; exploitability: trivial (just hit the URL with
no cookie/header). Likely an honest typo when the author refactored away
from a boolean-returning `verifyAdmin` to the current `NextResponse | null`
contract. The Stripe webhook was the prior suspect but turned out clean —
the substrate inversion is the real find.

## Build status

`cd digital-cathedral && npm run build` fails on `app/lib/auth-config.ts:15`
("Unused '@ts-expect-error' directive"). Verified by `git stash` that this
failure pre-exists Bucket B work (Agent-Alpha's surface or earlier).
Out-of-scope for Bucket B.
