#!/usr/bin/env python3
"""
Coherence falsification — the kill-test, runnable by anyone.

This is the test the Remembrance interface points you at. It does NOT need the
private engine or the full substrate: it ships with its own input — the derived
domain waveforms (`falsification_dataset.npz`, ~461 KB of aggregated signatures,
not raw source) that the substrate-wide run was measured on. You run it, you get
the verdict, you check our claim yourself.

The claim under test: the cross-domain coherence in the substrate is REAL, not an
artifact. The null we try to beat it with is the hard one — a Theiler (1992)
phase-randomized surrogate, which keeps each domain's power spectrum and destroys
only its phase. A cross-domain correlation is "real" only where the observed |r|
is beaten by the phase surrogates less than 1% of the time. A shuffle null (which
destroys everything) is run alongside as the easy baseline.

A null result is informative: if survival ≈ the 1% false-positive floor, the
substrate-wide coherence claim does NOT survive, and you should say so.

    pip install numpy
    python3 run.py                 # ~seconds; deterministic (seed 42)

Reproduces `coherence_falsification_v2_report.json` exactly.
"""
from __future__ import annotations
import argparse
import datetime as _dt
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 42
ALPHA = 0.01


def corr_abs(W):
    """|Pearson| matrix of the rows of W, NaN-safe (zero-variance -> 0)."""
    return np.abs(np.nan_to_num(np.corrcoef(W), nan=0.0))


def phase_batch(W, rng):
    """Theiler phase-randomized surrogates of every row at once (the HARD null:
    keeps each row's power spectrum, destroys its phase)."""
    F = np.fft.rfft(W, axis=1)
    mags = np.abs(F)
    ph = rng.uniform(0, 2 * np.pi, size=F.shape)
    ph[:, 0] = 0.0
    if W.shape[1] % 2 == 0:
        ph[:, -1] = 0.0
    return np.fft.irfft(mags * np.exp(1j * ph), n=W.shape[1], axis=1)


def shuffle_batch(W, rng):
    """Independently shuffle every row — the EASY null (destroys all structure)."""
    idx = np.argsort(rng.random(W.shape), axis=1)
    return np.take_along_axis(W, idx, axis=1)


def main():
    ap = argparse.ArgumentParser(description="Phase-null coherence falsification.")
    ap.add_argument('--n-perm', type=int, default=1000, help='permutations (default 1000)')
    ap.add_argument('--json', default=os.path.join(HERE, 'coherence_falsification_v2_report.json'))
    args = ap.parse_args()

    data = np.load(os.path.join(HERE, 'falsification_dataset.npz'), allow_pickle=True)
    W = data['W'].astype(float)
    names = [str(x) for x in data['names']]
    n = W.shape[0]
    rng = np.random.default_rng(SEED)

    bar = '=' * 84
    print(bar)
    print('  COHERENCE FALSIFICATION — phase-randomized null (Theiler et al. 1992)')
    print('  H0: a cross-domain |r| is indistinguishable from a phase-randomized')
    print('      surrogate of the same two domains.')
    print(bar)
    print(f'  domains: {n}   waveform dim: {W.shape[1]}   permutations: {args.n_perm}   seed: {SEED}')
    print('  building phase + shuffle nulls...')

    obs = corr_abs(W)
    iu = np.triu_indices(n, k=1)
    n_pairs = int(iu[0].size)
    ge_phase = np.zeros((n, n), dtype=np.int32)
    ge_shuf = np.zeros((n, n), dtype=np.int32)
    for k in range(args.n_perm):
        ge_phase += (corr_abs(phase_batch(W, rng)) >= obs)
        ge_shuf += (corr_abs(shuffle_batch(W, rng)) >= obs)
        if (k + 1) % 200 == 0:
            print(f'    {k + 1}/{args.n_perm}')

    p_phase = ge_phase / args.n_perm
    p_shuf = ge_shuf / args.n_perm
    surv_phase = int((p_phase[iu] < ALPHA).sum())
    surv_shuf = int((p_shuf[iu] < ALPHA).sum())
    rate = surv_phase / n_pairs
    enrich = rate / ALPHA

    if rate >= 5 * ALPHA:
        verdict = 'REAL'
    elif rate >= 2 * ALPHA:
        verdict = 'PARTIAL'
    else:
        verdict = 'NULL'

    print('\n' + bar)
    print('  DOMAIN-PAIR VERDICT (substrate-wide)')
    print(bar)
    print(f'  cross-domain pairs:                 {n_pairs:,}')
    print(f'  survive phase null (p<{ALPHA}):       {surv_phase:,}  ({100 * rate:.2f}%)')
    print(f'  survive shuffle null (p<{ALPHA}):     {surv_shuf:,}  ({100 * surv_shuf / n_pairs:.2f}%)')
    print(f'  false-positive floor (alpha):       {100 * ALPHA:.0f}%')
    print(f'  enrichment over chance:             {enrich:.1f}x')
    print(f'\n  -> {verdict}', end='  ')
    if verdict == 'REAL':
        print('phase-coherent structure survives many-fold above the floor.')
    elif verdict == 'PARTIAL':
        print('survival exceeds chance but most pairs are artifact.')
    else:
        print('survival ~= the floor; substrate-wide coherence does not survive.')

    report = {
        '_pinned': {
            'generated_at': _dt.date.today().isoformat(),
            'seed': SEED,
            'n_permutations': args.n_perm,
            'n_domains': n,
            'waveform_dim': int(W.shape[1]),
            'null_method': 'phase-randomized surrogate (Theiler et al. 1992)',
            'note': 'self-contained: run with `python3 run.py` against the bundled dataset',
            'domain_pair': {
                'verdict': verdict,
                'pairs': n_pairs,
                'survivors_phase_p<0.01': surv_phase,
                'survivors_shuffle_p<0.01': surv_shuf,
                'survival_rate_phase': rate,
                'false_positive_floor': ALPHA,
                'enrichment_over_chance': enrich,
            },
        }
    }
    with open(args.json, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\n  report written to {os.path.basename(args.json)}')


if __name__ == '__main__':
    main()
