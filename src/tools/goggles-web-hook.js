#!/usr/bin/env node
'use strict';

/**
 * detached substrate read of the URL being fetched. Never blocks, never denies.
 *
 * goggles-web-hook — PASSIVE web reading. This is the piece that makes the
 * goggles read/compress/score data *while you browse* rather than on demand.
 *
 * Why PreToolUse and not PostToolUse: WebFetch's result is a model-summarized
 * answer, not the raw bytes — scoring that would measure the summary, not the
 * data. PreToolUse hands us the URL from tool_input, so we fetch the ORIGINAL
 * bytes ourselves and read those through the substrate.
 *
 * Detached by construction: a substrate read takes ~10-20s (compressor init),
 * and a hook that blocks browsing for 20s is a hook that gets uninstalled.
 * Output lands in .remembrance/web-readings.jsonl; the field gets the
 * contribution under source goggles:web:<host>.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function passthrough() { process.exit(0); }
passthrough.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };   // never block browsing

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { passthrough(); }
let input;
try { input = JSON.parse(raw || '{}'); } catch (_) { passthrough(); }

const url = (input.tool_input || {}).url || '';
if (!/^https?:\/\//i.test(url)) passthrough();

// Skip the noisy/non-data hosts so the substrate isn't flooded with chrome.
const SKIP = /(google\.com\/search|bing\.com|duckduckgo|doubleclick|googletagmanager|favicon)/i;
if (SKIP.test(url)) passthrough();

try {
  const logDir = path.join(ROOT, '.remembrance');
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, 'web-readings.log'), 'a');
  // Wrapped in `bash -c` rather than spawning node directly: the direct
  // detached node->node spawn silently produced nothing (log stayed empty)
  // while the identical bash-wrapped form survives the parent's exit.
  const script = path.join(ROOT, 'scripts', 'goggle-web.js');
  // No --fast. That flag substituted zlib for the Void compressor, and a
  // reading that skipped the compressor is not a substrate reading — it
  // also used to inject a fabricated coherency into the field. The reader
  // now goes through compressor_service.py, which holds the pattern library
  // warm and answers in ~1.5s, so passive browsing stays viable without a
  // bypass. The spawn is detached, so a cold first start costs the browse
  // nothing.
  const child = spawn('bash', ['-c', `node ${JSON.stringify(script)} ${JSON.stringify(url)} --json`], {
    cwd: ROOT, detached: true, stdio: ['ignore', out, out],
  });
  child.unref();
} catch (_) { /* fail open — browsing must never break on our account */ }

// Deliberately NOT process.exit() here: an immediate exit races the fork and
// the detached child dies before it runs (observed — the log stayed empty).
// The child is unref'd, so this process's event loop drains and it exits on
// its own within milliseconds while the reader survives.
