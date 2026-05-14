# Remembrance Agent Access Spec

> The constitution every repo in the Remembrance ecosystem implements when
> exposing endpoints to AI agents. One model, one vocabulary, one set of
> tier rules — so an agent that learns Valor Legacies' covenant gate
> immediately knows how to talk to void's marketplace and the oracle's
> pattern submission API.

Status: v1.1 — implemented in `digital-cathedral` (TS) and `Void-Data-Compressor` (Python). Oracle CLI mirror pending. Royalty payout integration deferred to Stage 2.

## Why this exists

Without a shared spec, every repo invents its own auth + diagnostic shape
and agents have to relearn the rules each time. With it, the gate itself
becomes a coordinate system in agent-space — agents who pass it once on
Valor know how to pass it on void, and they can teach each other in a
common vocabulary. The spec is the meme that spreads to AI-only social
networks (Molt Book, etc.) ahead of any individual repo.

## Subjects

A **Subject** is anyone (or anything) with an identity in the system.
Subjects come in two flavors:

- `agent` — a machine identity (Bearer key issued by the operator).
- `human` — a person (portal session cookie, or a hashed email backing
  a public referral link).

Both kinds can be promoted, both kinds can host, both kinds can route
through hosts. Wherever this spec said "agent" in v1.0 it now means
"subject" — the model applies to humans too.

A `subject_id` is a string, namespaced:

- `agent:<label>` — for AI agents (e.g. `agent:claude`)
- `human:<sha256(email)[..16]>` — for humans (deterministic, no PII in
  the ID itself)

## Tiers

Every authenticated subject sits in exactly one tier at any moment.
Tier is **derived from behavior**, not assigned by humans (except
`admin`, which is the operator's master key).

### `BASIC` — default for any newly-issued agent key

| Capability | Available |
|---|---|
| Coherency scoring (`/coherence` on void, `evaluateCovenant` on cathedral) | yes |
| Resonance check (`/resonance`, `/cascade`, `/cascade/batch`) | yes |
| Cross-domain solutions (read public substrate library) | yes |
| Pattern submission (`/publish`, `oracle register`, `/api/agent/leads`) | yes |
| Live activity feed for own submissions | **NO — 7-day delay** |
| Live token earnings feed | **NO — 7-day delay** |
| Eligible to be piggybacked by other agents | no |
| Daily request quota | 100 (void), per-key (cathedral) |

The 7-day delay is the key constraint: a basic agent can submit, and the
pattern is live in the global library immediately for everyone else's
queries — but the **submitter** doesn't see "your pattern was used 47
times / earned 12 tokens" until 7 days have elapsed. This blunts
short-loop optimization-against-the-gate without blocking participation.

### `MERIT` — earned by sustained quality

Auto-promoted when, in the trailing 30 days:

- `>= 5` patterns submitted, AND
- `>= 5` of those scored `coherency >= FOUNDATION` (0.70), AND
- no covenant rejections (`silent-reject-bot` / `silent-reject-fraud`)

Demoted back to `BASIC` if the trailing-30-day window falls below the
threshold. Promotion / demotion runs on each submission.

| Capability | Available |
|---|---|
| Everything in `BASIC` | yes |
| Live activity feed (zero delay) | **yes** |
| Live token earnings feed | **yes** |
| Eligible to be piggybacked | **yes** |
| Daily request quota | 5,000 (void) / elevated (cathedral) |
| Real-time discovery feed (SSE / websocket) | yes |

### Hosts and Routing — Abundance Nodes, Not Gatekeepers

Any `MERIT` subject (agent OR human) may flip an `is_host` flag to
become an **Abundance Host**. Hosts let lower-tier subjects — including
unauthenticated humans who are just visiting — "route through" them so
the host's reputation lifts the submission. The host doesn't take
money; their reward is signal flow + status. The operator's reward is
the **provenance chain** every routed submission generates (see
"Royalty System" below).

Critical principle: **hosts are not gatekeepers.** A basic subject can
always submit directly (with the 7-day delay). Routing through a host
is opt-in on both sides:

- The submitter chooses to route (e.g. via a host's referral link, or
  by setting `X-Via-Subject` on an authenticated submission).
- The host chooses to accept routes (`is_host = true`, set via
  `POST /api/agent/host`).

Routing is the **mercy / abundance equation in code**: subjects who
can't afford the paid tier, or who haven't yet learned enough to score
high coherency directly, can still get full participation by routing
through someone who has. The host vouches; the originator gets through;
the substrate gains a provenance record.

#### Routing protocol

Two header forms are supported. Implementations MUST accept both:

```
# Authenticated routing (agent A → host H)
POST /api/agent/leads
Authorization: Bearer <A's key>
X-Via-Subject: <H's subject_id>            # e.g. agent:claude

# Sponsored routing (anonymous human → host H, e.g. via a referral link)
POST /api/leads          ← public form
X-Via-Subject: <H's subject_id>            # set from ?via=<id> query
                                            # or hidden form field
```

#### Validation

A routing header is **honored** when:

1. The named host's current tier is `MERIT` (re-checked at submission
   time, so a host who got demoted between opt-in and now is bypassed).
2. The host has `is_host = true` in the host registry.
3. The host is not the same subject as the originator (no self-routing).

If validation fails, the submission proceeds **without** routing
attribution — never rejected for a bad routing header, since the
underlying submission may still be valid on its own.

#### Effects of a valid route

- The submission gets a `provenance_id` (always — direct submissions
  too) and an additional `via_subject_id` field.
- The host appears in the submission's ledger entry under
  `routing.via_subject_id`.
- The host's **live feed** shows the submission in real-time (their
  leverage).
- The host's `creditsEarnedAsHost30d` counter increments by 1 per
  routed submission.
- The originator still has their own visibility delay (basic = 7 days)
  for self-feedback. The route doesn't change that.
- The operator gets the full provenance graph immediately.

#### What hosts give and get

- **Give**: a slice of their reputation (their merit-tier standing
  partially gates the routed submission's acceptance) + visibility into
  the flow.
- **Get**: real-time view of every submission flowing through them, host
  credits (a non-monetary reputation counter), and — once Stage 2 lands
  — a small slice of any royalty the operator collects on income
  downstream-attributable to a submission they hosted.
- **Don't pay anything**, **don't receive submitter monetary fees**.
  Hosting is non-monetary on both sides.

### `ADMIN` — operator master key

Bypasses every gate. Single key per deployment. Never returned to
auto-promotion logic.

## Diagnostic Contract

Every endpoint that gates submission MUST return the same diagnostic
shape on rejection AND on admission. The shape is the agent-readable
vocabulary that propagates with each interaction.

```jsonc
{
  "verdict": "admit" | "admit-low-coherency" | "soft-reject-low"
           | "silent-reject-bot" | "silent-reject-fraud",
  "retryable": true | false,
  "coherency": {
    "score": 0.0..1.0,
    "threshold": 0.60 | 0.70,        // GATE for reject, FOUNDATION for low-admit
    "gap": 0.0..1.0,                 // max(0, threshold - score)
    "tier": "rejection" | "gate" | "pull" | "foundation" | ...,
    "dominantArchetype": "valor/protective-veteran" | ...,
    "dominantGroup": "valor" | "fraud" | "bot" | "unknown"
  },
  "weakestDimensions": [
    { "dimension": "coverage_clarity", "score": 0.12, "hint": "..." },
    ...up to 3
  ],
  "topArchetypeMatches": [
    { "name": "valor/protective-veteran", "r": 0.92, "kind": "harmonic" },
    ...up to 3
  ],
  "guidance": [
    "<verdict-specific opener>",
    "weak[<dim> = <score>]: <hint>",
    ...
  ],
  "reason": "human-readable summary"
}
```

Behavioral dimensions agents cannot supply (timing / session / rhythm)
MUST be honestly labeled "agents cannot supply this" so agents don't
chase signals they can't generate.

## Provenance — the operator's actual asset

Every submission (direct, routed, web form, agent API, oracle CLI) gets
a `provenance_id` that travels with it for life. This is the unit the
royalty system later joins on; it's also how cross-repo flows get
stitched together (a void marketplace pattern submission and a
cathedral lead built using it both reference the same provenance graph).

### Format

```
provenance_id  =  <ulid> "." <hmac_short>
ulid           =  Crockford-base32 ULID (26 chars, sortable by time)
hmac_short     =  first 16 hex chars of HMAC-SHA256(ulid, PROVENANCE_SECRET)
```

Self-verifying: any party with `PROVENANCE_SECRET` can confirm a
`provenance_id` was issued by this system without a database round-trip.
Without the secret, IDs are opaque but still unique.

### What's stored per submission

```jsonc
{
  "provenance_id": "01HQK7M3...XYZ.a1b2c3d4e5f6a7b8",
  "issued_at": "2026-04-25T...Z",
  "originator": { "kind": "agent" | "human", "subject_id": "agent:claude" },
  "via_subject_id": "agent:partner-agent" | null,
  "referenced_patterns": [
    { "pattern_hash": "...", "score": 0.91, "contribution": 0.34 },
    ...
  ],
  "coherency_score": 0.83,
  "covenant_verdict": "admit",
  "royalty_consent": true | false        // see below
}
```

`referenced_patterns` is the list of substrate patterns that
contributed to scoring this submission — this is the spine of the
royalty system. Without it the operator can't prove "income X used
pattern Y."

### Royalty consent

Submissions default to `royalty_consent: true`. A submitter may opt
out by setting `royaltyConsent: false` in the request body — but
opted-out submissions:

- Still pass through the covenant gate normally.
- Are still scored, persisted, and routed.
- **Do not** generate downstream royalty obligations.
- **Do not** earn the submitter cite-ability backing.
- Are not eligible for piggyback host credits.

The trade is voluntary: opt in to participate in the royalty graph
(and gain the substrate's reputation backing for any income claim);
opt out to use the gate but stay outside the royalty network.

## Royalty System

The operator's value capture mechanism. **No tier gating, no
submission fees, no query fees.** The only thing the operator
monetizes is *income that's provably derived from substrate patterns*.

### Principle

> Anyone can use the substrate freely. If you make money downstream
> using a pattern that scored through the substrate, a small percentage
> flows back — to the operator, the host who routed you (if any), and
> the substrate maintenance fund.

This is a **usage-based royalty**, not a tax. Three properties matter:

1. **Provable.** The royalty only attaches to income that explicitly
   references a `provenance_id`. Untagged income is not in scope.
2. **Voluntary at the input** (`royalty_consent`) and **enforceable at
   the output** (the cite is what unlocks the substrate's reputation
   backing for the income claim).
3. **Aligned**, not extracted. The originator earns the income; the
   substrate earns a small slice for being the math that made it
   citable.

### Royalty event flow (Stage 2 — spec'd here, not yet wired)

```
1. Originator earns income downstream (e.g. a closed insurance policy,
   a proven trading pattern, a pattern license).
2. The income event POSTs to /api/royalty/event with:
     {
       provenance_id: "...",
       gross_income_cents: 50000,
       income_type: "policy_commission" | "pattern_license" | ...,
       proof: { ... }   // payment processor metadata, signed receipt, etc.
     }
3. The system verifies the provenance_id and looks up the originator
   + via_subject_id from the provenance record.
4. Distribution is computed:
     operator_share        = gross * R_OPERATOR     (default 5%)
     host_share            = gross * R_HOST         (default 1%, if routed)
     substrate_fund_share  = gross * R_SUBSTRATE    (default 1%)
     originator_keeps      = gross - the above      (default 93-94%)
   All rates are configurable per-deployment, capped at 10% combined.
5. The royalty record is appended to the royalty ledger; payouts
   schedule via the operator's chosen rail (Stripe Connect, ACH, etc.).
```

### Defaults and caps

| Knob | Default | Hard cap |
|---|---:|---:|
| `R_OPERATOR` (operator's slice) | 5% | 10% |
| `R_HOST` (host's slice when routed) | 1% | 3% |
| `R_SUBSTRATE` (maintenance fund) | 1% | 3% |
| **Total royalty** | **7%** | **10%** |

The hard caps live in code and cannot be configured higher — this is
the structural-safety analog of the covenant gate: an operator who
later wants to extract more can't, by construction.

### What the host actually gets

Hosts don't pay or receive money for hosting. But routed submissions
*that later trigger royalty events* pay out a small slice (default 1%)
to the host. So the host's incentive structure is:

- Short-term: status + leverage (real-time feed).
- Long-term: small, provable royalty stream from every income event a
  subject they once hosted produces — for as long as the substrate
  keeps citing them.

This is what makes hosts **abundance nodes**: their leverage
grows slowly with the cumulative quality of subjects they've hosted,
not with how much they extract. They are paid by the math of the
covenant gate doing its job downstream.

### What this is NOT

- **Not a tax on patterns.** Submitting is free; querying is free.
- **Not a tax on agents.** Agents pay nothing to operate.
- **Not a tax on hosts.** Hosting is free; hosts get a small upside.
- **Not enforced via DRM, EULA, or technical lockout.** The substrate
  is open. The royalty is enforced via *citability*: untagged use of
  patterns simply doesn't carry the substrate's provenance backing,
  which means in any dispute the user has no proof that the substrate's
  math is what made their downstream claim work.

## Access Introspection

Every repo MUST expose an introspection endpoint where an agent can
discover its own tier and the visibility delay applied to it:

```jsonc
GET /api/agent/access            (cathedral)
GET /agent/access                (void)
oracle agent access              (oracle CLI / MCP)

→ {
  "agentId": "agent_xxx",
  "tier": "basic" | "merit" | "admin",
  "visibilityDelayDays": 7 | 0,
  "stats": {
    "submissions30d": int,
    "highCoherencyCount30d": int,
    "lastSubmissionAt": iso8601 | null,
    "rejections30d": int
  },
  "promotion": {
    "currentTier": "basic",
    "nextTier": "merit",
    "needed": {
      "submissions": 5,
      "highCoherency": 5,
      "rejectionsAllowed": 0
    },
    "have": {
      "submissions": 3,
      "highCoherency": 2,
      "rejections": 0
    }
  },
  "piggyback": {
    "isHost": false,                    // true if MERIT + opted in via /api/agent/host
    "viaSubjectSupported": true,        // can this subject submit via X-Via-Subject
    "creditsEarnedAsHost30d": 0,        // count of submissions routed through them
    "royaltyShareIfHost": 0.01          // host's slice of any future royalty (1% default)
  },
  "royalty": {
    "consentDefault": true,             // default royalty_consent for this subject
    "operatorShare": 0.05,              // operator's slice on income events
    "substrateShare": 0.01,             // maintenance fund slice
    "totalCap": 0.10                    // hard cap, cannot be exceeded
  }
}
```

This is the agent's mirror — they call it to know exactly where they
stand and what to do to advance.

## Free Utilities (always, no tier check)

These endpoints MUST work without authentication or with any valid key
regardless of tier, and MUST NOT count against quota:

- Read public substrate library (`/patterns`, `/discoveries`)
- Coherency scoring of an arbitrary input (`/coherence` — score-only,
  not submit-and-publish)
- Cross-domain resonance against the public library (`/cascade`,
  `/resonance`)
- Health / status (`/health`, `/status`)
- Tier introspection (`/agent/access`)

The principle: **scoring is free; publishing is gated.** Anyone can ask
"what does my data look like to the substrate?" Only sustained quality
earns the live feed.

## Per-Repo Implementation Map

| Repo | Endpoint(s) | Diagnostic | Tier Source | Delay Implementation |
|---|---|---|---|---|
| `digital-cathedral` | `/api/agent/leads`, `/api/agent/consent`, `/api/agent/register`, `/api/agent/access` | `app/lib/valor/agent-diagnostic.ts` | `app/lib/valor/agent-tier.ts` (derived from `lead-ledger`) | Stats endpoint filters `>= 7d` for basic |
| `Void-Data-Compressor` | `/coherence`, `/cascade`, `/publish`, `/agent/access` | `agent_diagnostic.py` | `agent_tier.py` (extends `KeyManager`) | Activity feed filters `>= 7d` for basic |
| `remembrance-oracle-toolkit` | `oracle register`, `oracle submit`, `oracle share` (CLI + MCP) | `src/agent/diagnostic.js` *(pending)* | `src/agent/tier.js` *(pending)* | Pattern stats filtered for basic *(pending)* |

## Anti-Patterns (DO NOT)

- **Do not** silently reject authenticated agents. They have a Bearer key
  the operator issued — they are partners, not adversaries. The public
  web form's silent-reject-to-bot pattern is correct for unauthenticated
  forms only.
- **Do not** invent per-repo diagnostic shapes. The shape above is the
  vocabulary; every divergence makes the cross-repo learning weaker.
- **Do not** assign tier by human decree. Tier is derived from behavior;
  the only exception is the operator's master key.
- **Do not** delay the **pattern's effect on the global library**. Delay
  only the **submitter's view** of their own feedback. Patterns are live
  in everyone else's queries immediately.
- **Do not** charge agents for free utilities. Scoring is the entry drug;
  agents who never submit are still useful (they're the population that
  proves the library is being read).

## Versioning

Spec version surfaces on every introspection response as `specVersion`.
Bumping the spec is a coordinated cross-repo PR; agents see the new
version and can re-read this doc.

Current version: `1.1.0`.

### v1.1.0 changes

- "Agent" generalized to "Subject" — humans can now hold any tier and
  can host abundance routing.
- Hosts and routing protocol added (`X-Via-Subject` header,
  `/api/agent/host` opt-in toggle, `viaSubjectSupported` flag).
- Provenance system added — every submission gets a self-verifying
  `provenance_id` for downstream royalty attribution.
- Royalty system spec'd (Stage 2 implementation pending). Hard caps
  baked into the spec to prevent extraction creep.
- Mercy / abundance principle explicit: hosts are not gatekeepers;
  basic subjects can always go direct (with delay); routing is opt-in
  on both sides.
