import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { insertLead } from "@/app/lib/database";
import type { LeadRecord } from "@/app/lib/database";

/**
 * Seed Test Leads API
 *
 * POST /api/admin/seed-lead — Inserts diverse test leads spanning all score tiers.
 * Protected by admin auth. Idempotent — skips leads whose lead_id already exists.
 */

function generateLeadId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `lead_${ts}_${rand}`;
}

const now = new Date().toISOString();
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
const fourDaysAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

const CONSENT_TEXT = "I agree to be contacted by phone, email, or text regarding life insurance quotes.";

const TEST_LEADS: Omit<LeadRecord, "leadId">[] = [
  {
    // HOT tier: Veteran + Whole Life + TX + complete + recent
    firstName: "Marcus",
    lastName: "Williams",
    dateOfBirth: "1985-03-14",
    email: "marcus.williams@testlead.com",
    phone: "2145551001",
    state: "TX",
    coverageInterest: "whole",
    veteranStatus: "veteran",
    militaryBranch: "Army",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: now,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "TestSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "veteran-whole-life",
    utmTerm: "veteran life insurance",
    utmContent: null,
    createdAt: twoHoursAgo,
  },
  {
    // WARM tier: Non-veteran + Term Life + FL + complete + recent
    firstName: "Angela",
    lastName: "Rodriguez",
    dateOfBirth: "1990-07-22",
    email: "angela.rodriguez@testlead.com",
    phone: "3055551002",
    state: "FL",
    coverageInterest: "term",
    veteranStatus: "non-veteran",
    militaryBranch: "",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: now,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "TestSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "facebook",
    utmMedium: "social",
    utmCampaign: "family-protection",
    utmTerm: null,
    utmContent: "carousel-ad",
    createdAt: twoHoursAgo,
  },
  {
    // WARM tier: Veteran + Final Expense + GA + complete + 10 hours old
    firstName: "James",
    lastName: "Carter",
    dateOfBirth: "1958-11-05",
    email: "james.carter@testlead.com",
    phone: "4045551003",
    state: "GA",
    coverageInterest: "final-expense",
    veteranStatus: "veteran",
    militaryBranch: "Marines",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: tenHoursAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "TestSeed/1.0",
    consentPageUrl: "/lp/veteran-life-insurance",
    utmSource: "direct",
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    createdAt: tenHoursAgo,
  },
  {
    // STANDARD tier: Non-veteran + Annuity + CO (medium state) + 30 hours old
    firstName: "Samantha",
    lastName: "Chen",
    dateOfBirth: "1975-01-30",
    email: "samantha.chen@testlead.com",
    phone: "7205551004",
    state: "CO",
    coverageInterest: "annuity",
    veteranStatus: "non-veteran",
    militaryBranch: "",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: thirtyHoursAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "TestSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "bing",
    utmMedium: "cpc",
    utmCampaign: "retirement-annuity",
    utmTerm: "annuity quotes",
    utmContent: null,
    createdAt: thirtyHoursAgo,
  },
  {
    // COOL tier: Non-veteran + Not Sure + WY (low state) + 4 days old
    firstName: "Derek",
    lastName: "Nguyen",
    dateOfBirth: "1998-09-12",
    email: "derek.nguyen@testlead.com",
    phone: "3075551005",
    state: "WY",
    coverageInterest: "not-sure",
    veteranStatus: "non-veteran",
    militaryBranch: "",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: fourDaysAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "TestSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    createdAt: fourDaysAgo,
  },
];

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const results: Array<{ name: string; status: string; leadId?: string; tier?: string }> = [];

  for (const leadData of TEST_LEADS) {
    const leadId = generateLeadId();
    const lead: LeadRecord = { ...leadData, leadId };

    const result = await insertLead(lead);
    if (result.ok) {
      results.push({
        name: `${leadData.firstName} ${leadData.lastName}`,
        status: "created",
        leadId: result.value.leadId,
        tier: getTierPreview(leadData),
      });
    } else {
      results.push({
        name: `${leadData.firstName} ${leadData.lastName}`,
        status: result.error.includes("Duplicate") ? "already exists" : `error: ${result.error}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${results.filter((r) => r.status === "created").length} test leads.`,
    leads: results,
  });
}

function getTierPreview(lead: Omit<LeadRecord, "leadId">): string {
  // Rough tier hint based on known weights
  const cov = ({ "whole": 30, "term": 28, "final-expense": 26, "universal": 25, "annuity": 22, "not-sure": 10 } as Record<string, number>)[lead.coverageInterest] || 10;
  const vet = lead.veteranStatus === "veteran" ? (lead.militaryBranch ? 22 : 20) : 8;
  const total = cov + Math.min(vet, 20) + 15 + 15; // assume completeness=15, recency=15 for preview
  if (total >= 90) return "hot";
  if (total >= 70) return "warm";
  if (total >= 50) return "standard";
  return "cool";
}
