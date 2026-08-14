export const GUIDE_DISCLAIMER =
  "Valor Legacies is not an insurance company. We are an independent life insurance resource and may connect consumers with licensed insurance professionals. Coverage availability, rates, and approval are subject to state availability, underwriting, and carrier guidelines. Valor Legacies is not affiliated with the U.S. Department of Veterans Affairs, the Department of Defense, or any government agency.";

export type GuideCategory =
  | "New Parents"
  | "Homeowners"
  | "Work Benefits"
  | "Final Expense"
  | "Retirement & Legacy"
  | "Veterans & Military Families"
  | "Coverage Basics";

export interface GuideSource {
  label: string;
  href: string;
}

export interface GuideSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface GuideData {
  slug: string;
  title: string;
  category: GuideCategory;
  purpose: string;
  intro: string;
  helps: string[];
  sections: GuideSection[];
  questions: string[];
  cta: string;
  sources: GuideSource[];
  metaDescription: string;
}

export const GUIDES: GuideData[] = [
  {
    slug: "new-parent-protection-checklist",
    title: "New Parent Protection Checklist",
    category: "New Parents",
    purpose:
      "Help new parents understand why having a baby is a major time to review life insurance.",
    intro:
      "Your baby does not just depend on your love. They depend on your income, your care, your stability, and the plan you leave behind. A new baby means more people depending on the life you are building, so this chapter is a meaningful time to review protection.",
    helps: [
      "Why a growing family may need a fresh look at protection",
      "How income replacement can support people who depend on you",
      "Which everyday costs are worth thinking through before choosing coverage",
      "Why employer coverage can be helpful but may not be the whole plan",
    ],
    sections: [
      {
        heading: "A hidden gap for growing families",
        body: [
          "A family may plan for diapers and childcare without calculating how income, unpaid caregiving, housing, debt, and future education would be supported if a parent died.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“My work coverage is enough” is a common starting assumption. Employer coverage may be useful, but its amount and connection to a job can leave needs uncovered.",
        ],
      },
      {
        heading: "Why a new baby changes your protection needs",
        body: [
          "Before children, life insurance may feel like something to think about someday. After a baby arrives, your income, caregiving, housing, and future plans often become tied to someone who cannot provide for themselves yet.",
          "Reviewing coverage does not mean expecting the worst. It means giving your family a plan if life changes unexpectedly.",
        ],
      },
      {
        heading: "What income replacement means for a growing family",
        body: [
          "Income replacement is the idea that life insurance can help replace income your family would lose if an income earner passed away. For new parents, this may include more than a paycheck. It can also support childcare, household help, health insurance changes, or time for a surviving parent to adjust.",
        ],
      },
      {
        heading: "Common expenses to think about",
        body: [
          "Every family is different, but new parents often review the same major categories before deciding how much protection may be appropriate.",
        ],
        bullets: [
          "Mortgage or rent payments",
          "Childcare and household support",
          "Credit cards, student loans, auto loans, or other debt",
          "Future education goals",
          "Daily living costs such as groceries, utilities, insurance, and transportation",
        ],
      },
      {
        heading: "Why work coverage may not be enough by itself",
        body: [
          "Employer life insurance can be a valuable starting point, but many workplace policies are limited to a multiple of salary or a flat amount. Coverage may also change if you leave your job, reduce hours, or lose eligibility.",
          "Personally owned coverage may help fill gaps because it is usually tied to you rather than your employer, subject to policy terms and approval.",
        ],
      },
      {
        heading: "Questions to ask before choosing coverage",
        body: [
          "A simple checklist can make the conversation easier when you speak with a licensed professional.",
        ],
        bullets: [
          "Who depends on my income or caregiving?",
          "How long would my family need support?",
          "What debts or monthly expenses would still need to be paid?",
          "What coverage do I already have through work?",
          "Would my current coverage still be available if I changed jobs?",
        ],
      },
    ],
    questions: [
      "If my income stopped, how many months or years would my family need help?",
      "Who would care for my child, and what would that cost?",
      "Do I want coverage for temporary needs, lifelong needs, or both?",
      "What can I comfortably afford each month?",
      "Which future goal would be hardest for my family to fund without me?",
    ],
    cta: "Start My Protection Path",
    sources: [
      {
        label: "NAIC Life Insurance Consumer Guide",
        href: "https://content.naic.org/consumer/life-insurance.htm",
      },
      {
        label: "Life Happens Life Insurance Needs Calculator",
        href: "https://lifehappens.org/life-insurance-needs-calculator/",
      },
      {
        label: "Life Happens: How much life insurance do I need?",
        href: "https://lifehappens.org/life-insurance-101/how-much-life-insurance-do-i-need/",
      },
      {
        label: "U.S. Census Bureau: Rising Child Care Costs",
        href: "https://www.census.gov/library/stories/2024/01/rising-child-care-cost.html",
      },
    ],
    metaDescription:
      "A simple life insurance checklist for new parents reviewing income replacement, childcare, mortgage or rent, debt, education, and family protection needs.",
  },
  {
    slug: "homeowner-protection-guide",
    title: "Homeowner Protection Guide",
    category: "Homeowners",
    purpose:
      "Help homeowners understand how life insurance can help protect the home if something happens to an income earner.",
    intro:
      "Your home is more than a mortgage. It is where your family’s life is being built. Homeowners often protect the house itself but overlook the income that keeps the mortgage and everyday household costs paid.",
    helps: [
      "Why homeownership often triggers a coverage review",
      "What mortgage protection means in plain English",
      "How protecting a lender differs from protecting your family",
      "Which questions to ask before choosing coverage",
    ],
    sections: [
      {
        heading: "The hidden gap behind the front door",
        body: [
          "Homeowners usually insure the property because the lender requires it. The overlooked gap is often the income that pays the mortgage, utilities, repairs, taxes, and daily family expenses.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“Mortgage insurance protects my family” can be misleading. Mortgage insurance generally protects the lender; personally owned life insurance generally pays a chosen beneficiary, based on policy terms.",
        ],
      },
      {
        heading: "Why buying a home creates a new responsibility",
        body: [
          "A mortgage can be one of the largest financial commitments a family makes. If an income earner passed away, the surviving family may still need to handle the mortgage, utilities, maintenance, insurance, taxes, and daily living costs.",
        ],
      },
      {
        heading: "Mortgage protection in plain English",
        body: [
          "Mortgage protection usually refers to life insurance designed around the amount or length of a mortgage. The goal is to provide money that can help a family keep the home, pay down the loan, or create transition time.",
          "It is important to understand who owns the policy, who receives the benefit, and how the benefit can be used.",
        ],
      },
      {
        heading: "Protecting the lender vs. protecting the family",
        body: [
          "Some products are designed mainly to protect a lender. Life insurance owned by you, with your chosen beneficiary, is generally designed to help your family. That difference matters because your beneficiary may be able to decide whether to pay off the mortgage, keep making payments, or use funds for other urgent needs.",
        ],
      },
      {
        heading: "What coverage can help with",
        body: [
          "Depending on the policy and coverage amount, life insurance may help with several housing-related needs.",
        ],
        bullets: [
          "Paying off all or part of the mortgage",
          "Helping with monthly mortgage payments",
          "Replacing income used for household bills",
          "Creating transition time before major decisions are made",
        ],
      },
      {
        heading: "Questions homeowners should ask",
        body: [
          "You do not need to answer every question perfectly before speaking with a licensed professional. A few basics can help make the review more useful.",
        ],
        bullets: [
          "What is my current mortgage balance and remaining term?",
          "Could my family afford the payment on one income?",
          "Would we want to stay in the home or have flexibility to move?",
          "Do I need protection only for the mortgage, or for income and daily expenses too?",
        ],
      },
    ],
    questions: [
      "How much of the mortgage would I want covered?",
      "Would my beneficiary need a lump sum, monthly flexibility, or both?",
      "Do I already have coverage that could help protect the home?",
      "How long do I expect this home-related need to last?",
      "Which non-mortgage household costs would still need support?",
    ],
    cta: "Protect My Home",
    sources: [
      {
        label: "NAIC Life Insurance Consumer Guide",
        href: "https://content.naic.org/consumer/life-insurance.htm",
      },
      {
        label: "Life Happens Life Insurance Needs Calculator",
        href: "https://lifehappens.org/life-insurance-needs-calculator/",
      },
      {
        label: "CFPB: What is mortgage insurance?",
        href: "https://www.consumerfinance.gov/ask-cfpb/what-is-mortgage-insurance-and-how-does-it-work-en-1953/",
      },
    ],
    metaDescription:
      "A homeowner-friendly guide to mortgage protection, family-owned life insurance, income replacement, and questions to ask after buying a home.",
  },
  {
    slug: "employer-life-insurance",
    title: "Employer Life Insurance: Is It Enough?",
    category: "Work Benefits",
    purpose:
      "Help people understand the difference between work/group coverage and personally owned coverage.",
    intro:
      "Work coverage is a good start. But your family’s protection should not depend only on where you work. Group coverage may be tied to employment, and its benefit may not match your family’s longer-term needs.",
    helps: [
      "What employer life insurance usually means",
      "Why group coverage can be a good starting point",
      "Why personally owned coverage may still matter",
      "What questions to ask your employer or benefits team",
    ],
    sections: [
      {
        heading: "The hidden gap in a workplace benefit",
        body: [
          "A benefit shown during enrollment may feel complete, yet the amount may cover only a portion of income, housing, childcare, debt, final costs, and the time a family needs to adjust.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“I have insurance at work, so I am covered” leaves two questions unanswered: whether the amount is enough and whether the coverage continues or can be converted when employment changes.",
        ],
      },
      {
        heading: "What employer life insurance usually is",
        body: [
          "Employer life insurance is often group term life insurance offered through a workplace benefits package. It may be paid by the employer, employee, or both. Many plans provide a flat amount or a multiple of salary.",
        ],
      },
      {
        heading: "Why group coverage can be a good starting point",
        body: [
          "Work coverage may be convenient, affordable, and easy to enroll in. For many families, it is the first layer of life insurance protection they ever have.",
        ],
      },
      {
        heading: "Why it may not be enough long term",
        body: [
          "The main question is whether the amount and portability match your family's needs. If the benefit is limited, or if coverage ends when your employment ends, it may not be enough by itself for long-term family protection.",
        ],
      },
      {
        heading: "Questions to ask about your work coverage",
        body: [
          "Before comparing options, gather the details of what you already have.",
        ],
        bullets: [
          "How much coverage do I have right now?",
          "Is the coverage portable if I leave my job?",
          "Can I convert it to an individual policy?",
          "Does the cost increase with age?",
          "What happens if I retire, change employers, or become unable to work?",
        ],
      },
      {
        heading: "How personally owned coverage may help fill the gap",
        body: [
          "Personally owned coverage is typically purchased outside of work. If approved and kept in force, it can stay with you even if you change jobs. It may help provide more control over the coverage amount, beneficiaries, and policy duration.",
        ],
      },
    ],
    questions: [
      "How much workplace coverage do I currently have?",
      "Would that amount cover my family’s major needs?",
      "Is my work coverage portable or convertible?",
      "Do I want coverage that I control outside of my employer?",
      "What would my family need beyond the benefit I have today?",
    ],
    cta: "Review My Coverage",
    sources: [
      {
        label: "BLS: Employee Benefits, Life Insurance",
        href: "https://www.bls.gov/news.release/ebs2.t05.htm",
      },
      {
        label: "IRS Group-Term Life Insurance",
        href: "https://www.irs.gov/government-entities/federal-state-local-governments/group-term-life-insurance",
      },
      {
        label: "NAIC Group Life Insurance Model Act",
        href: "https://content.naic.org/sites/default/files/model-law-565.pdf",
      },
      {
        label: "NAIC Life Insurance Consumer Guide",
        href: "https://content.naic.org/consumer/life-insurance.htm",
      },
    ],
    metaDescription:
      "Understand employer life insurance, group term coverage, portability, conversion, and how personally owned life insurance may help fill family protection gaps.",
  },
  {
    slug: "final-expense-planning",
    title: "Final Expense Planning Guide",
    category: "Final Expense",
    purpose:
      "Educate families on funeral, cremation, burial, and final expense planning without fear-based language.",
    intro:
      "Final expense planning is not about death. It is about love, dignity, and not leaving your family with a bill during one of the hardest moments of their lives. A clear plan can reduce both uncertainty and financial strain.",
    helps: [
      "What final expense planning includes",
      "Common costs families may need to prepare for",
      "How burial, cremation, Social Security, and veteran benefits may factor in",
      "Why planning ahead can make things easier for loved ones",
    ],
    sections: [
      {
        heading: "The hidden gap in final expense benefits",
        body: [
          "Funeral, cremation, burial, travel, medical bills, and ongoing household costs can arrive together. Public or veteran benefits may help eligible families but may be limited in amount, timing, or covered expenses.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“Social Security or veteran benefits will cover everything” may leave a shortfall. Eligibility and benefit amounts vary, so families should compare available benefits with likely costs.",
        ],
      },
      {
        heading: "What final expense planning means",
        body: [
          "Final expense planning means thinking through the costs, wishes, documents, and conversations that may come near the end of life. Life insurance is one possible tool families review to help with final costs.",
        ],
      },
      {
        heading: "Common costs families may face",
        body: [
          "Costs vary widely by location, provider, and personal wishes. Families commonly consider:",
        ],
        bullets: [
          "Funeral home services",
          "Burial or cremation",
          "Cemetery plot, marker, or urn",
          "Transportation and permits",
          "Outstanding medical bills or household expenses",
        ],
      },
      {
        heading: "Burial vs. cremation cost considerations",
        body: [
          "Burial and cremation can involve different services and costs. The FTC Funeral Rule gives consumers certain rights when comparing funeral goods and services, including the ability to receive price information.",
        ],
      },
      {
        heading: "Social Security and veteran benefits",
        body: [
          "Social Security may provide a limited lump-sum death payment to certain eligible survivors. Veterans may also qualify for burial benefits depending on eligibility and circumstances. These benefits can help, but families may still have additional costs or timing needs.",
        ],
      },
      {
        heading: "Why planning ahead can reduce stress",
        body: [
          "Planning ahead can give loved ones direction. It can also help them avoid rushed decisions, understand your preferences, and know what resources may be available.",
        ],
      },
    ],
    questions: [
      "Have I written down my final wishes?",
      "Who would be responsible for arrangements?",
      "What benefits or savings may already be available?",
      "Would a final expense policy help reduce stress for my family?",
      "Could my family access funds when bills are due?",
    ],
    cta: "Plan Final Expenses",
    sources: [
      {
        label: "FTC Funeral Rule",
        href: "https://consumer.ftc.gov/articles/ftc-funeral-rule",
      },
      {
        label: "FTC Funeral Costs and Pricing Checklist",
        href: "https://consumer.ftc.gov/articles/funeral-costs-pricing-checklist",
      },
      {
        label: "NFDA funeral cost data",
        href: "https://www.nfda.org/media-center/",
      },
      {
        label: "SSA Lump-Sum Death Payment",
        href: "https://www.ssa.gov/personal-record/when-someone-dies/lump-sum-death-payment",
      },
      {
        label: "VA Burial Allowance",
        href: "https://www.va.gov/burials-memorials/veterans-burial-allowance/",
      },
    ],
    metaDescription:
      "A clear, non-fear-based guide to final expense planning, funeral and cremation costs, Social Security death payment, veteran burial benefits, and planning ahead.",
  },
  {
    slug: "veteran-benefits-vs-private-coverage",
    title: "Veteran Benefits vs. Private Coverage",
    category: "Veterans & Military Families",
    purpose:
      "Help veterans and military families understand what military/VA benefits may offer and where private coverage may still matter.",
    intro:
      "Your service earned benefits. But benefits and a full protection plan are not always the same thing. Military and VA benefits may help, while a family may still need protection for income, housing, debt, and time to adjust.",
    helps: [
      "SGLI and VGLI in plain English",
      "How burial benefits may help eligible families",
      "Why benefits may not cover every family need",
      "Questions veterans and military families can prepare before a coverage review",
    ],
    sections: [
      {
        heading: "The hidden gap between benefits and a family plan",
        body: [
          "A benefit can be valuable without covering every responsibility. Income replacement, mortgage or rent, childcare, debt, education, final expenses, and transition time may extend beyond a program’s scope or amount.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“VA or military benefits cover everything” can keep families from reviewing what changes after service and what their survivors would actually need.",
        ],
      },
      {
        heading: "SGLI in simple terms",
        body: [
          "Servicemembers’ Group Life Insurance, or SGLI, is group life insurance coverage available to eligible service members. It can provide an important foundation during military service.",
        ],
      },
      {
        heading: "VGLI in simple terms",
        body: [
          "Veterans’ Group Life Insurance, or VGLI, allows eligible service members to continue life insurance coverage after service. Costs and eligibility details should be reviewed carefully because family needs and budgets change over time.",
        ],
      },
      {
        heading: "Burial benefits in simple terms",
        body: [
          "Eligible veterans may qualify for burial-related benefits through the VA. These benefits can be helpful, but eligibility, amounts, timing, and covered expenses can vary.",
        ],
      },
      {
        heading: "Why benefits may help but may not cover everything",
        body: [
          "Benefits may support certain needs, but families often also think about mortgage or rent, income replacement, childcare, debts, education goals, and transition time. Those needs may be larger or longer lasting than a single benefit amount.",
        ],
      },
      {
        heading: "Why private coverage may still be worth reviewing",
        body: [
          "Private coverage may provide additional flexibility, ownership, and coverage amounts outside of government or employer programs. Approval, rates, and availability depend on underwriting, state availability, and carrier guidelines.",
        ],
      },
    ],
    questions: [
      "What benefits do I currently have, and when do they change?",
      "Would my family still need income replacement or mortgage support?",
      "How much coverage would help my family feel stable?",
      "Do I want coverage I personally own outside of work or military benefits?",
      "Which expenses are not addressed by my current benefits?",
    ],
    cta: "Review Veteran Options",
    sources: [
      {
        label: "VA SGLI",
        href: "https://www.va.gov/life-insurance/options-eligibility/sgli/",
      },
      {
        label: "VA VGLI",
        href: "https://www.va.gov/life-insurance/options-eligibility/vgli/",
      },
      {
        label: "VA Life Insurance",
        href: "https://www.va.gov/life-insurance/",
      },
      {
        label: "VA Burial Benefits",
        href: "https://www.va.gov/burials-memorials/",
      },
      {
        label: "VA National Cemetery Eligibility",
        href: "https://www.va.gov/burials-memorials/eligibility/",
      },
    ],
    metaDescription:
      "A plain-English guide comparing SGLI, VGLI, VA burial benefits, and private life insurance considerations for veterans and military families.",
  },
  {
    slug: "retirement-life-insurance",
    title: "Life Insurance for Retirement Planning",
    category: "Retirement & Legacy",
    purpose:
      "Explain how life insurance may be part of retirement conversations without overpromising.",
    intro:
      "Retirement should not only be about how long your money lasts. It should also be about what happens to the people you love if plans change. Protection needs may shift toward spouse support, final costs, preserving assets, and legacy goals.",
    helps: [
      "Why retirement can change protection needs",
      "Permanent life insurance and cash value basics",
      "Why policy design and funding matter",
      "Why reviewing options with a licensed professional is important",
    ],
    sections: [
      {
        heading: "The hidden gap in a retirement plan",
        body: [
          "Savings may be designed for two people and a particular timeline. A death, final costs, debt, or a change in income can affect spouse support, assets, and legacy goals.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“I already have savings, so insurance no longer matters” may overlook how quickly needs and timing can change. Life insurance is not right for everyone, but remaining protection needs deserve a review.",
        ],
      },
      {
        heading: "Why retirement changes protection needs",
        body: [
          "As retirement approaches, families may think differently about income, debt, legacy, long-term care concerns, and surviving spouse needs. Coverage that made sense during working years may need to be reviewed.",
        ],
      },
      {
        heading: "Permanent life insurance and cash value basics",
        body: [
          "Some permanent life insurance policies can build cash value. Cash value features vary by policy type and carrier, and they are subject to policy terms, costs, funding, and performance limitations.",
        ],
      },
      {
        heading: "Living benefits and access to policy value",
        body: [
          "Depending on the policy, some features may allow access to policy value or benefits during life. Access may reduce death benefits, create tax consequences, or depend on specific qualifications. Details should be reviewed before relying on any feature.",
        ],
      },
      {
        heading: "Why policy design and funding matter",
        body: [
          "Life insurance used in retirement planning must be designed carefully. Premiums, fees, policy charges, loan provisions, surrender periods, and funding levels can affect whether a policy remains in force and how it performs.",
        ],
      },
      {
        heading: "Why professional review matters",
        body: [
          "Life insurance should not be presented as a guaranteed retirement income source or investment replacement. A licensed professional can help review whether a policy may fit your protection goals, risk tolerance, budget, and broader retirement plan.",
        ],
      },
    ],
    questions: [
      "What protection needs will remain in retirement?",
      "Do I understand the policy costs and risks?",
      "Could accessing policy value reduce benefits or create consequences?",
      "How does this fit with savings, retirement accounts, and other income sources?",
      "What support would my spouse need if retirement plans changed?",
    ],
    cta: "Plan With Confidence",
    sources: [
      {
        label: "NAIC Life Insurance Consumer Guide",
        href: "https://content.naic.org/consumer/life-insurance.htm",
      },
      {
        label: "NAIC Life Insurance Buyer’s Guide PDF",
        href: "https://content.naic.org/sites/default/files/publication-lig-lp-consumer-life.pdf",
      },
      {
        label: "FINRA Insurance overview",
        href: "https://www.finra.org/investors/investing/investment-products/insurance",
      },
    ],
    metaDescription:
      "A careful guide to how life insurance may fit retirement planning, including permanent coverage, cash value basics, policy design, funding, and professional review.",
  },
  {
    slug: "how-much-coverage-do-i-need",
    title: "How Much Coverage Does My Family Need?",
    category: "Coverage Basics",
    purpose:
      "Help families think through coverage needs in a simple, non-intimidating way.",
    intro:
      "The right amount of coverage is not a guess. It should be based on who depends on you, what you owe, what you earn, and what you want protected. A thoughtful estimate starts with your real responsibilities and existing resources.",
    helps: [
      "How to think about coverage without guessing",
      "Which expenses families commonly include",
      "How existing savings and coverage affect the conversation",
      "What to prepare before speaking with a licensed professional",
    ],
    sections: [
      {
        heading: "The hidden gap behind a round number",
        body: [
          "Choosing a benefit because it sounds substantial can overlook income, housing, debt, childcare, education, final expenses, spouse support, and how long loved ones would need to adjust.",
        ],
      },
      {
        heading: "A common assumption to reconsider",
        body: [
          "“Any coverage is enough” or “my savings will handle it” can replace a calculation with a guess. Existing resources matter, but they should be compared with the full list of needs.",
        ],
      },
      {
        heading: "Why there is no one-size-fits-all number",
        body: [
          "Two families with the same income may need different coverage because their debts, savings, ages, children, housing costs, and goals are different. The right discussion starts with your life, not a generic number.",
        ],
      },
      {
        heading: "Income replacement",
        body: [
          "If someone depends on your income, coverage may help replace a portion of that income for a period of time. Families often consider how many years of support would be meaningful.",
        ],
      },
      {
        heading: "Mortgage, rent, debts, childcare, and education",
        body: [
          "Common planning categories include housing costs, credit cards, student loans, auto loans, childcare, education goals, and day-to-day living expenses. You do not need exact answers, but estimates are helpful.",
        ],
      },
      {
        heading: "Final expenses",
        body: [
          "Many families include funeral, cremation, burial, or end-of-life costs in their coverage conversation so loved ones have fewer immediate financial decisions to make.",
        ],
      },
      {
        heading: "Existing savings and coverage",
        body: [
          "Savings, retirement accounts, employer life insurance, military or VA benefits, and personally owned policies can all affect how much additional coverage may be needed.",
        ],
      },
    ],
    questions: [
      "Who depends on me financially or practically?",
      "What debts or monthly expenses would remain?",
      "How much coverage do I already have?",
      "How long would my family need support?",
      "What monthly premium fits comfortably in my budget?",
    ],
    cta: "Find My Protection Path",
    sources: [
      {
        label: "Life Happens Life Insurance Needs Calculator",
        href: "https://lifehappens.org/life-insurance-needs-calculator/",
      },
      {
        label: "Life Happens: How much life insurance do I need?",
        href: "https://lifehappens.org/life-insurance-101/how-much-life-insurance-do-i-need/",
      },
      {
        label: "NAIC Life Insurance Consumer Guide",
        href: "https://content.naic.org/consumer/life-insurance.htm",
      },
      {
        label: "Federal Reserve: Economic Well-Being of U.S. Households in 2024",
        href: "https://www.federalreserve.gov/publications/2025-economic-well-being-of-us-households-in-2024-savings-and-investments.htm",
      },
    ],
    metaDescription:
      "A simple guide to estimating family life insurance coverage needs, including income replacement, mortgage or rent, debts, childcare, education, final expenses, and existing coverage.",
  },
];

export const GUIDE_CATEGORIES: GuideCategory[] = [
  "New Parents",
  "Homeowners",
  "Work Benefits",
  "Final Expense",
  "Retirement & Legacy",
  "Veterans & Military Families",
  "Coverage Basics",
];

export function getGuideBySlug(slug: string): GuideData | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function getGuidesByCategory(category: GuideCategory): GuideData[] {
  return GUIDES.filter((guide) => guide.category === category);
}
