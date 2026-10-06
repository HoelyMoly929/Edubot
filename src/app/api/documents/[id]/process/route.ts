import { ObjectId } from "mongodb";
import { documents } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { UnprocessablePdfError } from "@/lib/extract";
import { indexDocument } from "@/lib/process";

/**
 * Indexes one document for retrieval, flipping it from "processing" to "ready",
 * or to "failed" with a message the dashboard shows (spec §9, §11).
 *
 * Its own request rather than part of the upload, so neither call has to stay
 * open for the whole pipeline.
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

  try {
    const { pageCount, chunkCount } = await indexDocument(doc);

    await documentsCol.updateOne(
      { _id: doc._id, userId: user._id },
      { $set: { pageCount, status: "ready" }, $unset: { error: "" } },
    );

    return Response.json({ status: "ready", pageCount, chunks: chunkCount });
  } catch (err) {
    // Only our own validation messages are safe to show the user verbatim.
    const message =
      err instanceof UnprocessablePdfError
        ? err.message
        : "Something went wrong while processing that PDF. Please try again.";

    await documentsCol.updateOne(
      { _id: doc._id, userId: user._id },
      { $set: { status: "failed", error: message } },
    );

    if (!(err instanceof UnprocessablePdfError)) console.error("processing failed", err);
    return Response.json({ error: message }, { status: 422 });
  }
}
