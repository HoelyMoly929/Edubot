"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CitedPoint } from "@/lib/queries";

interface Props {
  documentId: string;
  initialSummary: { points: CitedPoint[]; createdAt: string } | null;
}

export function SummaryPanel({ documentId, initialSummary }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<number | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/summary`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't write the notes");
      router.refresh(); // reload with source excerpts joined server-side
      setSummary(null);
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
          No notes yet. EduBot will pull the key ideas out of this document and
          show you which page each one came from.
        </p>
      )}

      {busy && !summary && (
        <p className="mt-6 text-muted">Reading the document and writing notes…</p>
      )}

      {summary && (
        <ol className="mt-6">
          {summary.points.map((point, index) => {
            const open = openSource === index;
            return (
              <li
                key={`${point.chunkId}-${index}`}
                className="grid grid-cols-[3.5rem_1fr] gap-x-5 border-b border-rule py-5 sm:grid-cols-[6rem_1fr]"
              >
                {/* The margin rail: provenance sits beside every claim, not
                    hidden behind a footnote marker. */}
                <div>
                  <button
                    onClick={() => setOpenSource(open ? null : index)}
                    aria-expanded={open}
                    className="rail-label cursor-pointer hover:text-source"
                    title="Show the text this came from"
                  >
                    p. {point.sourcePage}
                    <span aria-hidden className="ml-1 inline-block">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                </div>

                <div className="min-w-0">
                  <p className="text-[1.0625rem] leading-relaxed">{point.text}</p>

                  {open && (
                    <blockquote className="mt-3 border-l-2 border-source pl-4 text-sm leading-relaxed text-muted">
                      <span className="rail-label block text-source">
                        From your document, page {point.sourcePage}
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
        </ol>
      )}
    </section>
  );
}
