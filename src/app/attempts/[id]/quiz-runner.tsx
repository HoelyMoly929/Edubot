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

interface Pending {
  question: Question | null;
  difficulty: Difficulty;
  completed: boolean;
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
 * The answering phase only. Explanations and sources are deliberately held back
 * until the results screen, so the quiz stays a test rather than an open book.
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
  const [marked, setMarked] = useState<{ correct: boolean; correctOption: number } | null>(
    null,
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [answered, setAnswered] = useState(answeredSoFar);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(option: number) {
    if (marked || busy) return;
    setSelected(option);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question._id, selectedOption: option }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That answer didn't save");

      setMarked({ correct: data.correct, correctOption: data.correctOption });
      setAnswered(data.answered);
      // Held until "Next": the student sees the mark before anything moves.
      setPending({
        question: data.question,
        difficulty: data.difficulty,
        completed: data.completed,
      });
    } catch (err) {
      setSelected(null);
      setError(err instanceof Error ? err.message : "That answer didn't save");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!pending) return;

    if (pending.completed || !pending.question) {
      // The attempt is marked complete server-side; re-render the page, which
      // now shows the results and review.
      setFinishing(true);
      router.refresh();
      return;
    }

    // Direction comes from comparing levels, not from where we landed:
    // "medium" can be a step up or a step down.
    const from = LEVELS.indexOf(difficulty);
    const to = LEVELS.indexOf(pending.difficulty);
    setDirection(to > from ? "up" : to < from ? "down" : null);
    setDifficulty(pending.difficulty);

    setQuestion(pending.question);
    setMarked(null);
    setSelected(null);
    setPending(null);
  }

  const last = pending?.completed || (pending && !pending.question);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-[6rem_1fr]">
      {/* Margin rail: how hard, how far. */}
      <aside className="sm:sticky sm:top-8 sm:self-start">
        <DifficultyLadder level={difficulty} direction={direction} />
        <div className="rail-label mt-5">
          {answered} / {total}
        </div>
      </aside>

      <div>
        <h1 className="text-xl leading-snug">{question.stem}</h1>

        <ul className="mt-6 space-y-2">
          {question.options.map((option, i) => {
            const isAnswer = marked?.correctOption === i;
            const isPicked = selected === i;

            let tone = "border-rule hover:border-ink";
            if (marked) {
              if (isAnswer) tone = "border-source bg-source/10";
              else if (isPicked) tone = "border-wrong bg-wrong/10";
              else tone = "border-rule opacity-60";
            } else if (isPicked) {
              tone = "border-ink";
            }

            return (
              <li key={i}>
                <button
                  onClick={() => submit(i)}
                  disabled={marked !== null || busy}
                  className={`w-full cursor-pointer rounded-md border px-4 py-3 text-left transition-colors ${tone} disabled:cursor-default`}
                >
                  <span className="rail-label mr-3">{String.fromCharCode(65 + i)}</span>
                  {option}
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="mt-4 text-sm text-wrong">{error}</p>}

        {marked && (
          <div aria-live="polite" className="mt-6 flex flex-wrap items-center gap-4">
            <p className={marked.correct ? "text-source" : "text-wrong"}>
              {marked.correct ? "Correct." : "Not quite."}
            </p>
            <button
              onClick={next}
              disabled={finishing}
              autoFocus
              className="cursor-pointer rounded-full bg-ink px-5 py-2 text-sm text-paper disabled:opacity-50"
            >
              {finishing ? "Loading results…" : last ? "See your results" : "Next question"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
