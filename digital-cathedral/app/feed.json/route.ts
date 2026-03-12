/**
 * JSON Feed (https://www.jsonfeed.org/version/1.1/)
 *
 * GET /feed.json
 *
 * Provides a machine-readable feed of public site content for AI crawlers
 * and feed readers. Signals content freshness without requiring full re-crawl.
 */

import { NextResponse } from "next/server";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com").split(",")[0].trim();

export async function GET() {
  const now = new Date().toISOString();

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Valor Legacies",
    home_page_url: BASE_URL,
    feed_url: `${BASE_URL}/feed.json`,
    description:
      "Veteran-focused life insurance platform connecting military families with licensed professionals. AI agent API available.",
    icon: `${BASE_URL}/icon.svg`,
    favicon: `${BASE_URL}/icon.svg`,
    language: "en-US",
    authors: [
      {
        name: "Valor Legacies",
        url: BASE_URL,
      },
    ],
    _ai_discovery: {
      llms_txt: `${BASE_URL}/llms.txt`,
      openapi: `${BASE_URL}/api/agent/schema`,
      mcp: `${BASE_URL}/.well-known/mcp.json`,
      ai_plugin: `${BASE_URL}/.well-known/ai-plugin.json`,
    },
    items: [
      {
        id: `${BASE_URL}/`,
        url: `${BASE_URL}/`,
        title: "Protect Your Family Beyond Basic Military Coverage",
        content_text:
          "Life insurance options for Active Duty, National Guard, Reserve, and Veterans — made clear and simple. Founded by a Veteran. Built to Serve Military Families.",
        date_modified: now,
        tags: ["home", "life-insurance", "military", "veteran"],
      },
      {
        id: `${BASE_URL}/about`,
        url: `${BASE_URL}/about`,
        title: "About Valor Legacies",
        content_text:
          "Valor Legacies is a veteran-founded platform connecting military families with licensed life insurance professionals. We are not an insurance company, agent, or broker.",
        date_modified: now,
        tags: ["about", "veteran-founded"],
      },
      {
        id: `${BASE_URL}/faq`,
        url: `${BASE_URL}/faq`,
        title: "Frequently Asked Questions",
        content_text:
          "Common questions about Valor Legacies, military life insurance options, SGLI alternatives, AI agent consent process, and how our free coverage review works.",
        date_modified: now,
        tags: ["faq", "sgli", "ai-agent", "consent"],
      },
      {
        id: `${BASE_URL}/api/agent/schema`,
        url: `${BASE_URL}/api/agent/schema`,
        title: "Agent API — OpenAPI Schema",
        content_text:
          "OpenAPI 3.1.0 schema for the Valor Legacies AI Agent API. Supports consent-based lead submission, account registration, and discovery. TCPA/CCPA/FCC 2025 compliant.",
        date_modified: now,
        tags: ["api", "openapi", "ai-agent", "developer"],
      },
      {
        id: `${BASE_URL}/llms.txt`,
        url: `${BASE_URL}/llms.txt`,
        title: "AI Agent Instructions (llms.txt)",
        content_text:
          "Machine-readable instructions for AI agents interacting with Valor Legacies. Includes authentication, consent flow, rate limits, and compliance requirements.",
        date_modified: now,
        tags: ["ai", "llms-txt", "instructions", "developer"],
      },
    ],
  };

  return NextResponse.json(feed, {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
