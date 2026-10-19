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
 * Three rungs, filled to the current level. The engine moves one step at a time
 * (spec §7), so a ladder reads more truthfully than a label — you can see where
 * you are and which way you just moved.
 */
function DifficultyLadder({
  level,
  direction,
}: {
  level: Difficulty;
  direction: "up" | "down" | null;
}) {
  const index = LEVELS.indexOf(level);
  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`Difficulty: ${level}`}>
        {LEVELS.map((rung, i) => (
          <span
            key={rung}
            className={`h-1.5 w-5 rounded-full transition-colors duration-500 ${
              i <= index ? "bg-source" : "bg-rule"
            }`}
          />
        ))}
      </div>
      <div className="rail-label mt-2">{level}</div>
      {direction && (
        <div className="rail-label mt-1 text-source">
          {direction === "up" ? "harder" : "easier"}
        </div>
      )}
    </div>
  );
}

/**
 * The answering phase only: pick an option and the next question follows, with
 * no reveal in between. Marking and explanations wait for the results screen,
 * so the quiz stays a test and keeps its momentum.
 */
export function QuizRunner({
  attemptId,
  firstQuestion,
  total,
  answeredSoFar,
  startingDifficulty,
}: {
  attemptId: string;
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
      setError(err instanceof Error ? `${err.message}. Pick again to retry.` : "That answer didn't save");
    }
  }

  if (finishing) {
    return (
      <p aria-live="polite" className="text-muted">
        That&rsquo;s all {total}. Marking your answers…
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-[6rem_1fr]">
      {/* Margin rail: how hard, how far. */}
      <aside className="sm:sticky sm:top-8 sm:self-start">
        <DifficultyLadder level={difficulty} direction={direction} />
        <div className="rail-label mt-5">
          {Math.min(answered + 1, total)} / {total}
        </div>
      </aside>

      {/* Keyed on the question so each one enters fresh rather than mutating
          in place, which is what made the swap feel like lag. */}
      <div key={question._id} className="animate-[fade-in_180ms_ease-out]">
        <h1 className="text-xl leading-snug">{question.stem}</h1>

        <ul className="mt-6 space-y-2" aria-busy={selected !== null}>
          {question.options.map((option, i) => {
            const isPicked = selected === i;
            const tone =
              selected === null
                ? "border-rule hover:border-ink hover:bg-raised"
                : isPicked
                  ? "border-ink bg-ink text-paper"
                  : "border-rule opacity-40";

            return (
              <li key={i}>
                <button
                  onClick={() => submit(i)}
                  disabled={selected !== null}
                  className={`w-full cursor-pointer rounded-md border px-4 py-3 text-left transition-colors duration-150 ${tone} disabled:cursor-default`}
                >
                  <span className={`rail-label mr-3 ${isPicked ? "text-paper/70" : ""}`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {option}
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="mt-4 text-sm text-wrong">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
