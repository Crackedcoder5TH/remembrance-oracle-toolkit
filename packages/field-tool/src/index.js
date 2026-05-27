'use strict';

/**
 * @crackedcoder5th/remembrance-field — the Remembrance Field tool.
 *
 * Standalone (offline):
 *   const { toWaveform, coherency, coherencyOf } = require('@crackedcoder5th/remembrance-field');
 *   const score = coherencyOf('foo', 'foo bar');
 *
 * Connected (uses YOUR Void compressor's collected substrate for accuracy):
 *   const { VoidClient } = require('@crackedcoder5th/remembrance-field');
 *   const void_ = new VoidClient();                       // http://127.0.0.1:8080 by default
 *   const r = await void_.coherence('some code');         // substrate-backed score
 *   await void_.submitPattern({ name, code, language });  // contribute (get consent first!)
 *
 * Field (shared conserved scalar):
 *   const { Field } = require('@crackedcoder5th/remembrance-field');
 *   await new Field().contribute({ coherence: score, source: 'my-app' });
 */

const { DIM, toWaveform, coherency, coherencyOf } = require('./waveform');
const { Field, DEFAULT_FIELD_URL } = require('./field');
const { VoidClient, DEFAULT_VOID_URL } = require('./void');
const { confirm } = require('./prompt');

module.exports = {
  DIM, toWaveform, coherency, coherencyOf,
  Field, DEFAULT_FIELD_URL,
  VoidClient, DEFAULT_VOID_URL,
  confirm,
};
