import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getAttempt,
  getAttemptQuestions,
  getAttemptReview,
  type ReviewItem,
} from "@/lib/queries";
import { selectNextQuestion } from "@/lib/adaptive";
import { formatPagesLong } from "@/lib/pages";
import { UNNAMED_QUIZ } from "@/lib/quiz-name";
import { TIERS, tierFor } from "@/lib/score-tier";
import { StartQuizButton } from "@/app/_components/start-quiz-button";
import { QuizRunner } from "./quiz-runner";

export default async function AttemptPage({ params }: PageProps<"/attempts/[id]">) {
  await auth.protect();

  const found = await getAttempt((await params).id);
  if (!found) notFound();
  const { attempt, quiz, document } = found;
  const quizName = quiz.name ?? UNNAMED_QUIZ;

  // Questions arrive without correctOption, so the answer never reaches the
  // browser before it's been given.
  const pool = await getAttemptQuestions(quiz._id);
  const answered = new Set(attempt.responses.map((r) => r.questionId.toString()));

  // Resuming mid-attempt picks up at the difficulty already reached (spec §7).
  const current = attempt.completedAt
    ? null
    : selectNextQuestion(
        pool.map((q) => ({ ...q, correctOption: -1 })),
        answered,
        attempt.finalDifficulty,
      );

  return (
    <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 px-[clamp(16px,4vw,48px)] pt-4 pb-16">
      <Link
        href={`/documents/${document._id}`}
        className="flex min-h-11 w-fit max-w-full items-center rounded-full px-1 font-bold text-brand-ink hover:underline"
      >
        <span className="truncate">← {document.filename}</span>
      </Link>

      {current ? (
        <QuizRunner
          attemptId={attempt._id.toString()}
          title={quizName}
          total={quiz.questionCount}
          answeredSoFar={attempt.responses.length}
          startingDifficulty={attempt.finalDifficulty}
          firstQuestion={{
            _id: current._id.toString(),
            stem: current.stem,
            options: current.options,
            difficulty: current.difficulty,
          }}
        />
      ) : (
        <Results
          quizId={quiz._id.toString()}
          quizName={quizName}
          score={attempt.score}
          finalDifficulty={attempt.finalDifficulty}
          items={await getAttemptReview(attempt)}
          documentId={document._id.toString()}
        />
      )}
    </div>
  );
}

function Results({
  quizId,
  quizName,
  score,
  finalDifficulty,
  items,
  documentId,
}: {
  quizId: string;
  quizName: string;
  score: number;
  finalDifficulty: string;
  items: ReviewItem[];
  documentId: string;
}) {
  const wrong = items.filter((item) => !item.correct);
  const right = items.length - wrong.length;
  const tier = TIERS[tierFor(score)];
  const percent = Math.round(score * 100);

  return (
    <div className="flex flex-col gap-6">
      <section className={`flex flex-col gap-4 rounded-[28px] p-[clamp(20px,4vw,36px)] ${tier.card}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold">{quizName}</h1>
          <span className={`rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-bold ${tier.ink}`}>
            {tier.label}
          </span>
        </div>
        <div className={`display text-[clamp(44px,8vw,64px)] leading-none font-medium ${tier.ink}`}>
          {percent}%
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/80">
          <div className={`h-full rounded-full ${tier.fill}`} style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[17px] text-ink-soft">
          {right} of {items.length} correct · finished at{" "}
          <strong className="capitalize">{finalDifficulty}</strong> difficulty
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-card p-[clamp(20px,4vw,36px)] shadow-[var(--shadow-card)]">
        {wrong.length === 0 ? (
          <div className="rounded-[20px] bg-good-soft p-5">
            <p className="display text-xl font-medium text-good">Nice, every answer was right</p>
            <p className="mt-1 text-ink">Nothing to review this time.</p>
          </div>
        ) : (
          <>
            <div>
              <h2 className="display text-[26px] font-medium">
                {wrong.length === 1 ? "The one you missed" : `The ${wrong.length} you missed`}
              </h2>
              <p className="text-[15px] text-muted">
                Open a question to see the answer, why, and where to find it.
              </p>
            </div>

            <ol className="flex flex-col gap-3">
              {wrong.map((item, i) => (
                <li key={item.questionId}>
                  {/* Native disclosure: keyboard and screen-reader support for free. */}
                  <details className="group rounded-[18px] border-2 border-line-strong bg-card open:border-brand-dash">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3.5 px-4.5 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-bad-soft font-bold text-bad">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-lg font-semibold leading-snug">
                        {item.stem}
                      </span>
                      <span
                        aria-hidden
                        className="flex-none text-2xl font-bold text-brand-ink transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>

                    <div className="flex flex-col gap-3 px-4.5 pb-5">
                      <div className="flex items-center gap-3.5 rounded-[14px] bg-bad-soft px-4 py-3">
                        <span className="flex-none text-sm font-bold text-bad">Your answer</span>
                        <span className="min-w-0 font-semibold">{item.options[item.selectedOption]}</span>
                      </div>
                      <div className="flex items-center gap-3.5 rounded-[14px] bg-good-soft px-4 py-3">
                        <span className="flex-none text-sm font-bold text-good">Correct</span>
                        <span className="min-w-0 font-semibold">{item.options[item.correctOption]}</span>
                      </div>

                      <div className="flex flex-col gap-1.5 rounded-[20px] bg-warn-soft px-5 py-4">
                        <p className="display text-xl font-medium text-warn">Here&rsquo;s why</p>
                        {item.explanation ? (
                          <p className="leading-relaxed">{item.explanation}</p>
                        ) : (
                          <p className="leading-relaxed">
                            This quiz was built before explanations existed. Build a new quiz
                            from the document to get them.
                          </p>
                        )}
                        {item.sourcePage !== undefined && (
                          <p className="mt-1 text-[15px] leading-relaxed text-[#3B2D00]">
                            <strong>Find it on {formatPagesLong(item.sourcePage, item.endPage)}</strong>
                            {item.evidence && (
                              <>
                                {" "}— look for <span className="bg-white/70 px-1">“{item.evidence}”</span>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <StartQuizButton
            quizId={quizId}
            label="Retake quiz"
            className="min-h-[52px] cursor-pointer rounded-full bg-brand px-8 text-[17px] font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          />
          <Link
            href={`/documents/${documentId}`}
            className="flex min-h-11 items-center px-3 font-bold text-brand-ink underline"
          >
            Back to the notes
          </Link>
          <Link href="/history" className="flex min-h-11 items-center px-3 font-bold text-brand-ink underline">
            Quiz history
          </Link>
        </div>
      </section>
    </div>
  );
}
