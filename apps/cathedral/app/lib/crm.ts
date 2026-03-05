/**
 * CRM Integration Layer
 *
 * Unified interface to push leads to HubSpot or Salesforce.
 * Uses circuit breaker for fault tolerance and retry for transient failures.
 *
 * Environment variables:
 *   CRM_PROVIDER      — "hubspot", "salesforce", or empty (no-op)
 *   CRM_API_KEY       — API key / Bearer token for the CRM
 *   CRM_INSTANCE_URL  — Salesforce instance URL (e.g., https://myorg.my.salesforce.com)
 */

import { withCircuitBreaker, CircuitOpenError } from "./circuit-breaker";

// --- Retry with exponential backoff ---
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

/** Coverage labels for CRM field mapping */
const COVERAGE_LABELS: Record<string, string> = {
  term: "Term Life",
  whole: "Whole Life",
  universal: "Universal Life",
  "final-expense": "Final Expense",
  annuity: "Annuity",
  "not-sure": "Needs Guidance",
};

export interface CrmLead {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/**
 * Push a lead to the configured CRM provider.
 *
 * If CRM_PROVIDER is not set, this is a no-op.
 * Uses circuit breaker to prevent cascading failures if the CRM is down.
 */
export async function pushLeadToCrm(lead: CrmLead): Promise<void> {
  const provider = process.env.CRM_PROVIDER?.toLowerCase();

  if (!provider) {
    return; // No CRM configured — silent no-op
  }

  switch (provider) {
    case "hubspot":
      await pushToHubSpot(lead);
      break;
    case "salesforce":
      await pushToSalesforce(lead);
      break;
    default:
      console.warn(`[CRM] Unknown CRM_PROVIDER: "${provider}". Supported: hubspot, salesforce.`);
  }
}

/**
 * Push a lead to HubSpot CRM via the Contacts API v3.
 */
async function pushToHubSpot(lead: CrmLead): Promise<void> {
  const apiKey = process.env.CRM_API_KEY;
  if (!apiKey) {
    console.warn("[CRM][HubSpot] CRM_API_KEY is not set. Skipping CRM push.");
    return;
  }

  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;

  const payload = {
    properties: {
      firstname: lead.firstName,
      lastname: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      state: lead.state,
      hs_lead_status: "NEW",
      military_branch: lead.veteranStatus,
      coverage_interest: coverageLabel,
      ...(lead.utmSource ? { utm_source: lead.utmSource } : {}),
      ...(lead.utmMedium ? { utm_medium: lead.utmMedium } : {}),
      ...(lead.utmCampaign ? { utm_campaign: lead.utmCampaign } : {}),
    },
  };

  try {
    await withCircuitBreaker(
      () =>
        retry(async () => {
          const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            // 409 = contact already exists — not a failure
            if (res.status === 409) {
              console.log(`[CRM][HubSpot] Contact already exists for ${lead.email} — skipping.`);
              return;
            }
            throw new Error(`HubSpot API error: ${res.status} ${errorBody}`);
          }

          console.log(`[CRM][HubSpot] Contact created for lead ${lead.leadId}`);
        }, 2, 1000),
      { name: "crm-hubspot", failureThreshold: 5, resetTimeout: 120_000 },
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn(`[CRM][HubSpot] Circuit open — skipping push for lead ${lead.leadId}. ${err.message}`);
    } else {
      throw err;
    }
  }
}

/**
 * Push a lead to Salesforce CRM via the REST API.
 */
async function pushToSalesforce(lead: CrmLead): Promise<void> {
  const apiKey = process.env.CRM_API_KEY;
  const instanceUrl = process.env.CRM_INSTANCE_URL;

  if (!apiKey) {
    console.warn("[CRM][Salesforce] CRM_API_KEY is not set. Skipping CRM push.");
    return;
  }
  if (!instanceUrl) {
    console.warn("[CRM][Salesforce] CRM_INSTANCE_URL is not set. Skipping CRM push.");
    return;
  }

  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;

  const payload: Record<string, string> = {
    FirstName: lead.firstName,
    LastName: lead.lastName,
    Email: lead.email,
    Phone: lead.phone,
    State: lead.state,
    Status: "Open - Not Contacted",
    LeadSource: "Web",
    Description: `Coverage Interest: ${coverageLabel}. Veteran Status: ${lead.veteranStatus}. Ref: ${lead.leadId}`,
  };

  if (lead.utmSource) payload.UTM_Source__c = lead.utmSource;
  if (lead.utmMedium) payload.UTM_Medium__c = lead.utmMedium;
  if (lead.utmCampaign) payload.UTM_Campaign__c = lead.utmCampaign;

  const url = `${instanceUrl.replace(/\/$/, "")}/services/data/v58.0/sobjects/Lead/`;

  try {
    await withCircuitBreaker(
      () =>
        retry(async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
          });

          if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Salesforce API error: ${res.status} ${errorBody}`);
          }

          console.log(`[CRM][Salesforce] Lead created for ${lead.leadId}`);
        }, 2, 1000),
      { name: "crm-salesforce", failureThreshold: 5, resetTimeout: 120_000 },
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn(`[CRM][Salesforce] Circuit open — skipping push for lead ${lead.leadId}. ${err.message}`);
    } else {
      throw err;
    }
  }
}
