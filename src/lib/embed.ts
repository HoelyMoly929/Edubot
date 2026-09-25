import OpenAI from "openai";

/**
 * Chunk and query embeddings must share a model, or cosine similarity compares
 * vectors from different spaces and retrieval silently degrades (spec §6).
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Keeps request bodies well inside the API's per-request input limits. */
const BATCH_SIZE = 64;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
  }
  return (client ??= new OpenAI({ apiKey }));
}

/**
 * Embeds texts in batches, returning vectors in the same order as the input —
 * chunk N's embedding must line up with chunk N.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getClient();
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    // Documented to come back in input order; sorted anyway because a silent
    // mis-pairing here would misattribute every citation downstream.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new Error(`Embedding count mismatch: sent ${batch.length}, got ${ordered.length}`);
    }
    vectors.push(...ordered.map((item) => item.embedding));
  }

  return vectors;
}

/** Embeds a single retrieval query, in the same vector space as the chunks. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
