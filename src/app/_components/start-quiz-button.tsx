"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Starts a fresh attempt and opens it. Every Start or Retake creates a new
 * attempt — nothing is overwritten — so the quiz list and History share this.
 */
export function StartQuizButton({
  quizId,
  label,
  className,
}: {
  quizId: string;
  label: string;
  className: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempt`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the quiz");
      router.push(`/attempts/${data.attemptId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the quiz");
      setStarting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={start} disabled={starting} className={className}>
        {starting ? "Starting…" : label}
      </button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-bad">
          {error}
        </span>
      )}
    </>
  );
}
