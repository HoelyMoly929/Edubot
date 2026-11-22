import { ObjectId } from "mongodb";
import { documents } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { processDocument } from "@/lib/process";

// Model calls (and for processing, extracting and embedding a large PDF) can
// outlast the platform default. 300s is the ceiling on Vercel's free tier.
export const maxDuration = 300;

/**
 * Indexes one document for retrieval, flipping it from "processing" to "ready",
 * or to "failed" with a message the dashboard shows (spec §9, §11).
 *
 * Saving an upload already starts this in the background (see POST /api/documents);
 * this stays as a way to re-run it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid document id" }, { status: 400 });
  }

  const documentsCol = await documents();
  // Scoped to the caller: another user's id simply doesn't exist here (spec §9).
  const doc = await documentsCol.findOne({ _id: new ObjectId(id), userId: user._id });
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  const result = await processDocument(doc);
  return result.ok
    ? Response.json({ status: "ready", pageCount: result.pageCount, chunks: result.chunkCount })
    : Response.json({ error: result.error }, { status: 422 });
}
