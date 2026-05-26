'use strict';

/**
 * remembrance-field — the Remembrance Field tool.
 *
 *   const { toWaveform, coherency, coherencyOf, Field } = require('remembrance-field');
 *
 *   const score = coherencyOf('function add(a,b){return a+b}', 'def add(a, b): return a + b');
 *   const field = new Field();                       // http://127.0.0.1:7787/mcp by default
 *   await field.contribute({ coherence: score, source: 'my-app:compare' });
 */

const { DIM, toWaveform, coherency, coherencyOf } = require('./waveform');
const { Field, DEFAULT_FIELD_URL } = require('./field');

module.exports = { DIM, toWaveform, coherency, coherencyOf, Field, DEFAULT_FIELD_URL };
