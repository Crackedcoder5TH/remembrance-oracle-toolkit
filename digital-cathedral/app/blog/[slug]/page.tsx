import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllPosts,
  getPostBySlug,
  getRelatedPosts,
} from "../../lib/blog-posts";

// ─── Static Params ───

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

// ─── Dynamic Metadata ───

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getPostBySlug(params.slug);
  if (!post) {
    return { title: "Post Not Found" };
  }

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    keywords: post.tags,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      authors: [post.author],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

// ─── Helpers ───

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Render markdown-like content as paragraphs and headings. */
function renderContent(content: string) {
  const blocks = content.split("\n\n");
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // H2 headings
    if (trimmed.startsWith("## ")) {
      return (
        <h2
          key={i}
          className="text-lg font-medium text-[var(--text-primary)] mt-8 mb-3"
        >
          {trimmed.slice(3)}
        </h2>
      );
    }

    // H3 headings
    if (trimmed.startsWith("### ")) {
      return (
        <h3
          key={i}
          className="text-base font-medium text-[var(--text-primary)] mt-6 mb-2"
        >
          {trimmed.slice(4)}
        </h3>
      );
    }

    // Regular paragraphs
    return (
      <p
        key={i}
        className="text-sm text-[var(--text-muted)] leading-relaxed mb-4"
      >
        {trimmed}
      </p>
    );
  });
}

// ─── Page ───

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getPostBySlug(params.slug);
  if (!post) {
    notFound();
  }

  const related = getRelatedPosts(params.slug, 3);

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.split(",")[0]?.trim() || "https://valorlegacies.com";

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: {
      "@type": "Organization",
      name: post.author,
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Valor Legacies",
      url: BASE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <div className="w-full max-w-4xl">
        {/* ─── Back Link ─── */}
        <Link
          href="/blog"
          className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-8 inline-block hover:opacity-80 transition-opacity"
        >
          &larr; All Resources
        </Link>

        <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
          {/* ─── Article ─── */}
          <article>
            {/* Meta */}
            <header className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2.5 py-0.5 rounded-full bg-teal-cathedral/10 text-teal-cathedral uppercase tracking-wider"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="text-xl sm:text-2xl font-light text-[var(--text-primary)] leading-snug mb-4">
                {post.title}
              </h1>
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <span>{post.author}</span>
                <span>&middot;</span>
                <time dateTime={post.datePublished}>
                  {formatDate(post.datePublished)}
                </time>
                <span>&middot;</span>
                <span>{post.readTime}</span>
              </div>
            </header>

            {/* Content */}
            <div className="border-t border-teal-cathedral/10 pt-6">
              {renderContent(post.content)}
            </div>

            {/* ─── CTA ─── */}
            <div className="cathedral-surface p-6 mt-10 text-center">
              <h3 className="text-base font-medium text-[var(--text-primary)] mb-2">
                Ready to Review Your Coverage?
              </h3>
              <p className="text-xs text-[var(--text-muted)] mb-4 max-w-md mx-auto">
                Connect with a licensed insurance professional who understands
                military benefits. Free, no-obligation consultation.
              </p>
              <Link
                href="/"
                className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
              >
                Start My Coverage Review
              </Link>
            </div>
          </article>

          {/* ─── Sidebar ─── */}
          <aside className="space-y-6">
            {/* Related Posts */}
            {related.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.15em] uppercase text-[var(--text-muted)] mb-4">
                  Related Articles
                </h3>
                <div className="space-y-4">
                  {related.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/blog/${r.slug}`}
                      className="cathedral-surface p-4 block hover:border-teal-cathedral/30 transition-colors group"
                    >
                      <h4 className="text-xs font-medium text-[var(--text-primary)] group-hover:text-teal-cathedral transition-colors leading-snug mb-1">
                        {r.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <time dateTime={r.datePublished}>
                          {formatDate(r.datePublished)}
                        </time>
                        <span>&middot;</span>
                        <span>{r.readTime}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Sidebar CTA */}
            <div className="cathedral-surface p-4 text-center">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Have questions about your coverage options?
              </p>
              <Link
                href="/"
                className="inline-block px-5 py-2 rounded-lg font-medium text-xs transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
              >
                Free Coverage Review
              </Link>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-xs tracking-[0.15em] uppercase text-[var(--text-muted)] mb-3">
                Quick Links
              </h3>
              <nav className="space-y-2">
                <Link
                  href="/blog"
                  className="block text-xs text-teal-cathedral hover:underline"
                >
                  All Resources
                </Link>
                <Link
                  href="/faq"
                  className="block text-xs text-teal-cathedral hover:underline"
                >
                  FAQ
                </Link>
                <Link
                  href="/about"
                  className="block text-xs text-teal-cathedral hover:underline"
                >
                  About Valor Legacies
                </Link>
              </nav>
            </div>
          </aside>
        </div>

        {/* ─── Footer ─── */}
        <footer className="pt-10 mt-10 border-t border-teal-cathedral/10 text-center">
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
