/**
 * Agent Schema / Discovery Endpoint
 *
 * GET /api/agent/schema
 *
 * Returns an OpenAPI-compatible schema describing all agent endpoints.
 * No authentication required — this is for AI agent discovery.
 */

import { NextResponse } from "next/server";

const SCHEMA = {
  openapi: "3.1.0",
  info: {
    title: "Valor Legacies Agent API",
    version: "1.0.0",
    description: "AI agent API for submitting life insurance leads and registering human users on behalf of veterans and military families.",
  },
  servers: [
    { url: "/api/agent", description: "Agent API base path" },
  ],
  paths: {
    "/consent": {
      post: {
        operationId: "createConsent",
        summary: "Create a consent request for a human user",
        description: "Generates a consent token that the human must confirm before the agent can submit leads or register accounts. The human confirms by visiting the returned confirmationUrl.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "firstName", "agentIdentity", "scope"],
                properties: {
                  email: { type: "string", format: "email", description: "The human's email address" },
                  firstName: { type: "string", description: "The human's first name" },
                  agentIdentity: { type: "string", description: "Name of the AI agent or model (e.g., 'Claude', 'GPT-4')" },
                  scope: {
                    type: "string",
                    enum: ["lead-submission", "account-registration", "both"],
                    description: "What the consent covers",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Consent request created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    consentId: { type: "string" },
                    confirmationUrl: { type: "string", format: "uri" },
                    pendingToken: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                    message: { type: "string" },
                    instructions: {
                      type: "object",
                      properties: {
                        forAgent: { type: "string" },
                        forHuman: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      get: {
        operationId: "confirmConsent",
        summary: "Confirm consent (human-facing)",
        description: "Human visits this URL to confirm their consent. Returns an HTML page with the confirmed token.",
        parameters: [
          { name: "token", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Consent confirmed — HTML page with confirmed token" },
        },
      },
    },
    "/leads": {
      post: {
        operationId: "submitLead",
        summary: "Submit a life insurance lead on behalf of a human",
        description: "Submits lead information for a human who has confirmed consent. The lead will be scored, stored, and routed to licensed insurance professionals.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["firstName", "lastName", "dateOfBirth", "email", "phone", "state", "coverageInterest", "veteranStatus", "purchaseIntent", "consentToken"],
                properties: {
                  firstName: { type: "string", minLength: 2, maxLength: 100 },
                  lastName: { type: "string", minLength: 2, maxLength: 100 },
                  dateOfBirth: { type: "string", format: "date", description: "YYYY-MM-DD, must be 18+" },
                  email: { type: "string", format: "email" },
                  phone: { type: "string", description: "10-digit US phone number" },
                  state: { type: "string", description: "2-letter US state code", minLength: 2, maxLength: 2 },
                  coverageInterest: {
                    type: "string",
                    enum: ["mortgage-protection", "final-expense", "income-replacement", "retirement-savings", "guaranteed-income", "legacy", "not-sure"],
                  },
                  veteranStatus: {
                    type: "string",
                    enum: ["active-duty", "reserve", "national-guard", "veteran", "non-military"],
                  },
                  militaryBranch: {
                    type: "string",
                    enum: ["army", "marine-corps", "navy", "air-force", "space-force", "coast-guard", "national-guard", "reserves"],
                    description: "Required if veteranStatus is not 'non-military'",
                  },
                  purchaseIntent: {
                    type: "string",
                    enum: ["protect-family", "want-protection", "exploring"],
                  },
                  consentToken: { type: "string", description: "Confirmed consent token from POST /consent" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Lead submitted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    leadId: { type: "string" },
                    message: { type: "string" },
                    score: { type: "number" },
                    tier: { type: "string", enum: ["hot", "warm", "standard", "cool"] },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/register": {
      post: {
        operationId: "registerHuman",
        summary: "Register a human as a client (lead buyer)",
        description: "Creates an account for the human on the platform. Returns login credentials. Requires consent with scope 'account-registration' or 'both'.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "firstName", "lastName", "consentToken"],
                properties: {
                  email: { type: "string", format: "email" },
                  firstName: { type: "string", minLength: 2 },
                  lastName: { type: "string", minLength: 2 },
                  phone: { type: "string", description: "Optional phone number" },
                  state: { type: "string", description: "Optional 2-letter state code" },
                  consentToken: { type: "string", description: "Confirmed consent token with registration scope" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Account created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    loginUrl: { type: "string", format: "uri" },
                    temporaryPassword: { type: "string" },
                    instructions: {
                      type: "object",
                      properties: {
                        forAgent: { type: "string" },
                        forHuman: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/schema": {
      get: {
        operationId: "getSchema",
        summary: "Get the OpenAPI schema for agent endpoints",
        description: "Returns this schema. No authentication required.",
        responses: {
          "200": { description: "OpenAPI schema" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Agent API key provided as Bearer token",
      },
    },
  },
};

// Stable ETag based on schema version — changes only when schema changes
const SCHEMA_ETAG = `"agent-schema-v${SCHEMA.info.version}"`;

export async function GET(request: Request) {
  // Conditional request support — return 304 if unchanged
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === SCHEMA_ETAG) {
    return new Response(null, { status: 304 });
  }

  return NextResponse.json(SCHEMA, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "ETag": SCHEMA_ETAG,
      "Last-Modified": new Date("2025-01-01").toUTCString(),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Authorization",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
