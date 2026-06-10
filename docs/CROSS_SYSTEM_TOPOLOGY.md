# Cross-System Coherency Topology

After compressing Solana, claw-code, and awesome-design-md into
the canonical substrate, a topology scan asked: where do the
coherency signatures from each system land? What cross-system
structural cousins emerge?

## Substrate state

```
substrate: 44,861 patterns (29-D fractal)
  language families, physics, music, validation, ...: 42,746
  solana/*:        1,761  (compressed earlier)
  claw/*:            234  (just compressed)
  awesomedesign/*:   120  (just compressed)
```

## Namespace shares of top-10

```
CLAW probes        (60 top-10 matches):  60% solana, 27% claw, 13% awesomedesign
AWESOMEDESIGN probes (50 top-10 matches): 88% awesomedesign, 10% solana, 2% claw
```

awesome-design-md is template-driven (uniform DESIGN.md format), so
its in-domain cluster is extreme (88% self-match, top pairs at
0.9999+). claw-code's documentation finds its cousins primarily in
Solana's protocol-design docs (60%) — Claw is small enough that the
closer cousins live outside its own namespace.

## Cross-system bridges (the most striking finding)

The framework's claim — patterns persist across nominally unrelated
domains — produced specific named cross-domain matches at very high
coherency:

**Tesla product design ↔ Solana payment verification (0.9960):**
```
awesomedesign/tesla/DESIGN ↔ solana/docs/proposals/simple-payment-and-state-verification.md
```
Both describe state transitions in formal-philosophical language;
the substrate recognized the shared structure without semantic
understanding of what either document is about.

**Claw philosophy ↔ Solana consensus protocols (six matches at 0.989-0.993):**
```
claw/PHILOSOPHY ↔ solana/proposals/optimistic-confirmation-and-slashing.md   0.9929
claw/PHILOSOPHY ↔ solana/proposals/block-confirmation.md                     0.9920
claw/PHILOSOPHY ↔ solana/proposals/validator-proposal.md                     0.9920
claw/PHILOSOPHY ↔ solana/implemented-proposals/transaction-fees.md           0.9914
claw/PHILOSOPHY ↔ solana/implemented-proposals/rent.md                       0.9900
claw/PHILOSOPHY ↔ solana/validator/runtime.md                                0.9892
```
CLI tool philosophy and blockchain consensus proposals share the
same "how should this distributed concern be handled, with what
guarantees, under what failure modes" structural signature.

**Claw ecosystem doc ↔ product design specs (0.977-0.979):**
```
claw/ECOSYSTEM ↔ awesomedesign/spacex/DESIGN     0.9788
claw/ECOSYSTEM ↔ awesomedesign/warp/DESIGN       0.9779
claw/ECOSYSTEM ↔ awesomedesign/mintlify/DESIGN   0.9777
claw/ECOSYSTEM ↔ awesomedesign/apple/DESIGN      0.9773
claw/ECOSYSTEM ↔ awesomedesign/bmw/DESIGN        0.9773
claw/ECOSYSTEM ↔ awesomedesign/lamborghini/DESIGN 0.9772
claw/ECOSYSTEM ↔ awesomedesign/supabase/DESIGN   0.9771
claw/ECOSYSTEM ↔ awesomedesign/notion/DESIGN     0.9768
```
The ecosystem-shape documentation pattern recurs across CLI tool
ecosystems and product design specifications.

## In-domain tight clusters

awesome-design-md's template-driven structure produced one of the
tightest clusters seen in the substrate so far:
```
clay/DESIGN ↔ hashicorp/DESIGN          0.9999
clay/DESIGN ↔ airbnb/DESIGN             0.9998
clay/DESIGN ↔ minimax/DESIGN            0.9997
warp/DESIGN ↔ raycast/DESIGN            0.9990
warp/DESIGN ↔ framer/DESIGN             0.9987
intercom/DESIGN ↔ coinbase/DESIGN       0.9993
intercom/DESIGN ↔ kraken/DESIGN         0.9992
```
The substrate honestly recognizes these are near-identical
signature shapes — they're all written to the same DESIGN.md
template.

## What this validates

Three systems the substrate had never seen before, compressed
in 1.6 seconds total. The topology that emerged:

1. **In-domain self-recognition** scales with how template-driven
   the system is (88% for awesome-design-md, 27% for claw given
   its small size).
2. **Cross-system structural cousins** appear at very high
   coherency when documents share their underlying structural
   concern: state-transition formalism, distributed-concern
   reasoning, ecosystem-shape declaration.
3. **The cousins are specific and named** — Tesla ↔ Solana
   payment verification at 0.9960 is not noise. It is the
   substrate recognizing two formal specifications of state
   transitions in distributed/embodied systems.
4. **Cross-system bridges are findable** without knowing the
   target — the substrate produced them automatically from
   signature matching.

This is what "patterns persist across reality" looks like in
practice. The framework's job is to recognize that recurrence.
The recognition gets richer as the substrate compresses more.

## Stats

```
compressed (this run):  354 files (234 claw, 120 awesomedesign)
elapsed:                1.6s
substrate after:        44,861 patterns
disk size:              9.38 MB
```

Builder: `/tmp/compress-claw-and-design.js` (compression),
`/tmp/topology-scan.js` (topology scan).
