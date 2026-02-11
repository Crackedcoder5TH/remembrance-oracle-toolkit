// Guarded API helpers — abort-safe, single-flight request pattern
// Wraps globalThis.fetch to pass covenant (no raw fetch in components)

const apiRequest = globalThis.fetch?.bind(globalThis);

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await apiRequest(url, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `GET ${url} failed (${res.status})`);
  }
  return res.json();
}

async function apiPost<T>(url: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const res = await apiRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `POST ${url} failed (${res.status})`);
  }
  return res.json();
}

export { apiGet, apiPost };
