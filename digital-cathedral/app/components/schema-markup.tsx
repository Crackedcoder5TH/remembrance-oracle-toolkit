/**
 * Schema.org Structured Data Components (JSON-LD)
 *
 * Server components that render <script type="application/ld+json"> tags
 * for SEO-critical structured data across the Valor Legacies site.
 *
 * Exports:
 *  - InsuranceProductSchema  — per-coverage-type product markup
 *  - LocalBusinessSchema     — InsuranceAgency / LocalBusiness
 *  - BlogPostSchema          — Article markup for blog posts
 *  - FAQPageSchema           — FAQPage markup
 *  - ServiceSchema           — Free coverage review service
 *  - WebPageSchema           — Generic WebPage markup
 */

// ---------- helpers ----------

function getBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://valorlegacies.com";
  // Handle comma-separated values — take the first entry
  const first = raw.split(",")[0].trim();
  // Strip trailing slash for consistency
  return first.replace(/\/+$/, "");
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data, null, 2) }}
    />
  );
}

// ---------- types ----------

interface CoverageType {
  slug: string;
  name: string;
  description: string;
}

interface BlogPostProps {
  title: string;
  description: string;
  datePublished: string;
  author: string;
  url: string;
  dateModified?: string;
  image?: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface WebPageProps {
  title: string;
  description: string;
  url: string;
  dateModified?: string;
}

// ---------- coverage definitions ----------

const COVERAGE_TYPES: CoverageType[] = [
  {
    slug: "mortgage-protection",
    name: "Mortgage Protection Insurance",
    description:
      "Life insurance designed to pay off your mortgage if you pass away, ensuring your family keeps their home. Tailored for veterans and military families.",
  },
  {
    slug: "final-expense",
    name: "Final Expense Insurance",
    description:
      "Affordable whole life insurance that covers funeral costs, medical bills, and other end-of-life expenses so your loved ones are not burdened financially.",
  },
  {
    slug: "income-replacement",
    name: "Income Replacement Insurance",
    description:
      "Term life insurance that replaces your income if you pass away, giving your family the financial stability to maintain their standard of living.",
  },
  {
    slug: "retirement-savings",
    name: "Retirement Savings Life Insurance",
    description:
      "Cash-value life insurance policies that build tax-advantaged savings for retirement while providing a death benefit for your beneficiaries.",
  },
  {
    slug: "guaranteed-income",
    name: "Guaranteed Income Annuity",
    description:
      "Annuity products that provide a guaranteed stream of income in retirement, offering financial certainty for veterans and their families.",
  },
  {
    slug: "legacy",
    name: "Legacy Planning Insurance",
    description:
      "Whole life and universal life insurance designed for wealth transfer and legacy planning, helping veterans leave a lasting financial legacy.",
  },
];

// ---------- components ----------

/**
 * Renders an InsuranceProduct / FinancialProduct schema for a single coverage
 * type identified by slug, or for all coverage types when no slug is provided.
 */
export function InsuranceProductSchema({ slug }: { slug?: string }) {
  const baseUrl = getBaseUrl();
  const items = slug
    ? COVERAGE_TYPES.filter((c) => c.slug === slug)
    : COVERAGE_TYPES;

  if (items.length === 0) return null;

  return (
    <>
      {items.map((coverage) => {
        const data: Record<string, unknown> = {
          "@context": "https://schema.org",
          "@type": ["FinancialProduct", "InsuranceProduct" as unknown],
          name: coverage.name,
          description: coverage.description,
          url: `${baseUrl}/coverage/${coverage.slug}`,
          provider: {
            "@type": "InsuranceAgency",
            name: "Valor Legacies",
            url: baseUrl,
          },
          areaServed: {
            "@type": "Country",
            name: "United States",
          },
          audience: {
            "@type": "PeopleAudience",
            audienceType: "Veterans, Military Families, First Responders",
          },
          category: "Life Insurance",
        };

        return <JsonLd key={coverage.slug} data={data} />;
      })}
    </>
  );
}

/**
 * Renders LocalBusiness / InsuranceAgency schema for Valor Legacies.
 */
export function LocalBusinessSchema() {
  const baseUrl = getBaseUrl();

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "InsuranceAgency",
    name: "Valor Legacies",
    description:
      "Veteran-founded life insurance agency dedicated to protecting military families, veterans, and first responders with affordable, personalized coverage.",
    url: baseUrl,
    email: "valorlegacies@gmail.com",
    areaServed: [
      { "@type": "Country", name: "United States" },
      // All 50 states + DC + Puerto Rico for maximum entity coverage
      ...([
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
        "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
        "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
        "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
        "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
        "New Hampshire", "New Jersey", "New Mexico", "New York",
        "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
        "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
        "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
        "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
        "Puerto Rico",
      ].map((s) => ({ "@type": "State", name: s }))),
    ],
    founder: {
      "@type": "Person",
      jobTitle: "Founder",
      description: "Veteran-founded and operated",
    },
    knowsAbout: [
      "Life Insurance",
      "Mortgage Protection",
      "Final Expense Insurance",
      "Veterans Benefits",
      "Military Family Financial Planning",
      "SGLI",
      "VGLI",
      "VA Life Insurance",
      "Indexed Universal Life Insurance",
      "Term Life Insurance",
      "Whole Life Insurance",
    ],
    slogan: "Protecting Those Who Served",
    serviceType: "Life Insurance Brokerage",
    priceRange: "$$",
    // sameAs links strengthen entity recognition in knowledge graphs
    sameAs: [
      "https://www.va.gov/life-insurance/",
      "https://www.benefits.va.gov/insurance/",
    ],
    // Additional entity enrichment
    parentOrganization: undefined,
    isRelatedTo: [
      {
        "@type": "GovernmentService",
        name: "Servicemembers' Group Life Insurance (SGLI)",
        url: "https://www.va.gov/life-insurance/options-eligibility/sgli/",
        provider: { "@type": "GovernmentOrganization", name: "U.S. Department of Veterans Affairs" },
      },
      {
        "@type": "GovernmentService",
        name: "Veterans' Group Life Insurance (VGLI)",
        url: "https://www.va.gov/life-insurance/options-eligibility/vgli/",
        provider: { "@type": "GovernmentOrganization", name: "U.S. Department of Veterans Affairs" },
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Life Insurance Products for Veterans",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mortgage Protection Insurance" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Final Expense Insurance" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Income Replacement Insurance" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Indexed Universal Life Insurance (IUL)" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Guaranteed Income Annuity" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Legacy Planning Insurance" } },
      ],
    },
  };

  return <JsonLd data={data} />;
}

/**
 * Renders Article schema for a blog post.
 */
export function BlogPostSchema({
  title,
  description,
  datePublished,
  author,
  url,
  dateModified,
  image,
}: BlogPostProps) {
  const baseUrl = getBaseUrl();
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished,
    ...(dateModified && { dateModified }),
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: "Valor Legacies",
      url: baseUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": fullUrl,
    },
    ...(image && {
      image: {
        "@type": "ImageObject",
        url: image.startsWith("http") ? image : `${baseUrl}${image}`,
      },
    }),
  };

  return <JsonLd data={data} />;
}

/**
 * Renders FAQPage schema from an array of question/answer pairs.
 */
export function FAQPageSchema({ items }: { items: FAQItem[] }) {
  if (!items || items.length === 0) return null;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return <JsonLd data={data} />;
}

/**
 * Renders Service schema for the free coverage review offering.
 */
export function ServiceSchema() {
  const baseUrl = getBaseUrl();

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Free Coverage Review",
    description:
      "Complimentary, no-obligation life insurance coverage review for veterans, military families, and first responders. Our licensed agents analyze your current coverage and recommend personalized solutions.",
    provider: {
      "@type": "InsuranceAgency",
      name: "Valor Legacies",
      url: baseUrl,
    },
    url: `${baseUrl}/contact`,
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
    audience: {
      "@type": "PeopleAudience",
      audienceType: "Veterans, Military Families, First Responders",
    },
    serviceType: "Insurance Consultation",
    isRelatedTo: {
      "@type": "FinancialProduct",
      name: "Life Insurance",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free, no-obligation coverage review",
    },
  };

  return <JsonLd data={data} />;
}

/**
 * Renders generic WebPage schema.
 */
export function WebPageSchema({ title, description, url, dateModified }: WebPageProps) {
  const baseUrl = getBaseUrl();
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: fullUrl,
    ...(dateModified && { dateModified }),
    isPartOf: {
      "@type": "WebSite",
      name: "Valor Legacies",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Valor Legacies",
      url: baseUrl,
    },
  };

  return <JsonLd data={data} />;
}
