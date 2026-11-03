/**
 * Self-check for the notes pipeline's pure parts. Run: `npm run check:notes`
 *
 * No API calls. If batching, merging or source-mapping is wrong, notes lose
 * whole stretches of the PDF or cite the wrong page, and still look plausible.
 */
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
  BATCH_SIZE,
  MAX_BATCHES,
  NotesTooLongError,
  batchChunks,
  mergeSections,
  resolveSections,
  type RawBlock,
  type RawSection,
} from "./notes-structure.ts";
import type { Chunk, NoteBlock, NoteSection } from "./schema.ts";

const chunk = (n: number): Chunk => ({
  _id: new ObjectId(),
  documentId: new ObjectId(),
  text: `chunk ${n}`,
  position: n,
  sourcePage: n + 1,
  endPage: n + 2,
  embedding: [],
});

const raw = (over: Partial<RawBlock>): RawBlock => ({
  kind: "bullet",
  lead: "",
  text: "",
  items: [],
  columns: [],
  rows: [],
  source: 1,
  ...over,
});

// --- batching -------------------------------------------------------------

assert.equal(BATCH_SIZE, 6);
const thirteen = Array.from({ length: 13 }, (_, i) => i);
assert.deepEqual(
  batchChunks(thirteen).map((b) => b.length),
  [6, 6, 1],
  "13 items → 6,6,1",
);
assert.deepEqual(batchChunks(thirteen).flat(), thirteen, "order preserved");
assert.deepEqual(batchChunks([7]), [[7]], "one chunk → one batch");
assert.deepEqual(batchChunks([]), [], "no chunks → no batches");
assert.equal(batchChunks(Array(BATCH_SIZE * MAX_BATCHES).fill(0)).length, MAX_BATCHES, "at the cap is fine");
assert.throws(
  () => batchChunks(Array(BATCH_SIZE * MAX_BATCHES + 1).fill(0)),
  NotesTooLongError,
  "over the cap throws",
);

// --- resolving model output ----------------------------------------------

const batch = [chunk(0), chunk(1)];

const resolved = resolveSections(
  [
    {
      chapter: "",
      heading: "The Human",
      blocks: [
        raw({ lead: "Slip", text: "right intention, wrong execution", source: 2 }),
        raw({ text: "cites a chunk we never sent", source: 99 }),
        raw({ text: "   ", source: 1 }),
      ],
    },
    { chapter: "Chapter 1", heading: "Empty after cleaning", blocks: [raw({ text: "", source: 1 })] },
  ],
  batch,
);
assert.equal(resolved.length, 1, "section with no valid blocks is removed");
assert.equal(resolved[0].chapter, undefined, "empty chapter → undefined (slide decks)");
assert.equal(resolved[0].blocks.length, 1, "out-of-range source and empty text dropped");
const kept = resolved[0].blocks[0] as Extract<NoteBlock, { kind: "bullet" }>;
assert.equal(kept.lead, "Slip");
assert.equal(kept.chunkId.toString(), batch[1]._id.toString(), "source 2 → second chunk");
assert.equal(kept.sourcePage, batch[1].sourcePage);
assert.equal(kept.endPage, batch[1].endPage);

const withTables = resolveSections(
  [
    {
      chapter: "",
      heading: "Tables",
      blocks: [
        raw({ kind: "table", columns: ["Style", "Key points"], rows: [["Menus", "Options visible"], ["Command line", "Direct", "extra cell"]] }),
        raw({ kind: "table", columns: ["A", "B"], rows: [["1", "2"], ["3", "4"]] }),
      ],
    },
  ],
  batch,
)[0].blocks;
assert.equal(withTables[0].kind, "bullet", "ragged table becomes bullets, no invented cells");
assert.equal((withTables[0] as { lead?: string }).lead, "Menus");
assert.deepEqual(withTables.map((b) => b.kind), ["bullet", "bullet", "table"], "two rows → two bullets, then the intact table");
const intact = withTables.find((b) => b.kind === "table") as Extract<NoteBlock, { kind: "table" }>;
assert.deepEqual(intact.rows, [["1", "2"], ["3", "4"]], "table cells untouched");

// --- merging across batch boundaries -------------------------------------

const bullet = (text: string): NoteBlock => ({
  kind: "bullet",
  text,
  chunkId: new ObjectId(),
  sourcePage: 1,
});
const sec = (heading: string, chapter: string | undefined, ...texts: string[]): NoteSection => ({
  chapter,
  heading,
  blocks: texts.map(bullet),
});

const merged = mergeSections([
  sec("The Human", "Chapter 1", "a"),
  sec("the human.", "Chapter 1", "b"),
  sec("The Human", "Chapter 2", "c"),
  sec("Slides", undefined, "d"),
  sec("Slides", undefined, "e"),
]);
assert.equal(merged.length, 3, "same chapter+heading merge; different chapter does not");
assert.deepEqual(merged[0].blocks.map((b) => (b as { text: string }).text), ["a", "b"], "blocks stay in order");
assert.equal(merged[0].heading, "The Human", "first spelling wins");
assert.equal(merged[2].blocks.length, 2, "chapter-less sections merge too");

console.log("notes: all checks passed");
