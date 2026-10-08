import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getAttempt, getAttemptQuestions } from "@/lib/queries";
import { selectNextQuestion } from "@/lib/adaptive";
import { QuizRunner } from "./quiz-runner";

export default async function AttemptPage({ params }: PageProps<"/attempts/[id]">) {
  await auth.protect();

  const found = await getAttempt((await params).id);
  if (!found) notFound();
  const { attempt, quiz, document } = found;

  // Questions arrive without correctOption, so the answer never reaches the
  // browser before it's been given.
  const pool = await getAttemptQuestions(quiz._id);
  const answered = new Set(attempt.responses.map((r) => r.questionId.toString()));

  // Resuming mid-attempt picks up at the difficulty already reached (spec §7).
  const current = selectNextQuestion(
    pool.map((q) => ({ ...q, correctOption: -1 })),
    answered,
    attempt.finalDifficulty,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="rail-label">{document.filename}</p>
      <div className="mt-8">
        <QuizRunner
          attemptId={attempt._id.toString()}
          total={quiz.questionCount}
          startingDifficulty={attempt.finalDifficulty}
          documentName={document.filename}
          firstQuestion={
            current && !attempt.completedAt
              ? {
                  _id: current._id.toString(),
                  stem: current.stem,
                  options: current.options,
                  difficulty: current.difficulty,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
