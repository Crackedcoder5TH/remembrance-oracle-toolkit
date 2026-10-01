'use strict';

/**
 * store-path.js — the one place the canonical pattern store's location is
 * resolved. A pure leaf (stdlib only), so both sides of the export/whitening
 * pair read it without requiring each other: store-export.js exports the
 * store's rows, whitening-reference.js keys its fitted reference on the
 * store's bytes, and before this leaf existed each required the other for
 * exactly one constant — the lexical cycle the cycle-ratchet caught
 * (2026-09-17). Nothing here measures; naming a path is not a reading.
 */

const path = require('node:path');

const HUB = path.resolve(__dirname, '..', '..');
const HOME = process.env.ECOSYSTEM_HOME || path.resolve(HUB, '..');
const VOID = process.env.VOID_ROOT || path.join(HOME, 'Void-Data-Compressor');
const STORE = path.join(VOID, 'data', 'pattern_store.npz');

module.exports = { HUB, HOME, VOID, STORE };
