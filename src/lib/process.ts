import { chunks as chunksCollection, summaries as summariesCollection } from "./db.ts";
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
  // dangling. Summaries are cheap to regenerate; broken citations are not
  // acceptable (spec §9).
  await (await summariesCollection()).deleteMany({ documentId: doc._id });
  await col.insertMany(
    drafts.map<Omit<Chunk, "_id">>((draft, i) => ({
      documentId: doc._id,
      text: draft.text,
      position: draft.position,
      sourcePage: draft.sourcePage,
      embedding: embeddings[i],
    })) as Chunk[],
  );

  return { pageCount, chunkCount: drafts.length };
}
