"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_QUIZ_NAME, UNNAMED_QUIZ, cleanQuizName } from "@/lib/quiz-name";

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
        className="w-full rounded border border-ink bg-raised px-2 py-0.5 text-base text-ink"
      />
    );
  }

  return (
    <>
      <button
        onClick={() => setDraft(name)}
        title="Rename"
        className="group flex max-w-full cursor-text items-baseline gap-2 text-left text-base text-ink"
      >
        <span className="truncate">{name}</span>
        <span aria-hidden className="rail-label opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          rename
        </span>
      </button>
      {error && <p className="text-xs text-wrong">{error}</p>}
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
  const [starting, setStarting] = useState<string | null>(null);
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

  async function start(quizId: string) {
    setStarting(quizId);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempt`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the quiz");
      router.push(`/attempts/${data.attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the quiz");
      setStarting(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-3">
        <h2 className="display text-2xl font-semibold">Quizzes</h2>
        <button
          onClick={generate}
          disabled={busy}
          className="cursor-pointer rounded-full border border-ink px-4 py-1.5 text-sm hover:bg-ink hover:text-paper disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-ink"
        >
          {busy ? "Building…" : "Build a quiz"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-wrong">{error}</p>}

      {busy && (
        <p aria-live="polite" className="mt-6 text-muted">
          Writing questions at three difficulty levels…
        </p>
      )}

      {initialQuizzes.length === 0 && !busy ? (
        <p className="mt-6 max-w-prose text-muted">
          No quizzes yet. Questions get harder or easier as you answer, so the set
          covers a range of difficulty from the start.
        </p>
      ) : (
        <ul className="mt-6">
          {initialQuizzes.map((quiz) => (
            <li
              key={quiz._id}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-4 border-b border-rule py-4 sm:grid-cols-[6rem_1fr_auto] sm:gap-x-5"
            >
              {/* Rail leads with the result once there is one. */}
              <div>
                {quiz.bestScore === null ? (
                  <span className="rail-label">Not taken</span>
                ) : (
                  <>
                    <div className="font-mono text-xl leading-none">
                      {Math.round(quiz.bestScore * 100)}%
                    </div>
                    <div className="rail-label mt-1">best</div>
                  </>
                )}
              </div>
              <div className="min-w-0 text-sm text-muted">
                <QuizName quizId={quiz._id} initial={quiz.name ?? UNNAMED_QUIZ} />
                <div className="mt-0.5">
                  {quiz.questionCount} questions
                  {quiz.attempts > 0 &&
                    ` · taken ${quiz.attempts} ${quiz.attempts === 1 ? "time" : "times"}`}
                </div>
              </div>
              <button
                onClick={() => start(quiz._id)}
                disabled={starting !== null}
                className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-sm text-paper disabled:opacity-50"
              >
                {starting === quiz._id ? "Starting…" : quiz.attempts > 0 ? "Retake" : "Start"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
