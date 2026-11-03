"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_QUIZ_NAME, UNNAMED_QUIZ, cleanQuizName } from "@/lib/quiz-name";
import { TIERS, tierFor } from "@/lib/score-tier";
import { StartQuizButton } from "@/app/_components/start-quiz-button";

interface QuizRow {
  _id: string;
  name?: string;
  questionCount: number;
  createdAt: string;
  /** Best finished score, 0–1, or null if never finished. */
  bestScore: number | null;
  attempts: number;
}

/**
 * The quiz's name, editable in place. Click to edit; Enter or leaving the field
 * saves, Escape cancels. Kept local until saved so a failed rename can't leave
 * the list showing a name the server never accepted.
 */
function QuizName({ quizId, initial }: { quizId: string; initial: string }) {
  const [name, setName] = useState(initial);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (draft === null) return;
    const cleaned = cleanQuizName(draft);
    if (!cleaned || cleaned === name) {
      setDraft(null);
      setError(cleaned ? null : `Names need 1–${MAX_QUIZ_NAME} characters.`);
      return;
    }
    setDraft(null);
    const previous = name;
    setName(cleaned); // show it straight away; roll back if the server refuses
    const res = await fetch(`/api/quizzes/${quizId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleaned }),
    }).catch(() => null);
    if (!res?.ok) {
      setName(previous);
      setError("Couldn't rename it. Try again.");
    } else {
      setError(null);
    }
  }

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={MAX_QUIZ_NAME}
        aria-label="Quiz name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-full rounded-[12px] border-2 border-brand bg-card px-3 py-1 text-lg font-bold text-ink"
      />
    );
  }

  return (
    <>
      <button
        onClick={() => setDraft(name)}
        title="Rename"
        className="group flex min-h-9 max-w-full cursor-text items-center gap-2 text-left text-lg font-bold text-ink"
      >
        <span className="truncate">{name}</span>
        <span aria-hidden className="flex-none rounded-full bg-brand-softer px-2 py-0.5 text-xs font-bold text-brand-ink opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          Rename
        </span>
      </button>
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
    </>
  );
}

export function QuizPanel({
  documentId,
  initialQuizzes,
}: {
  documentId: string;
  initialQuizzes: QuizRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/quiz`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't build a quiz");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build a quiz");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-[26px] font-medium">Quizzes</h2>
          <p className="text-[15px] text-muted">
            Questions come from this document and get harder or easier as you answer.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="min-h-[52px] cursor-pointer rounded-full bg-brand px-8 text-[17px] font-bold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:bg-track disabled:text-[#3A4068]"
        >
          {busy ? "Building…" : "Build a quiz"}
        </button>
      </div>

      {error && (
        <p role="alert" className="font-semibold text-bad">
          {error}
        </p>
      )}

      {busy && (
        <p aria-live="polite" className="rounded-[20px] bg-brand-softer p-5 font-semibold text-brand-ink">
          Writing questions at three difficulty levels…
        </p>
      )}

      {initialQuizzes.length === 0 && !busy ? (
        <p className="text-[17px] leading-relaxed text-ink-soft">
          No quizzes yet. Build one to test yourself on this document.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {initialQuizzes.map((quiz) => {
            const tier = quiz.bestScore === null ? null : TIERS[tierFor(quiz.bestScore)];
            const pct = quiz.bestScore === null ? 0 : Math.round(quiz.bestScore * 100);
            const chip = "rounded-full bg-white/80 px-3 py-1 text-sm font-bold";
            return (
              <li
                key={quiz._id}
                className={`flex flex-col gap-5 rounded-[24px] p-5 sm:flex-row sm:items-center sm:gap-6 ${
                  tier ? tier.card : "border-2 border-line-strong bg-card shadow-[var(--shadow-card)]"
                }`}
              >
                {/* Who: icon, editable name, size and attempt count. */}
                <div className="flex min-w-0 items-center gap-4 sm:flex-1">
                  <span
                    aria-hidden
                    className={`flex size-14 flex-none items-center justify-center rounded-[18px] ${
                      tier ? `bg-white/80 ${tier.ink}` : "bg-brand-softer text-brand-ink"
                    }`}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="4" width="14" height="17" rx="3" />
                      <path d="M9 4.5h6M9 11l2 2 4-4M9 17h6" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <QuizName quizId={quiz._id} initial={quiz.name ?? UNNAMED_QUIZ} />
                    <div className={`mt-1 flex flex-wrap gap-2 ${tier ? tier.ink : "text-ink-soft"}`}>
                      <span className={tier ? chip : "rounded-full bg-brand-softer px-3 py-1 text-sm font-bold"}>
                        {quiz.questionCount} questions
                      </span>
                      {quiz.attempts > 0 && (
                        <span className={chip}>
                          Taken {quiz.attempts} {quiz.attempts === 1 ? "time" : "times"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* How you did: best score and tier, or an empty track. */}
                <div className="flex flex-col gap-2 sm:w-64">
                  {tier ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className={`display text-[34px] font-medium leading-none ${tier.ink}`}>
                        {pct}%<span className="text-base"> best</span>
                      </span>
                      <span className={`${chip} ${tier.ink}`}>{tier.label}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-muted">Not taken yet</span>
                  )}
                  <div className={`h-3 overflow-hidden rounded-full ${tier ? "bg-white/80" : "bg-track/60"}`}>
                    {tier && <div className={`h-full rounded-full ${tier.fill}`} style={{ width: `${pct}%` }} />}
                  </div>
                </div>

                <StartQuizButton
                  quizId={quiz._id}
                  label={quiz.attempts > 0 ? "Retake quiz" : "Start quiz"}
                  className="min-h-12 flex-none cursor-pointer self-start rounded-full bg-brand px-7 font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 sm:self-center"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
