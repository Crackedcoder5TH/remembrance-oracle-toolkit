// Guarded API helpers — abort-safe, single-flight request pattern
// Wraps fetch to enforce guarded access (no raw fetch in components)

function createApiClient(fetchFn) {
  async function apiGet(url, signal) {
    const res = await fetchFn(url, { signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body && body.error) || `GET ${url} failed (${res.status})`);
    }
    return res.json();
  }

  async function apiPost(url, data, signal) {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body && body.error) || `POST ${url} failed (${res.status})`);
    }
    return res.json();
  }

  return { apiGet, apiPost };
}

module.exports = { createApiClient };
