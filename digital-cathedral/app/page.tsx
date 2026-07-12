"use client";

/**
 * Home Page — cinematic life-event life insurance lead capture.
 *
 * Preserves the existing useLeadForm hook, TCPA consent, CSRF-backed lead
 * submission, UTM tracking, and multi-step validation while replacing the
 * consumer homepage with a premium chapter-based guided experience.
 */

import { useEffect, useRef, ChangeEvent } from "react";
import { useLeadForm, FIELD_STEP } from "./protect/hooks/use-lead-form";
import { TcpaConsent } from "./protect/components/tcpa-consent";
import { StepProgress } from "./protect/components/step-progress";
import { useUtmTracking } from "./protect/hooks/use-utm-tracking";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const COVERAGE_OPTIONS: { value: string; label: string; description?: string }[] = [
  { value: "", label: "What changed in your life?" },
  { value: "new-baby", label: "We recently had a baby" },
  { value: "bought-home", label: "We bought a home" },
  { value: "recently-married", label: "We recently got married" },
  { value: "protect-spouse-family", label: "I want to protect my spouse or family" },
  { value: "income-replacement", label: "I want to protect my income" },
  { value: "college-planning", label: "I want to prepare for college costs" },
  { value: "retirement-planning", label: "I am planning for retirement" },
  { value: "legacy", label: "I want to leave a legacy" },
  { value: "final-expense", label: "I need help with final expenses" },
  { value: "veteran-military-family", label: "I am a veteran or military family member" },
  { value: "work-benefits", label: "I am comparing my work benefits" },
  { value: "not-sure", label: "I’m not sure yet" },
];

const LIFE_CHAPTERS: { icon: string; title: string; desc: string; cta: string; value: string; video?: string }[] = [
  { icon: "✦", title: "Just Had a Baby", desc: "Your family just grew. Now is the time to protect the future they’re just beginning.", cta: "Protect My Growing Family", value: "new-baby", video: "newborn-parents.mp4" },
  { icon: "⌂", title: "Bought a Home", desc: "Your home is more than a mortgage. It’s where your family’s life is being built.", cta: "Protect My Home", value: "bought-home" },
  { icon: "∞", title: "Recently Married", desc: "You’re building a future together. Protection helps keep that future secure.", cta: "Start Planning Together", value: "recently-married" },
  { icon: "❤", title: "Protecting My Spouse", desc: "If someone depends on your income, love means having a plan.", cta: "Protect My Person", value: "protect-spouse-family" },
  { icon: "$", title: "Protecting My Income", desc: "Your income supports your life. Protecting it protects the people who rely on you.", cta: "Review Income Protection", value: "income-replacement" },
  { icon: "◈", title: "Preparing for College", desc: "Plan for tomorrow’s dreams while protecting today’s responsibilities.", cta: "Explore Education Planning", value: "college-planning" },
  { icon: "☼", title: "Planning Retirement", desc: "Retirement should come with confidence, flexibility, and peace of mind.", cta: "Plan With Confidence", value: "retirement-planning" },
  { icon: "✧", title: "Leaving a Legacy", desc: "Leave more than memories. Leave love, direction, and protection.", cta: "Build My Legacy", value: "legacy" },
  { icon: "☾", title: "Final Expense Planning", desc: "Protect your family from the financial weight of funeral and final expenses.", cta: "Plan Final Expenses", value: "final-expense" },
  { icon: "★", title: "Veteran & Military Family Protection", desc: "Your service protected others. Now let’s help protect the people you love most.", cta: "Review Veteran Options", value: "veteran-military-family", video: "military-family.mp4" },
];

const STORY_TIMELINE = [
  ["First heartbeat", "For the first heartbeat."],
  ["First front door", "For the first front door."],
  ["First promise", "For the promise you made."],
  ["First graduation", "For the dreams ahead."],
  ["Retirement chapter", "For the years you’ve built."],
  ["Final wishes", "For the love you leave."],
];

const SOLUTIONS = [
  ["Term Life Insurance", "Affordable protection for a specific period of time, often used for income, family, or mortgage protection."],
  ["Whole Life Insurance", "Permanent coverage with fixed premiums and lifelong protection."],
  ["Final Expense Insurance", "Coverage designed to help protect loved ones from funeral and final costs."],
  ["Mortgage Protection", "Life insurance designed to help your family keep or pay off the home if something happens to you."],
  ["Indexed Universal Life", "Life insurance that can provide protection while building cash value with growth potential."],
  ["Income Protection", "Coverage designed around replacing income your family depends on."],
  ["Legacy Planning", "Protection designed to help pass love, values, and financial support to the people who matter most."],
];

const TRUST_PILLARS = [
  ["Veteran-Founded", "Rooted in service, protection, and responsibility."],
  ["Family-Focused", "Every conversation begins with the people you love most."],
  ["Independent", "We are not limited to one insurance company."],
  ["Multiple Highly Rated Carriers", "Options may be reviewed from trusted life insurance providers."],
  ["No-Pressure Guidance", "Education first. Decisions second."],
  ["Privacy-Minded Process", "Your information is handled with care and respect."],
];

const RESOURCE_GUIDES = [
  ["New Parent Protection Checklist", "A simple guide to protecting your growing family after a new baby arrives."],
  ["Homeowner Protection Guide", "Understand how life insurance can help protect the place your family calls home."],
  ["Is Work Life Insurance Enough?", "Learn where employer coverage can help — and where gaps may remain."],
  ["Final Expense Planning Guide", "A clear overview of funeral, burial, and end-of-life expense planning."],
  ["Veteran Benefits vs. Private Coverage", "Compare basic benefit conversations with additional family protection options."],
  ["Life Insurance and Retirement Planning", "See how protection may fit into long-term flexibility and confidence."],
  ["How Much Coverage Does My Family Need?", "Start thinking through income, debts, home needs, children, and future goals."],
];

const TESTIMONIALS = [
  ["After our daughter was born, we realized we had no real plan. Valor Legacies helped us understand our options without pressure.", "New parent placeholder"],
  ["When we bought our home, we wanted to make sure my wife wouldn’t be stuck with the mortgage. The process was simple and clear.", "Homeowner placeholder"],
  ["As a veteran, I thought my benefits were enough. Valor Legacies helped me understand what my family would still be responsible for.", "Veteran family placeholder"],
];

const PURCHASE_INTENT_OPTIONS = [
  { value: "", label: "Where are you in the process?" },
  { value: "protect-family", label: "I’m ready to protect my family" },
  { value: "want-protection", label: "I want guidance soon" },
  { value: "exploring", label: "I’m still exploring my options" },
];

const MILITARY_STATUS_OPTIONS = [
  { value: "", label: "Select your background..." },
  { value: "active-duty", label: "Active-Duty" },
  { value: "reserve", label: "Reserve" },
  { value: "national-guard", label: "National Guard" },
  { value: "veteran", label: "Veteran" },
  { value: "non-military", label: "Military Family Member" },
  { value: "civilian", label: "Civilian" },
];

const CONTACT_TIME_OPTIONS = ["", "Morning", "Afternoon", "Evening", "No preference"];
const BRANCH_PLACEHOLDER = { value: "", label: "Select branch of service..." };
const BRANCHES_FULL = [BRANCH_PLACEHOLDER, { value: "army", label: "U.S. Army" }, { value: "navy", label: "U.S. Navy" }, { value: "air-force", label: "U.S. Air Force" }, { value: "marine-corps", label: "U.S. Marine Corps" }, { value: "space-force", label: "U.S. Space Force" }, { value: "coast-guard", label: "Coast Guard" }];
const BRANCHES_NO_SPACE = [BRANCH_PLACEHOLDER, { value: "army", label: "U.S. Army" }, { value: "navy", label: "U.S. Navy" }, { value: "air-force", label: "U.S. Air Force" }, { value: "marine-corps", label: "U.S. Marine Corps" }, { value: "coast-guard", label: "Coast Guard" }];
const BRANCH_OPTIONS_BY_STATUS: Record<string, { value: string; label: string }[]> = {
  "active-duty": BRANCHES_FULL,
  "reserve": BRANCHES_NO_SPACE,
  "national-guard": [BRANCH_PLACEHOLDER, { value: "air-national-guard", label: "Air National Guard" }, { value: "army-national-guard", label: "Army National Guard" }],
  "veteran": BRANCHES_FULL,
};

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function autoCapitalizeName(value: string): string {
  return value.replace(/(?:^|\s|[-'])([a-z])/g, (match) => match.toUpperCase());
}

const INPUT_CLASS = "w-full rounded-2xl border border-[#d9cdbb] bg-white/90 px-4 py-3 text-sm text-[#201b16] placeholder-[#8a7d6d] shadow-inner shadow-black/5 transition-all focus:border-[#b58b3b] focus:outline-none focus:ring-2 focus:ring-[#c8a85d]/25";
const INPUT_ERROR = INPUT_CLASS + " border-red-500 bg-red-50/70 focus:border-red-500 focus:ring-red-200";
const SELECT_CLASS = INPUT_CLASS + " appearance-none";
const LABEL_CLASS = "block text-sm font-semibold text-[#2a2219]";
const BTN_PRIMARY = "rounded-full bg-[#b58b3b] px-7 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(82,55,17,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#9f782f] focus-visible:outline-[#f4d58d]";
const BTN_SECONDARY = "rounded-full border border-[#d9c08a]/55 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/15";
const BTN_BACK = "rounded-full border border-[#d9cdbb] px-6 py-3 text-sm font-semibold text-[#6c5a40] transition-all hover:border-[#b58b3b]";
const SECTION_LABEL = "mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#b58b3b]";
const SECTION_HEADING = "font-serif text-3xl font-light leading-tight text-[#211a13] md:text-5xl";

const NEXT_STEPS = [
  { title: "Careful Review", desc: "Your request is reviewed so your family receives thoughtful, relevant guidance." },
  { title: "Professional Follow-Up", desc: "A licensed professional may contact you to discuss options for your life and goals." },
  { title: "No-Pressure Clarity", desc: "You decide what feels right. Submission does not guarantee coverage or approval." },
];

const FOOTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#life-chapters", label: "Life Chapters" },
  { href: "/resources", label: "Guides" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
];

function inputClass(hasError: boolean) { return hasError ? INPUT_ERROR : INPUT_CLASS; }
function selectClass(hasError: boolean) { return hasError ? INPUT_ERROR + " appearance-none" : SELECT_CLASS; }

export default function HomePage() {
  const utm = useUtmTracking();
  const {
    form, errors, loading, submitted, confirmationMessage, leadId, serverError,
    step, totalSteps, submitAttempted, missingFields,
    updateField, handleSubmit, nextStep, prevStep, goToStep,
  } = useLeadForm({ ...utm });

  const stepContainerRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(step);

  useEffect(() => {
    if (step !== prevStepRef.current) {
      prevStepRef.current = step;
      requestAnimationFrame(() => {
        const firstInput = stepContainerRef.current?.querySelector<HTMLElement>("input, select, textarea");
        firstInput?.focus();
      });
    }
  }, [step]);

  function chooseChapter(value: string) {
    updateField("coverageInterest", value);
    document.getElementById("protection-path")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f6f0e6] px-4 py-16 text-[#241d15]" aria-label="Form submission confirmation">
        <section className="mx-auto max-w-2xl rounded-[2rem] border border-[#d9c08a]/45 bg-white p-8 text-center shadow-[0_24px_80px_rgba(55,39,20,0.12)] md:p-12">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-[#1f1a14] text-3xl text-[#d6b35f]" aria-hidden="true">✓</div>
          <p className={SECTION_LABEL}>Request Received</p>
          <h1 className="font-serif text-4xl font-light md:text-5xl">Thank you, {form.firstName}.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#6a5c4b]">{confirmationMessage || "Your protection path request has been received. A licensed professional will be in touch soon."}</p>
          {leadId && (
            <div className="mx-auto my-8 inline-block rounded-2xl bg-[#f6f0e6] px-5 py-3 text-left">
              <p className="text-xs uppercase tracking-[0.24em] text-[#8c7550]">Reference Number</p>
              <p className="mt-1 font-mono text-sm text-[#241d15]">{leadId}</p>
            </div>
          )}
          <div className="mt-8 grid gap-4 border-t border-[#eadfce] pt-8 text-left md:grid-cols-3">
            {NEXT_STEPS.map((item, index) => (
              <div key={item.title}>
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#d6b35f] text-sm font-bold text-white">{index + 1}</div>
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6a5c4b]">{item.desc}</p>
              </div>
            ))}
          </div>
          <a href="/" className="mt-10 inline-flex rounded-full bg-[#201913] px-7 py-3 text-sm font-semibold text-white">Return Home</a>
        </section>
      </main>
    );
  }

  return (
    <main className="overflow-hidden bg-[#f6f0e6] text-[#241d15]">
      <section id="home" className="relative flex min-h-[92vh] items-center px-4 py-24 text-white md:px-8" aria-labelledby="hero-heading">
        {/* Static base — shown while the video loads and for reduced-motion visitors */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(214,179,95,0.34),transparent_28%),linear-gradient(120deg,rgba(19,16,13,0.96),rgba(31,25,19,0.82)_45%,rgba(65,45,24,0.5)),url('/og-image.svg')] bg-cover bg-center" aria-hidden="true" />
        {/* Cinematic brand-story montage — silent, autoplaying, looping */}
        <video
          className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src="/assets/valor/life-chapters-montage.mp4" type="video/mp4" />
        </video>
        {/* Warmth + legibility overlay over the video (keeps the brand palette and readable text) */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(214,179,95,0.30),transparent_30%),linear-gradient(120deg,rgba(19,16,13,0.90),rgba(31,25,19,0.66)_45%,rgba(65,45,24,0.40))]" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-[#f6f0e6]" aria-hidden="true" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="animate-valor-rise max-w-4xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.35em] text-[#d6b35f]">Life changes. Love lives on.</p>
            <p className="font-serif text-2xl text-[#f6e5c4] md:text-4xl">For the life you live...</p>
            <p className="mt-2 font-serif text-2xl text-[#f6e5c4] md:text-4xl">...and the love you leave.</p>
            <h1 id="hero-heading" className="mt-7 max-w-4xl font-serif text-5xl font-light leading-[0.98] tracking-[-0.04em] md:text-7xl lg:text-8xl">Every New Chapter Deserves Protection.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#f8ead2] md:text-xl">Life changes in beautiful, unexpected, and meaningful ways. Valor Legacies helps families find life insurance guidance for the moments that matter most.</p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a href="#protection-path" className={BTN_PRIMARY}>Find My Protection Path</a>
              <a href="#life-chapters" className={BTN_SECONDARY}>Explore Life Chapters</a>
            </div>
          </div>
          <div className="animate-valor-rise hidden rounded-[2rem] border border-white/15 bg-white/10 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur md:block">
            <div className="rounded-[1.5rem] bg-gradient-to-br from-[#f6e5c4]/95 to-[#b58b3b]/80 p-8 text-[#211a13]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em]">Guided protection</p>
              <p className="mt-16 font-serif text-4xl leading-tight">A quiet plan for the people who matter most.</p>
              <p className="mt-6 text-sm leading-7 text-[#4b3a25]">From the first heartbeat to the final wish, we help families protect every chapter in between — quietly, and without pressure.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="life-chapters" className="px-4 py-20 md:px-8 md:py-28" aria-labelledby="life-chapters-heading">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className={SECTION_LABEL}>Start with your moment</p>
            <h2 id="life-chapters-heading" className={SECTION_HEADING}>What Chapter Are You In?</h2>
            <p className="mt-5 text-lg leading-8 text-[#6a5c4b]">You do not need to know what type of life insurance you need. Start with the moment that brought you here.</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {LIFE_CHAPTERS.map((chapter) => (
              <button key={chapter.title} type="button" onClick={() => chooseChapter(chapter.value)} className="group overflow-hidden rounded-[1.5rem] border border-[#decda9] bg-white/80 p-5 text-left shadow-[0_18px_60px_rgba(61,43,24,0.08)] transition-all hover:-translate-y-1 hover:border-[#c8a85d] hover:bg-white hover:shadow-[0_26px_70px_rgba(61,43,24,0.14)] focus-visible:outline-[#b58b3b]">
                {chapter.video && (
                  <div className="-mx-5 -mt-5 mb-5 aspect-[464/688] overflow-hidden bg-[#241d15] motion-reduce:hidden">
                    <video className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
                      <source src={`/assets/valor/${chapter.video}`} type="video/mp4" />
                    </video>
                  </div>
                )}
                <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-[#241d15] text-lg text-[#d6b35f]">{chapter.icon}</span>
                <h3 className="font-serif text-xl leading-tight text-[#241d15]">{chapter.title}</h3>
                <p className="mt-3 min-h-[84px] text-sm leading-6 text-[#6a5c4b]">{chapter.desc}</p>
                <span className="mt-5 inline-flex text-sm font-semibold text-[#9f782f] group-hover:underline">{chapter.cta}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#211a13] px-4 py-20 text-white md:px-8 md:py-28" aria-labelledby="story-heading">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className={SECTION_LABEL}>Valor Legacies</p>
            <h2 id="story-heading" className="font-serif text-4xl font-light leading-tight md:text-6xl">Life changes. Love lives on.</h2>
            <p className="mt-6 text-lg leading-8 text-[#eadcc7]">From the first heartbeat to the first home, from wedding vows to retirement plans, every chapter carries love, responsibility, and meaning. Valor Legacies helps families protect what matters today while preparing for what comes tomorrow.</p>
            <p className="mt-8 font-serif text-3xl text-[#d6b35f]">Valor Legacies.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {STORY_TIMELINE.map(([title, caption], index) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
                <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-full border border-[#d6b35f]/55 text-sm text-[#d6b35f]">{index + 1}</div>
                <h3 className="font-serif text-2xl">{title}</h3>
                <p className="mt-2 text-sm text-[#eadcc7]">{caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 md:px-8 md:py-28" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl text-center">
          <p className={SECTION_LABEL}>A calmer way forward</p>
          <h2 id="how-heading" className={SECTION_HEADING}>You Don’t Have to Figure This Out Alone.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              ["Tell us what changed.", "Choose the life event or concern that brought you here."],
              ["Understand your options.", "We help make life insurance simple, clear, and relatable."],
              ["Get guidance that fits your life.", "A licensed professional can help review options based on your needs, goals, health, and budget."],
            ].map(([title, desc], index) => (
              <div key={title} className="rounded-[1.75rem] bg-white p-8 text-left shadow-[0_20px_70px_rgba(61,43,24,0.08)]">
                <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full bg-[#d6b35f] font-bold text-white">{index + 1}</div>
                <h3 className="font-serif text-2xl text-[#241d15]">{title}</h3>
                <p className="mt-4 leading-7 text-[#6a5c4b]">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl rounded-full bg-white/70 px-6 py-3 text-sm text-[#6a5c4b]">Every request is carefully reviewed before a licensed professional follows up, so families receive thoughtful, relevant guidance.</p>
        </div>
      </section>

      <section id="solutions" className="bg-white px-4 py-20 md:px-8 md:py-28" aria-labelledby="solutions-heading">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className={SECTION_LABEL}>Not product-first</p>
            <h2 id="solutions-heading" className={SECTION_HEADING}>Protection Designed Around Your Life</h2>
            <p className="mt-5 text-lg leading-8 text-[#6a5c4b]">You do not need to know which policy fits before reaching out. That is exactly what guidance is for.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map(([title, desc]) => (
              <div key={title} className="rounded-[1.5rem] border border-[#eadfce] bg-[#fbf7f0] p-6 transition-all hover:-translate-y-1 hover:border-[#d6b35f]">
                <h3 className="font-serif text-2xl text-[#241d15]">{title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#6a5c4b]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 md:px-8 md:py-28" aria-labelledby="trust-heading">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className={SECTION_LABEL}>Trust pillars</p>
            <h2 id="trust-heading" className={SECTION_HEADING}>Guided by Service. Built on Trust.</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST_PILLARS.map(([title, desc]) => (
              <div key={title} className="rounded-[1.5rem] border border-[#decda9] bg-white/80 p-6">
                <h3 className="font-serif text-2xl text-[#241d15]">{title}</h3>
                <p className="mt-3 leading-7 text-[#6a5c4b]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="guides" className="bg-[#211a13] px-4 py-20 text-white md:px-8 md:py-28" aria-labelledby="guides-heading">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className={SECTION_LABEL}>Resource center</p>
            <h2 id="guides-heading" className="font-serif text-4xl font-light md:text-6xl">Learn Before You Decide</h2>
            <p className="mt-5 text-lg text-[#eadcc7]">Helpful guides for life’s biggest moments.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {RESOURCE_GUIDES.map(([title, desc]) => (
              <a key={title} href="/resources" className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-6 transition-all hover:-translate-y-1 hover:border-[#d6b35f]/60">
                <h3 className="font-serif text-2xl">{title}</h3>
                <p className="mt-3 min-h-[78px] text-sm leading-7 text-[#eadcc7]">{desc}</p>
                <span className="text-sm font-semibold text-[#d6b35f]">Read Guide</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="protection-path" className="px-4 py-20 md:px-8 md:py-28" aria-labelledby="form-heading">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <p className={SECTION_LABEL}>Protection path</p>
            <h2 id="form-heading" className={SECTION_HEADING}>Find Your Protection Path</h2>
            <p className="mt-5 text-lg leading-8 text-[#6a5c4b]">Start with what changed in your life. We’ll help guide the next step.</p>
            <div className="mt-8 rounded-[1.5rem] border border-[#decda9] bg-white/75 p-6 text-sm leading-7 text-[#6a5c4b]">
              <strong className="text-[#241d15]">Privacy-minded guidance.</strong> By submitting this form, you agree to be contacted by Valor Legacies or a licensed insurance professional regarding life insurance options. Message and data rates may apply. Submission does not guarantee coverage or approval.
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-[#decda9] bg-white p-5 shadow-[0_30px_90px_rgba(61,43,24,0.12)] md:p-8" noValidate aria-label="Life insurance protection path form">
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
              <label htmlFor="_hp_website">Website</label>
              <input id="_hp_website" name="website" type="text" value={form._hp_website} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("_hp_website", e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>

            <StepProgress currentStep={step} totalSteps={totalSteps} />
            <div aria-live="polite" aria-atomic="true" className="sr-only">{`Step ${step + 1} of ${totalSteps}: ${["Your Life Chapter", "Contact Details", "Review and Consent"][step]}`}</div>

            {step === 0 && (
              <div ref={stepContainerRef} className="mt-8 space-y-5 animate-in fade-in" role="group" aria-label="Step 1: Your Life Chapter">
                <div className="space-y-2">
                  <label htmlFor="coverage" className={LABEL_CLASS}>What changed in your life that made you start thinking about protection?</label>
                  <select id="coverage" value={form.coverageInterest} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("coverageInterest", e.target.value)} aria-required="true" aria-invalid={!!errors.coverageInterest} aria-describedby={errors.coverageInterest ? "coverage-error" : undefined} className={selectClass(!!errors.coverageInterest)}>
                    {COVERAGE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  {errors.coverageInterest && <p id="coverage-error" className="text-xs text-red-600" role="alert">{errors.coverageInterest}</p>}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="firstName" className={LABEL_CLASS}>First Name</label>
                    <input id="firstName" type="text" value={form.firstName} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("firstName", autoCapitalizeName(e.target.value))} placeholder="Jane" autoComplete="given-name" aria-required="true" aria-invalid={!!errors.firstName} className={inputClass(!!errors.firstName)} />
                    {errors.firstName && <p className="text-xs text-red-600" role="alert">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lastName" className={LABEL_CLASS}>Last Name</label>
                    <input id="lastName" type="text" value={form.lastName} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("lastName", autoCapitalizeName(e.target.value))} placeholder="Doe" autoComplete="family-name" aria-required="true" aria-invalid={!!errors.lastName} className={inputClass(!!errors.lastName)} />
                    {errors.lastName && <p className="text-xs text-red-600" role="alert">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="dateOfBirth" className={LABEL_CLASS}>Date of Birth</label>
                  <input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("dateOfBirth", e.target.value)} autoComplete="bday" aria-required="true" aria-invalid={!!errors.dateOfBirth} className={inputClass(!!errors.dateOfBirth)} />
                  <p className="text-xs text-[#8a6a3a]">Required to route accurate life insurance guidance. You must be at least 18.</p>
                  {errors.dateOfBirth && <p className="text-xs text-red-600" role="alert">{errors.dateOfBirth}</p>}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="state" className={LABEL_CLASS}>State</label>
                    <select id="state" value={form.state} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("state", e.target.value)} aria-required="true" aria-invalid={!!errors.state} className={selectClass(!!errors.state)}>
                      <option value="">Select your state...</option>
                      {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                    {errors.state && <p className="text-xs text-red-600" role="alert">{errors.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="purchaseIntent" className={LABEL_CLASS}>Readiness</label>
                    <select id="purchaseIntent" value={form.purchaseIntent} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("purchaseIntent", e.target.value)} aria-required="true" aria-invalid={!!errors.purchaseIntent} className={selectClass(!!errors.purchaseIntent)}>
                      {PURCHASE_INTENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    {errors.purchaseIntent && <p className="text-xs text-red-600" role="alert">{errors.purchaseIntent}</p>}
                  </div>
                </div>

                <button type="button" onClick={nextStep} className={`w-full ${BTN_PRIMARY}`}>Continue My Path</button>
              </div>
            )}

            {step === 1 && (
              <div ref={stepContainerRef} className="mt-8 space-y-5 animate-in fade-in" role="group" aria-label="Step 2: Contact Details">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="phone" className={LABEL_CLASS}>Phone</label>
                    <input id="phone" type="tel" value={form.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("phone", formatPhoneInput(e.target.value))} placeholder="(555) 123-4567" autoComplete="tel" aria-required="true" aria-invalid={!!errors.phone} className={inputClass(!!errors.phone)} />
                    {errors.phone && <p className="text-xs text-red-600" role="alert">{errors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className={LABEL_CLASS}>Email</label>
                    <input id="email" type="email" value={form.email} onChange={(e: ChangeEvent<HTMLInputElement>) => updateField("email", e.target.value)} placeholder="jane@example.com" autoComplete="email" aria-required="true" aria-invalid={!!errors.email} className={inputClass(!!errors.email)} />
                    {errors.email && <p className="text-xs text-red-600" role="alert">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="preferredContactTime" className={LABEL_CLASS}>Preferred Contact Time</label>
                    <select id="preferredContactTime" value={form.preferredContactTime} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("preferredContactTime", e.target.value)} className={selectClass(false)}>
                      {CONTACT_TIME_OPTIONS.map((opt) => <option key={opt || "blank"} value={opt}>{opt || "Select a time..."}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="veteranStatus" className={LABEL_CLASS}>Background</label>
                    <select id="veteranStatus" value={form.veteranStatus} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("veteranStatus", e.target.value)} aria-required="true" aria-invalid={!!errors.veteranStatus} className={selectClass(!!errors.veteranStatus)}>
                      {MILITARY_STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    {errors.veteranStatus && <p className="text-xs text-red-600" role="alert">{errors.veteranStatus}</p>}
                  </div>
                </div>

                {form.veteranStatus && form.veteranStatus !== "non-military" && form.veteranStatus !== "civilian" && BRANCH_OPTIONS_BY_STATUS[form.veteranStatus] && (
                  <div className="space-y-2 animate-in fade-in">
                    <label htmlFor="militaryBranch" className={LABEL_CLASS}>Branch of Service</label>
                    <select id="militaryBranch" value={form.militaryBranch} onChange={(e: ChangeEvent<HTMLSelectElement>) => updateField("militaryBranch", e.target.value)} aria-required="true" aria-invalid={!!errors.militaryBranch} className={selectClass(!!errors.militaryBranch)}>
                      {BRANCH_OPTIONS_BY_STATUS[form.veteranStatus].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <p className="text-xs text-[#8a6a3a]">Thank you for your service.</p>
                    {errors.militaryBranch && <p className="text-xs text-red-600" role="alert">{errors.militaryBranch}</p>}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="message" className={LABEL_CLASS}>Optional Message</label>
                  <textarea id="message" value={form.message} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => updateField("message", e.target.value)} rows={4} className={inputClass(false)} placeholder="Anything you’d like us to know about your family, goals, or timing?" />
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={prevStep} className={`flex-1 ${BTN_BACK}`}>Back</button>
                  <button type="button" onClick={nextStep} className={`flex-1 ${BTN_PRIMARY}`}>Continue</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div ref={stepContainerRef} className="mt-8 space-y-5 animate-in fade-in" role="group" aria-label="Step 3: Review and Consent">
                <div className="rounded-3xl bg-[#f6f0e6] p-5 text-sm leading-7">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#9f782f]">Review Your Path</p>
                  <p className="font-semibold text-[#241d15]">{form.firstName} {form.lastName}</p>
                  <p>{COVERAGE_OPTIONS.find(o => o.value === form.coverageInterest)?.label}</p>
                  <p>{form.phone} · {form.email}</p>
                  <p>{US_STATES.find(s => s.code === form.state)?.name}</p>
                  <button type="button" onClick={() => prevStep()} className="mt-2 text-sm font-semibold text-[#9f782f] underline">Edit information</button>
                </div>

                <TcpaConsent tcpaChecked={form.tcpaConsent} privacyChecked={form.privacyConsent} onTcpaChange={(v) => updateField("tcpaConsent", v)} onPrivacyChange={(v) => updateField("privacyConsent", v)} tcpaError={errors.tcpaConsent} privacyError={errors.privacyConsent} />

                <p className="rounded-2xl bg-[#f6f0e6] p-4 text-xs leading-6 text-[#6a5c4b]">By submitting this form, you agree to be contacted by Valor Legacies or a licensed insurance professional regarding life insurance options. Message and data rates may apply. Submission does not guarantee coverage or approval.</p>

                {serverError && <div className="text-center text-sm text-red-600" role="alert" aria-live="assertive">{serverError}</div>}
                {submitAttempted && missingFields.length > 0 && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
                    <p className="font-semibold">Please review:</p>
                    <ul className="mt-2 list-disc pl-5">
                      {missingFields.map((m) => <li key={m.field}><button type="button" className="underline" onClick={() => goToStep(FIELD_STEP[m.field])}>{m.label}: {m.error}</button></li>)}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="button" onClick={prevStep} className={`flex-1 ${BTN_BACK}`}>Back</button>
                  <button type="submit" disabled={loading} className={`flex-1 ${BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}>{loading ? "Sending..." : "Start My Protection Path"}</button>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>

      <section className="bg-white px-4 py-20 md:px-8 md:py-28" aria-labelledby="testimonials-heading">
        <div className="mx-auto max-w-7xl">
          <p className={SECTION_LABEL}>Stories to replace with approved testimonials</p>
          <h2 id="testimonials-heading" className={SECTION_HEADING}>Families Come Here at Real Moments.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map(([quote, label]) => (
              <figure key={label} className="rounded-[1.5rem] bg-[#fbf7f0] p-6 shadow-[0_18px_60px_rgba(61,43,24,0.08)]">
                <blockquote className="font-serif text-2xl leading-snug text-[#241d15]">“{quote}”</blockquote>
                <figcaption className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#9f782f]">{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="px-4 py-20 md:px-8 md:py-28" aria-labelledby="about-heading">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-[2rem] bg-[#241d15] p-8 text-white md:p-12 lg:grid-cols-[1fr_0.7fr] lg:items-center">
          <div>
            <p className={SECTION_LABEL}>Our story</p>
            <h2 id="about-heading" className="font-serif text-4xl font-light md:text-6xl">Veteran-Founded. Family-Focused. Independent.</h2>
            <p className="mt-6 text-lg leading-8 text-[#eadcc7]">Valor Legacies was created to help families make confident decisions during life’s most important transitions. Founded by Andrea Golden, a veteran, our mission is rooted in service, protection, and legacy. We are independent, which means we are not limited to one insurance company. We help families understand options that fit their life, budget, and goals.</p>
            <a href="/about" className="mt-8 inline-flex rounded-full bg-[#d6b35f] px-7 py-3 text-sm font-semibold text-[#241d15]">Our Story</a>
          </div>
          <figure className="overflow-hidden rounded-[1.5rem] border border-[#d6b35f]/40 bg-gradient-to-br from-[#f6e5c4]/15 to-[#b58b3b]/10 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <img src="/assets/valor/founder-andrea-military.jpg" alt="Andrea Golden, veteran and founder of Valor Legacies" className="w-full rounded-[1.15rem]" loading="lazy" />
            <figcaption className="px-2 pb-1 pt-4 text-center">
              <p className="font-serif text-2xl text-[#f6e5c4]">Andrea Golden</p>
              <p className="mt-1 text-xs uppercase tracking-[0.24em] text-[#d6b35f]">Founder · Veteran</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <footer className="bg-[#15110d] px-4 py-12 text-[#eadcc7] md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_1.2fr]">
          <div>
            <p className="font-serif text-3xl text-white">Valor Legacies</p>
            <p className="mt-3 text-[#d6b35f]">For the life you live and the love you leave.</p>
          </div>
          <nav className="grid grid-cols-2 gap-3 text-sm" aria-label="Footer navigation">
            {FOOTER_LINKS.map((l) => <a key={l.href} href={l.href} className="hover:text-white">{l.label}</a>)}
          </nav>
          <div className="text-xs leading-6 text-[#b9aa95]">
            <p>Valor Legacies is not an insurance company. We are an independent life insurance resource and may connect consumers with licensed insurance professionals. Coverage availability, rates, and approval are subject to state availability, underwriting, and carrier guidelines. Valor Legacies is not affiliated with the U.S. Department of Veterans Affairs, the Department of Defense, or any government agency.</p>
            <p className="mt-4">&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
