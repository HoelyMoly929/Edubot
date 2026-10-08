"use client";

import Link from "next/link";
import { useState } from "react";

type Difficulty = "easy" | "medium" | "hard";

interface Question {
  _id: string;
  stem: string;
  options: string[];
  difficulty: Difficulty;
}

interface Marked {
  correct: boolean;
  correctOption: number;
  citation: { sourcePage: number; text: string } | null;
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

export function QuizRunner({
  attemptId,
  firstQuestion,
  total,
  startingDifficulty,
  documentName,
}: {
  attemptId: string;
  firstQuestion: Question | null;
  total: number;
  startingDifficulty: Difficulty;
  documentName: string;
}) {
  const [question, setQuestion] = useState(firstQuestion);
  const [difficulty, setDifficulty] = useState<Difficulty>(startingDifficulty);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [marked, setMarked] = useState<Marked | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [answered, setAnswered] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(firstQuestion === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(option: number) {
    if (!question || marked || busy) return;
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

      setMarked({
        correct: data.correct,
        correctOption: data.correctOption,
        citation: data.citation,
      });
      setAnswered(data.answered);
      setScore(data.score);
      // Held until "Next": the student reads the result before anything moves.
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

    // Direction comes from comparing levels, not from which level we landed on:
    // "medium" can be a step up or a step down.
    const from = LEVELS.indexOf(difficulty);
    const to = LEVELS.indexOf(pending.difficulty);
    setDirection(to > from ? "up" : to < from ? "down" : null);
    setDifficulty(pending.difficulty);

    setMarked(null);
    setSelected(null);
    if (pending.completed || !pending.question) setDone(true);
    else setQuestion(pending.question);
    setPending(null);
  }

  if (done) {
    const percent = Math.round(score * 100);
    return (
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-[6rem_1fr]">
        <div className="rail-label">Finished</div>
        <div>
          <h1 className="display text-3xl font-semibold">
            {percent}% <span className="text-muted">·</span> {answered}{" "}
            {answered === 1 ? "question" : "questions"}
          </h1>
          <p className="mt-3 max-w-prose text-muted">
            You finished at <strong className="text-ink">{difficulty}</strong> difficulty
            on {documentName}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/history" className="rounded-full bg-ink px-5 py-2 text-sm text-paper">
              See your history
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-ink px-5 py-2 text-sm hover:bg-ink hover:text-paper"
            >
              Back to documents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!question) return <p className="text-muted">This quiz has no questions.</p>;

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
                  {marked && isAnswer && (
                    <span className="rail-label ml-2 text-source">correct</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {error && <p className="mt-4 text-sm text-wrong">{error}</p>}

        {marked && (
          <div aria-live="polite" className="mt-6">
            <p className={marked.correct ? "text-source" : "text-wrong"}>
              {marked.correct ? "Correct." : "Not quite."}
            </p>

            {marked.citation && (
              <blockquote className="mt-3 border-l-2 border-source pl-4 text-sm leading-relaxed text-muted">
                <span className="rail-label block text-source">
                  Why — from your document, page {marked.citation.sourcePage}
                </span>
                <span className="mt-2 block whitespace-pre-wrap">{marked.citation.text}</span>
              </blockquote>
            )}

            <button
              onClick={next}
              autoFocus
              className="mt-6 cursor-pointer rounded-full bg-ink px-5 py-2 text-sm text-paper"
            >
              {pending?.completed || !pending?.question ? "See your score" : "Next question"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
