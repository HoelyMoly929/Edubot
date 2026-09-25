import { ObjectId } from "mongodb";
import { chunks as chunksCollection, documents } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { chunkPages } from "@/lib/chunk";
import { downloadPdf, extractPdf, UnprocessablePdfError } from "@/lib/extract";
import { embedTexts } from "@/lib/embed";
import type { Chunk } from "@/lib/schema";

/**
 * Runs the RAG indexing pipeline for one document: download → extract → chunk →
 * embed → store (spec §6). Flips the document from "processing" to "ready", or
 * to "failed" with a message the UI can show.
 *
 * Kept as its own request rather than run inside the upload so neither call has
 * to hold a connection open for the whole pipeline.
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
    const { pageCount, pages } = await extractPdf(await downloadPdf(doc.blobUrl));

    const drafts = chunkPages(pages);
    if (drafts.length === 0) {
      throw new UnprocessablePdfError("No usable text could be extracted from that PDF.");
    }

    const embeddings = await embedTexts(drafts.map((draft) => draft.text));

    const col = await chunksCollection();
    // Re-processing replaces the previous index rather than duplicating it.
    await col.deleteMany({ documentId: doc._id });
    await col.insertMany(
      drafts.map<Omit<Chunk, "_id">>((draft, i) => ({
        documentId: doc._id,
        text: draft.text,
        position: draft.position,
        sourcePage: draft.sourcePage,
        embedding: embeddings[i],
      })) as Chunk[],
    );

    await documentsCol.updateOne(
      { _id: doc._id, userId: user._id },
      { $set: { pageCount, status: "ready" }, $unset: { error: "" } },
    );

    return Response.json({ status: "ready", pageCount, chunks: drafts.length });
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
