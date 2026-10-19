import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listAttempts } from "@/lib/queries";
import { HistoryList, type HistoryRow } from "./history-list";

export default async function HistoryPage() {
  await auth.protect();
  const attempts = await listAttempts();

  const rows: HistoryRow[] = attempts.map(
    ({ attempt, documentName, documentId, quizName, quizExists, total }) => ({
      attemptId: attempt._id.toString(),
      quizId: attempt.quizId.toString(),
      quizName,
      quizExists,
      documentName,
      documentId,
      finished: Boolean(attempt.completedAt),
      score: attempt.score,
      answered: attempt.responses.length,
      total,
      wrong: attempt.responses.filter((r) => !r.correct).length,
      finalDifficulty: attempt.finalDifficulty,
      startedAt: attempt.startedAt.toISOString(),
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-8 px-[clamp(16px,4vw,48px)] pt-4 pb-16">
      <section className="flex flex-col gap-3">
        <h1 className="display text-[clamp(32px,5vw,44px)] leading-[1.1] font-semibold">
          Quiz history
        </h1>
        <p className="max-w-[560px] text-lg leading-relaxed text-muted">
          Every quiz you have taken, newest first. Open one to go back over what you
          missed, or retake it to see how much you have improved.
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-[28px] border border-line bg-card p-8 text-lg text-muted">
          No attempts yet.{" "}
          <Link href="/dashboard" className="font-bold text-brand-ink underline">
            Pick a document
          </Link>{" "}
          and take a quiz.
        </p>
      ) : (
        <HistoryList rows={rows} />
      )}
    </div>
  );
}
