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
        Every attempt, with the difficulty you finished at. Open a finished one to
        go back over what you missed.
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
          {attempts.map(({ attempt, documentName, quizName, total }) => {
            const answered = attempt.responses.length;
            const finished = Boolean(attempt.completedAt);
            const wrong = attempt.responses.filter((r) => !r.correct).length;

            return (
              <li key={attempt._id.toString()} className="border-t border-rule">
                {/* The whole row is the link: one target, keyboard reachable. */}
                <Link
                  href={`/attempts/${attempt._id}`}
                  className="group grid grid-cols-[4rem_1fr_auto] items-center gap-x-5 py-5 sm:grid-cols-[6rem_1fr_auto]"
                >
                  {/* Score leads: it's what you came to this page for. */}
                  <div>
                    {finished ? (
                      <>
                        <div className="font-mono text-2xl">
                          {Math.round(attempt.score * 100)}%
                        </div>
                        <div className="rail-label mt-1">{attempt.finalDifficulty}</div>
                      </>
                    ) : (
                      <span className="rail-label">In progress</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate group-hover:text-source">{quizName}</p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {documentName} · {answered} of {total} answered ·{" "}
                      {attempt.startedAt.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <span className="rail-label text-source whitespace-nowrap">
                    {!finished ? "Finish it →" : wrong > 0 ? `Review ${wrong} →` : "View →"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
