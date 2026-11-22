import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getDocument, getSummaryWithSources, listQuizzesWithStats } from "@/lib/queries";
import { SummaryPanel } from "./summary-panel";
import { QuizPanel } from "./quiz-panel";
import { JobWatcher } from "@/app/_components/job-watcher";
import { documentView, jobView } from "@/lib/jobs";

const STATUS = {
  processing: { label: "Reading…", className: "bg-info-soft text-info" },
  ready: { label: "Ready", className: "bg-good-soft text-good" },
  failed: { label: "Can't use", className: "bg-bad-soft text-bad" },
} as const;

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  await auth.protect();

  const doc = await getDocument((await params).id);
  if (!doc) notFound();

  const [summary, quizzes] = await Promise.all([
    getSummaryWithSources(doc._id),
    listQuizzesWithStats(doc._id),
  ]);
  // A document stuck "processing" long after upload reads as failed, not forever-reading.
  const { status: docStatus, error: docError } = documentView(doc);
  const status = STATUS[docStatus];

  return (
    <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-6 px-[clamp(16px,4vw,48px)] pt-4 pb-16">
      <JobWatcher active={docStatus === "processing"} />
      <Link
        href="/dashboard"
        className="flex min-h-11 w-fit items-center rounded-full px-1 font-bold text-brand-ink hover:underline"
      >
        ← All documents
      </Link>

      <section className="flex flex-col gap-7 rounded-[28px] border border-line bg-card p-[clamp(20px,3vw,36px)] shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-bad-soft">
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8A2A16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold break-words">{doc.filename}</h1>
              <div className="text-sm text-muted">
                {doc.pageCount ? `${doc.pageCount} pages · ` : ""}
                Added{" "}
                {doc.uploadedAt.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
          <span className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${status.className}`}>
            {docStatus === "ready" && summary ? "Notes ready" : status.label}
          </span>
        </div>

        {docStatus === "failed" ? (
          <div className="flex flex-col gap-2 rounded-[20px] bg-bad-soft p-5">
            <p className="display text-xl font-medium text-bad">Can&rsquo;t use this file</p>
            <p className="max-w-prose leading-relaxed">{docError}</p>
            <p className="max-w-prose text-sm leading-relaxed text-ink-soft">
              Open the PDF and try selecting a sentence with your cursor. If nothing
              highlights, the pages are images and there&rsquo;s no text to read.
            </p>
          </div>
        ) : docStatus === "processing" ? (
          <p className="rounded-[20px] bg-info-soft p-5 text-info">
            Still reading this document. This page updates on its own, so you can leave
            and come back.
          </p>
        ) : (
          <SummaryPanel
            documentId={doc._id.toString()}
            job={jobView(doc.jobs?.notes)}
            initialSummary={
              summary
                ? {
                    points: summary.points,
                    sections: summary.sections,
                    sources: summary.sources,
                    createdAt: summary.createdAt.toISOString(),
                  }
                : null
            }
          />
        )}
      </section>

      {docStatus === "ready" && (
        <section className="rounded-[28px] border border-line bg-card p-[clamp(20px,3vw,36px)] shadow-[var(--shadow-card)]">
          <QuizPanel
            documentId={doc._id.toString()}
            job={jobView(doc.jobs?.quiz)}
            initialQuizzes={quizzes.map(({ quiz, bestScore, attempts }) => ({
              _id: quiz._id.toString(),
              name: quiz.name,
              questionCount: quiz.questionCount,
              createdAt: quiz.createdAt.toISOString(),
              bestScore,
              attempts,
            }))}
          />
        </section>
      )}
    </div>
  );
}
