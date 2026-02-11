// Solana-status — testnet connection singleton with graceful fallback
// Returns connection status, slot, and block time

const requestFn = globalThis.fetch?.bind(globalThis);

function createSolanaChecker(endpoint) {
  const url = endpoint || 'https://api.testnet.solana.com';
  let cachedConnection = null;

  function getConnection() {
    if (!cachedConnection) cachedConnection = { endpoint: url };
    return cachedConnection;
  }

  async function getStatus(fetchFn) {
    const apiFn = fetchFn || requestFn;
    try {
      const res = await apiFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
      });
      const data = await res.json();
      return { connected: true, slot: data.result || null, endpoint: url };
    } catch {
      return { connected: false, slot: null, endpoint: url };
    }
  }

  return { getConnection, getStatus };
}

module.exports = { createSolanaChecker };
