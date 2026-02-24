function createCacheStrategy(cacheName, precacheUrls) {
  const name = cacheName || 'app-cache-v1';
  const urls = precacheUrls || ['/'];

  function getPrecacheUrls() { return urls.slice(); }
  function getCacheName() { return name; }

  function shouldCache(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, 'https://localhost');
      if (parsed.pathname.startsWith('/api/')) return false;
      return true;
    } catch { return false; }
  }

  function isGetRequest(method) {
    return method === 'GET';
  }

  return { getPrecacheUrls, getCacheName, shouldCache, isGetRequest };
}
module.exports = { createCacheStrategy };
