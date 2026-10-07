import type { ObjectId } from "mongodb";
import { chunks as chunksCollection } from "./db.ts";
import { embedQuery } from "./embed.ts";
import type { Chunk } from "./schema.ts";

/** Spec §6: k ≈ 4–6, tunable. */
export const DEFAULT_TOP_K = 5;

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

/**
 * Cosine similarity. text-embedding-3 vectors arrive normalised, so a dot
 * product would usually do, but normalisation isn't part of the API contract
 * and an un-normalised vector would silently skew every ranking.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/** Ranks already-loaded chunks against a query vector. Pure, so it's testable. */
export function rankChunks(
  chunks: Chunk[],
  queryVector: number[],
  topK: number = DEFAULT_TOP_K,
): ScoredChunk[] {
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Retrieves the chunks most similar to `query` from one document.
 *
 * Scoped to a single document, which is both what spec §6 asks for and what
 * keeps one user's chunks away from another's — the document was already
 * authorised by the caller.
 *
 * ponytail: loads the document's chunks and scores them in memory. Fine at a
 * few hundred chunks per PDF; swap in an Atlas `$vectorSearch` index if latency
 * becomes visible, which is the upgrade spec §6 anticipates.
 */
export async function retrieveChunks(
  documentId: ObjectId,
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<ScoredChunk[]> {
  const col = await chunksCollection();
  const all = await col.find({ documentId }).toArray();
  if (all.length === 0) return [];

  // Same model as indexing, so both vectors live in the same space.
  const queryVector = await embedQuery(query);
  return rankChunks(all, queryVector, topK);
}
