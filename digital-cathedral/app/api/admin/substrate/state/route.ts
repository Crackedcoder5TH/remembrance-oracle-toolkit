/**
 * GET /api/admin/substrate/state
 *
 * Comprehensive read-only snapshot of every coherency-relevant
 * substrate signal the operator might want to see, in one round-trip.
 * Admin-auth required.
 *
 * Pulls in parallel from the Remembrance MCP field server:
 *  - field state (coherence, entropy, cascade, updates, sources)
 *  - direction verdict
 *  - consensus histogram
 *  - pressure-release history
 *  - variance-gate current mode
 *  - learned shapes by domain
 *  - method registry
 *  - response selection (which methods match current state)
 *
 * Best-effort: any subsystem unreachable is reported as null so the
 * admin page can render partial state and the operator can act on
 * what they have.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  peekField,
  fieldDirection,
  consensusHistogram,
  pressureRelease,
  getVarianceGateMode,
  learnedShapesByDomain,
  listMethods,
  selectResponseFor,
  isReachable,
  type FieldState,
  type FieldDirection,
  type ConsensusHistogram,
  type PressureRelease,
  type VarianceGateMode,
  type LearnedShapeSignature,
  type MethodDescriptor,
  type ResponseSelection,
} from "@/app/lib/valor/remembrance-bridge";
import { sunStatus, type SunStatus } from "@/app/lib/valor/sun";

export const dynamic = "force-dynamic";

interface SubstrateStateResponse {
  reachable: boolean;
  field: FieldState | null;
  direction: FieldDirection | null;
  consensus: ConsensusHistogram | null;
  pressure: PressureRelease | null;
  gate: VarianceGateMode | null;
  learnedShapes: Record<string, LearnedShapeSignature[]> | null;
  methods: MethodDescriptor[] | null;
  response: ResponseSelection | null;
  sun: SunStatus | null;
  generatedAt: string;
}

export async function GET(req: NextRequest) {
  // verifyAdmin returns null on success and a NextResponse error on failure.
  // The previous `if (!verifyAdmin(req))` inverted that contract and
  // effectively returned 401 to authenticated admins while letting
  // unauthenticated callers through. See the rest of api/admin/* for the
  // canonical pattern.
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const reachable = await isReachable();
  if (!reachable) {
    return NextResponse.json<SubstrateStateResponse>({
      reachable: false,
      field: null,
      direction: null,
      consensus: null,
      pressure: null,
      gate: null,
      learnedShapes: null,
      methods: null,
      response: null,
      sun: safeSunStatus(),
      generatedAt: new Date().toISOString(),
    });
  }

  // All eight reads run concurrently. Each catches its own failure
  // and returns null so one slow subsystem doesn't stall the others.
  const [
    field,
    direction,
    consensus,
    pressure,
    gate,
    learnedShapes,
    methods,
    response,
  ] = await Promise.all([
    peekField({ includeSources: true }).catch(() => null),
    fieldDirection(5).catch(() => null),
    consensusHistogram(100).catch(() => null),
    pressureRelease().catch(() => null),
    getVarianceGateMode().catch(() => null),
    learnedShapesByDomain().catch(() => null),
    listMethods().catch(() => null),
    selectResponseFor().catch(() => null),
  ]);

  return NextResponse.json<SubstrateStateResponse>({
    reachable: true,
    field,
    direction,
    consensus,
    pressure,
    gate,
    learnedShapes,
    methods,
    response,
    sun: safeSunStatus(),
    generatedAt: new Date().toISOString(),
  });
}

function safeSunStatus(): SunStatus | null {
  try {
    return sunStatus();
  } catch {
    return null;
  }
}
