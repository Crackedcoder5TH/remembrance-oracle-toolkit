/**
 * Landing page data and generator for keyword-targeted SEO pages.
 * Each landing page targets a specific long-tail keyword for organic search.
 */

export interface LandingPageData {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  heroText: string;
  coverageInterest: string;
  veteranStatus: string;
  trustSignals: { icon: string; title: string; description: string }[];
  faqs: { q: string; a: string }[];
  keywords: string[];
}

export const LANDING_PAGES: LandingPageData[] = [
  {
    slug: "veteran-final-expense",
    title: "Final Expense Insurance for Veterans",
    metaTitle: "Final Expense Insurance for Veterans | No Medical Exam Options",
    metaDescription: "Affordable final expense and burial insurance for veterans. No medical exam options available. Coverage from $5,000 to $50,000. Free review — veteran-founded platform.",
    headline: "Protect Your Family from End-of-Life Costs",
    subheadline: "Affordable whole life insurance for burial and funeral expenses — designed with veterans in mind.",
    heroText: "The average funeral costs $7,000-$12,000. Don't leave that burden on your family. Final expense insurance provides guaranteed coverage with no medical exam options, building cash value over time.",
    coverageInterest: "final-expense",
    veteranStatus: "veteran",
    trustSignals: [
      { icon: "shield", title: "No Medical Exam Options", description: "Guaranteed issue policies available for veterans" },
      { icon: "heart", title: "Veteran-Founded", description: "Built by someone who served and understands" },
      { icon: "dollar", title: "$5K-$50K Coverage", description: "Flexible coverage to match your needs" },
    ],
    faqs: [
      { q: "Do I need a medical exam for final expense insurance?", a: "Not always. Many carriers offer guaranteed issue or simplified issue policies that require no medical exam. A licensed professional can help you find the right option." },
      { q: "How much does final expense insurance cost for veterans?", a: "Rates vary by age and health, but whole life final expense policies typically range from $30-$100/month for $10,000-$25,000 in coverage. Veterans may qualify for preferred rates." },
      { q: "Can I get final expense insurance with a service-connected disability?", a: "Yes. Many carriers offer coverage regardless of VA disability rating. Guaranteed issue policies have no health questions at all." },
    ],
    keywords: ["final expense insurance veterans", "burial insurance veterans", "veteran funeral insurance", "no medical exam life insurance veterans"],
  },
  {
    slug: "military-mortgage-protection",
    title: "Mortgage Protection for Military Families",
    metaTitle: "Mortgage Protection Insurance for Military Families | Free Review",
    metaDescription: "Protect your military family's home with mortgage protection life insurance. Term life coverage matched to your mortgage. Free review from licensed professionals.",
    headline: "Keep Your Family in Their Home",
    subheadline: "Term life insurance designed to pay off your mortgage if something happens to you.",
    heroText: "You served to protect others. Now protect your family's home. Mortgage protection insurance ensures your loved ones can stay in their home by covering the remaining mortgage balance. Terms match your mortgage length — 15, 20, or 30 years.",
    coverageInterest: "mortgage-protection",
    veteranStatus: "active-duty",
    trustSignals: [
      { icon: "home", title: "Covers Your Mortgage", description: "Death benefit pays off your remaining mortgage balance" },
      { icon: "lock", title: "Locked-In Rates", description: "Your premium never increases for the life of the policy" },
      { icon: "family", title: "Peace of Mind", description: "Your family stays in their home no matter what" },
    ],
    faqs: [
      { q: "How does mortgage protection differ from regular life insurance?", a: "Mortgage protection is term life insurance with a death benefit designed to match your mortgage balance. The beneficiary can use the payout to pay off the mortgage entirely." },
      { q: "Can I get mortgage protection while on active duty?", a: "Yes. Active duty service members can purchase private mortgage protection insurance in addition to SGLI. This provides dedicated coverage for your home." },
      { q: "What happens to my mortgage protection if I refinance?", a: "Your policy stays in force regardless of refinancing. You may want to adjust coverage amounts to match your new mortgage balance." },
    ],
    keywords: ["mortgage protection military", "military mortgage insurance", "veteran mortgage protection", "military home insurance"],
  },
  {
    slug: "veteran-iul-retirement",
    title: "IUL Retirement Savings for Veterans",
    metaTitle: "IUL Life Insurance for Veterans | Tax-Advantaged Retirement Savings",
    metaDescription: "Indexed Universal Life insurance for veterans. Combine life insurance protection with tax-advantaged cash value growth. Free consultation with military-specialist professionals.",
    headline: "Build Wealth While Protecting Your Family",
    subheadline: "Indexed Universal Life insurance combines protection with tax-advantaged cash value growth.",
    heroText: "IUL policies let you grow wealth tied to stock market performance with a guaranteed floor — you participate in gains but are protected from losses. Cash value grows tax-deferred and can be accessed as supplemental retirement income.",
    coverageInterest: "retirement-savings",
    veteranStatus: "veteran",
    trustSignals: [
      { icon: "chart", title: "Market-Linked Growth", description: "Cash value tied to index performance with downside protection" },
      { icon: "tax", title: "Tax Advantages", description: "Tax-deferred growth and tax-free policy loans" },
      { icon: "shield", title: "Guaranteed Floor", description: "Your cash value never decreases due to market losses" },
    ],
    faqs: [
      { q: "What is an IUL and how does it work?", a: "An Indexed Universal Life policy is permanent life insurance that builds cash value based on stock market index performance (like the S&P 500). You get a guaranteed minimum rate (floor) so you never lose money in down markets, while participating in gains during up markets." },
      { q: "Is IUL a good retirement savings vehicle for veterans?", a: "IUL can complement military retirement benefits (pension, TSP) as a tax-advantaged savings vehicle. Cash value grows tax-deferred and can be accessed via tax-free policy loans for supplemental retirement income." },
      { q: "How much should I put into an IUL?", a: "This depends on your financial goals, age, and existing retirement savings. A licensed professional will help determine the right premium and coverage structure for your situation." },
    ],
    keywords: ["IUL for veterans", "veteran retirement savings", "indexed universal life military", "tax-advantaged life insurance veterans"],
  },
  {
    slug: "national-guard-life-insurance",
    title: "Life Insurance for National Guard Members",
    metaTitle: "Life Insurance for National Guard Members | Beyond SGLI Coverage",
    metaDescription: "Life insurance options for National Guard members. Supplement your SGLI coverage with portable, permanent protection. Free review from military-specialist professionals.",
    headline: "Coverage That Follows You — Active or Civilian",
    subheadline: "National Guard members face unique coverage gaps. Private life insurance fills them.",
    heroText: "As a National Guard member, your coverage needs shift between drill weekends, deployments, and civilian life. SGLI provides a foundation, but private coverage ensures continuous protection that you own — regardless of your duty status.",
    coverageInterest: "income-replacement",
    veteranStatus: "national-guard",
    trustSignals: [
      { icon: "toggle", title: "Portable Coverage", description: "Your policy follows you between duty statuses" },
      { icon: "plus", title: "Supplement SGLI", description: "Add coverage beyond the $400K SGLI cap" },
      { icon: "clock", title: "Lock In Rates Now", description: "Premiums based on your current age — younger is cheaper" },
    ],
    faqs: [
      { q: "Do National Guard members get SGLI?", a: "Yes. National Guard members are eligible for SGLI during periods of active duty, active duty for training, and inactive duty training. Full-time National Guard (AGR) members have continuous SGLI coverage." },
      { q: "What happens to my SGLI between drill weekends?", a: "Part-time Guard members have full-time SGLI coverage for 120 days after separation from a period of duty. However, private coverage ensures continuous protection without gaps." },
      { q: "Can I get life insurance that covers me during deployments?", a: "Yes. Private life insurance policies do not have war exclusions in most cases, especially for military members. A licensed professional can confirm coverage terms for your specific situation." },
    ],
    keywords: ["national guard life insurance", "guard member insurance", "SGLI supplement national guard", "national guard coverage gaps"],
  },
  {
    slug: "military-spouse-insurance",
    title: "Life Insurance for Military Spouses",
    metaTitle: "Life Insurance for Military Spouses | Protect the Whole Family",
    metaDescription: "Life insurance options for military spouses. Protect your family beyond FSGLI. Affordable coverage for military families. Free review from veteran-founded platform.",
    headline: "The Military Spouse Deserves Protection Too",
    subheadline: "FSGLI covers up to $100,000 for spouses — but many families need more.",
    heroText: "Military spouses hold the family together through deployments, PCS moves, and the demands of service life. If something happened to you, your service member would need financial support for childcare, household management, and more. Don't leave that to chance.",
    coverageInterest: "income-replacement",
    veteranStatus: "active-duty",
    trustSignals: [
      { icon: "family", title: "Beyond FSGLI", description: "FSGLI covers only $100K — get the coverage your family needs" },
      { icon: "heart", title: "Veteran-Founded", description: "We understand military family dynamics" },
      { icon: "dollar", title: "Affordable Options", description: "Term life rates for healthy spouses start under $20/month" },
    ],
    faqs: [
      { q: "What is FSGLI and how much does it cover?", a: "Family SGLI (FSGLI) provides up to $100,000 in coverage for the spouse of a service member with SGLI. It's affordable but may not be enough if your family relies on dual income or the spouse manages the household." },
      { q: "Can a military spouse get their own life insurance?", a: "Absolutely. Military spouses can purchase private life insurance independently. This coverage is portable, stays with you regardless of your spouse's military status, and can be tailored to your family's needs." },
      { q: "What happens to FSGLI when my spouse separates from service?", a: "FSGLI ends 120 days after the service member's separation. Having your own private policy ensures continuous coverage during and after military life." },
    ],
    keywords: ["military spouse life insurance", "FSGLI alternatives", "military wife insurance", "military family coverage"],
  },
  {
    slug: "disabled-veteran-life-insurance",
    title: "Life Insurance for Disabled Veterans",
    metaTitle: "Life Insurance for Disabled Veterans | Guaranteed Issue Options",
    metaDescription: "Life insurance options for disabled veterans. Guaranteed issue, no medical exam, and service-connected disability coverage. Free review from veteran-founded platform.",
    headline: "Your Service-Connected Disability Doesn't Disqualify You",
    subheadline: "Guaranteed issue and simplified issue life insurance for veterans with disabilities.",
    heroText: "Many veterans assume a service-connected disability makes life insurance impossible or unaffordable. That's not true. Guaranteed issue policies require no medical questions or exams. Simplified issue policies ask minimal health questions. And some carriers offer preferred rates for veterans regardless of VA disability rating.",
    coverageInterest: "final-expense",
    veteranStatus: "veteran",
    trustSignals: [
      { icon: "check", title: "Guaranteed Issue Available", description: "No health questions, no medical exam required" },
      { icon: "shield", title: "VA Disability Accepted", description: "Coverage available regardless of disability rating" },
      { icon: "heart", title: "S-DVI Eligibility", description: "You may qualify for VA-administered S-DVI coverage too" },
    ],
    faqs: [
      { q: "Can I get life insurance with a 100% VA disability rating?", a: "Yes. Guaranteed issue policies have no health questions or medical exams. Additionally, veterans with service-connected disabilities may be eligible for S-DVI (Service-Disabled Veterans' Insurance) through the VA." },
      { q: "What is S-DVI?", a: "Service-Disabled Veterans' Insurance (S-DVI) is a life insurance program for veterans with service-connected disabilities. It provides up to $10,000 in basic coverage and an additional $30,000 supplemental coverage. Apply through the VA within 2 years of receiving a new service-connected disability rating." },
      { q: "How much does life insurance cost for disabled veterans?", a: "Costs vary widely. Guaranteed issue policies are more expensive per dollar of coverage but require no health underwriting. A licensed professional can compare options to find the most affordable path for your situation." },
    ],
    keywords: ["disabled veteran life insurance", "life insurance VA disability", "guaranteed issue veteran", "service-connected disability insurance"],
  },
  {
    slug: "sgli-to-vgli-transition",
    title: "SGLI to VGLI Transition Guide",
    metaTitle: "SGLI to VGLI Transition | Convert or Replace Your Military Life Insurance",
    metaDescription: "Separating from service? Understand your SGLI to VGLI transition options. Compare VGLI rates to private coverage. Free review from veteran-founded platform.",
    headline: "Separating from Service? Don't Lose Your Coverage",
    subheadline: "You have 240 days to convert SGLI to VGLI — but is that your best option?",
    heroText: "When you separate from military service, your SGLI coverage ends after 120 days. You can convert to VGLI (Veterans' Group Life Insurance) within 240 days — but VGLI rates increase every 5 years and can become expensive. Private coverage may offer better long-term value with rates locked at your current age.",
    coverageInterest: "income-replacement",
    veteranStatus: "veteran",
    trustSignals: [
      { icon: "clock", title: "240-Day Window", description: "Convert SGLI to VGLI within 240 days of separation" },
      { icon: "chart", title: "Compare Rates", description: "VGLI rates increase every 5 years — private rates can be locked" },
      { icon: "lock", title: "Lock In Now", description: "The younger you are when you buy, the cheaper it is" },
    ],
    faqs: [
      { q: "What happens to SGLI when I separate from the military?", a: "SGLI coverage continues for 120 days after separation at no cost. After that, it ends unless you convert to VGLI or purchase private coverage. You have 240 days from separation to apply for VGLI without health evidence." },
      { q: "Is VGLI worth it?", a: "VGLI provides guaranteed coverage without health questions (within the 240-day window), which is valuable. However, VGLI premiums increase every 5 years as you age. For healthy veterans, private coverage with locked-in rates may be more cost-effective long-term." },
      { q: "Can I have both VGLI and private life insurance?", a: "Yes. Many veterans keep VGLI for its guaranteed coverage and supplement with private insurance for additional protection or locked-in rates." },
    ],
    keywords: ["SGLI to VGLI", "VGLI conversion", "veteran life insurance transition", "leaving military life insurance"],
  },
  {
    slug: "veteran-estate-planning",
    title: "Estate Planning with Life Insurance for Veterans",
    metaTitle: "Estate Planning for Veterans | Life Insurance for Wealth Transfer",
    metaDescription: "Use life insurance for veteran estate planning and wealth transfer. Tax-free death benefits, legacy creation, and charitable giving. Free consultation.",
    headline: "Build a Legacy That Outlasts Your Service",
    subheadline: "Permanent life insurance as a cornerstone of your estate plan.",
    heroText: "Your military service built discipline, leadership, and resilience. Now build a financial legacy for your family. Permanent life insurance provides a tax-free death benefit that bypasses probate, funds trusts, supports charitable causes, and transfers wealth to the next generation.",
    coverageInterest: "legacy",
    veteranStatus: "veteran",
    trustSignals: [
      { icon: "document", title: "Tax-Free Transfer", description: "Death benefits pass to beneficiaries income-tax-free" },
      { icon: "shield", title: "Bypasses Probate", description: "Named beneficiaries receive funds directly" },
      { icon: "growth", title: "Cash Value Growth", description: "Permanent policies build tax-deferred cash value" },
    ],
    faqs: [
      { q: "How does life insurance help with estate planning?", a: "Life insurance death benefits are generally income-tax-free and pass directly to named beneficiaries, bypassing probate. This makes them an efficient tool for wealth transfer, funding trusts, covering estate taxes, and ensuring your family receives money quickly." },
      { q: "What type of life insurance is best for estate planning?", a: "Permanent life insurance (whole life or universal life) is typically used for estate planning because it provides lifetime coverage and builds cash value. Term life can also play a role for temporary needs like covering a mortgage or income replacement during working years." },
      { q: "Can veterans use life insurance for charitable giving?", a: "Yes. You can name a charity as a beneficiary of your life insurance policy, providing a tax-efficient way to support causes you care about. Some veterans use this to support veteran service organizations." },
    ],
    keywords: ["veteran estate planning", "life insurance wealth transfer veterans", "veteran legacy planning", "military estate planning"],
  },
];

export function getAllLandingPages(): LandingPageData[] {
  return LANDING_PAGES;
}

export function getLandingPageBySlug(slug: string): LandingPageData | undefined {
  return LANDING_PAGES.find((p) => p.slug === slug);
}
