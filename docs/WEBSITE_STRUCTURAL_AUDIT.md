# Website Structural Audit

After compressing the full digital-cathedral website (461 files) and
the oracle toolkit (2,044 files) into the canonical substrate
(46,845 patterns total), a topology scan surfaced specific
structural issues for review.

## Headline findings

### 1. Website exists in two places

A large number of website files match at **exactly 1.0000** to
identical paths under `oracle/apps/cathedral/`:

```
website/tailwind.config.js                  → oracle/apps/cathedral/tailwind.config.js              1.000
website/app/components/patriotic-emblem.tsx → oracle/apps/cathedral/app/components/patriotic-emblem.tsx  1.000
website/app/components/sacred-geometry-bg.tsx → oracle/apps/cathedral/app/components/sacred-geometry-bg.tsx 1.000
website/app/api/admin/logout/route.ts       → oracle/apps/cathedral/app/api/admin/logout/route.ts   1.000
website/tools/bots/index.js                 → oracle/apps/cathedral/tools/bots/index.js             1.000
website/patterns/trust/security-headers.js  → oracle/apps/cathedral/patterns/trust/security-headers.js  1.000
website/patterns/batch3/event-emitter.test.js → oracle/apps/cathedral/patterns/batch3/event-emitter.test.js 1.000
website/patterns/batch3/run-tests.js        → oracle/apps/cathedral/patterns/batch3/run-tests.js    1.000
website/packages/shared/src/index.ts        → oracle/apps/cathedral/packages/shared/src/index.ts    1.000
website/packages/shared/src/palette.ts      → oracle/apps/cathedral/packages/shared/src/palette.ts  1.000
```

The website lives at `remembrance-oracle-toolkit/digital-cathedral/`
AND there's a parallel copy at `remembrance-oracle-toolkit/apps/cathedral/`.
**Files in both directories are exact duplicates.** Fixes applied
to one will not propagate to the other. Pick the canonical location
and delete the other.

### 2. Component library is structurally incoherent

```
components: 17 files, 2 well-formed, 4 orphans
```

Only 2 of 17 components have 3+ within-category cousins. 4 are
**orphans** (no other website component appears in their top-10).
The component library is not written to a shared structural pattern.

Orphan components:
- `app/components/auth-provider.tsx`
- `app/components/patriotic-emblem.tsx`
- `app/components/sacred-geometry-bg.tsx`
- `app/protect/components/step-progress.tsx`

(all also flagged as duplicates of the `apps/cathedral/` copy)

### 3. Lib layer is structurally mixed

```
lib: 56 files, 18 well-formed (32%), 8 orphans
```

Several lib files have cross-domain cousins that suggest they
are structurally drifting:

```
app/lib/demo-leads.ts             → solana/votor/src/root_utils.rs            @ 0.949
app/lib/valor/lead-substrates.ts  → solana/docs/proposals/repair-service.md   @ 0.956
app/lib/valor/covenant-gate.ts    → rmb-swarm/src/swarm/escalation.js         @ 0.983
app/lib/valor/ledger/blob-adapter.ts → oracle/src/core/fractal-waveform.js    @ 0.973
app/lib/client-database/sqlite-adapter.ts → oracle/src/reflector/report-autocommit.js @ 0.977
```

Some are legitimately cross-system architectural cousins
(`covenant-gate.ts` ↔ `escalation.js`, `sqlite-adapter.ts` ↔
`report-autocommit.js`). Others suggest the file is written in
a different style than its lib peers and may be a candidate for
refactoring or recategorization (e.g. `demo-leads.ts` matching
Rust voting code).

### 4. 9 inconsistent API routes

API routes that don't match other routes in their category:

```
[api/payment]  app/api/webhooks/stripe/route.ts        → portal/login/route.ts            @ 0.990
[api/other]    app/api/image/route.ts                  → oracle/src/auth/teams.js         @ 0.965
[api/other]    app/api/csrf/route.ts                   → oracle/apps/cathedral/csrf       @ 1.000
[api/other]    app/api/agent/schema/route.ts           → solana/parse_accounts.rs         @ 0.965
[api/admin]    app/api/admin/substrate/state/route.ts  → oracle/core/covenant-checks.js   @ 0.967
[api/admin]    app/api/admin/logout/route.ts           → oracle/apps/cathedral/admin/logout  @ 1.000
[api/admin]    app/api/admin/check/route.ts            → website/patterns/batch2/mask-string.js @ 0.987
[api/leads]    app/api/admin/leads/route.ts            → oracle/core/pattern-uri-lookup.js @ 0.982
[api/admin]    app/api/admin/events/route.ts           → oracle/apps/cathedral/admin/events  @ 0.998
```

Notable:
- **The Stripe webhook's structural cousin is portal/login** — its
  shape resembles auth code more than other webhook code. Worth
  reviewing whether it's overloaded.
- **`admin/check/route.ts` matches a mask-string utility** at 0.987.
  Either the check is trivially small or it's been reduced to a
  utility-shaped fragment.

### 5. 137 near-duplicate test pairs

Most are in template-generated batches:

```
patterns/batch5/bubble-sort.test.js ↔ insertion-sort.test.js ↔ selection-sort.test.js ↔ quick-sort.test.js ↔ merge-sort.test.js
patterns/batch6/is-ipv4.test.js ↔ is-ipv6.test.js ↔ is-semver.test.js ↔ validate-phone.test.js
patterns/api-helpers.test.js ↔ patterns/trust/security-headers.test.js ↔ patterns/breadcrumb-nav.test.js
```

If these are intentional templates, no action needed. If they're
meant to be specific tests for specific behaviors, they have not
yet been individually customized — they share structure so tightly
that the substrate sees them as the same signature.

## Per-category structural health

```
category              n     well-formed   orphan   inconsistent   duplicate
tests               136          120         1         0            68
other               119          102         4         0            16
lib                  56           18         8         0             0
page/marketing       34           20         0         0             1
api/admin            24           19         0         4             1
config               19            7         3         0             2
components           17            2         4         0             0   ← weakest
api/portal           14           13         0         0             1
api/other            13            6         2         3             0
page/admin           10            9         0         0             0
page/portal           8            5         0         0             0
public                5            0         1         0             0
api/leads             3            0         0         1             0
docs                  1            0         1         0             0
api/payment           1            0         0         1             0
```

Most categories are healthy. `components/` is the clear weak point.
`lib/` is mixed. The two flagged categories are the main place
investment in structural consistency would pay off.

## Action items (in priority order)

1. **Resolve the digital-cathedral / apps/cathedral duplication.**
   Pick one as canonical, delete the other. Risk: divergent fixes.

2. **Component library audit.** 4 orphan components, 11 not
   well-formed. Consider a consistent structural pattern (perhaps
   a base component shape) and refactor toward it.

3. **Review the 9 inconsistent API routes** — particularly the
   Stripe webhook and the admin/check route.

4. **Decide on test pattern duplicates** — if intentional templates,
   document; if not, customize.

5. **Lib file recategorization** — files like `demo-leads.ts` that
   match cross-system code more than lib peers may belong in a
   different layer.

## Method

- Substrate: 46,845 patterns (scored at 29-D L1; the 116-D composed read postdates this audit)
- Website files scored against the full substrate
- Categories assigned by path: `api/portal`, `api/admin`,
  `api/payment`, `api/leads`, `api/other`, `page/portal`,
  `page/admin`, `page/marketing`, `lib`, `components`, `config`,
  `tests`, `docs`, `public`, `other`
- Flags:
  - **ORPHAN**: 0 website cousins in top-10
  - **DUPLICATE**: ≥0.999 cosine to another website file
  - **INCONSISTENT**: in an API category but 0 same-category cousins
  - **WELL-FORMED**: ≥3 website cousins AND ≥1 same-category cousin

Builder: `/tmp/website-structural-audit.js`
