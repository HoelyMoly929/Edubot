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
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
          {initialQuizzes.map((quiz) => {
            const tier = quiz.bestScore === null ? null : TIERS[tierFor(quiz.bestScore)];
            return (
              <li
                key={quiz._id}
                className={`flex flex-col gap-4 rounded-[24px] p-5 ${tier ? tier.card : "border-2 border-line-strong bg-card"}`}
              >
                <div className="min-w-0">
                  <QuizName quizId={quiz._id} initial={quiz.name ?? UNNAMED_QUIZ} />
                  <div className="text-[15px] text-ink-soft">
                    {quiz.questionCount} questions
                    {quiz.attempts > 0 &&
                      ` · taken ${quiz.attempts} ${quiz.attempts === 1 ? "time" : "times"}`}
                  </div>
                </div>

                {tier && quiz.bestScore !== null ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`display text-[32px] font-medium leading-none ${tier.ink}`}>
                        {Math.round(quiz.bestScore * 100)}%
                        <span className="text-lg"> best</span>
                      </span>
                      <span className={`rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-bold ${tier.ink}`}>
                        {tier.label}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/80">
                      <div
                        className={`h-full rounded-full ${tier.fill}`}
                        style={{ width: `${Math.round(quiz.bestScore * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-muted">Not taken yet</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <StartQuizButton
                    quizId={quiz._id}
                    label={quiz.attempts > 0 ? "Retake quiz" : "Start quiz"}
                    className="min-h-11 cursor-pointer rounded-full bg-brand px-6 font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
