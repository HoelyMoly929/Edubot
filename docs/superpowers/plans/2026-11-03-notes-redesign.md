# Full-Document Study Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Write notes" produces revision notes covering the whole PDF: chapters, colour-coded subtopic cards with bold-lead bullets, numbered steps, tables and a closing memory list, every unit cited to a page.

**Architecture:** Load all of a document's chunks in order, split into batches of 6, call `gpt-4o-mini` once per batch (4 at a time, one retry) for structured sections, merge adjacent same-title sections, then one final call writes the memory list. Pure helpers live in `notes-structure.ts` so they are testable without the API. Notes are stored as `sections` on the existing `summaries` document; old flat `points` summaries keep rendering.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routes/components, per `AGENTS.md`), MongoDB, OpenAI SDK already installed, Tailwind v4. Tests are the repo's `*.check.mts` scripts (`node:assert`), no framework.

**Spec:** `docs/superpowers/specs/2026-11-03-notes-redesign-design.md`

## Global Constraints

- No new dependencies. Model stays `gpt-4o-mini` (`GENERATION_MODEL`, still exported from `summarise.ts`; `quiz.ts` imports it).
- Summary reads ALL chunks in `position` order (approved deviation from spec §6 top-k). Quiz retrieval and chunking params are untouched.
- Every unit keeps `chunkId` + `sourcePage` (+ `endPage`). The model returns an excerpt *number* (enum-constrained, strict structured outputs); ids are mapped server-side.
- `**term**` in model text renders as bold via React text nodes, never as markup.
- Batch size 6 chunks, concurrency 4, retry a failed batch once, then fail the whole run. Never store partial notes. Cap 40 batches (240 chunks) then a clear 422 message.
- Table block only when the excerpt clearly has a header row and consistent rows; a table with ragged rows is converted to bullets server-side, never padded or guessed.
- Memory list: one source per item; items that can't be tied to one unit are dropped.
- New summary docs store `points: []` plus `sections`, so the existing Mongo validator (`points` required) needs no change. `maxDuration = 300` stays.
- Page chips show the page number only (no `+`/`−`), keep `aria-expanded`, and still reveal the source excerpt.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A PDF with no headings (slide deck): sections still come back, `chapter` undefined, no crash. (Task 1 test)
2. Same heading across a batch boundary with different case/punctuation ("The Human" / "the human."): merged into one card. (Task 1 test)
3. Flattened table with ragged rows: becomes bullets, no invented cells. (Task 1 test)
4. Model returns an out-of-range source, empty text, or a batch with zero valid blocks: bad units dropped; an empty batch is retried then fails the run, never a silent gap. (Tasks 1, 2 tests)
5. Legacy summary (points only, no `sections`) still renders; a new doc with `points: []` and `sections` is accepted by the validator. (Task 3 check, Task 4 preview)
6. One-chunk document, and a document over the 240-chunk cap. (Task 1, 2 tests)
7. Model text containing `<script>` or stray `**`: shown as text. (Task 4 preview)

---

## File Structure

- Modify `src/lib/schema.ts`: note types, optional `sections` on `Summary`.
- Create `src/lib/notes-structure.ts`: pure helpers (batching, merging, resolving model output).
- Create `src/lib/notes.check.mts`; add `check:notes` to `package.json`.
- Modify `src/lib/summarise.ts`: prompts, strict schema, `generateNotes`.
- Modify `src/lib/retrieve.ts`: add `loadChunks`.
- Modify `src/app/api/documents/[id]/summary/route.ts`: POST uses `loadChunks` + `generateNotes`.
- Modify `src/lib/queries.ts`: `getSummaryWithSources` returns sections + a `sources` map.
- Create `src/app/documents/[id]/notes-view.tsx`; modify `summary-panel.tsx`, `page.tsx`.

### Task 1: Types and pure structure helpers

**Files:** Modify `src/lib/schema.ts`; Create `src/lib/notes-structure.ts`, `src/lib/notes.check.mts`; Modify `package.json`.

**Interfaces:**
- Produces (schema.ts):
  ```ts
  export interface NoteCite { chunkId: ObjectId; sourcePage: number; endPage?: number }
  export type NoteBlock =
    | ({ kind: "bullet"; lead?: string; text: string } & NoteCite)
    | ({ kind: "steps"; title?: string; items: string[] } & NoteCite)
    | ({ kind: "table"; columns: string[]; rows: string[][] } & NoteCite);
  export interface NoteSection { chapter?: string; heading: string; memory?: boolean; blocks: NoteBlock[] }
  ```
  and `Summary.sections?: NoteSection[]` (`points` stays required, doc comment says legacy/empty).
- Produces (notes-structure.ts):
  ```ts
  export const BATCH_SIZE = 6; export const MAX_BATCHES = 40;
  export class NotesTooLongError extends Error {}
  export function batchChunks<T>(items: T[], size?: number, maxBatches?: number): T[][]; // throws NotesTooLongError
  export interface RawBlock { kind: "bullet"|"steps"|"table"; lead: string; text: string; items: string[]; columns: string[]; rows: string[][]; source: number }
  export interface RawSection { chapter: string; heading: string; blocks: RawBlock[] }
  export function resolveSections(raw: RawSection[], batch: Chunk[]): NoteSection[];
  export function mergeSections(sections: NoteSection[]): NoteSection[];
  ```
  `resolveSections` takes the batch's chunks (excerpt `n` = `chunks[n-1]`), drops blocks with out-of-range source or empty content, converts ragged-row tables to bullets (lead = first cell, text = remaining cells joined with "; "), maps empty-string `chapter`/`lead`/`title` to undefined, drops sections left with no blocks.

- [ ] **Step 1: Write failing checks** in `notes.check.mts` (style of `retrieve.check.mts`): `batchChunks` 13 items → sizes `[6,6,1]` in order; 1 item → one batch; 241 chunks throws `NotesTooLongError`; `resolveSections` drops `source: 99` and empty text, keeps others with right `chunkId`/pages; ragged table (rows of 2 and 3 cells) becomes bullets, a consistent table stays a table with same cells; empty `chapter` → undefined; section with all blocks dropped is removed; `mergeSections` merges "The Human" + "the human." (same chapter), keeps them apart when chapters differ, merges blocks in order, and leaves chapter-less sections alone.
- [ ] **Step 2:** Add `"check:notes": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/notes.check.mts"`; run `npm run check:notes`. Expected: FAIL (module missing).
- [ ] **Step 3:** Add types to `schema.ts`; implement helpers in `notes-structure.ts`. Heading equality = lowercase, strip non-alphanumerics, collapse whitespace.
- [ ] **Step 4:** Run `npm run check:notes`. Expected: PASS. Do a mutation check: break the heading normaliser, confirm FAIL, restore.
- [ ] **Step 5:** Commit `feat: note types and pure structure helpers`.

### Task 2: Generator

**Files:** Modify `src/lib/summarise.ts`, `src/lib/retrieve.ts`; Modify `src/lib/notes.check.mts`.

**Interfaces:**
- Consumes: Task 1 helpers and types.
- Produces:
  ```ts
  // retrieve.ts
  export async function loadChunks(documentId: ObjectId): Promise<Chunk[]>; // sorted by position
  // summarise.ts
  export interface NotesDeps { batch(chunks: Chunk[]): Promise<RawSection[]>; memory(units: NoteBlock[]): Promise<{ text: string; unit: number }[]> }
  export async function generateNotes(chunks: Chunk[], deps?: NotesDeps): Promise<NoteSection[]>;
  ```
  Remove `generateSummary`, `SummaryPoint`, `SUMMARY_QUERY` (route is their only user; confirm with grep). Keep `GENERATION_MODEL`.

- [ ] **Step 1: Write failing checks** with fake `deps`: batches run and results come back in chunk order even if later batches finish first; a batch that throws once is retried and succeeds; a batch that throws twice rejects the whole run; a batch whose resolved sections are empty counts as failure (retry, then reject); memory items become a final section `{ heading: "Quick memory list", memory: true }` whose blocks inherit the cite of `units[unit-1]`, with out-of-range units dropped and the section omitted if nothing survives; empty `chunks` returns `[]`.
- [ ] **Step 2:** Run `npm run check:notes`. Expected: new assertions FAIL.
- [ ] **Step 3: Implement.** `generateNotes` = `batchChunks` → `mapLimit(batches, 4, withRetry(batchFn))` → `resolveSections` per batch → flatten → `mergeSections` → memory call over a flat numbered list of bullet/steps/table units → append memory section. Default `deps` call OpenAI with `response_format` strict json_schema; schema built per call so `source` is an `enum` of `1..n`; all block fields required (unused ones empty string/array); `temperature: 0.2`. Excerpts are numbered `[n]` with no page numbers (same reason as today's code comment).
- [ ] **Step 4: Write the prompts** (constants in `summarise.ts`). Batch prompt must say: use only the excerpts; make each subtopic its own section using the document's own names and order; if no headings, group by theme; set `chapter` only when the material labels chapters/parts; block kinds and when to use each (bold-lead bullet `Label: text`, numbered `steps` for sequences, `table` only with a clear header row and consistent rows, else bullets); `**bold**` key terms and numbers; do not repeat facts the overlap makes visible twice; one `source` per block. Memory prompt: pick the numbers, counts and one-line distinctions worth memorising, one `unit` each.
- [ ] **Step 5:** Run `npm run check:notes`. Expected: PASS.
- [ ] **Step 6: Live check** (needs `.env.local`): scratch script in the scratchpad dir extracts and chunks `/Users/hoelymoly929/Documents/notes_example.pdf` with `extractPdf` + the chunker (no DB), runs `generateNotes`, prints chapters, headings, block kinds per section. Expected: the 4 chapters and their subtopics appear in order (Introduction to HCI, The Human, The Computer, The Interaction, ..., Design Rationale), at least one `steps` and one `table`, a memory section; no table with mismatched cell counts. Fix prompts if not, then rerun.
- [ ] **Step 7:** Commit `feat: whole-document notes generator`.

### Task 3: Route and read path

**Files:** Modify `src/app/api/documents/[id]/summary/route.ts`, `src/lib/queries.ts`.

**Interfaces:**
- Consumes: `loadChunks`, `generateNotes`, `NotesTooLongError`.
- Produces: POST stores `{ documentId, points: [], sections, createdAt }`; 422 `{ error }` for `NotesTooLongError` ("This document is too long to write notes for in one go."). `getSummaryWithSources` returns:
  ```ts
  { createdAt: Date; points: CitedPoint[]; sections?: CitedSection[]; sources: Record<string, string> }
  // CitedSection / CitedBlock = NoteSection / NoteBlock with chunkId: string; sources maps chunkId → excerpt text
  ```
  `endPage` prefers the chunk's own range, as today.

- [ ] **Step 1:** In the route, drop the `query`/`topK` body handling; POST loads chunks (409 if none), calls `generateNotes`, maps errors as above, keeps existing 409/502 behaviour.
- [ ] **Step 2:** Update `getSummaryWithSources`: collect chunk ids from `sections` (and `points` for legacy), one `find`, build `sources`; stringify ids.
- [ ] **Step 3:** Verify `npx next build` passes (type errors surface in `page.tsx`/`summary-panel.tsx`; fix props only as far as needed to compile, UI comes in Task 4).
- [ ] **Step 4:** Commit `feat: notes route and cited read path`.

### Task 4: Notes UI (layout B)

**Files:** Create `src/app/documents/[id]/notes-view.tsx`; Modify `summary-panel.tsx`, `page.tsx`.

**Interfaces:**
- Consumes: `CitedSection[]`, `sources`.
- Produces: `NotesView({ sections, sources }: { sections: CitedSection[]; sources: Record<string, string> })`. `SummaryPanel`'s `initialSummary` becomes `{ points, sections?, sources, createdAt } | null`; it renders `NotesView` when `sections` exists, otherwise today's legacy cards unchanged.

- [ ] **Step 1:** `NotesView`: chapter heading row whenever `chapter` changes between consecutive sections; one card per section using the existing `TONES` cycle (memory card uses the `sun` colour); consecutive `bullet` blocks share one `<ul>` with the bold `lead` then text; `steps` as `<ol>` with optional title; `table` as `<table>` with `<th scope="col">` header row inside an `overflow-x-auto` wrapper; text goes through the existing `**` bold helper (move it to a shared spot only if both files need it); each block ends with the page chip (`formatPages`), `aria-expanded`, toggling an excerpt `<blockquote>` from `sources`, keyed by `${section index}-${block index}`.
- [ ] **Step 2:** Update loading copy to "Reading the document and writing notes. This can take a minute or two." and the empty-state copy to mention chapters, tables and a memory list.
- [ ] **Step 3: Visual check.** Add a temporary route with a fixture (a chapter, a bullets card, a steps card, a table card, a memory card, a block containing `<script>` and a stray `**`, plus a legacy flat-points summary), screenshot at 1280px and 390px with Playwright. Expected: cards readable, tables scroll sideways on mobile without page overflow, `<script>` shown as text, no `+`/`−` on chips, legacy cards unchanged. Delete the temporary route.
- [ ] **Step 4:** Run the design detector on changed files, `npx next build`, all `npm run check:*` that need no DB. Expected: clean.
- [ ] **Step 5:** Commit `feat: revision-notes cards for study notes`.

### Task 5: Ship

- [ ] **Step 1:** `git push`; confirm the Vercel deployment goes live (build id changes).
- [ ] **Step 2:** Tell the user: open the HCI document on the live site, click **Write again**, expect a one to two minute wait; old notes stay until regenerated.
