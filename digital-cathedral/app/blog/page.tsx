import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "../lib/blog-posts";

export const metadata: Metadata = {
  title: "Veteran Life Insurance Resources",
  description:
    "Expert guides, tips, and resources on life insurance for veterans, active duty service members, and military families. SGLI, VGLI, VA programs, and private coverage explained.",
  alternates: {
    canonical: "/blog",
  },
};

const BLOG_FAQS = [
  {
    q: "What happens to my SGLI when I leave the military?",
    a: "SGLI coverage continues for 120 days after separation at no cost. You then have an additional 120 days (240 days total) to convert to VGLI without a medical exam. After that window, you may need to provide evidence of good health.",
  },
  {
    q: "Is VGLI the best life insurance option for veterans?",
    a: "Not always. VGLI premiums increase every five years and can become significantly more expensive than comparable private term policies. Healthy veterans often find better rates on the private market. VGLI is most valuable for veterans with health conditions who benefit from its guaranteed-issue conversion window.",
  },
  {
    q: "Can disabled veterans get life insurance?",
    a: "Yes. The VA offers several programs specifically for disabled veterans, including Service-Disabled Veterans Life Insurance (S-DVI) and Veterans Affairs Life Insurance (VALife), which provides up to $40,000 in whole life coverage with guaranteed acceptance for any service-connected disability rating.",
  },
  {
    q: "How much life insurance do military families need?",
    a: "Financial planners typically recommend 10-15 times your annual income, including military compensation like BAH and BAS. Most military families need more than the $500,000 SGLI maximum, especially if they have a mortgage, children, or a single-income household.",
  },
  {
    q: "Does military service affect life insurance rates?",
    a: "It depends on your MOS, deployment history, and health. Administrative roles are typically rated the same as civilian jobs, while combat-related MOSs may face slightly higher premiums. Most veterans receive standard civilian rates after separation.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: BLOG_FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="w-full max-w-4xl space-y-10">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            Veteran Life Insurance Resources
          </h1>
          <p className="text-sm text-[var(--text-muted)] max-w-xl">
            Expert guides on SGLI, VGLI, VA insurance programs, and private
            coverage options for service members, veterans, and military families.
          </p>
        </header>

        {/* ─── Post Grid ─── */}
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="cathedral-surface p-5 block hover:border-teal-cathedral/30 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-3">
                <time
                  dateTime={post.datePublished}
                  className="text-xs text-[var(--text-muted)]"
                >
                  {formatDate(post.datePublished)}
                </time>
                <span className="text-xs text-[var(--text-muted)]">&middot;</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {post.readTime}
                </span>
              </div>
              <h2 className="text-sm font-medium text-[var(--text-primary)] mb-2 group-hover:text-teal-cathedral transition-colors leading-snug">
                {post.title}
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-3 mb-3">
                {post.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-teal-cathedral/10 text-teal-cathedral"
                  >
                    {tag}
                  </span>
                ))}
                {post.tags.length > 3 && (
                  <span className="text-[10px] px-2 py-0.5 text-[var(--text-muted)]">
                    +{post.tags.length - 3} more
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* ─── FAQ Section ─── */}
        <section className="space-y-6 pt-4">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Common Questions
          </h2>
          <div className="space-y-4">
            {BLOG_FAQS.map((item) => (
              <div
                key={item.q}
                className="border-b border-indigo-cathedral/8 pb-4"
              >
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                  {item.q}
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── CTA ─── */}
        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Start My Coverage Review
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Free, no-obligation review. Takes less than 60 seconds.
          </p>
        </div>

        {/* ─── Footer ─── */}
        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <nav className="flex gap-4 justify-center mb-3">
            <Link
              href="/about"
              className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs"
            >
              About
            </Link>
            <Link
              href="/faq"
              className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs"
            >
              FAQ
            </Link>
            <Link
              href="/privacy"
              className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs"
            >
              Terms of Service
            </Link>
          </nav>
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights
            reserved.
          </p>
        </footer>
      </div>
    </main>
  );
}
