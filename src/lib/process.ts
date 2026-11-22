import {
  chunks as chunksCollection,
  documents as documentsCollection,
  questions as questionsCollection,
  quizzes as quizzesCollection,
  summaries as summariesCollection,
} from "./db.ts";
import { chunkPages } from "./chunk.ts";
import { downloadPdf, extractPdf, UnprocessablePdfError } from "./extract.ts";
import { embedTexts } from "./embed.ts";
import type { Chunk, PdfDocument } from "./schema.ts";

/**
 * The RAG indexing pipeline for one document: download → extract → chunk →
 * embed → store (spec §6).
 *
 * Takes an already-authorised document. Callers own auth, the document's
 * status field and HTTP concerns; this owns the pipeline.
 */
export async function indexDocument(
  doc: PdfDocument,
): Promise<{ pageCount: number; chunkCount: number }> {
  const { pageCount, pages } = await extractPdf(await downloadPdf(doc.blobUrl));

  const drafts = chunkPages(pages);
  if (drafts.length === 0) {
    throw new UnprocessablePdfError("No usable text could be extracted from that PDF.");
  }

  const embeddings = await embedTexts(drafts.map((draft) => draft.text));

  const col = await chunksCollection();
  // Re-indexing replaces the previous chunks rather than duplicating them.
  await col.deleteMany({ documentId: doc._id });

  // Replacement chunks get fresh _ids, so anything citing the old ones is now
  // dangling. Summaries and questions are cheap to regenerate; broken citations
  // are not acceptable (spec §9).
  await (await summariesCollection()).deleteMany({ documentId: doc._id });

  const quizzesCol = await quizzesCollection();
  const staleQuizIds = (await quizzesCol.find({ documentId: doc._id }, { projection: { _id: 1 } }).toArray())
    .map((quiz) => quiz._id);
  if (staleQuizIds.length > 0) {
    await (await questionsCollection()).deleteMany({ quizId: { $in: staleQuizIds } });
    await quizzesCol.deleteMany({ _id: { $in: staleQuizIds } });
  }
  // QuizAttempts are deliberately kept: they are the user's own performance
  // history (spec §8), and their score and difficulty stay meaningful even once
  // the quiz they ran against is gone.
  await col.insertMany(
    drafts.map<Omit<Chunk, "_id">>((draft, i) => ({
      documentId: doc._id,
      text: draft.text,
      position: draft.position,
      sourcePage: draft.sourcePage,
      endPage: draft.endPage,
      embedding: embeddings[i],
    })) as Chunk[],
  );

  return { pageCount, chunkCount: drafts.length };
}

/**
 * Indexes a document and records the outcome on it: "ready" with its page
 * count, or "failed" with a message the dashboard shows (spec §9, §11). Never
 * throws, so it is safe to run in the background after a response.
 */
export async function processDocument(
  doc: PdfDocument,
): Promise<{ ok: true; pageCount: number; chunkCount: number } | { ok: false; error: string }> {
  const col = await documentsCollection();
  try {
    const { pageCount, chunkCount } = await indexDocument(doc);
    await col.updateOne(
      { _id: doc._id, userId: doc.userId },
      { $set: { pageCount, status: "ready" }, $unset: { error: "" } },
    );
    return { ok: true, pageCount, chunkCount };
  } catch (err) {
    // Only our own validation messages are safe to show the user verbatim.
    const error =
      err instanceof UnprocessablePdfError
        ? err.message
        : "Something went wrong while processing that PDF. Please try again.";
    await col.updateOne({ _id: doc._id, userId: doc.userId }, { $set: { status: "failed", error } });
    if (!(err instanceof UnprocessablePdfError)) console.error("processing failed", err);
    return { ok: false, error };
  }
}
