import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listDocuments } from "@/lib/queries";
import { UploadForm } from "./upload-form";

const STATUS = {
  processing: { label: "Reading", tone: "text-muted" },
  ready: { label: "Ready", tone: "text-source" },
  failed: { label: "Can't use", tone: "text-wrong" },
} as const;

export default async function DashboardPage() {
  await auth.protect();
  const docs = await listDocuments();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="display text-3xl font-semibold">Your documents</h1>
      <p className="mt-2 max-w-prose text-muted">
        Upload a lecture PDF to get study notes and a quiz built from it — each
        one linked back to the page it came from.
      </p>

      <div className="mt-8">
        <UploadForm />
      </div>

      {docs.length === 0 ? (
        <p className="mt-12 text-muted">
          Nothing here yet. Your first upload will appear in this list.
        </p>
      ) : (
        <ul className="mt-12">
          {docs.map((doc) => {
            const status = STATUS[doc.status];
            return (
              <li key={doc._id.toString()} className="border-t border-rule">
                <Link
                  href={`/documents/${doc._id}`}
                  className="group grid grid-cols-[5rem_1fr] gap-x-5 py-5 sm:grid-cols-[7rem_1fr]"
                >
                  {/* Margin rail: status and extent, in the annotation voice. */}
                  <div className="rail-label pt-1">
                    <span className={status.tone}>{status.label}</span>
                    {doc.pageCount ? <div className="mt-1">{doc.pageCount} pp</div> : null}
                  </div>

                  <div className="min-w-0">
                    <span className="block truncate text-lg group-hover:text-source">
                      {doc.filename}
                    </span>
                    {doc.error ? (
                      <p className="mt-1 max-w-prose text-sm text-muted">{doc.error}</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">
                        {doc.uploadedAt.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
