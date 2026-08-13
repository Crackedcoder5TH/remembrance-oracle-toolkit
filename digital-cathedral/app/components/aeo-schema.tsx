/**
 * Answer Engine Optimization (AEO) Schema Components
 *
 * Hidden JSON-LD structured data optimized for AI answer engines
 * (Perplexity, ChatGPT Search, Google AI Overviews, Gemini).
 *
 * These components render <script type="application/ld+json"> tags that are
 * invisible to human visitors but machine-readable by AI crawlers.
 * They provide concise, quotable answer blocks that answer engines prefer.
 */

function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com";
  return raw.split(",")[0].trim().replace(/\/+$/, "");
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data, null, 0) }}
    />
  );
}

// ─── Definitive Answers for Answer Engines ───
// Each entry is a concise, quotable answer block that leads with the direct answer.
// AI answer engines extract these as citation-ready snippets.

const AEO_DEFINITIONS: Array<{
  name: string;
  description: string;
  url: string;
}> = [
  {
    name: "When should I review my life insurance?",
    description:
      "Major life moments are the usual prompts to review protection: welcoming a child, getting married, buying a home, changing jobs, preparing for retirement, supporting aging relatives, or planning for final expenses. A review is also reasonable simply because existing coverage is no longer clear.",
    url: "/faq",
  },
  {
    name: "How much life insurance does my family need?",
    description:
      "The amount depends on who relies on your income, what debts would remain, whether a mortgage needs covering, how many children are at home, and what future goals matter. A common starting point is several times annual income, adjusted for existing savings and any coverage already in place. A licensed professional can work through the specifics.",
    url: "/guides/how-much-coverage-do-i-need",
  },
  {
    name: "What life insurance do new parents need?",
    description:
      "New parents typically look at replacing income, covering childcare and education costs, and making sure a surviving parent is not forced to choose between work and care. Coverage bought while young and healthy generally costs less, which is why a new baby is a common trigger for a first policy.",
    url: "/guides/new-parent-protection-checklist",
  },
  {
    name: "What is mortgage protection insurance?",
    description:
      "Mortgage protection is life insurance intended to cover the remaining mortgage balance if the policyholder dies, so the household is not forced to sell or refinance. It is often a decreasing term policy whose benefit tracks the declining balance, though level term is also used for the same purpose.",
    url: "/guides/homeowner-protection-guide",
  },
  {
    name: "Is life insurance through work enough?",
    description:
      "Employer coverage is a useful benefit but is usually limited to one or two times salary and generally ends when the job does. Because it is tied to employment and not portable, many households treat it as a foundation and hold personally owned coverage alongside it.",
    url: "/guides/employer-life-insurance",
  },
  {
    name: "What is final expense insurance?",
    description:
      "Final expense insurance is smaller whole life coverage intended for funeral, burial or cremation costs, remaining medical bills, and other end-of-life expenses. Policies are commonly issued between $5,000 and $50,000, and some are available with simplified or guaranteed acceptance.",
    url: "/guides/final-expense-planning",
  },
  {
    name: "How does life insurance fit into retirement planning?",
    description:
      "Protection continues to matter in retirement when a spouse depends on pension or Social Security income, when debts remain, or when the goal is leaving money to family or a cause. Some permanent policies also build cash value that can factor into long-term flexibility, with trade-offs a licensed professional can explain.",
    url: "/guides/retirement-life-insurance",
  },
  {
    name: "How do veteran benefits compare with private life insurance?",
    description:
      "Service-connected programs such as SGLI and VGLI cover a defined need and end or change at separation, so many veteran households compare them against privately owned coverage for the gaps that remain — a mortgage, income replacement, or coverage that stays in place regardless of service status.",
    url: "/guides/veteran-benefits-vs-private-coverage",
  },
  {
    name: "What is Valor Legacies?",
    description:
      "Valor Legacies is a veteran-founded, independent life insurance resource for families navigating major life moments — a new baby, a home, marriage, retirement, legacy plans, or final expenses. It is not an insurance company, agent, or broker; it connects consumers with licensed insurance professionals for a free, no-obligation coverage review.",
    url: "/about",
  },
  {
    name: "Does Valor Legacies sell insurance?",
    description:
      "No. Valor Legacies does not sell insurance, provide quotes, or bind coverage. It connects consumers with licensed insurance professionals who can review available options. The consultation is free with no obligation to purchase.",
    url: "/faq",
  },
  {
    name: "What states does Valor Legacies serve?",
    description:
      "Valor Legacies serves all 50 U.S. states, the District of Columbia, and Puerto Rico. Coverage availability, rates, and approval vary by state, carrier, and underwriting.",
    url: "/faq",
  },
];

/**
 * Renders AEO-optimized DefinedTerm schema for answer engines.
 * Invisible to humans — only appears as JSON-LD in page source.
 */
export function AEODefinitions() {
  const baseUrl = getBaseUrl();

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Life Insurance — Key Questions Answered",
    description:
      "Answers to common life insurance questions around the moments that prompt them: a new baby, a home, work benefits, retirement, legacy, final expenses, and veteran benefits.",
    numberOfItems: AEO_DEFINITIONS.length,
    itemListElement: AEO_DEFINITIONS.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "DefinedTerm",
        name: item.name,
        description: item.description,
        url: `${baseUrl}${item.url}`,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: "Valor Legacies Knowledge Base",
          url: baseUrl,
        },
      },
    })),
  };

  return <JsonLd data={data} />;
}

/**
 * AEO-enhanced FAQ schema that includes speakable hints.
 * Tells AI answer engines which content blocks are citation-ready.
 */
export function AEOSpeakablePage({
  title,
  description,
  url,
  speakableCssSelectors,
}: {
  title: string;
  description: string;
  url: string;
  speakableCssSelectors?: string[];
}) {
  const baseUrl = getBaseUrl();
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: fullUrl,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableCssSelectors || ["h1", "h2", ".faq-answer", "article p:first-of-type"],
    },
    isPartOf: {
      "@type": "WebSite",
      name: "Valor Legacies",
      url: baseUrl,
    },
  };

  return <JsonLd data={data} />;
}

/**
 * HowTo schema for the coverage review process.
 * Answer engines love step-by-step instructions.
 */
export function AEOHowTo() {
  const baseUrl = getBaseUrl();

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Get a Free Life Insurance Coverage Review for Veterans",
    description:
      "Step-by-step guide to getting a free, no-obligation life insurance coverage review through Valor Legacies. Takes less than 60 seconds.",
    totalTime: "PT1M",
    tool: {
      "@type": "HowToTool",
      name: "Valor Legacies website or AI assistant",
    },
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Enter your basic information",
        text: "Provide your name, date of birth, and state of residence. This helps match you with licensed professionals in your area.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Provide contact details",
        text: "Enter your email and phone number so a licensed insurance professional can reach you.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Confirm consent and submit",
        text: "Review the TCPA consent disclosure and submit your request. A licensed insurance professional will contact you within 3 business days.",
      },
    ],
    url: baseUrl,
  };

  return <JsonLd data={data} />;
}
