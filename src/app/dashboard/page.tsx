import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listDocuments } from "@/lib/queries";
import { UploadForm } from "./upload-form";

const STATUS = {
  processing: { label: "Reading…", className: "bg-info-soft text-info" },
  ready: { label: "Ready", className: "bg-good-soft text-good" },
  failed: { label: "Can't use", className: "bg-bad-soft text-bad" },
} as const;

function FileIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8A2A16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export default async function DashboardPage() {
  await auth.protect();
  const docs = await listDocuments();

  return (
    <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-10 px-[clamp(16px,4vw,48px)] pt-4 pb-16">
      <section className="flex flex-wrap items-center gap-10">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <div className="flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full bg-brand-soft px-3.5 py-1.5 text-brand-ink">1 Upload</span>
            <span className="rounded-full bg-info-soft px-3.5 py-1.5 text-info">2 Summary</span>
            <span className="rounded-full bg-good-soft px-3.5 py-1.5 text-good">3 Quiz</span>
          </div>
          <h1 className="display text-[clamp(34px,5vw,52px)] leading-[1.1] font-semibold text-balance">
            Turn any PDF into a study session
          </h1>
          <p className="max-w-[520px] text-lg leading-relaxed text-muted text-pretty">
            Upload your notes or a chapter. EduBot writes revision notes, then builds a
            quiz so you can check what stuck — every point linked to the page it came
            from.
          </p>
        </div>

        <div className="min-w-0 flex-[1_1_420px]">
          <UploadForm />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="display text-[26px] font-medium">Your documents</h2>

        {docs.length === 0 ? (
          <p className="rounded-[28px] border border-line bg-card p-8 text-muted">
            Nothing here yet. Your first upload will appear here.
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-4">
            {docs.map((doc) => {
              const status = STATUS[doc.status];
              return (
                <li key={doc._id.toString()}>
                  <Link
                    href={`/documents/${doc._id}`}
                    className="flex h-full flex-col gap-3 rounded-[24px] border border-line bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:border-brand-dash"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-bad-soft">
                        <FileIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-bold">{doc.filename}</div>
                        <div className="text-sm text-muted">
                          {doc.pageCount ? `${doc.pageCount} pages · ` : ""}
                          {doc.uploadedAt.toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <span className={`flex-none rounded-full px-3.5 py-1.5 text-sm font-bold ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    {doc.error && <p className="text-sm leading-relaxed text-bad">{doc.error}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
