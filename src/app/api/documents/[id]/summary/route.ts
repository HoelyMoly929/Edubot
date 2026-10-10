import { ObjectId } from "mongodb";
import { documents, summaries } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { retrieveChunks } from "@/lib/retrieve";
import { generateSummary, SUMMARY_QUERY } from "@/lib/summarise";
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
 * Generates a source-grounded summary: embed the instruction, retrieve the
 * top-k most similar chunks, and prompt the model with only those (spec §6).
 */
export async function POST(
  request: Request,
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

  // Optional override so a user can later ask for a focused summary; topK stays
  // tunable per spec §6 but is clamped so a caller can't request the whole index.
  const body = await request.json().catch(() => ({}));
  const query = typeof body?.query === "string" && body.query.trim() ? body.query : SUMMARY_QUERY;
  const topK = Number.isInteger(body?.topK) ? Math.min(Math.max(body.topK, 1), 20) : undefined;

  try {
    const retrieved = await retrieveChunks(doc._id, query, topK);
    if (retrieved.length === 0) {
      return Response.json({ error: "That document has no indexed text." }, { status: 409 });
    }

    const points = await generateSummary(retrieved);
    if (points.length === 0) {
      return Response.json(
        { error: "The model could not produce a grounded summary from this material." },
        { status: 422 },
      );
    }

    const summary: Omit<Summary, "_id"> = {
      documentId: doc._id,
      points,
      createdAt: new Date(),
    };
    const { insertedId } = await (await summaries()).insertOne(summary as Summary);

    return Response.json({ summary: { ...summary, _id: insertedId } }, { status: 201 });
  } catch (err) {
    console.error("summary generation failed", err);
    return Response.json(
      { error: "Could not generate a summary right now. Please try again." },
      { status: 502 },
    );
  }
}
