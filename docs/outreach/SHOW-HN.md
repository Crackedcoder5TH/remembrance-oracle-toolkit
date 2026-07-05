# Show HN drafts

## Title (pick one — HN titles live or die in the first 5 words)
- Show HN: A deterministic "telescope" that reads the shape of information (npx demo)
- Show HN: I built a reproducible alternative to embeddings — three unrelated methods agree it's real
- Show HN: Fingerprint any data deterministically — no model, no API, 42kB, runs with npx

## Body

Everyone measuring "how similar are two things" reaches for a neural embedding
— which needs a vendor, a model version, a GPU, and gives a *different* answer
every model release. I wanted the opposite: a small, deterministic,
fully-inspectable instrument that turns any input (code, prose, DNA, a
time-series) into a 145-dimensional signature by reading its structure, and
measures how things resemble each other. Same input, same output, forever.

The obvious objection is "sure, but that's just YOUR encoder seeing what it
wants." So the first thing I did was try to falsify that. Run this (offline,
~2 seconds, zero install):

    npx @crackedcoder5th/remembrance-field demo convergence

It reads a 60-item corpus three ways — my hand-designed encoder, gzip
compression distance (an approximation of Kolmogorov complexity), and raw
character-trigram statistics — three methods that share no code and no theory.
They agree, far above chance, about what resembles what (Spearman rho 0.43 vs
gzip, 0.71 vs trigram; domain purity 0.97-1.00 vs 0.17 chance). When a
hand-built encoder, a compressor, and a character-counter agree on the
neighborhood structure of a corpus, the structure is in the *data*, not the
telescope. The full 46k-pattern run reaches rho ~0.73.

Other demos:

    npx @crackedcoder5th/remembrance-field demo dna    # DNA families cluster by function
    npx @crackedcoder5th/remembrance-field demo self "your text"

What it's genuinely good for: deterministic provenance/drift fingerprints
(embeddings can't give you reproducible signatures across model versions —
this can), structural search across any domain, and label-free classification
where the geometry corresponds to real dynamics.

What it is NOT: a semantic/topic model. It reads structure and dynamics, not
meaning — two prose passages on different subjects can look similar; two
programs doing the same thing in different styles look different. That's the
feature (it sees form), and it's why topical search blends it with keywords.

Zero dependencies, pure JS + stdlib, MIT. Two independent reference
implementations produce byte-identical signatures across thousands of
adversarial inputs. Every one of the 145 dimensions is a named, readable
quantity — the whole instrument is a few hundred lines of arithmetic you can
read.

Repo: https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit
Package: https://www.npmjs.com/package/@crackedcoder5th/remembrance-field

Happy to answer anything — and if you run the convergence demo and it DOESN'T
converge on your machine, that's the most interesting possible reply, tell me.

## First comment to post yourself (seed the thread with the honest caveats)

A few things I want to be upfront about, since I'd rather you find them from me
than feel like you caught me:

1. The strong claim is narrow: instrument-independent *neighborhood structure*
   exists on the corpora I've tested. That's not "I've discovered a new physics"
   — it's "three unrelated similarity methods agree, reproducibly." Everything
   bigger is downstream and unproven.
2. It reads shape, not meaning. If you need semantic/topic similarity, this is
   the wrong tool alone (blend it with keywords).
3. The demo corpus is small (60 items) so it runs instantly; the full runs are
   in the repo's scripts/ if you want to hammer it harder.
4. No external validation yet beyond "run it yourself" — which is exactly why
   I'm posting. Break it.
