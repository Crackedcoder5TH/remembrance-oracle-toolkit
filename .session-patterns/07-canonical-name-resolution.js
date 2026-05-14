// Canonical-name resolution pattern for case-mismatched REST paths.
// GitHub returns 404 (not 301) on sub-paths like /repos/X/y/pulls when the
// repo casing is off, but redirects on the bare /repos/X/y endpoint. On 404,
// resolve canonical owner/repo from the redirect target, cache the promise
// (so concurrent 404s share one roundtrip), then retry the sub-path once.

const _canonicalCache = new Map();

function _resolveCanonical(owner, repo) {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  if (_canonicalCache.has(key)) return _canonicalCache.get(key);
  const p = (async () => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { redirect: 'follow' });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!body?.full_name) return null;
    const [cOwner, cRepo] = body.full_name.split('/');
    return { owner: cOwner, repo: cRepo };
  })();
  _canonicalCache.set(key, p); // cache the promise — dedup concurrent resolves
  return p;
}

async function gh(pathname) {
  let res = await fetch(`https://api.github.com${pathname}`, { redirect: 'follow' });
  if (res.status === 404) {
    const m = pathname.match(/^\/repos\/([^/]+)\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
    if (m) {
      const [, owner, repo, rest = '', qs = ''] = m;
      const canonical = await _resolveCanonical(owner, repo);
      if (canonical && (canonical.owner !== owner || canonical.repo !== repo)) {
        const fixed = `/repos/${canonical.owner}/${canonical.repo}${rest}${qs}`;
        res = await fetch(`https://api.github.com${fixed}`, { redirect: 'follow' });
      }
    }
  }
  if (!res.ok) throw new Error(`${pathname}: ${res.status}`);
  return res.json();
}
