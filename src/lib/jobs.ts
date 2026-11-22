import type { ObjectId } from "mongodb";
import { documents } from "./db.ts";
import type { JobState, PdfDocument } from "./schema.ts";

export type JobKind = "notes" | "quiz";

/** Route limit is 300s; a run still "writing" after 6 minutes died without telling us. */
export const JOB_STALE_MS = 6 * 60 * 1000;

/** What the UI needs to know about a job. */
export type JobView = { state: "idle" } | { state: "writing" } | { state: "failed"; error?: string };

/** An error whose message is safe and useful to show the user as-is. */
export class JobError extends Error {}

export function jobView(job: JobState | undefined, now: Date | number = Date.now()): JobView {
  if (!job) return { state: "idle" };
  if (job.status === "failed") return { state: "failed", error: job.error };
  const age = new Date(now).getTime() - job.startedAt.getTime();
  return age > JOB_STALE_MS
    ? { state: "failed", error: "That took too long and was stopped. Please try again." }
    : { state: "writing" };
}

/**
 * A document's status as the user should see it. One still "processing" long
 * after upload lost its reader (the function died), so it reads as failed
 * instead of spinning forever.
 */
export function documentView(
  doc: Pick<PdfDocument, "status" | "uploadedAt" | "error">,
  now: Date | number = Date.now(),
): { status: PdfDocument["status"]; error?: string } {
  if (doc.status === "processing" && new Date(now).getTime() - doc.uploadedAt.getTime() > JOB_STALE_MS) {
    return { status: "failed", error: "Reading this PDF took too long and was stopped. Please upload it again." };
  }
  return { status: doc.status, error: doc.error };
}

/** Matches a document only if no live job of this kind is running on it. */
export function claimFilter(documentId: ObjectId, kind: JobKind, now: Date = new Date()) {
  return {
    _id: documentId,
    $or: [
      { [`jobs.${kind}`]: { $exists: false } },
      { [`jobs.${kind}.status`]: "failed" },
      { [`jobs.${kind}.startedAt`]: { $lt: new Date(now.getTime() - JOB_STALE_MS) } },
    ],
  };
}

export function jobErrorMessage(err: unknown, fallback: string): string {
  return err instanceof JobError ? err.message : fallback;
}

/** Atomically marks the job as running. False means one is already running. */
export async function claimJob(documentId: ObjectId, kind: JobKind): Promise<boolean> {
  const now = new Date();
  const { matchedCount } = await (await documents()).updateOne(claimFilter(documentId, kind, now), {
    $set: { [`jobs.${kind}`]: { status: "writing", startedAt: now } },
  });
  return matchedCount === 1;
}

/**
 * Runs `work` for a claimed job and records the outcome: cleared on success,
 * "failed" with a message otherwise. Call inside `after()` so it outlives the
 * request that started it.
 */
export async function runJob(
  documentId: ObjectId,
  kind: JobKind,
  fallbackError: string,
  work: () => Promise<void>,
): Promise<void> {
  const col = await documents();
  try {
    await work();
    await col.updateOne({ _id: documentId }, { $unset: { [`jobs.${kind}`]: "" } });
  } catch (err) {
    if (!(err instanceof JobError)) console.error(`${kind} generation failed`, err);
    await col.updateOne(
      { _id: documentId },
      {
        $set: {
          [`jobs.${kind}`]: {
            status: "failed",
            startedAt: new Date(),
            error: jobErrorMessage(err, fallbackError),
          },
        },
      },
    );
  }
}
