"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { CitedPoint } from "@/lib/queries";
import { formatPages, formatPagesLong } from "@/lib/pages";

interface Props {
  documentId: string;
  initialSummary: { points: CitedPoint[]; createdAt: string } | null;
}

/** The design's key-point palette, cycled across topic cards. */
const TONES = [
  { card: "bg-warn-soft", number: "text-warn", text: "text-[#3B2D00]", chip: "text-warn" },
  { card: "bg-info-soft", number: "text-info", text: "text-[#0B2F52]", chip: "text-info" },
  { card: "bg-good-soft", number: "text-good", text: "text-[#08362A]", chip: "text-good" },
  { card: "bg-bad-soft", number: "text-bad", text: "text-[#4A1A0E]", chip: "text-bad" },
];

/**
 * Renders `**term**` as bold. Text stays as React text nodes, so nothing the
 * model writes can turn into markup.
 */
function withKeyTerms(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-bold">
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-[26px] font-medium">Study notes</h2>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-full border-2 border-brand bg-card px-6 font-bold text-brand-ink transition-colors hover:bg-brand-softer disabled:cursor-default disabled:opacity-50"
        >
          {busy ? "Writing…" : summary ? "Write again" : "Write notes"}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {busy ? "Writing study notes" : ""}
      </p>

      {error && (
        <p role="alert" className="font-semibold text-bad">
          {error}
        </p>
      )}

      {!summary && !busy && !error && (
        <p className="max-w-[640px] text-[17px] leading-relaxed text-ink-soft">
          No notes yet. EduBot will turn this document into revision notes, grouped
          by topic, with the pages each point came from.
        </p>
      )}

      {busy && (
        <p className="rounded-[20px] bg-brand-softer p-5 font-semibold text-brand-ink">
          Reading the document and writing notes…
        </p>
      )}

      {summary && !busy && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
          {groupByHeading(summary.points).map((section, s) => {
            const tone = TONES[s % TONES.length];
            return (
              <article
                key={s}
                className={`flex flex-col gap-3 rounded-[20px] p-5 ${tone.card}`}
              >
                <div className="flex items-baseline gap-3">
                  <span className={`display text-[22px] ${tone.number}`}>{s + 1}</span>
                  {section.heading && (
                    <h3 className={`display text-xl font-medium ${tone.text}`}>
                      {section.heading}
                    </h3>
                  )}
                </div>

                <ul className="flex flex-col gap-2.5">
                  {section.items.map(({ point, index }) => {
                    const open = openSource === index;
                    return (
                      <li key={`${point.chunkId}-${index}`} className={tone.text}>
                        <p className="leading-normal">
                          {withKeyTerms(point.text)}{" "}
                          <button
                            type="button"
                            onClick={() => setOpenSource(open ? null : index)}
                            aria-expanded={open}
                            title="Show the text this came from"
                            className={`ml-0.5 inline-flex cursor-pointer items-center rounded-full bg-white/80 px-2 py-0.5 align-[1px] text-xs font-bold hover:bg-white ${tone.chip}`}
                          >
                            {formatPages(point.sourcePage, point.endPage)}
                            <span aria-hidden className="ml-1">
                              {open ? "−" : "+"}
                            </span>
                          </button>
                        </p>

                        {open && (
                          <blockquote className="mt-2 rounded-[14px] bg-white/85 p-3.5 text-sm leading-relaxed text-ink-soft">
                            <span className={`mb-1.5 block text-xs font-bold ${tone.chip}`}>
                              From your document, {formatPagesLong(point.sourcePage, point.endPage)}
                            </span>
                            <span className="block whitespace-pre-wrap">
                              {point.sourceText || "This excerpt is no longer available."}
                            </span>
                          </blockquote>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
