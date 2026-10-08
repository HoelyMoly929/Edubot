import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listAttempts } from "@/lib/queries";

export default async function HistoryPage() {
  await auth.protect();
  const attempts = await listAttempts();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="display text-3xl font-semibold">Your quiz history</h1>
      <p className="mt-2 max-w-prose text-muted">
        Every attempt, with the difficulty you finished at. Scores climbing while
        difficulty holds steady is the shape you want.
      </p>

      {attempts.length === 0 ? (
        <p className="mt-12 text-muted">
          No attempts yet.{" "}
          <Link href="/dashboard" className="text-source hover:underline">
            Pick a document
          </Link>{" "}
          and take a quiz.
        </p>
      ) : (
        <ul className="mt-10">
          {attempts.map(({ attempt, documentName, total }) => {
            const answered = attempt.responses.length;
            const percent = Math.round(attempt.score * 100);
            const finished = Boolean(attempt.completedAt);

            return (
              <li
                key={attempt._id.toString()}
                className="grid grid-cols-[4rem_1fr] gap-x-5 border-t border-rule py-5 sm:grid-cols-[6rem_1fr]"
              >
                {/* Score leads: it's what you came to this page for. */}
                <div>
                  <div className="font-mono text-2xl">{percent}%</div>
                  <div className="rail-label mt-1">{attempt.finalDifficulty}</div>
                </div>

                <div className="min-w-0">
                  <p className="truncate">{documentName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {answered} of {total} answered ·{" "}
                    {attempt.startedAt.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {!finished && (
                      <>
                        {" · "}
                        <Link
                          href={`/attempts/${attempt._id}`}
                          className="text-source hover:underline"
                        >
                          Finish it
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
