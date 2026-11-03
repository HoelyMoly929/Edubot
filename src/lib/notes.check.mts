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
import { generateNotes, type NotesDeps } from "./summarise.ts";
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

const thirteen = Array.from({ length: 13 }, (_, i) => i);
assert.deepEqual(
  batchChunks(thirteen, 6).map((b) => b.length),
  [6, 6, 1],
  "13 items in sixes → 6,6,1",
);
assert.deepEqual(
  batchChunks(thirteen).map((b) => b.length),
  [...Array(Math.floor(13 / BATCH_SIZE)).fill(BATCH_SIZE), ...(13 % BATCH_SIZE ? [13 % BATCH_SIZE] : [])],
  "default batch size, remainder last",
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

// The same chapter spelled differently by two batches renders as one chapter.
const respelled = mergeSections([
  sec("GOMS", "Chapter 3: Cognitive Models", "a"),
  sec("goms.", "CHAPTER 3 - cognitive models", "b"),
  sec("KLM", "CHAPTER 3 - cognitive models", "c"),
]);
assert.deepEqual(
  respelled.map((s) => s.chapter),
  Array(2).fill("Chapter 3: Cognitive Models"),
  "chapter keeps its first spelling",
);
assert.equal(respelled.length, 2, "GOMS merged, KLM separate");

// A batch that starts mid-chapter has no chapter label: inherit the previous one.
const inherited = mergeSections([
  sec("Intro", "Chapter 1"),
  sec("Next topic", undefined, "x"),
  sec("Another", "Chapter 2", "y"),
  sec("After", undefined, "z"),
]);
assert.deepEqual(
  inherited.map((s) => s.chapter),
  ["Chapter 1", "Chapter 1", "Chapter 2", "Chapter 2"],
  "chapter carries forward until the next one",
);


// --- generateNotes (fake model) ------------------------------------------

const doc = Array.from({ length: 13 }, (_, i) => chunk(i));
const starts = Array.from({ length: Math.ceil(13 / BATCH_SIZE) }, (_, i) => i * BATCH_SIZE);
const B = BATCH_SIZE; // second batch starts here
const one = (heading: string, source = 1): RawSection[] => [
  { chapter: "", heading, blocks: [raw({ text: `${heading} note`, source })] },
];
const headingOf = (n: NoteSection[]) => n.map((x) => x.heading);
const noMemory = async () => [];

// Order follows the document even when later batches finish first.
{
  const deps: NotesDeps = {
    batch: async (cs) => {
      await new Promise((r) => setTimeout(r, cs[0].position === 0 ? 40 : 1));
      return one(`B${cs[0].position}`);
    },
    memory: noMemory,
  };
  assert.deepEqual(headingOf(await generateNotes(doc, deps)), starts.map((p) => `B${p}`), "document order");
}

// A failed batch is retried once.
{
  const calls = new Map<number, number>();
  const deps: NotesDeps = {
    batch: async (cs) => {
      const n = (calls.get(cs[0].position) ?? 0) + 1;
      calls.set(cs[0].position, n);
      if (cs[0].position === B && n === 1) throw new Error("rate limited");
      return one(`B${cs[0].position}`);
    },
    memory: noMemory,
  };
  assert.deepEqual(headingOf(await generateNotes(doc, deps)), starts.map((p) => `B${p}`), "retry recovers");
  assert.equal(calls.get(B), 2, "retried exactly once");
}

// Failing twice, or returning nothing usable, fails the whole run: no silent gap.
await assert.rejects(
  generateNotes(doc, {
    batch: async (cs) => {
      if (cs[0].position === B) throw new Error("down");
      return one("ok");
    },
    memory: noMemory,
  }),
  /down/,
  "second failure rejects the run",
);
await assert.rejects(
  generateNotes(doc, { batch: async () => one("bad", 99), memory: noMemory }),
  "a batch with no valid blocks rejects the run",
);

// Memory list inherits the cited unit's source; bad units are dropped.
{
  let seen: NoteBlock[] = [];
  const notes = await generateNotes(doc.slice(0, 2), {
    batch: async () => one("The Human", 2),
    memory: async (units) => {
      seen = units;
      return [
        { text: "**7 ± 2** chunks", unit: 1 },
        { text: "cites nothing real", unit: 50 },
      ];
    },
  });
  assert.equal(seen.length, 1, "memory call sees the notes' units");
  const last = notes.at(-1)!;
  assert.equal(last.memory, true);
  assert.equal(last.heading, "Quick memory list");
  assert.equal(last.blocks.length, 1, "unit 50 dropped");
  assert.equal(last.blocks[0].chunkId.toString(), doc[1]._id.toString(), "inherits unit 1's chunk");
}

// The memory list is an extra: if its call fails twice the notes still ship.
{
  let calls = 0;
  const notes = await generateNotes(doc.slice(0, 2), {
    batch: async () => one("Kept"),
    memory: async () => {
      calls++;
      throw new Error("schema rejected");
    },
  });
  assert.deepEqual(headingOf(notes), ["Kept"], "notes survive a failed memory call");
  assert.equal(calls, 2, "memory call was retried once");
}

// No surviving memory items → no memory section.
{
  const notes = await generateNotes(doc.slice(0, 1), {
    batch: async () => one("Only"),
    memory: async () => [{ text: "x", unit: 9 }],
  });
  assert.deepEqual(headingOf(notes), ["Only"]);
}

assert.deepEqual(await generateNotes([], { batch: noMemory as never, memory: noMemory }), [], "no chunks → no notes");

console.log("notes: all checks passed");
