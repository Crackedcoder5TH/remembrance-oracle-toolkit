# Lead Coherency — what it is, why it's worth paying for, and how to sell it

This is the narrative behind the number. Part 1 is buyer-facing (use it as site
copy and sales language). Part 2 is your go-to-market playbook.

---

## Part 1 — Lead Coherency, explained

### What it is (plain)
**Coherency is a single 0–100 quality grade on every lead** — a measure of how
well the lead's own attributes *hang together* into the shape of a real,
in-market, consenting buyer, versus a bot, a fraud, or a tire-kicker. It isn't a
hand-tuned points system. It's a mathematical resonance score: the lead is
matched against the patterns of genuine buyers and the patterns of junk, and
graded on which it resembles.

### What it is (technical, honest)
1. Every lead is reduced to a **16-dimension shape** — a vector of the signals
   that actually predict a closeable life-insurance policy.
2. That shape is **cascaded (Pearson-correlated) against an archetype library** —
   real-buyer patterns and reject patterns.
3. The score is the **geometric mean** of three things: the lead's own dimension
   strength, how strongly it *lifts* toward a genuine-buyer archetype, and how
   much it's *suppressed* by resembling a bot/fraud archetype. Geometric mean =
   **weakest-link**: one bad dimension drags the whole grade down. A bot that
   maxes every field but has robotic timing scores near zero.
4. A second, independent check (the Remembrance field's **dual-oracle**) can veto
   a suspicious lead even when the local math would admit it.

### The 16 dimensions (why they're insurance-specific)
coverage clarity · intent strength · veteran integrity · branch specificity ·
state market fit · field completeness · recency · consent integrity (TCPA) ·
email quality · phone quality · name plausibility · DOB validity · marketing
context (UTM provenance) · session coherence · timing cadence · step rhythm.

These are the things that separate "a veteran who knows they want final-expense
coverage and consented 9 minutes ago" from "a form filled by a script in 1.4
seconds."

### The archetypes
**Buyers you want:** `valor/protective-veteran` (the prize), `valor/service-family`,
`valor/engaged-civilian`, `valor/civilian-planner`, `valor/exploratory`.
**Shapes that get rejected:** `fraud/mismatched`, `fraud/harvested`,
`bot/uniform-fast`, `bot/constant-cadence`, `bot/honeypot`.

### The grades (thresholds)
| Grade | Coherency | Meaning |
|---|---|---|
| Transcendence | ≥ 0.95 | Top-of-market, exclusive-worthy |
| Synergy | ≥ 0.85 | Premium |
| Foundation | ≥ 0.70 | Standard admitted lead |
| Gate | ≥ 0.60 | Admitted, marginal |
| Below gate | < 0.60 | Soft-rejected (declined to the visitor) |
| Bot / fraud | — | **Silently rejected** — fake success, never enters the marketplace |

### Why it's valuable
- **It predicts close rate.** The dimensions are the ones that correlate with a
  real, consenting, in-market veteran — not vanity fields.
- **It pre-cleans the marketplace.** Bots and fraud are rejected *before* a lead
  is ever listed. Buyers can't accidentally pay for junk.
- **It's consistent and auditable.** Same math on every lead, no grader drift;
  re-score the same lead, get the same grade.
- **It's legible.** Every lead carries its grade and its archetype.

### Why it's a trust signal
Most lead vendors sell *volume* and hide *quality*. Here, quality is measured,
shown, and **priced**:
- Every lead displays a grade + archetype.
- Fraud/bots are rejected at the gate, so the pool is pre-filtered.
- **The grade drives the price.** A seller who prices by a measured quality grade
  is putting their money where their quality is — the opposite of dumping
  recycled, re-sold junk at a flat rate. That alignment *is* the trust.

---

## Part 2 — Why a buyer pays, and how to get your first ones

### Who the customer is
Not consumers — your **buyers are licensed life-insurance agents and small
agencies**, especially veteran-focused / final-expense / mortgage-protection
shops. They *already buy leads* from aggregators, and their #1 complaint is
quality and fraud. That complaint is your wedge.

### Why they'd pay for a graded lead (the ROI argument)
A lead is worth what it **closes**, so sell **cost-per-acquisition, not
cost-per-lead**:

> A $100 graded `valor/protective-veteran @ 0.93` that closes 1-in-5 beats a $30
> aggregator lead that closes 1-in-50. The "expensive" lead is 3× cheaper per
> policy written.

They're buying four things at once: **higher close probability** (the grade),
**zero spend on bots/fraud** (pre-filtered), **exclusivity** (1-buyer vs shared),
and **compliance** (TCPA consent captured and stored). No aggregator bundles all
four — and none of them can show you a per-lead quality grade.

> Honest note: the 3× figure is the *hypothesis to prove with your own data*, not
> a measured fact yet. Capturing buyer close-rates by grade (below) turns it into
> a number you can put on a billboard.

### The first-10-customers playbook (solo-operator, concrete)
1. **Pick the niche tight.** Veteran final-expense (or mortgage protection), one
   state — your strongest market-fit state. Narrow wins.
2. **Seed supply first.** You need real graded leads to sell. Run a small
   lead-gen campaign (Facebook/Google → your veteran-coverage landing page; the
   site + covenant gate already grade them). Even 15–20 graded leads is a demo.
3. **Go where the agents already are:**
   - Facebook groups for final-expense / life-insurance agents (very active).
   - LinkedIn search: "final expense agent", "veteran life insurance agent".
   - Independent agencies near military bases (Google Maps → call list).
   - Forums: r/lifeinsurance, InsuranceForums, FEX/IMO communities.
4. **The offer that gets the first yes — let quality close them:**
   - **Hand over 1–2 real graded leads free.** Show the grade + archetype.
   - **"First 5 leads free; pay only if they're as good as the grade says."**
   - **Replace-if-bad guarantee.** Your fraud filter makes this cheap to honor.
   - Lead with **exclusivity**: "1-buyer-exclusive veteran leads in [state]."
5. **Always show the grade on delivery.** The coherency score + archetype is the
   thing they've never seen from any other vendor. It's the whole pitch.
6. **Get one case study fast.** Track your first agent's close rate. *"Agent X
   closed 3 of 10 graded leads"* is your entire marketing engine.

### Pricing strategy to start
- Lead with **exclusivity + grade**, not rock-bottom price.
- The coherency multiplier (now live) does the work: 0.85+ leads carry a premium,
  marginal ones are discounted — so buyers *feel* they're paying for quality.
- Offer a small **intro pack (5 leads)** at a discount to kill first-purchase
  risk; convert to recurring once the close-rate proves out.

### The flywheel
Quality grade → higher close rate → agents pay more and buy more → funds more
lead-gen → more graded supply → more agents. The grade is what tightens every
turn.

### The one thing to instrument
**Track close-rate by coherency bucket.** You already log every lead's coherency
in the ledger; capture the buyer's outcome (closed / didn't) and you can prove —
in your own numbers — that the grade predicts closes. That dataset is
simultaneously your sales deck, your pricing tuner, and your moat.
