/**
 * Demo Lead Data
 *
 * Hardcoded test leads spanning all 4 score tiers.
 * Used when no DATABASE_URL is configured (Vercel without a database).
 * Allows admin dashboard and client portal to display realistic data.
 */

import type { LeadRecord, LeadStats } from "./database";

const now = new Date().toISOString();
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
const fourDaysAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();

const CONSENT_TEXT = "I agree to be contacted by phone, email, or text regarding life insurance quotes.";

export const DEMO_LEADS: LeadRecord[] = [
  {
    leadId: "lead_demo_001",
    firstName: "Marcus",
    lastName: "Williams",
    dateOfBirth: "1985-03-14",
    email: "marcus.williams@testlead.com",
    phone: "2145551001",
    state: "TX",
    coverageInterest: "whole",
    purchaseIntent: "protect-family",
    veteranStatus: "veteran",
    militaryBranch: "Army",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: now,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "DemoSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "veteran-whole-life",
    utmTerm: "veteran life insurance",
    utmContent: null,
    createdAt: twoHoursAgo,
  },
  {
    leadId: "lead_demo_002",
    firstName: "Angela",
    lastName: "Rodriguez",
    dateOfBirth: "1990-07-22",
    email: "angela.rodriguez@testlead.com",
    phone: "3055551002",
    state: "FL",
    coverageInterest: "term",
    purchaseIntent: "want-protection",
    veteranStatus: "non-military",
    militaryBranch: "",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: now,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "DemoSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "facebook",
    utmMedium: "social",
    utmCampaign: "family-protection",
    utmTerm: null,
    utmContent: "carousel-ad",
    createdAt: twoHoursAgo,
  },
  {
    leadId: "lead_demo_003",
    firstName: "James",
    lastName: "Carter",
    dateOfBirth: "1958-11-05",
    email: "james.carter@testlead.com",
    phone: "4045551003",
    state: "GA",
    coverageInterest: "final-expense",
    purchaseIntent: "protect-family",
    veteranStatus: "active-duty",
    militaryBranch: "marine-corps",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: tenHoursAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "DemoSeed/1.0",
    consentPageUrl: "/lp/veteran-life-insurance",
    utmSource: "direct",
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    createdAt: tenHoursAgo,
  },
  {
    leadId: "lead_demo_004",
    firstName: "Samantha",
    lastName: "Chen",
    dateOfBirth: "1975-01-30",
    email: "samantha.chen@testlead.com",
    phone: "7205551004",
    state: "CO",
    coverageInterest: "annuity",
    purchaseIntent: "want-protection",
    veteranStatus: "reserve",
    militaryBranch: "army",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: thirtyHoursAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "DemoSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: "bing",
    utmMedium: "cpc",
    utmCampaign: "retirement-annuity",
    utmTerm: "annuity quotes",
    utmContent: null,
    createdAt: thirtyHoursAgo,
  },
  {
    leadId: "lead_demo_005",
    firstName: "Derek",
    lastName: "Nguyen",
    dateOfBirth: "1998-09-12",
    email: "derek.nguyen@testlead.com",
    phone: "3075551005",
    state: "WY",
    coverageInterest: "not-sure",
    purchaseIntent: "exploring",
    veteranStatus: "non-military",
    militaryBranch: "",
    consentTcpa: true,
    consentPrivacy: true,
    consentTimestamp: fourDaysAgo,
    consentText: CONSENT_TEXT,
    consentIp: "127.0.0.1",
    consentUserAgent: "DemoSeed/1.0",
    consentPageUrl: "/protect",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    createdAt: fourDaysAgo,
  },
];

export function getDemoStats(): LeadStats {
  const byState: Record<string, number> = {};
  const byCoverage: Record<string, number> = {};
  const byVeteranStatus: Record<string, number> = {};

  const now = Date.now();
  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;

  for (const lead of DEMO_LEADS) {
    byState[lead.state] = (byState[lead.state] || 0) + 1;
    byCoverage[lead.coverageInterest] = (byCoverage[lead.coverageInterest] || 0) + 1;

    byVeteranStatus[lead.veteranStatus] = (byVeteranStatus[lead.veteranStatus] || 0) + 1;

    const ageMs = now - new Date(lead.createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 24) today++;
    if (ageHours < 168) thisWeek++;
    if (ageHours < 720) thisMonth++;
  }

  return {
    total: DEMO_LEADS.length,
    today,
    thisWeek,
    thisMonth,
    byState,
    byCoverage,
    byVeteranStatus,
  };
}
