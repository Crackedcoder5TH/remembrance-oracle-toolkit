# Best-effort LRE field-coupling shim — called from a producer's return path.
# Sibling-clone fallback keeps the contribution honest without hard
# dependency: if the LRE module isn't reachable, the contribution is a
# no-op and the caller proceeds unchanged.
try:
    from living_remembrance import contribute as _lre_contribute
    _lre_contribute(cost=COST, coherence=COHERENCE, source='REPO:PRODUCER')
except Exception:
    pass
