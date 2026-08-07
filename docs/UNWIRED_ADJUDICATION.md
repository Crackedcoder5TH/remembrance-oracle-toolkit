# Unwired-Capability Adjudication Ledger

**Source:** trap #24 sweep (2026-08-07) — 2,635 exports across 409 src files,
refined to 120 functions with zero callers on any consumer path (in-file calls,
src/scripts/bin, .github, packages, plugin and cathedral surfaces all checked).
**Rule:** every item gets a verdict and a reason. A capability is only real when
a consumer reaches it — but not every zero-caller function is debt; the verdict
distinguishes the species.

## Verdicts

### WIRED (11) — done
| item | wired into |
|---|---|
| 10 audit-pattern detectors (`src/patterns/audit-patterns/*`) | `auditCode` via `src/audit/pattern-detectors.js` bridge. 7 precise detectors default-on; 3 string-level ones (`null-property-access-guard`, `wrong-property-access`, `falsy-zero-coercion`) advisory-tier (`options.advisoryPatterns`) because the AST checkers already cover their classes with scope awareness — measured 558/582 of the noise. Shell detector taught to skip `db.exec` (SQL is the taint checker's territory). |
| `updateVoterReputation` (sqlite) | `patternFeedback` — the reputation loop closes (071bde5). |

### ELEMENT CORPUS (27) — keep; zero callers is by design
- `src/utils/gap-filled.js` + `gap-filled-wave2.js` (25 fns): specified by the
  periodic table's discovery loop to fill property-space gaps — existence is
  the deliverable; adoption is organic (`deepEqual`: 58 callers). Headers now
  say so, so future sweeps classify them out.
- `sierpinskiDensity`, `barnsleyFern` (`src/fractals/engines.js`): fractal
  mathematics corpus.

### KEEP — declared API / partial-adoption library (24)
| item | reason |
|---|---|
| `covenant-utils` 7 fns (`secureRandom`, `timeConstantCompare`, `maskEmail`, `rateLimitKey`, `tokenBucketCheck`, `validateOrigin`, `checksumBuffer`) | security utility library with organic adoption already underway (`hashString`, `sanitizeInput`: 26+ callers). |
| `byteCodeToWaveform`, `byteWaveformCosine` | fractal-waveform header explicitly keeps byte-stretch "available under explicit `byte*` names for binary / non-textual inputs". |
| `toFractalLadder`, `fractalCoherencyOfRecursive`, `fractalCoherencyMultiScale`, `composedCoherencyOf` | encoder-spec variant surface (FRACTAL_WAVEFORM_SPEC.md). |
| `reconstructHierarchical`, `detectHierarchicalFamilies`, `decompressPattern` | compression library API. |
| `recognizedShapeSignatures`, `localUpdateCount` (field-coupling) | field introspection accessors. |
| `decodeSignature` (periodic-table), `getLastSearchTimestamp`, `safeFilename`, `getProductionSeeds`, `getProductionSeeds2` | introspection / data accessors on adopted modules. |
| `formatMultiPRBody`, `parseCronInterval`, `getCircuitStatus` (reflector) | reflector feature surface behind the public `reflector*` wrappers. |
| `registerFeedbackSignal`, `unifiedFieldMeasurement`, `quickAmplitude`, `shouldEntangle` | unified/quantum layer surface. |

### WIRE-LATER (8) — real features whose consumer path is a design decision
| item | natural consumer |
|---|---|
| `maybeAbsorbPattern` + `maybeAbsorbBatch` (covenant-trust) | the submit/absorb pipeline — field-validated growth is currently reachable only from a diagnostic script. Biggest one here. |
| `auditSourceForLies` (grounding-semantics) | goggles META-DEBUG / audit engine. |
| `classifyDebugFix` (resolve-hook) | the resolve-hook pipeline. |
| `loadIgnoreFile` (suppressions) | `auditFiles` — an `.auditignore` feature, written and unplugged. |
| `detectHiddenIdentifiers` (void-indirection) | void-scan. |
| `checkFractalIntegrity` + `repairFractalIntegrity` | `oracle_maintain`. |
| `withOfflineQueue` (sync-queue) | persistence sync path. |
| `generateWithGate` (swarm) | swarm generation entry. |

### RETIRE — pending your approval (~50, all [DEAD]: no callers, no tests)
Deletion is destructive and git is the only undo, so this batch executes only
on an explicit go. Representative members (full list = the `deadTrue` minus
keeps above): `seedCuratedLibrary` (superseded seeding path),
`generateFractalSignature`, `allEntries`, `classificationStrength`,
`diffCallGraphs`, `checkFiles`, `parseLanguage`, `jsonOrPrint`,
`negotiateMulti`, `addNegotiationEndpoints`, `generateDispatchWorkflow`,
`parseIssue`, `buildEvent`, covenant-spec accessors (`waveformConstant`,
`principleById`, `structuralGates`, `domainsForUri`, `specPath`),
`getCovenantCalibration`, `registerLayer`, `reflectionFeedback`,
`contributeLayerAgreement`, function-record trio, `getPendingElements`,
`setRunnerRegistry`, `getDensityState`, `sealReads`, `readingOf`, `selfTest`,
`getModeInfo`, `crossVerify`, `withOperationalTrackingSync`,
`requireRole`/`scopedAccess` (access-control — verify the dashboard doesn't
reach them dynamically before deleting), `healQuick`/`healFull`/`healSweep`,
`debugBridge`/`quantumScorer` (unified index re-exports), `trustedSources`,
`isInfrastructureFile`, `isRecognizedPattern`, `recognizedPatterns`.

## The refined species definition (feeds trap #24)
Zero callers alone is a *lead*. The disease is **zero callers + intent to be
called** (detectors, `updateVoterReputation`). Corpus existence
(gap-filled), declared API surface, and spec variants are healthy
zero-caller classes. The sweep must check in-file calls, all consumer
surfaces, dynamic dispatch, and declared intent before pronouncing.
