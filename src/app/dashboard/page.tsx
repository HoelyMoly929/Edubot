import { auth } from "@clerk/nextjs/server";
import { documents } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { UploadForm } from "./upload-form";

const STATUS_LABEL = {
  processing: "Extracting text…",
  ready: "Ready",
  failed: "Failed",
} as const;

export default async function DashboardPage() {
  await auth.protect();

  const user = await getCurrentUser();
  const docs = user
    ? await (await documents())
        .find({ userId: user._id })
        .sort({ uploadedAt: -1 })
        .toArray()
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Your documents</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">{user?.email}</p>

      <div className="mt-6">
        <UploadForm />
      </div>

      {docs.length === 0 ? (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">
          Nothing uploaded yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-black/10 dark:divide-white/15">
          {docs.map((doc) => (
            <li key={doc._id.toString()} className="py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="truncate text-sm">{doc.filename}</span>
                <span
                  className={`shrink-0 text-xs ${
                    doc.status === "failed"
                      ? "text-red-600 dark:text-red-400"
                      : "text-black/60 dark:text-white/60"
                  }`}
                >
                  {doc.status === "ready" && doc.pageCount
                    ? `Ready · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`
                    : STATUS_LABEL[doc.status]}
                </span>
              </div>
              {doc.error && (
                <p className="mt-1 text-xs text-black/60 dark:text-white/60">{doc.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
