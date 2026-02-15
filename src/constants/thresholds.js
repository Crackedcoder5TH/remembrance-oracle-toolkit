/**
 * Centralized threshold constants for the Remembrance Oracle system.
 *
 * All magic numbers from the core scoring, validation, and decision
 * modules are collected here so changes happen in one place.
 *
 * Changing any value here affects the corresponding module behavior.
 * See inline comments for impact warnings.
 */

// ─── Coherency Scoring (coherency.js) ───

/** Dimension weights must sum to 1.0. testProof is highest because passing tests is concrete proof. */
const COHERENCY_WEIGHTS = {
  SYNTAX_VALID: 0.25,
  COMPLETENESS: 0.20,
  CONSISTENCY: 0.15,
  TEST_PROOF: 0.30,            // Highest — proven > everything
  HISTORICAL_RELIABILITY: 0.10,
};

/** Syntax scoring — graduated scale for parsability */
const SYNTAX_SCORES = {
  PERFECT: 1.0,                // Passes new Function() or equivalent
  BALANCED_BRACES: 0.7,        // Braces balance but doesn't parse (module code)
  INVALID: 0.2,                // Clearly broken
  UNKNOWN_BASE: 0.5,           // Unknown language baseline
  BALANCED_BONUS: 0.3,         // Bonus for balanced braces (unknown lang)
  STRUCTURE_BONUS: 0.2,        // Bonus for language keywords found
};

/** Completeness penalties — deductions for incomplete code */
const COMPLETENESS_PENALTIES = {
  MARKER_PENALTY: 0.15,        // Per TODO/FIXME/HACK — 5 markers = -0.75 (fails)
  PLACEHOLDER_PENALTY: 0.3,    // For ..., pass, raise NotImplementedError
  EMPTY_BODY_PENALTY: 0.2,     // For empty function bodies {}
};

/** Consistency penalties — deductions for style inconsistency */
const CONSISTENCY_PENALTIES = {
  MIXED_INDENT_PENALTY: 0.3,   // Mixed tabs and spaces
  NAMING_RATIO_THRESHOLD: 0.3, // Trigger when >30% of names use different convention
  MIXED_NAMING_PENALTY: 0.2,   // Penalty for mixed camelCase/snake_case
};

/** Default scores when data is missing */
const COHERENCY_DEFAULTS = {
  TEST_PROOF_FALLBACK: 0.5,            // When test status unknown
  HISTORICAL_RELIABILITY_FALLBACK: 0.5, // When no usage history
};

/** Rounding precision for coherency scores */
const ROUNDING_FACTOR = 1000; // Math.round(x * 1000) / 1000 = 3 decimals

// ─── Validation (validator.js) ───

/** Minimum coherency to accept code into the store. Changing this affects ALL submissions. */
const MIN_COHERENCY_THRESHOLD = 0.6;

/** Default timeout for sandbox test execution (ms) */
const DEFAULT_VALIDATION_TIMEOUT_MS = 10000;

// ─── Relevance Scoring (relevance.js) ───

/** Minimum token length for search terms (skip single-char noise) */
const MIN_TOKEN_LENGTH = 1;

/** Code substance tiers — shorter code is penalized in relevance ranking */
const CODE_SUBSTANCE = {
  TRIVIAL_THRESHOLD: 35,   TRIVIAL_WEIGHT: 0.4,    // One-liners, trivial getters
  SHORT_THRESHOLD: 70,     SHORT_WEIGHT: 0.75,      // Real but short functions
  MEDIUM_THRESHOLD: 130,   MEDIUM_WEIGHT: 0.9,      // Typical utility functions
  FULL_WEIGHT: 1.0,                                  // Comprehensive code
};

/** Short name penalty — names ≤2 chars are generic and get halved relevance */
const NAME_PENALTY = {
  SHORT_THRESHOLD: 2,
  SHORT_WEIGHT: 0.5,
};

/** Relevance composition weights (must sum to 1.0) */
const RELEVANCE_WEIGHTS = {
  TEXT_SCORE: 0.35,            // TF-IDF dominates
  TAG_OVERLAP: 0.25,           // User-curated tags
  LANGUAGE_MATCH: 0.15,        // Nice-to-have
  COHERENCY: 0.25,             // Proven code ranks high
};

/** Default query parameters */
const RELEVANCE_DEFAULTS = {
  LIMIT: 10,
  MIN_RELEVANCE: 0.1,
  MIN_COHERENCY: 0.0,
};

// ─── Decision Engine (library.js) ───

/** Core decision thresholds — controls PULL/EVOLVE/GENERATE behavior */
const DECISION_THRESHOLDS = {
  PULL: 0.68,                  // Use as-is — high confidence
  EVOLVE: 0.50,                // Fork & improve — medium confidence
  GENERATE: 0.50,              // Write new — low/no match
  RETIRE: 0.30,                // Remove — unreliable
};

/** Pattern ID hash truncation (16 hex chars = 64 billion unique IDs) */
const HASH_TRUNCATION_LENGTH = 16;

/** Scoring bonuses for pattern attributes */
const DECISION_BONUSES = {
  NAME_MATCH: 0.15,            // Name includes description or vice versa
  ATOMIC_FOCUS: 0.08,          // Simple, focused patterns — more reusable
  COMPOSITE_FOCUS: 0.04,       // Complex patterns — half the boost
};

/** Bug report penalty per report */
const BUG_PENALTY_MULTIPLIER = 0.1;

/** Vote boost configuration */
const VOTE_BOOST = {
  MULTIPLIER: 0.02,            // Each vote: ±2%
  MAX: 0.15,                   // Cap at ±15%
  MIN: -0.15,
};

/** Composite score weights for decision engine */
const DECISION_WEIGHTS = {
  RELEVANCE: 0.35,
  COHERENCY: 0.25,
  RELIABILITY: 0.20,
};

/** Minimum relevance required before pulling/evolving (prevents noise matches) */
const RELEVANCE_GATES = {
  FOR_PULL: 0.3,               // Conservative — must be relevant
  FOR_EVOLVE: 0.2,             // More lenient — willing to fork weaker matches
};

/** Complexity classification thresholds */
const COMPLEXITY_TIERS = {
  ATOMIC: { MAX_LINES: 15, MAX_NESTING: 2 },
  COMPOSITE: { MAX_LINES: 60, MAX_NESTING: 4 },
};

/** Retirement scoring weights */
const RETIREMENT_WEIGHTS = {
  COHERENCY: 0.6,
  RELIABILITY: 0.4,
};

// ─── Recycler & Growth (recycler.js) ───

/** Cascade amplification — drives exponential library growth */
const CASCADE = {
  BETA: 2.5,                   // Exponential scaling factor
  GAMMA_BASE: 0.05,            // Base amplification (5%)
  VOID_SCAFFOLD_THRESHOLD: 0.3, // Below this coherency, inject scaffolding
  VOID_SCAFFOLD_MIN_COHERENCY: 0.8, // Only scaffold from high-quality patterns
};

/** Healing configuration */
const HEALING = {
  MAX_ATTEMPTS: 3,             // Try healing up to 3 times
  MAX_REFINE_LOOPS: 5,         // Max reflection loops per attempt
  TARGET_COHERENCE: 0.9,       // Aim for 90% coherency after healing
};

/** Void replenishment weights (tag relevance matters more than coherency) */
const VOID_REPLENISH_WEIGHTS = {
  COHERENCY: 0.4,
  TAG_RELEVANCE: 0.6,
};

/** Variant generation limits */
const VARIANT_GENERATION = {
  DEPTH: 2,                    // Generate 2 levels deep
  MAX_PATTERNS_PER_LEVEL: 3,   // Process 3 patterns per level
  BATCH_MULTIPLIER: 10,        // Max patterns per wave = MAX_PATTERNS * 10
  LARGE_FILE_THRESHOLD: 500,   // Skip files >500 lines
};

/** Approach swap — exploratory, so more lenient */
const APPROACH_SWAP = {
  REFINE_LOOPS: 2,
  TARGET_COHERENCE: 0.85,
};

/** Iterative refinement of proven patterns — strict because refining proven code */
const ITERATIVE_REFINE = {
  REFINE_LOOPS: 2,
  TARGET_COHERENCE: 0.95,
};

/** Candidate generation floor */
const CANDIDATE_MIN_COHERENCY = 0.5;

/** Max ternary nesting for Python transpilation viability */
const MAX_TERNARY_NESTING = 2;

module.exports = {
  // Coherency
  COHERENCY_WEIGHTS,
  SYNTAX_SCORES,
  COMPLETENESS_PENALTIES,
  CONSISTENCY_PENALTIES,
  COHERENCY_DEFAULTS,
  ROUNDING_FACTOR,
  // Validation
  MIN_COHERENCY_THRESHOLD,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  // Relevance
  MIN_TOKEN_LENGTH,
  CODE_SUBSTANCE,
  NAME_PENALTY,
  RELEVANCE_WEIGHTS,
  RELEVANCE_DEFAULTS,
  // Decision engine
  DECISION_THRESHOLDS,
  HASH_TRUNCATION_LENGTH,
  DECISION_BONUSES,
  BUG_PENALTY_MULTIPLIER,
  VOTE_BOOST,
  DECISION_WEIGHTS,
  RELEVANCE_GATES,
  COMPLEXITY_TIERS,
  RETIREMENT_WEIGHTS,
  // Recycler
  CASCADE,
  HEALING,
  VOID_REPLENISH_WEIGHTS,
  VARIANT_GENERATION,
  APPROACH_SWAP,
  ITERATIVE_REFINE,
  CANDIDATE_MIN_COHERENCY,
  MAX_TERNARY_NESTING,
};
