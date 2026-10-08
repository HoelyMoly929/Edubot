"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { BLOB_ACCESS, MAX_UPLOAD_BYTES } from "@/lib/blob";

type State =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "saving" }
  | { phase: "processing" }
  | { phase: "error"; message: string };

// Spec §9: processing never blocks the page, so each stage names itself.
const BUSY_LABEL = {
  uploading: "Uploading",
  saving: "Saving",
  processing: "Reading the text",
} as const;

export function UploadForm() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after an error
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setState({
        phase: "error",
        message: `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 50 MB.`,
      });
      return;
    }

    try {
      setState({ phase: "uploading", progress: 0 });
      const blob = await upload(file.name, file, {
        access: BLOB_ACCESS,
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: ({ percentage }) =>
          setState({ phase: "uploading", progress: percentage }),
      });

      setState({ phase: "saving" });
      const saved = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, filename: file.name }),
      });
      if (!saved.ok) throw new Error((await saved.json()).error ?? "Couldn't save that file");
      const { document } = await saved.json();

      // The document row exists now, so a failure here is recorded against it
      // rather than losing the upload.
      setState({ phase: "processing" });
      const processed = await fetch(`/api/documents/${document._id}/process`, {
        method: "POST",
      });

      setState({ phase: "idle" });
      router.refresh();

      if (!processed.ok) {
        setState({
          phase: "error",
          message: (await processed.json()).error ?? "Couldn't read that PDF",
        });
      }
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "The upload didn't finish",
      });
    }
  }

  const busy =
    state.phase === "uploading" || state.phase === "saving" || state.phase === "processing";

  return (
    <div className="rounded-lg border border-dashed border-rule bg-raised p-6">
      <label className="flex flex-wrap items-center gap-4">
        <span className="sr-only">Choose a PDF</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={onChange}
          disabled={busy}
          className="max-w-full text-sm disabled:opacity-50 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-5 file:py-2 file:text-paper"
        />
        {busy && (
          <span className="rail-label" aria-hidden>
            {BUSY_LABEL[state.phase as keyof typeof BUSY_LABEL]}
            {state.phase === "uploading" && ` ${Math.round(state.progress)}%`}
          </span>
        )}
      </label>

      {/* One live region, so a screen reader hears each stage without the
          status text shifting the layout. */}
      <p aria-live="polite" className="mt-3 text-sm">
        {state.phase === "idle" && (
          <span className="text-muted">
            PDFs up to 50 MB, in English, with text you can select.
          </span>
        )}
        {state.phase === "uploading" && (
          <span className="text-muted">Uploading… {Math.round(state.progress)}%</span>
        )}
        {state.phase === "saving" && <span className="text-muted">Saving…</span>}
        {state.phase === "processing" && (
          <span className="text-muted">Reading the text and building the index…</span>
        )}
        {state.phase === "error" && <span className="text-wrong">{state.message}</span>}
      </p>
    </div>
  );
}
