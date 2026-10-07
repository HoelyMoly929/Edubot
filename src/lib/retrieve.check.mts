/**
 * Self-check for retrieval ranking. Run: `npm run check:retrieve`
 *
 * Pure maths, no API calls. If cosine similarity or the top-k ordering is
 * wrong, every summary and quiz question is grounded in the wrong chunk —
 * silently, because the output still looks plausible.
 */
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { cosineSimilarity, rankChunks, DEFAULT_TOP_K } from "./retrieve.ts";
import type { Chunk } from "./schema.ts";

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

// --- cosine similarity ----------------------------------------------------

assert.ok(close(cosineSimilarity([1, 0], [1, 0]), 1), "identical vectors → 1");
assert.ok(close(cosineSimilarity([1, 0], [0, 1]), 0), "orthogonal vectors → 0");
assert.ok(close(cosineSimilarity([1, 0], [-1, 0]), -1), "opposite vectors → -1");
// Magnitude must not affect direction-based similarity.
assert.ok(close(cosineSimilarity([1, 1], [5, 5]), 1), "scale invariant");
assert.equal(cosineSimilarity([0, 0], [1, 1]), 0, "zero vector → 0, not NaN");
assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /length mismatch/, "dimension guard");

// --- ranking --------------------------------------------------------------

const chunk = (id: number, embedding: number[]): Chunk => ({
  _id: new ObjectId(),
  documentId: new ObjectId(),
  text: `chunk ${id}`,
  position: id,
  sourcePage: id + 1,
  embedding,
});

const corpus = [
  chunk(0, [1, 0, 0]), // orthogonal to query
  chunk(1, [0, 1, 0]), // exact match
  chunk(2, [0, 0.9, 0.1]), // near match
  chunk(3, [0, -1, 0]), // opposite
];
const query = [0, 1, 0];

const ranked = rankChunks(corpus, query, 3);
assert.equal(ranked.length, 3, "topK must limit results");
assert.equal(ranked[0].chunk.position, 1, "exact match ranks first");
assert.equal(ranked[1].chunk.position, 2, "near match ranks second");
// Descending order is what slice() relies on to take the *best* k, not any k.
for (let i = 1; i < ranked.length; i++) {
  assert.ok(ranked[i - 1].score >= ranked[i].score, "scores must descend");
}
// The opposite vector is the worst match and must be cut by topK=3.
assert.ok(!ranked.some((r) => r.chunk.position === 3), "worst match excluded");

assert.equal(rankChunks(corpus, query).length, Math.min(DEFAULT_TOP_K, corpus.length));
assert.equal(rankChunks([], query).length, 0, "empty corpus → no results");
assert.ok(DEFAULT_TOP_K >= 4 && DEFAULT_TOP_K <= 6, "spec §6 requires k ≈ 4–6");

console.log(`OK — retrieval ranks correctly (default k=${DEFAULT_TOP_K}, spec §6)`);
