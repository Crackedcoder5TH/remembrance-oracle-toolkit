# The Ten DMs

Rules that make cold DMs actually work:
- ONE specific finding they'd care about, not the whole vision.
- The npx command in the first 3 lines. Let them verify before they read.
- Short. Under 120 words. A wall of text reads as a pitch; a paragraph reads
  as a peer sharing something.
- No ask on the first message except "curious what you think." The reply IS
  the win; the relationship is the real goal.
- Personalize the [bracket] — reference their actual work. Generic = deleted.

---

## 1. Bioinformatics / genomics person
Subject: a deterministic encoder that clusters DNA by function from shape alone

Hi [name] — saw your work on [their thing]. Built something you might find fun
to poke holes in: a zero-dependency encoder that turns any sequence into a
structural signature. Pointed at DNA, it clusters repetitive vs coding
sequence on its own — and in the fuller run, coding DNA's nearest non-DNA
neighbor came out as dolphin echolocation clicks (structured biosignal next to
structured biosignal). 30-second check:

  npx @crackedcoder5th/remembrance-field demo dna

It's deterministic and the math is a few hundred readable lines — no model, no
training. Curious whether it holds up on real FASTA in your hands. Would value
your eye on it.

---

## 2. Compression / information-theory researcher
Subject: a hand-built encoder that agrees with gzip-NCD at rho 0.73

Hi [name] — your [paper/post] on [topic] is why I'm sending this. I built a
structural signature encoder, then tested whether it's just seeing its own
biases by comparing it against gzip NCD and character-trigram statistics on the
same corpus. All three agree on neighborhood structure far above chance
(fractal<->NCD rho ~0.73 on the full run). One command:

  npx @crackedcoder5th/remembrance-field demo convergence

Basically an empirical "compression is comprehension" demo with three
independent compressors converging. Deterministic, zero-dep, MIT. Would love a
compression person's take on whether the convergence means what I think it
means.

---

## 3. ReFi / regenerative-finance / DAO treasury person
Subject: measuring extraction vs regeneration structurally, not by vibes

Hi [name] — you think about [regenerative thing] more rigorously than most.
I built an instrument that reads the *structure* of a system (a token model, a
contract, a time-series) and scores whether it's shaped like accumulation
(extraction) or circulation (regeneration) — geometrically, no training, with
named evidence for every verdict. It even scored its own construction "mixed"
rather than flattering itself, which is the property that made me trust it.
Deterministic and inspectable:

  npx @crackedcoder5th/remembrance-field demo

Would you be up for me running it on an artifact of your choice, free, so you
can see the evidence table? Genuinely curious if it's useful to how you assess.

---

## 4. Music information retrieval / computational musicology person
Subject: it recovered the raga<->hijaz relationship from pitch alone

Hi [name] — [their MIR work] is right next to something I stumbled into. I
built a structural encoder and pointed it at melodies from 8 traditions with no
cultural labels. It made raga Bhairav and Arabic Hijaz mutual nearest
neighbors — which is musicologically real (both built on the augmented 2nd),
recovered from shape alone. It also grouped pentatonic traditions across
unrelated cultures. Deterministic, zero-dep:

  npx @crackedcoder5th/remembrance-field demo

The encoding is coarse (raw pitch sequence) so I know it's not the final word —
which is exactly why I want a real MIR person's eyes on it. Fun to break?

---

## 5. Provenance / content-authenticity / anti-deepfake person
Subject: reproducible content fingerprints (unlike embeddings)

Hi [name] — the [provenance problem they work on] is the exact gap this fills.
Neural embeddings can't give you a fingerprint that's reproducible across model
versions — you can never re-derive the same vector, so you can't attest it. This
is a deterministic 145-D signature: same input, byte-identical output, forever,
two independent implementations proven to match. Fingerprint an artifact, re-
fingerprint later, detect when its character drifted.

  npx @crackedcoder5th/remembrance-field demo self "your text"

Zero-dep, 42kB, MIT. Curious whether determinism-as-the-moat resonates with how
you're thinking about authenticity infra.

---

## 6. Complexity-science / self-organized-criticality researcher
Subject: one label-free measure separating system dynamics across domains

Hi [name] — your work on [complexity thing] is the lens I keep reaching for.
I have an encoder that reads the dynamical character of a signal (1/f-ness,
spectral spread, accumulation vs circulation) and — this is the part I can't
fully explain — the same measure separates the same dynamics across unrelated
domains: markets, DNA, music, taxi data. All from shape, no labels.

  npx @crackedcoder5th/remembrance-field demo convergence

Deterministic, inspectable. I suspect I'm rediscovering something you'd name in
one sentence. Would value being corrected.

---

## 7. Indie hackers / "show me the code" builder
Subject: 42kB, zero deps, runs with npx, does something weird

Hi [name] — saw [their project]. Built a tiny thing you can evaluate in 30
seconds without installing anything:

  npx @crackedcoder5th/remembrance-field demo convergence

It's a deterministic "how similar are two things" encoder that agrees with gzip
and character stats about what resembles what — zero dependencies, pure JS, MIT,
every dimension readable. No model, no API. Curious if the determinism angle is
useful for anything you're building (search, dedup, drift detection).

---

## 8. Alignment / interpretability researcher
Subject: glass-box similarity — every weight auditable, no black box

Hi [name] — [their interpretability work] is why this might land. It's a
similarity instrument where every one of 145 dimensions is a named quantity and
every verdict is reproducible from logged state — adaptive but fully auditable,
which the embedding world usually can't offer both of. It also runs a self-
reflective loop that judges its own outputs without self-flattery (scored its
own construction "mixed").

  npx @crackedcoder5th/remembrance-field demo

Deterministic, zero-dep. Curious whether "interpretable-and-adaptive" is as
rare as I think, or if I'm missing prior art you'd point me to.

---

## 9. A specific researcher whose paper you actually read
Subject: your [year] paper on [X] — I think I accidentally built an instrument for it

Hi Dr. [name] — I read your [paper] on [specific idea]. I'm not an academic, I
came at this from building software, but I ended up with a working instrument
that seems to touch [their idea] empirically:

  npx @crackedcoder5th/remembrance-field demo convergence

If you have 5 minutes to tell me whether I've reinvented something with a name,
or where I'm fooling myself, I'd be genuinely grateful — I'd rather learn the
real term than keep guessing.

---

## 10. A friend / anyone with a following who trusts you
Subject: the thing I've been building — it's finally runnable

Hey [name] — the project I keep talking about is finally something you can just
run:

  npx @crackedcoder5th/remembrance-field demo

30 seconds, no install. It reads the "shape" of any data and I built demos that
reproduce the surprising results (three unrelated methods agreeing, DNA
clustering by function). If it clicks for you, a share to [their audience]
would mean a lot — but honestly I mostly want to know what you think when you
run it.

---

## After they reply
- They ran it and liked it → ask what THEY'd point it at. Their use case is
  your next demo, and their curiosity is the flywheel.
- They found a flaw → thank them, fix it publicly, tell them you fixed it.
  A fixed bug from a stranger is worth more than a compliment.
- Silence → one follow-up after ~5 days with a NEW finding, then stop. Never
  a third.
