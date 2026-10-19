"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { CitedPoint } from "@/lib/queries";
import { formatPages, formatPagesLong } from "@/lib/pages";

interface Props {
  documentId: string;
  initialSummary: { points: CitedPoint[]; createdAt: string } | null;
}

/**
 * Renders `**term**` as bold. Text stays as React text nodes, so nothing the
 * model writes can turn into markup.
 */
function withKeyTerms(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Consecutive bullets sharing a heading become one section. */
function groupByHeading(points: CitedPoint[]) {
  const sections: { heading?: string; items: { point: CitedPoint; index: number }[] }[] = [];
  points.forEach((point, index) => {
    const last = sections.at(-1);
    if (last && last.heading === point.heading) last.items.push({ point, index });
    else sections.push({ heading: point.heading, items: [{ point, index }] });
  });
  return sections;
}

export function SummaryPanel({ documentId, initialSummary }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<number | null>(null);
  const summary = initialSummary;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/summary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't write the notes");
      setOpenSource(null);
      router.refresh(); // reload with source excerpts joined server-side
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't write the notes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-3">
        <h2 className="display text-2xl font-semibold">Study notes</h2>
        <button
          onClick={generate}
          disabled={busy}
          className="cursor-pointer rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          {busy ? "Writing…" : summary ? "Write again" : "Write notes"}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {busy ? "Writing study notes" : ""}
      </p>

      {error && <p className="mt-4 text-sm text-wrong">{error}</p>}

      {!summary && !busy && !error && (
        <p className="mt-6 max-w-prose text-muted">
          No notes yet. EduBot will turn this document into revision notes, grouped
          by topic, with the pages each point came from.
        </p>
      )}

      {busy && <p className="mt-6 text-muted">Reading the document and writing notes…</p>}

      {summary &&
        !busy &&
        groupByHeading(summary.points).map((section, s) => (
          <div key={s} className="mt-8">
            {section.heading && (
              <h3 className="display text-lg font-semibold sm:ml-[7.25rem]">
                {section.heading}
              </h3>
            )}

            <ul className="mt-2">
              {section.items.map(({ point, index }) => {
                const open = openSource === index;
                return (
                  <li
                    key={`${point.chunkId}-${index}`}
                    className="grid grid-cols-[4.5rem_1fr] gap-x-4 py-1.5 sm:grid-cols-[6rem_1fr] sm:gap-x-5"
                  >
                    {/* Margin rail: every bullet keeps its provenance beside it. */}
                    <div className="pt-1">
                      <button
                        onClick={() => setOpenSource(open ? null : index)}
                        aria-expanded={open}
                        className="rail-label cursor-pointer hover:text-source"
                        title="Show the text this came from"
                      >
                        {formatPages(point.sourcePage, point.endPage)}
                        <span aria-hidden className="ml-1">
                          {open ? "−" : "+"}
                        </span>
                      </button>
                    </div>

                    <div className="min-w-0">
                      <p className="relative pl-4 leading-relaxed text-ink/90 before:absolute before:left-0 before:text-muted before:content-['•']">
                        {withKeyTerms(point.text)}
                      </p>

                      {open && (
                        <blockquote className="mt-2 mb-2 ml-4 border-l-2 border-source pl-4 text-sm leading-relaxed text-muted">
                          <span className="rail-label block text-source">
                            From your document,{" "}
                            {formatPagesLong(point.sourcePage, point.endPage)}
                          </span>
                          <span className="mt-2 block whitespace-pre-wrap">
                            {point.sourceText || "This excerpt is no longer available."}
                          </span>
                        </blockquote>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </section>
  );
}
