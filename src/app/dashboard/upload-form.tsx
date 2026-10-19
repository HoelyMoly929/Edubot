"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { upload } from "@vercel/blob/client";
import { BLOB_ACCESS, MAX_UPLOAD_BYTES } from "@/lib/blob";

type State =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "saving" }
  | { phase: "processing" }
  | { phase: "error"; message: string };

export function UploadForm() {
  const router = useRouter();
  const inputId = useId();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dragging, setDragging] = useState(false);

  const busy =
    state.phase === "uploading" || state.phase === "saving" || state.phase === "processing";

  /** One path for both the file picker and a drop. */
  async function handleFile(file: File) {
    if (busy) return;

    // Checked again server-side; this only spares a doomed upload.
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setState({ phase: "error", message: "That isn't a PDF. Choose a .pdf file." });
      return;
    }
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

  // Spec §9: processing never blocks the page, so each stage names itself.
  const heading =
    state.phase === "uploading"
      ? `Uploading… ${Math.round(state.progress)}%`
      : state.phase === "saving"
        ? "Saving…"
        : state.phase === "processing"
          ? "Reading the text…"
          : "Drop your PDF here";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      className={`flex flex-col items-center gap-4 rounded-[28px] border-2 border-dashed px-8 py-10 text-center transition-colors ${
        dragging ? "border-brand bg-brand-softer" : "border-brand-dash bg-card"
      }`}
    >
      <span className="flex size-[72px] items-center justify-center rounded-full bg-sun">
        <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4A3A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V5" />
          <path d="M7 9l5-5 5 5" />
          <path d="M5 19h14" />
        </svg>
      </span>

      <div className="display text-2xl font-medium" aria-live="polite">
        {heading}
      </div>

      {busy ? (
        <div className="h-2.5 w-full max-w-[280px] overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{
              width:
                state.phase === "uploading"
                  ? `${Math.max(4, state.progress * 0.6)}%`
                  : state.phase === "saving"
                    ? "70%"
                    : "88%",
            }}
          />
        </div>
      ) : (
        <div className="text-muted">or choose a file from your device</div>
      )}

      {/* Real file input behind a styled label: keyboard and screen readers
          get a native control. */}
      <input
        id={inputId}
        type="file"
        accept="application/pdf"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // let the same file be picked again after an error
          if (file) handleFile(file);
        }}
      />
      <label
        htmlFor={inputId}
        className={`flex min-h-12 items-center rounded-full border-2 border-brand bg-card px-7 font-bold text-brand-ink transition-colors [input:focus-visible+&]:outline-3 [input:focus-visible+&]:outline-brand ${
          busy ? "cursor-default opacity-50" : "cursor-pointer hover:bg-brand-softer"
        }`}
      >
        Choose PDF
      </label>

      {state.phase === "error" ? (
        <p role="alert" className="max-w-sm text-sm font-semibold text-bad">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-muted">PDFs up to 50 MB, in English, with text you can select.</p>
      )}
    </div>
  );
}
