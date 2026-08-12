'use strict';

/**
 * Field-coupling — FAÇADE.
 *
 * The coupling surface was a 1,152-line monolith; decomposition #4 split
 * it into organs under src/core/field-coupling/ and this module remains
 * the stable public surface — same 25 exports, byte-compatible:
 *
 *   field-coupling/engine.js    singleton/injection/lastReading ownership
 *   field-coupling/verbs.js     contribute, peekField, pressure, record*
 *   field-coupling/validate.js  variance-signature gate + baseline
 *   field-coupling/shapes.js    recognised-shape growth (gated persist)
 *   field-coupling/bridge.js    live-field HTTP bridge
 *   field-coupling/pressure.js  cascade-release bookkeeping
 *   field-coupling/history.js   direction + temporal snapshots (gated)
 *
 * The monolith carried a file-level infrastructure exemption; the organs
 * carry NONE — the two real mutations ride sealed covenant gates.
 */

const { lastReading, localUpdateCount, _setEngine } = require('./field-coupling/engine');
const {
  contribute, peekField, fieldPressure, projectContribution, pruneFieldSources,
  recordCost, recordBenefit, recordStorageVolume, recordMetaObservation,
} = require('./field-coupling/verbs');
const {
  setVarianceGateMode, getVarianceGateMode, validateContribution, cognitionTrajectory,
} = require('./field-coupling/validate');
const {
  recordLearnedShape, recognizedShapeSignatures, _resetLearnedShapes, learnedShapesByDomain,
} = require('./field-coupling/shapes');
const { markFieldServer } = require('./field-coupling/bridge');
const { pressureSnapshot, cascadeReleaseHistory } = require('./field-coupling/pressure');
const { fieldDirection, recordTemporalSnapshot } = require('./field-coupling/history');

module.exports = {
  contribute,
  lastReading,
  markFieldServer,
  peekField,
  fieldPressure,
  pressureSnapshot,
  cascadeReleaseHistory,
  localUpdateCount,
  projectContribution,
  validateContribution,
  recordLearnedShape,
  recognizedShapeSignatures,
  recordCost,
  recordBenefit,
  recordStorageVolume,
  recordMetaObservation,
  cognitionTrajectory,
  learnedShapesByDomain,
  fieldDirection,
  recordTemporalSnapshot,
  setVarianceGateMode,
  getVarianceGateMode,
  _resetLearnedShapes,
  _setEngine,
  pruneFieldSources,
};
