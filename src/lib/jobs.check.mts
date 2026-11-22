/**
 * Self-check for background-job state. Run: `npm run check:jobs`
 *
 * No database. If a stale job reads as "writing" the user waits forever; if a
 * finished one reads as "writing" they can never run it again.
 */
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { JOB_STALE_MS, JobError, claimFilter, jobErrorMessage, jobView } from "./jobs.ts";

const now = new Date("2026-11-22T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

assert.deepEqual(jobView(undefined, now), { state: "idle" });
assert.deepEqual(jobView({ status: "writing", startedAt: ago(1000) }, now), { state: "writing" });
assert.equal(jobView({ status: "writing", startedAt: ago(JOB_STALE_MS + 1) }, now).state, "failed", "stale job counts as failed");
const stale = jobView({ status: "writing", startedAt: ago(JOB_STALE_MS + 1) }, now);
assert.ok(stale.state === "failed" && stale.error, "stale job explains itself");
assert.deepEqual(jobView({ status: "failed", startedAt: ago(5), error: "boom" }, now), { state: "failed", error: "boom" });

// The claim only matches a document with no job, a failed job, or a stale one.
const id = new ObjectId();
assert.deepEqual(claimFilter(id, "quiz", now), {
  _id: id,
  $or: [
    { "jobs.quiz": { $exists: false } },
    { "jobs.quiz.status": "failed" },
    { "jobs.quiz.startedAt": { $lt: new Date(now.getTime() - JOB_STALE_MS) } },
  ],
});

// Only deliberate JobErrors reach the user verbatim; anything else is generic.
assert.equal(jobErrorMessage(new JobError("Too long."), "x"), "Too long.");
assert.equal(jobErrorMessage(new Error("mongo secret detail"), "Try again."), "Try again.");

console.log("jobs: all checks passed");
