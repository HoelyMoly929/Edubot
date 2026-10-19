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
  const current = attempt.completedAt
    ? null
    : selectNextQuestion(
        pool.map((q) => ({ ...q, correctOption: -1 })),
        answered,
        attempt.finalDifficulty,
      );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href={`/documents/${document._id}`} className="rail-label hover:text-source">
        ← {document.filename}
      </Link>
      <p className="display mt-3 text-lg font-semibold">{quiz.name ?? UNNAMED_QUIZ}</p>

      <div className="mt-8">
        {current ? (
          <QuizRunner
            attemptId={attempt._id.toString()}
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
            score={attempt.score}
            finalDifficulty={attempt.finalDifficulty}
            items={await getAttemptReview(attempt)}
            documentId={document._id.toString()}
          />
        )}
      </div>
    </div>
  );
}

function Results({
  score,
  finalDifficulty,
  items,
  documentId,
}: {
  score: number;
  finalDifficulty: string;
  items: ReviewItem[];
  documentId: string;
}) {
  const wrong = items.filter((item) => !item.correct);
  const right = items.length - wrong.length;

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-[6rem_1fr]">
      <div className="rail-label">Results</div>

      <div className="min-w-0">
        <h1 className="display text-4xl font-semibold">{Math.round(score * 100)}%</h1>
        <p className="mt-2 text-muted">
          {right} of {items.length} correct · finished at{" "}
          <strong className="text-ink">{finalDifficulty}</strong> difficulty
        </p>

        {wrong.length === 0 ? (
          <p className="mt-10">Nothing to review — every answer was right.</p>
        ) : (
          <section className="mt-10">
            <h2 className="display text-xl font-semibold">
              Review {wrong.length === 1 ? "the one you missed" : `the ${wrong.length} you missed`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Open a question to see the answer, why, and where to find it in your notes.
            </p>

            <ol className="mt-5 border-t border-rule">
              {wrong.map((item, i) => (
                <li key={item.questionId} className="border-b border-rule">
                  {/* Native disclosure: keyboard and screen-reader support for free. */}
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-4 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="rail-label w-6 shrink-0 pt-1">{i + 1}</span>
                      <span className="flex-1 leading-snug">{item.stem}</span>
                      <span
                        aria-hidden
                        className="rail-label pt-1 transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>

                    <div className="space-y-4 pb-6 pl-10">
                      <dl className="space-y-2 text-sm">
                        <div>
                          <dt className="rail-label text-wrong">Your answer</dt>
                          <dd className="mt-0.5">{item.options[item.selectedOption]}</dd>
                        </div>
                        <div>
                          <dt className="rail-label text-source">Correct answer</dt>
                          <dd className="mt-0.5">{item.options[item.correctOption]}</dd>
                        </div>
                      </dl>

                      {item.explanation && (
                        <p className="leading-relaxed">{item.explanation}</p>
                      )}

                      {item.sourcePage !== undefined && (
                        <div className="border-l-2 border-source pl-4">
                          <p className="rail-label text-source">
                            Where to find it ·{" "}
                            {formatPagesLong(item.sourcePage, item.endPage)}
                          </p>
                          {item.evidence ? (
                            <p className="mt-2 text-sm text-muted">
                              Look for: <span className="marker">“{item.evidence}”</span>
                            </p>
                          ) : null}
                        </div>
                      )}

                      {!item.explanation && (
                        <p className="text-sm text-muted">
                          This quiz was built before explanations existed. Build a new
                          quiz from the document to get them.
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={`/documents/${documentId}`}
            className="rounded-full bg-ink px-5 py-2 text-sm text-paper"
          >
            Back to the notes
          </Link>
          <Link
            href="/history"
            className="rounded-full border border-ink px-5 py-2 text-sm hover:bg-ink hover:text-paper"
          >
            Your history
          </Link>
        </div>
      </div>
    </div>
  );
}
