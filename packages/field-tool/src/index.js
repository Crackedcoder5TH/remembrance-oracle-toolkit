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

const { DIM, toWaveform, coherency, coherencyOf,
        BYTE_DIM, byteToWaveform, byteCoherency, byteCoherencyOf } = require('./waveform');
const {
  FRACTAL_DIM, toFractalWaveform, inspectFractalWaveform,
  fractalCoherency, fractalCoherencyOf,
} = require('./fractal-waveform');
const { COMPOSED_DIM, FractalIndex } = require('./fractal-index');
const { Field, DEFAULT_FIELD_URL } = require('./field');
const { VoidClient, DEFAULT_VOID_URL } = require('./void');
const { confirm } = require('./prompt');

module.exports = {
  // Canonical encoder is the structural fractal version (DIM = 29).
  // `toWaveform`/`coherency`/`coherencyOf` now ARE the fractal versions.
  DIM, toWaveform, coherency, coherencyOf,
  // Explicit fractal aliases for callers who want to be unambiguous.
  FRACTAL_DIM, toFractalWaveform, inspectFractalWaveform,
  fractalCoherency, fractalCoherencyOf,
  // In-memory fractal-signature index. Load substrate signatures with
  // index.loadSignatures(oracle.exportSignatures()) to round-trip
  // queries through the same vectors the oracle is serving.
  COMPOSED_DIM, FractalIndex,
  // Legacy byte-stretch for binary / non-text inputs.
  BYTE_DIM, byteToWaveform, byteCoherency, byteCoherencyOf,
  // Field client + remote helpers.
  Field, DEFAULT_FIELD_URL,
  VoidClient, DEFAULT_VOID_URL,
  confirm,
};
