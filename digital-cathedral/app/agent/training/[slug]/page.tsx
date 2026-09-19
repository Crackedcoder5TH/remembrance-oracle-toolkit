"use client";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyScriptButton } from "../../../components/copy-script-button";
import { Panel, PortalShell } from "../../../components/portal-shell";
import { getTrainingModule } from "../../../lib/portal-training-content";

/** Rotating disclosure marker for the accordions. */
function Chevron() {
  return (
    <span className="text-[#c9a75f] transition-transform duration-200 group-open:rotate-90" aria-hidden>
      ▸
    </span>
  );
}

export default function TrainingModulePage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // Long modules (e.g. Triple-A has 15 scripts + 15 sections) become an
  // unscannable wall if everything renders open. Each script is a collapsed,
  // clickable row showing only its title (the first opens by default), and the
  // whole "Details & guidance" breakdown sits behind a single collapsed
  // dropdown. Expand/Collapse all remounts the group so the new default applies
  // while leaving each row individually toggleable afterward.
  const [forceOpen, setForceOpen] = useState<null | boolean>(null);
  const module = getTrainingModule(params.slug);

  useEffect(() => {
    fetch("/api/portal/session", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        setReady(true);
      })
      .catch(() => router.replace("/portal/login"));
  }, [router]);

  if (!module) notFound();
  if (!ready) {
    return <main className="grid min-h-screen place-items-center bg-[#f4efe5] text-sm text-[#776e61]">Opening module…</main>;
  }

  const hasScripts = module.scripts.length > 0;
  const hasSections = module.sections.length > 0;
  const collapsible = hasScripts || hasSections;

  return (
    <PortalShell role="agent" eyebrow={module.category} title={module.title} description={module.summary}>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-5">
          <Panel title="Best used when">
            <p className="text-sm leading-7 text-[#62594e]">{module.bestUsedWhen}</p>
          </Panel>

          {collapsible && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setForceOpen(true)}
                className="rounded-lg border border-[#e2d9c9] bg-white px-3 py-1.5 text-xs font-semibold text-[#176b65] hover:border-[#c9a75f]"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setForceOpen(false)}
                className="rounded-lg border border-[#e2d9c9] bg-white px-3 py-1.5 text-xs font-semibold text-[#62594e] hover:border-[#c9a75f]"
              >
                Collapse all
              </button>
            </div>
          )}

          {/* key remounts the group when Expand/Collapse all flips, so each
              <details> picks up the new default open state. */}
          <div key={String(forceOpen)} className="space-y-5">
            {hasScripts && (
              <Panel title={`Scripts & talk tracks · ${module.scripts.length}`}>
                <div className="space-y-2">
                  {module.scripts.map((script, i) => (
                    <details
                      key={script.label}
                      open={forceOpen ?? i === 0}
                      className="group overflow-hidden rounded-xl border border-[#e2d9c9] bg-[#faf8f3] [&[open]]:bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[#211d18]">
                        <Chevron />
                        <span>{script.label}</span>
                      </summary>
                      <div className="border-t border-[#eee7db] px-4 py-3">
                        <p className="whitespace-pre-line text-sm leading-7 text-[#62594e]">“{script.text}”</p>
                        <div className="mt-3">
                          <CopyScriptButton text={script.text} />
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </Panel>
            )}

            {/* Details & guidance stays fully collapsed behind a single dropdown —
                only the title shows until the agent chooses to open it. */}
            {hasSections && (
              <details
                open={forceOpen ?? false}
                className="group rounded-2xl border border-[#e2d9c9] bg-white shadow-[0_8px_30px_rgba(39,32,20,0.04)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
                  <div className="flex items-center gap-2">
                    <Chevron />
                    <h2 className="font-serif text-xl">Details &amp; guidance</h2>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#176b65]">
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </span>
                </summary>
                <div className="space-y-5 border-t border-[#eee7db] p-5">
                  {module.sections.map((section) => (
                    <div key={section.heading}>
                      <h3 className="font-semibold text-[#211d18]">{section.heading}</h3>
                      {section.body && <p className="mt-1 text-sm leading-7 text-[#62594e]">{section.body}</p>}
                      {section.bullets && (
                        <ul className="mt-1 space-y-2 text-sm leading-6 text-[#62594e]">
                          {section.bullets.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="text-[#c9a75f]">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Panel title="Why it works">
            <ul className="space-y-3 text-sm leading-6 text-[#62594e]">
              {module.whyItWorks.map((item) => <li key={item}>✓ {item}</li>)}
            </ul>
          </Panel>
          <Panel title="Compliance reminders">
            <ul className="space-y-3 text-sm leading-6 text-[#7c5320]">
              {module.compliance.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </Panel>
          <Panel title="Related modules">
            <div className="space-y-2">
              {module.related.map((slug) => {
                const related = getTrainingModule(slug);
                return related ? (
                  <Link
                    key={slug}
                    href={`/agent/training/${slug}`}
                    className="block rounded-lg border border-[#e2d9c9] p-3 text-sm font-semibold hover:border-[#c9a75f]"
                  >
                    {related.title} →
                  </Link>
                ) : null;
              })}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/agent/training" className="rounded-xl bg-[#176b65] px-5 py-3 text-sm font-semibold text-white">Back to Training Library</Link>
        <Link href="/agent/leads" className="rounded-xl border border-[#e2d9c9] bg-white px-5 py-3 text-sm font-semibold">Go to My Leads</Link>
      </div>
    </PortalShell>
  );
}
