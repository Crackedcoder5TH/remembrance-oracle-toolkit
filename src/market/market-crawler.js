'use strict';

/**
 * market-crawler.js — reads the information and data flows of the stock market
 * (and crypto) as OHLCV time series, so the substrate can consume them.
 *
 * The crawler does one job: pull a raw candle stream from a live source and
 * hand it back in one canonical shape. It reads the flow; it does not judge it,
 * predict from it, or engineer anything on top of it. Downstream (candlestick.js,
 * market-encode.js) turns the flow into patterns and substrate vectors.
 *
 * Canonical candle:  { t, o, h, l, c, v }
 *   t = epoch seconds (bar open time)
 *   o,h,l,c = open/high/low/close
 *   v = volume (0 if the source omits it)
 *
 * Sources (both verified reachable through the agent proxy):
 *   - Yahoo Finance chart API  — equities, indices, ETFs, FX  (full OHLCV)
 *   - Coinbase Exchange candles — crypto spot pairs            (full OHLCV)
 *
 * No API key required for either. Network egress is governed by the
 * environment's network policy; if a source is blocked the crawler throws
 * with the source and status so the caller sees exactly what the proxy did.
 */

const https = require('node:https');

const UA = 'remembrance-market-crawler/1.0 (+substrate ingest)';

// parse JSON but surface a readable error (sources sometimes answer with an
// HTML challenge/error page instead of JSON — don't leak a bare SyntaxError)
function parseJSON(body, where) {
  try { return JSON.parse(body); }
  catch { throw new Error(`${where}: expected JSON, got ${/^\s*</.test(body) ? 'an HTML page (likely a block/challenge)' : 'non-JSON'}: ${body.slice(0, 120)}`); }
}

// low-level GET returning the raw body; rejects with status context on non-2xx
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, ...headers }, timeout: 30000 }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(body);
        reject(new Error(`GET ${url} -> HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`GET ${url} timed out`)); });
    req.on('error', reject);
  });
}

// ---- Yahoo Finance: equities / indices / ETFs / FX -------------------------
// range: 1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max ; interval: 1m 5m 15m 1h 1d 1wk 1mo
async function fetchYahoo(symbol, { range = '6mo', interval = '1d' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const json = parseJSON(await httpGet(url), `yahoo ${symbol}`);
  const r = json?.chart?.result?.[0];
  if (!r) {
    const msg = json?.chart?.error?.description || 'no chart result';
    throw new Error(`yahoo ${symbol}: ${msg}`);
  }
  const t = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const { open = [], high = [], low = [], close = [], volume = [] } = q;
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const o = open[i], h = high[i], l = low[i], c = close[i];
    if (![o, h, l, c].every(Number.isFinite)) continue;   // Yahoo pads gaps with null
    out.push({ t: t[i], o, h, l, c, v: Number.isFinite(volume[i]) ? volume[i] : 0 });
  }
  return {
    symbol: r.meta?.symbol || symbol,
    source: 'yahoo',
    currency: r.meta?.currency || null,
    exchange: r.meta?.fullExchangeName || r.meta?.exchangeName || null,
    interval, range, candles: out,
  };
}

// ---- Coinbase Exchange: crypto spot pairs ----------------------------------
// granularity seconds: 60 300 900 3600 21600 86400
const CB_GRAN = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '1d': 86400 };
async function fetchCoinbase(product, { interval = '1d' } = {}) {
  const g = CB_GRAN[interval];
  if (!g) throw new Error(`coinbase interval ${interval} unsupported (use ${Object.keys(CB_GRAN).join('/')})`);
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles?granularity=${g}`;
  const rows = parseJSON(await httpGet(url), `coinbase ${product}`);   // [ [time, low, high, open, close, volume], ... ] newest-first
  if (!Array.isArray(rows)) throw new Error(`coinbase ${product}: unexpected payload`);
  const out = rows
    .map(([time, low, high, open, close, vol]) => ({ t: time, o: open, h: high, l: low, c: close, v: vol }))
    .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => a.t - b.t);                  // oldest-first, matches Yahoo
  return { symbol: product, source: 'coinbase', currency: product.split('-')[1] || null, exchange: 'Coinbase', interval, candles: out };
}

/**
 * crawl(symbol, opts) — read one instrument's flow.
 *   opts.source : 'yahoo' | 'coinbase' | 'auto' (default)
 *   opts.range / opts.interval : passed to the source
 * 'auto' routes CRYPTO-DASH pairs (BTC-USD) to Coinbase, everything else to Yahoo,
 * and if the primary source errors it falls back to the other where the symbol shape allows.
 */
async function crawl(symbol, opts = {}) {
  const { source = 'auto' } = opts;
  const looksCrypto = /^[A-Z0-9]{2,10}-[A-Z]{3,5}$/.test(symbol);
  const order = source === 'yahoo' ? ['yahoo']
    : source === 'coinbase' ? ['coinbase']
    : looksCrypto ? ['coinbase', 'yahoo'] : ['yahoo'];
  let lastErr;
  for (const s of order) {
    try {
      return s === 'coinbase' ? await fetchCoinbase(symbol, opts) : await fetchYahoo(symbol, opts);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`crawl(${symbol}) failed: ${lastErr && lastErr.message}`);
}

// crawl several instruments; never let one failure sink the batch
async function crawlMany(symbols, opts = {}) {
  const out = [];
  for (const sym of symbols) {
    try { out.push(await crawl(sym, opts)); }
    catch (e) { out.push({ symbol: sym, source: opts.source || 'auto', error: e.message, candles: [] }); }
  }
  return out;
}

module.exports = { crawl, crawlMany, fetchYahoo, fetchCoinbase, httpGet };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
parseJSON.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 9, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
httpGet.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
fetchYahoo.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
fetchCoinbase.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
crawl.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
crawlMany.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
