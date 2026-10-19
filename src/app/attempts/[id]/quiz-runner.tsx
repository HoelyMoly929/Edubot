"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Difficulty = "easy" | "medium" | "hard";

interface Question {
  _id: string;
  stem: string;
  options: string[];
  difficulty: Difficulty;
}

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Three dots, filled to the current level. The engine moves one step at a time
 * (spec §7), so this reads more truthfully than a label alone — you can see
 * where you are and which way you just moved.
 */
function DifficultyPill({
  level,
  direction,
}: {
  level: Difficulty;
  direction: "up" | "down" | null;
}) {
  const index = LEVELS.indexOf(level);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-bold text-brand-ink"
      aria-label={`Difficulty: ${level}${direction ? `, just got ${direction === "up" ? "harder" : "easier"}` : ""}`}
    >
      <span aria-hidden className="flex gap-1">
        {LEVELS.map((rung, i) => (
          <span
            key={rung}
            className={`size-2 rounded-full transition-colors duration-500 ${i <= index ? "bg-brand" : "bg-white"}`}
          />
        ))}
      </span>
      <span aria-hidden className="capitalize">
        {level}
        {direction === "up" && " ↑"}
        {direction === "down" && " ↓"}
      </span>
    </span>
  );
}

/**
 * The answering phase only: pick an option and the next question follows, with
 * no reveal in between. Marking and explanations wait for the results screen,
 * so the quiz stays a test and keeps its momentum.
 */
export function QuizRunner({
  attemptId,
  title,
  firstQuestion,
  total,
  answeredSoFar,
  startingDifficulty,
}: {
  attemptId: string;
  title: string;
  firstQuestion: Question;
  total: number;
  answeredSoFar: number;
  startingDifficulty: Difficulty;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(firstQuestion);
  const [difficulty, setDifficulty] = useState<Difficulty>(startingDifficulty);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(answeredSoFar);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(option: number) {
    if (selected !== null || finishing) return;
    // Acknowledge the click straight away, so the round trip that follows reads
    // as "saving" rather than as an unresponsive page.
    setSelected(option);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question._id, selectedOption: option }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That answer didn't save");

      setAnswered(data.answered);

      if (data.completed || !data.question) {
        // Marked complete server-side; the page now renders the results.
        setFinishing(true);
        router.refresh();
        return;
      }

      // Direction comes from comparing levels, not from where we landed:
      // "medium" can be a step up or a step down.
      const from = LEVELS.indexOf(difficulty);
      const to = LEVELS.indexOf(data.difficulty as Difficulty);
      setDirection(to > from ? "up" : to < from ? "down" : null);
      setDifficulty(data.difficulty);
      setQuestion(data.question);
      setSelected(null);
    } catch (err) {
      setSelected(null);
      setError(
        err instanceof Error ? `${err.message}. Pick again to retry.` : "That answer didn't save",
      );
    }
  }

  const current = Math.min(answered + 1, total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[15px] font-bold">
          <span className="truncate text-brand-ink">{title}</span>
          <span className="flex items-center gap-3">
            <DifficultyPill level={difficulty} direction={direction} />
            <span className="text-muted">
              {finishing ? `All ${total} answered` : `Question ${current} of ${total}`}
            </span>
          </span>
        </div>
        {/* One segment per question, filled as they're answered. */}
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          aria-label="Questions answered"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 rounded-full transition-colors duration-300 ${i < answered ? "bg-brand" : "bg-track"}`}
            />
          ))}
        </div>
      </div>

      <section className="rounded-[28px] border border-line bg-card p-[clamp(20px,4vw,40px)] shadow-[var(--shadow-card)]">
        {finishing ? (
          <p aria-live="polite" className="display text-[clamp(22px,3vw,28px)] font-medium">
            That&rsquo;s all {total}. Marking your answers…
          </p>
        ) : (
          /* Keyed on the question so each one enters fresh rather than mutating
             in place, which is what made the swap feel like lag. */
          <div key={question._id} className="flex animate-[fade-in_180ms_ease-out] flex-col gap-6">
            <h1 className="display text-[clamp(24px,4vw,32px)] leading-tight font-medium text-balance">
              {question.stem}
            </h1>

            <ul className="flex flex-col gap-3" aria-busy={selected !== null}>
              {question.options.map((option, i) => {
                const isPicked = selected === i;
                const waiting = selected !== null;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => submit(i)}
                      disabled={waiting}
                      className={`flex min-h-16 w-full items-center gap-3.5 rounded-[18px] border-2 px-4.5 py-3 text-left text-lg font-semibold transition-colors disabled:cursor-default ${
                        isPicked
                          ? "border-brand bg-brand-softer"
                          : waiting
                            ? "border-line-strong bg-card opacity-50"
                            : "cursor-pointer border-line-strong bg-card hover:border-[#8F89F0]"
                      }`}
                    >
                      <span
                        className={`flex size-9 flex-none items-center justify-center rounded-full font-bold ${
                          isPicked ? "bg-brand text-white" : "bg-brand-softer text-brand-ink"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {error && (
              <p role="alert" className="font-semibold text-bad">
                {error}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
