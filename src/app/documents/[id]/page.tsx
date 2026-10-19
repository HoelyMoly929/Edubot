import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDocument, getSummaryWithSources, listQuizzesWithStats } from "@/lib/queries";
import { SummaryPanel } from "./summary-panel";
import { QuizPanel } from "./quiz-panel";

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  await auth.protect();

  const doc = await getDocument((await params).id);
  if (!doc) notFound();

  const [summary, quizzes] = await Promise.all([
    getSummaryWithSources(doc._id),
    listQuizzesWithStats(doc._id),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link href="/dashboard" className="rail-label hover:text-source">
        ← Documents
      </Link>

      <h1 className="display mt-4 text-3xl font-semibold break-words">{doc.filename}</h1>
      <p className="mt-2 text-muted">
        {doc.pageCount ? `${doc.pageCount} pages · ` : ""}
        Added{" "}
        {doc.uploadedAt.toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>

      {doc.status === "failed" ? (
        <div className="mt-10 border-l-2 border-wrong pl-5">
          <p className="rail-label text-wrong">Can&rsquo;t use this file</p>
          <p className="mt-2 max-w-prose">{doc.error}</p>
          <p className="mt-3 max-w-prose text-sm text-muted">
            Open the PDF and try selecting a sentence with your cursor. If nothing
            highlights, the pages are images and there&rsquo;s no text to read.
          </p>
        </div>
      ) : doc.status === "processing" ? (
        <p className="mt-10 text-muted">
          Still reading this document. Refresh in a moment.
        </p>
      ) : (
        <div className="mt-12 space-y-16">
          <SummaryPanel
            documentId={doc._id.toString()}
            initialSummary={
              summary
                ? { points: summary.points, createdAt: summary.createdAt.toISOString() }
                : null
            }
          />

          <QuizPanel
            documentId={doc._id.toString()}
            initialQuizzes={quizzes.map(({ quiz, bestScore, attempts }) => ({
              _id: quiz._id.toString(),
              name: quiz.name,
              questionCount: quiz.questionCount,
              createdAt: quiz.createdAt.toISOString(),
              bestScore,
              attempts,
            }))}
          />
        </div>
      )}
    </div>
  );
}
