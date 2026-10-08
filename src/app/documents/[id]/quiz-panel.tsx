"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface QuizRow {
  _id: string;
  questionCount: number;
  createdAt: string;
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
              className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-5 border-b border-rule py-4 sm:grid-cols-[6rem_1fr_auto]"
            >
              <span className="rail-label">{quiz.questionCount} Qs</span>
              <span className="text-muted">
                {new Date(quiz.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <button
                onClick={() => start(quiz._id)}
                disabled={starting !== null}
                className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-sm text-paper disabled:opacity-50"
              >
                {starting === quiz._id ? "Starting…" : "Start"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
