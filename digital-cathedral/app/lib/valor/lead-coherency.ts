/**
 * Valor Lead Coherency — the scoring replacement.
 *
 * Reduces a lead to its 16-dimensional shape, runs a cascade against the
 * archetype library, and returns a coherency score in [0, 1] plus the
 * dominant archetype. Replaces the weighted-sum lead-scoring.ts with the
 * same math used across the rest of the ecosystem (oracle SERF, void cascade).
 *
 * The score is the geometric mean of the per-dimension signals — a weakest-link
 * aggregate. No single dimension can carry a bad lead. A bot that maxes every
 * structured field but has zero timing cadence scores near zero overall.
 */

import {
  cascade,
  CascadeMatch,
  clamp01,
  COHERENCY_THRESHOLDS,
  CoherencyTier,
  geometricMean,
  tierFor,
} from './coherency-primitives';
import {
  archetypeGroup,
  archetypesAsSubstrateMap,
  LEAD_DIM,
  LEAD_DIMENSIONS,
  LeadDimension,
} from './lead-substrates';

/** Minimum set of fields the extractor needs. All optional — missing = zero. */
export interface LeadInput {
  readonly coverageInterest?: string;
  readonly purchaseIntent?: string;
  readonly veteranStatus?: string;
  readonly militaryBranch?: string;
  readonly state?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly dateOfBirth?: string;
  readonly consentTcpa?: boolean;
  readonly consentPrivacy?: boolean;
  readonly consentText?: string;
  readonly consentTimestamp?: string;
  readonly utmSource?: string | null;
  readonly utmMedium?: string | null;
  readonly utmCampaign?: string | null;
  readonly createdAt?: string;

  /** Optional behavioral envelope — honeypot timestamp and per-step timings. */
  readonly submitElapsedMs?: number;
  readonly stepTimingsMs?: readonly number[];
}

export interface LeadCoherency {
  readonly score: number;
  readonly tier: CoherencyTier;
  readonly dominantArchetype: string;
  readonly dominantGroup: 'valor' | 'fraud' | 'bot' | 'unknown';
  readonly dimensions: Readonly<Record<LeadDimension, number>>;
  readonly shape: readonly number[];
  readonly matches: readonly CascadeMatch[];
  readonly admitted: boolean;
}

/* ── Dimension extractors ─────────────────────────────────────────── */

const HIGH_VALUE_STATES = new Set([
  'TX', 'FL', 'CA', 'NY', 'PA', 'OH', 'IL', 'GA', 'NC', 'VA',
  'NJ', 'MI', 'TN', 'AZ', 'IN', 'MO', 'MD', 'WI', 'SC', 'AL',
]);
const MEDIUM_VALUE_STATES = new Set([
  'CO', 'MN', 'LA', 'KY', 'OR', 'OK', 'CT', 'IA', 'MS', 'AR',
  'KS', 'UT', 'NV', 'NE', 'WV', 'NM', 'HI', 'NH', 'ME', 'ID',
]);

const COVERAGE_CLARITY: Record<string, number> = {
  'mortgage-protection': 0.92,
  'income-replacement': 0.92,
  'final-expense': 0.88,
  'legacy': 0.95,
  'retirement-savings': 0.82,
  'guaranteed-income': 0.78,
  'not-sure': 0.30,
};

const INTENT_STRENGTH: Record<string, number> = {
  'protect-family': 0.95,
  'want-protection': 0.70,
  'exploring': 0.30,
};

// The "veteran_integrity" dimension originally penalized anyone without
// service connection. The site now accepts civilian leads explicitly, so
// "civilian" gets a neutral score rather than a penalty — they're a
// legitimate category, not a degraded veteran. Family members stay mid-
// range (0.55) because their value to carriers is typically higher than
// pure civilians for veteran-adjacent products, but lower than service
// members themselves.
const VETERAN_INTEGRITY: Record<string, number> = {
  'active-duty': 0.98,
  'veteran': 0.95,
  'reserve': 0.90,
  'national-guard': 0.90,
  'non-military': 0.55,  // military family member
  'civilian': 0.50,      // no military affiliation — neutral, not penalized
};

function scoreEmail(email: string | undefined): number {
  if (!email) return 0;
  // Minimal format + suspicious-pattern check. Full validation lives in validation.ts.
  const at = email.indexOf('@');
  if (at <= 0 || at === email.length - 1) return 0.2;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes('.')) return 0.3;
  // Known-bad patterns (disposable / abusive)
  const disposable = /mailinator|guerrilla|tempmail|10minutemail|throwaway|yopmail/;
  if (disposable.test(domain)) return 0.15;
  // Local-part quality
  const local = email.slice(0, at);
  const randomish = /^[a-z0-9]{20,}$/i.test(local) || /^[a-z]+[0-9]{6,}$/i.test(local);
  if (randomish) return 0.55;
  return 0.9;
}

function scorePhone(phone: string | undefined): number {
  if (!phone) return 0;
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 11) return 0.2;
  // All-same digits or obviously-fake sequences
  if (/^(\d)\1+$/.test(digits)) return 0.05;
  if (digits.endsWith('0000000') || digits.includes('1234567')) return 0.15;
  // 555-01xx reserved range
  const area = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
  if (area === '555') return 0.25;
  return 0.9;
}

function scoreName(name: string | undefined): number {
  if (!name) return 0;
  const trimmed = name.trim();
  if (trimmed.length < 2) return 0.1;
  if (trimmed.length > 40) return 0.3;
  // Too many non-letters (numbers, symbols)
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letters / trimmed.length < 0.7) return 0.2;
  // All same letter / obvious filler
  if (/^(.)\1+$/i.test(trimmed)) return 0.05;
  if (/^(test|asdf|qwerty|abc|xxx)/i.test(trimmed)) return 0.1;
  return 0.9;
}

function scoreDob(dob: string | undefined): number {
  if (!dob) return 0;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 0.1;
  const yearsAgo = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (yearsAgo < 18 || yearsAgo > 100) return 0.2;
  if (yearsAgo < 25 || yearsAgo > 85) return 0.75;
  return 0.95;
}

function scoreTimingCadence(elapsedMs: number | undefined): number {
  if (elapsedMs === undefined) return 0.6; // absence is neutral
  if (elapsedMs < 1500) return 0.05;   // obviously-bot fast
  if (elapsedMs < 3000) return 0.25;
  if (elapsedMs < 8000) return 0.70;
  if (elapsedMs < 60_000) return 0.92;
  if (elapsedMs < 600_000) return 0.80; // user wandered but OK
  return 0.40;                          // suspiciously long (session hijack?)
}

function scoreStepRhythm(stepTimings: readonly number[] | undefined): number {
  if (!stepTimings || stepTimings.length < 2) return 0.55;
  // Human pattern: variable timings with some dispersion.
  // Bot pattern: near-constant timings or monotonically-increasing with no variance.
  const mean = stepTimings.reduce((s, v) => s + v, 0) / stepTimings.length;
  if (mean <= 0) return 0.05;
  let variance = 0;
  for (const t of stepTimings) variance += (t - mean) * (t - mean);
  variance /= stepTimings.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  // Too-low CV → bot-flat; too-high CV → noisy/abandoned.
  if (cv < 0.08) return 0.10;
  if (cv < 0.20) return 0.55;
  if (cv < 0.80) return 0.92;
  if (cv < 1.5) return 0.75;
  return 0.40;
}

function scoreStateMarket(state: string | undefined): number {
  if (!state) return 0;
  const code = state.toUpperCase();
  if (HIGH_VALUE_STATES.has(code)) return 0.90;
  if (MEDIUM_VALUE_STATES.has(code)) return 0.70;
  if (code.length === 2) return 0.50;
  return 0.20;
}

function scoreRecency(createdAt: string | undefined): number {
  if (!createdAt) return 0.95;
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (3600 * 1000);
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0.95;
  if (ageHours < 1) return 0.98;
  if (ageHours < 6) return 0.92;
  if (ageHours < 24) return 0.80;
  if (ageHours < 72) return 0.55;
  return 0.25;
}

function scoreConsent(lead: LeadInput): number {
  let s = 0;
  if (lead.consentTcpa) s += 0.4;
  if (lead.consentPrivacy) s += 0.3;
  if (lead.consentText && lead.consentText.length >= 40) s += 0.2;
  if (lead.consentTimestamp) s += 0.1;
  return clamp01(s);
}

function scoreMarketingContext(lead: LeadInput): number {
  // Organic traffic with no UTM is fine (0.5 baseline); any UTM presence lifts it.
  const present = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter((v) => !!v).length;
  if (present === 0) return 0.55;
  if (present === 1) return 0.70;
  if (present === 2) return 0.85;
  return 0.95;
}

function scoreCompleteness(lead: LeadInput): number {
  const fields: (keyof LeadInput)[] = [
    'firstName', 'lastName', 'email', 'phone', 'dateOfBirth',
    'state', 'coverageInterest', 'purchaseIntent', 'veteranStatus',
  ];
  let hits = 0;
  for (const f of fields) if (lead[f]) hits++;
  return hits / fields.length;
}

function scoreBranchSpecificity(lead: LeadInput): number {
  if (!lead.veteranStatus) return 0;
  // Non-service statuses don't need a branch and aren't penalized for
  // lacking one. Family members score mid-range; civilians score neutral.
  if (lead.veteranStatus === 'non-military') return 0.30;
  if (lead.veteranStatus === 'civilian') return 0.25;
  return lead.militaryBranch ? 0.92 : 0.55;
}

function scoreSessionCoherence(lead: LeadInput): number {
  // Without richer session telemetry, proxy from what we have:
  // consent completeness + UTM presence + timing sanity.
  const consentOK = lead.consentTcpa && lead.consentPrivacy ? 0.5 : 0.1;
  const utmOK = (lead.utmSource || lead.utmMedium) ? 0.3 : 0.15;
  const timingOK = (lead.submitElapsedMs && lead.submitElapsedMs >= 3000) ? 0.2 : 0.05;
  return clamp01(consentOK + utmOK + timingOK);
}

/** Extract the 16-dimensional lead shape. */
export function extractLeadShape(lead: LeadInput): number[] {
  const shape = new Array<number>(LEAD_DIM);
  shape[0] = COVERAGE_CLARITY[lead.coverageInterest || ''] ?? 0.25;
  shape[1] = INTENT_STRENGTH[lead.purchaseIntent || ''] ?? 0.25;
  shape[2] = VETERAN_INTEGRITY[lead.veteranStatus || ''] ?? 0.30;
  shape[3] = scoreBranchSpecificity(lead);
  shape[4] = scoreStateMarket(lead.state);
  shape[5] = scoreCompleteness(lead);
  shape[6] = scoreRecency(lead.createdAt);
  shape[7] = scoreConsent(lead);
  shape[8] = scoreEmail(lead.email);
  shape[9] = scorePhone(lead.phone);
  shape[10] = (scoreName(lead.firstName) + scoreName(lead.lastName)) / 2;
  shape[11] = scoreDob(lead.dateOfBirth);
  shape[12] = scoreMarketingContext(lead);
  shape[13] = scoreSessionCoherence(lead);
  shape[14] = scoreTimingCadence(lead.submitElapsedMs);
  shape[15] = scoreStepRhythm(lead.stepTimingsMs);
  return shape;
}

/* ── The scoring entry point ──────────────────────────────────────── */

/**
 * Score a lead by coherency against the archetype library.
 *
 * The returned score is the geometric mean of the lead's own dimension
 * strengths, scaled by the resonance with valor archetypes and suppressed
 * by resonance with fraud/bot archetypes. One single weak dimension or
 * one strong bot-archetype correlation drags the score down — weakest-link
 * property preserved end to end.
 */
export function scoreLeadByCoherency(lead: LeadInput): LeadCoherency {
  const shape = extractLeadShape(lead);
  const dims = {} as Record<LeadDimension, number>;
  for (let i = 0; i < LEAD_DIM; i++) {
    dims[LEAD_DIMENSIONS[i]] = shape[i];
  }

  // Cascade the shape against the archetype library.
  const result = cascade(shape, archetypesAsSubstrateMap());

  // Separate valor (harmonic) vs fraud/bot (anti-phase) signals.
  let valorMax = 0;
  let suppressMax = 0;
  let dominantArchetype = '';
  let dominantAbs = 0;
  for (const m of result.matches) {
    const group = archetypeGroup(m.name);
    const abs = Math.abs(m.r);
    if (abs > dominantAbs) {
      dominantAbs = abs;
      dominantArchetype = m.name;
    }
    if (group === 'valor') {
      // Positive correlation with a valor archetype is good.
      if (m.r > valorMax) valorMax = m.r;
    } else if (group === 'fraud' || group === 'bot') {
      // Positive correlation with fraud/bot is bad — suppresses score.
      if (m.r > suppressMax) suppressMax = m.r;
    }
  }

  // Geometric mean of the lead's own dimensions (weakest-link floor).
  const intrinsic = geometricMean(shape);

  // Valor lift: how strongly the shape aligns with a valor archetype.
  const lift = clamp01(Math.max(valorMax, 0));

  // Suppression fires only when bot/fraud resonance WINS over valor resonance.
  // Real leads share some high-then-lower-timing structure with bot archetypes
  // (Pearson only sees shape, not magnitude). Treating any bot-similarity as
  // suppression would crush legitimate leads. The correct signal is dominance:
  // suppress only when the lead is more bot-like than valor-like.
  const valorPositive = Math.max(valorMax, 0);
  const suppressPositive = Math.max(suppressMax, 0);
  const suppression = suppressPositive > valorPositive
    ? clamp01(1 - suppressPositive)
    : 1.0;

  // Final coherency = geometric mean of the three signals (weakest-link law).
  const score = geometricMean([intrinsic, lift, suppression]);
  const tier = tierFor(score);
  const dominantGroup = archetypeGroup(dominantArchetype);
  const admitted = score >= COHERENCY_THRESHOLDS.GATE && dominantGroup !== 'bot';

  return {
    score,
    tier,
    dominantArchetype,
    dominantGroup,
    dimensions: dims,
    shape,
    matches: result.matches,
    admitted,
  };
}

/* ── Legacy-tier mapping ──────────────────────────────────────────── */

/**
 * Map a coherency score to the existing tier names used by lead-distribution,
 * admin emails, and the SSE broadcast. Keeps downstream code unchanged while
 * the underlying math is now coherency-native.
 */
export type LegacyTier = 'hot' | 'warm' | 'standard' | 'cool';

export function legacyTierFor(score: number): LegacyTier {
  if (score >= COHERENCY_THRESHOLDS.TRANSCENDENCE) return 'hot';
  if (score >= COHERENCY_THRESHOLDS.SYNERGY) return 'warm';
  if (score >= COHERENCY_THRESHOLDS.FOUNDATION) return 'standard';
  return 'cool';
}

/**
 * Legacy total (0–100) derived from the coherency score. Keeps the numeric
 * band admin UI expects, but it's now a projection of the coherency math,
 * not a separate calculation.
 */
export function legacyTotalFor(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
