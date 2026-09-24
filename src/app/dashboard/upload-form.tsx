"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

type State =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "saving" }
  | { phase: "error"; message: string };

export function UploadForm() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after an error
    if (!file) return;

    // Checked again server-side; this just avoids a pointless 50 MB round trip.
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({ phase: "error", message: "That file is over the 50 MB limit." });
      return;
    }

    try {
      setState({ phase: "uploading", progress: 0 });
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: ({ percentage }) =>
          setState({ phase: "uploading", progress: percentage }),
      });

      setState({ phase: "saving" });
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, filename: file.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save document");

      setState({ phase: "idle" });
      router.refresh();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  const busy = state.phase === "uploading" || state.phase === "saving";

  return (
    <div className="rounded-lg border border-dashed border-black/20 p-6 dark:border-white/25">
      <label className="flex cursor-pointer flex-col items-start gap-2">
        <span className="text-sm font-medium">Upload a PDF</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={onChange}
          disabled={busy}
          className="text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-1.5 file:text-background disabled:opacity-50"
        />
      </label>

      <p aria-live="polite" className="mt-3 text-sm text-black/60 dark:text-white/60">
        {state.phase === "uploading" && `Uploading… ${Math.round(state.progress)}%`}
        {state.phase === "saving" && "Saving…"}
        {state.phase === "error" && (
          <span className="text-red-600 dark:text-red-400">{state.message}</span>
        )}
        {state.phase === "idle" && "Text PDFs up to 50 MB. English only."}
      </p>
    </div>
  );
}
