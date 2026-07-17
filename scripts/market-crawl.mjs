#!/usr/bin/env node
// market-crawl.mjs — CLI over the market crawler: read the stock market's
// information/data flows, name their candlestick patterns, encode them for the
// substrate, and (optionally) harvest them into the pattern library.
//
// Usage:
//   node scripts/market-crawl.mjs AAPL MSFT SPY            # equities/indices (Yahoo)
//   node scripts/market-crawl.mjs BTC-USD ETH-USD          # crypto (Coinbase, auto-routed)
//   node scripts/market-crawl.mjs AAPL --range 1y --interval 1d
//   node scripts/market-crawl.mjs AAPL --json              # dump full JSON (feed+patterns+vectors)
//   node scripts/market-crawl.mjs AAPL SPY --harvest       # add flow vectors to the substrate library
//
// It reads the flow and reports it as it presents: bars pulled, candlestick
// pattern tally, and cross-instrument resonance in the substrate's own space.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { crawlMany } = require('../src/market/market-crawler');
const { encodeFlow, cosine, flows, patternFlow } = require('../src/market/market-encode');
const { ledgerFromCandles } = require('../src/market/temporal-signature');
const SL = require('../src/core/substrate-ledger');

const argv = process.argv.slice(2);
const opts = { range: '6mo', interval: '1d', source: 'auto' };
const flags = new Set();
const symbols = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--range') opts.range = argv[++i];
  else if (a === '--interval') opts.interval = argv[++i];
  else if (a === '--source') opts.source = argv[++i];
  else if (a.startsWith('--')) flags.add(a.slice(2));
  else symbols.push(a.toUpperCase());
}
if (!symbols.length) { console.error('usage: node scripts/market-crawl.mjs <SYMBOL...> [--range 6mo] [--interval 1d] [--source auto|yahoo|coinbase] [--json] [--harvest]'); process.exit(1); }

const feeds = await crawlMany(symbols, opts);
const encoded = feeds.map((f) => (f.error ? { symbol: f.symbol, source: f.source, error: f.error, bars: 0 } : { feed: f, ...encodeFlow(f) }));

if (flags.has('json')) {
  process.stdout.write(JSON.stringify(encoded.map((e) => e.feed ? { symbol: e.symbol, source: e.source, bars: e.bars, depth: e.depth, currency: e.feed.currency, patterns: e.patterns, vectors: e.vectors } : e), null, 2) + '\n');
  process.exit(0);
}

console.log(`MARKET FLOW — crawled ${symbols.length} instrument(s) @ ${opts.interval}/${opts.range}\n`);
for (const e of encoded) {
  if (e.error) { console.log(`  ${e.symbol.padEnd(10)} ERROR  ${e.error}`); continue; }
  const c = e.patterns.counts;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, k]) => `${n}×${k}`).join('  ');
  const cur = e.feed.currency ? ` ${e.feed.currency}` : '';
  console.log(`  ${e.symbol.padEnd(10)} ${String(e.bars).padStart(4)} bars ${(e.source + cur).padEnd(14)} depth ${e.depth}`);
  console.log(`     candlestick patterns: ${top || '(none of the named set fired)'}`);
}

// cross-instrument resonance in the substrate's space (close-flow vector), as measured
const ok = encoded.filter((e) => e.vectors);
if (ok.length >= 2) {
  console.log('\nCROSS-INSTRUMENT RESONANCE (cosine of close-flow substrate vectors):');
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    console.log(`  ${ok[i].symbol} · ${ok[j].symbol} = ${cosine(ok[i].vectors.close, ok[j].vectors.close).toFixed(3)}`);
  }
}

// --harvest: add the flow vectors to the Void pattern library under a market/
// namespace — every entry stamped with the substrate TIME DIMENSION (real
// observed window from the candle timestamps, ingest time + monotonic sequence,
// coherency reading, token count) and its raw waveform, so the retro-causal
// projector has a genuine ledger to work off of.
if (flags.has('harvest')) {
  const INDEX_PATH = process.env.SUBSTRATE_PATH || path.join(process.env.HARVEST_HOME || '/home/user', 'Void-Data-Compressor', 'pattern_index_fractal.json');
  const store = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const idx = store.index || store;
  let added = 0;
  let seq = SL.nextSequence(idx);                        // the substrate's own clock
  const now = new Date().toISOString();                 // when this data joins the substrate
  for (const e of ok) {
    const candles = e.feed.candles;
    const led = ledgerFromCandles(candles, opts.interval);   // real observed_start/end + cadence
    const f = flows(candles);
    const series = { close: f.close, ret: f.ret, body: f.body, range: f.range, patternPressure: patternFlow(candles) };
    for (const [flow, vec] of Object.entries(e.vectors)) {
      const key = `market/${e.source}/${e.symbol}/${flow}`;
      if (idx[key]) continue;
      const raw = series[flow] || [];
      const entry = { composed_v2: vec, waveform: raw, source: 'market-crawl', symbol: e.symbol, flow, bars: e.bars, interval: opts.interval };
      SL.stamp(entry, { sequence: seq++, now, series: raw, observedStart: led && led.observed_start, observedEnd: led && led.observed_end, cadence: led && led.cadence });
      idx[key] = entry;
      added++;
    }
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(store));
  console.log(`\nHARVEST: added ${added} market flow vectors to ${path.basename(INDEX_PATH)} (namespace market/), each time-stamped (seq up to ${seq - 1}, ingested_at ${now}).`);
}
