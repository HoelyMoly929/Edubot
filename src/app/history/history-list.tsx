"use client";

import Link from "next/link";
import { useState } from "react";
import { TIERS, tierFor, type Tier } from "@/lib/score-tier";
import { StartQuizButton } from "@/app/_components/start-quiz-button";

export interface HistoryRow {
  attemptId: string;
  quizId: string;
  quizName: string;
  quizExists: boolean;
  documentName: string;
  documentId: string | null;
  finished: boolean;
  score: number;
  answered: number;
  total: number;
  wrong: number;
  finalDifficulty: string;
  startedAt: string;
}

const FILTERS: { key: "all" | Tier; label: string }[] = [
  { key: "all", label: "All" },
  { key: "strong", label: TIERS.strong.label },
  { key: "mid", label: TIERS.mid.label },
  { key: "low", label: TIERS.low.label },
];

function FileIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/**
 * History cards with tier filters. Filtering is client-side over rows the
 * server already loaded; unfinished attempts have no tier, so they show only
 * under "All".
 */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const [filter, setFilter] = useState<"all" | Tier>("all");
  const shown =
    filter === "all" ? rows : rows.filter((r) => r.finished && tierFor(r.score) === filter);

  return (
    <>
      <div role="group" aria-label="Filter quizzes" className="flex flex-wrap gap-2.5">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const tone = key === "all" ? null : TIERS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={active}
              className={`min-h-11 cursor-pointer rounded-full border-2 px-5 font-bold transition-colors ${
                active
                  ? "border-brand bg-brand-soft text-brand-ink"
                  : `bg-card hover:bg-brand-softer ${tone ? `${tone.chipBorder} ${tone.ink}` : "border-line-strong text-brand-ink"}`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[24px] border border-line bg-card p-6 text-muted">
          No attempts in this group yet.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-5">
          {shown.map((row) => {
            const tier = row.finished ? TIERS[tierFor(row.score)] : null;
            const percent = Math.round(row.score * 100);
            return (
              <li
                key={row.attemptId}
                className={`flex flex-col gap-4.5 rounded-[24px] p-6 ${tier ? tier.card : "border-2 border-dashed border-brand-dash bg-card"}`}
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-white/75">
                    <FileIcon className={tier ? tier.ink : "text-brand-ink"} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{row.quizName}</h2>
                    <div className="truncate text-[15px] text-[#3F456B]">
                      {row.documentName} ·{" "}
                      {new Date(row.startedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>

                {tier ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`display text-[32px] font-medium ${tier.ink}`}>
                        {percent}%
                        <span className="text-lg capitalize"> · {row.finalDifficulty}</span>
                      </span>
                      <span className={`rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-bold ${tier.ink}`}>
                        {tier.label}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/80">
                      <div className={`h-full rounded-full ${tier.fill}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="display text-[24px] font-medium text-brand-ink">
                        {row.answered} of {row.total} answered
                      </span>
                      <span className="rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-bold text-brand-ink">
                        In progress
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-track">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.round((row.answered / Math.max(row.total, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/attempts/${row.attemptId}`}
                    className={`flex min-h-11 items-center rounded-full bg-card px-5 font-bold hover:bg-white/70 ${tier ? tier.ink : "text-brand-ink"}`}
                  >
                    {!row.finished ? "Finish it" : row.wrong > 0 ? `Review ${row.wrong} missed` : "View results"}
                  </Link>
                  {row.finished && row.quizExists && (
                    <StartQuizButton
                      quizId={row.quizId}
                      label="Retake"
                      className={`min-h-11 cursor-pointer rounded-full px-4 font-bold underline hover:bg-white/70 disabled:opacity-60 ${tier ? tier.ink : "text-brand-ink"}`}
                    />
                  )}
                  {row.documentId && (
                    <Link
                      href={`/documents/${row.documentId}`}
                      className={`flex min-h-11 items-center rounded-full px-4 font-bold underline hover:bg-white/70 ${tier ? tier.ink : "text-brand-ink"}`}
                    >
                      View notes
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
