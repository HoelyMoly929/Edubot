import { ObjectId } from "mongodb";
import { after } from "next/server";
import { documents, summaries } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { loadChunks } from "@/lib/retrieve";
import { generateNotes } from "@/lib/summarise";
import { NotesTooLongError } from "@/lib/notes-structure";
import { JobError, claimJob, runJob } from "@/lib/jobs";
import type { PdfDocument, Summary, User } from "@/lib/schema";

// Model calls (and for processing, extracting and embedding a large PDF) can
// outlast the platform default. 300s is the ceiling on Vercel's free tier.
export const maxDuration = 300;

/** Loads a document only if it belongs to the caller (spec §9). */
async function authorise(
  idParam: string,
): Promise<{ user: User; doc: PdfDocument } | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!ObjectId.isValid(idParam)) {
    return Response.json({ error: "Invalid document id" }, { status: 400 });
  }

  const doc = await (await documents()).findOne({
    _id: new ObjectId(idParam),
    userId: user._id,
  });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  return { user, doc };
}

/** Returns the most recent summary for a document, if one has been generated. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authorised = await authorise((await params).id);
  if (authorised instanceof Response) return authorised;

  const summary = await (await summaries()).findOne(
    { documentId: authorised.doc._id },
    { sort: { createdAt: -1 } },
  );

  return Response.json({ summary });
}

/**
 * Starts writing source-grounded study notes for the whole document: every
 * chunk is read in order, a few at a time (see `generateNotes`). Deliberately
 * not top-k retrieval (spec §6), so no part of the PDF is left out.
 *
 * Answers 202 straight away and does the work in `after()`, so leaving the page
 * doesn't stop it. Progress is the document's `jobs.notes`; the page polls it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authorised = await authorise((await params).id);
  if (authorised instanceof Response) return authorised;
  const { doc } = authorised;

  if (doc.status !== "ready") {
    return Response.json(
      { error: "That document hasn't finished processing yet." },
      { status: 409 },
    );
  }

  if (!(await claimJob(doc._id, "notes"))) {
    return Response.json({ error: "Notes are already being written." }, { status: 409 });
  }

  after(() =>
    runJob(doc._id, "notes", "Could not generate a summary right now. Please try again.", async () => {
      const chunks = await loadChunks(doc._id);
      if (chunks.length === 0) throw new JobError("That document has no indexed text.");

      let sections;
      try {
        sections = await generateNotes(chunks);
      } catch (err) {
        if (err instanceof NotesTooLongError) {
          throw new JobError("This document is too long to write notes for in one go.");
        }
        throw err;
      }
      if (sections.length === 0) {
        throw new JobError("The model could not produce grounded notes from this material.");
      }

      const summary: Omit<Summary, "_id"> = {
        documentId: doc._id,
        points: [], // legacy field, required by the collection validator
        sections,
        createdAt: new Date(),
      };
      await (await summaries()).insertOne(summary as Summary);
    }),
  );

  return Response.json({ status: "writing" }, { status: 202 });
}
