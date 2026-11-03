# Study notes redesign: full-document notes in the style of a student's revision notes

Date: 2026-11-03 · Status: draft for approval

## Intent and why

Today's "Study notes" are 3-6 cards of 2-5 short bullets built from only the 5
chunks most similar to a generic query (`DEFAULT_TOP_K = 5`). The user finds
them "too little and odd". They want what a good AI chat model (or a diligent
classmate) produces when asked to summarise a lecture PDF: notes that cover the
**whole document**, organised by the document's own structure, detailed enough
to revise from. The user supplied an example, an 11-page "HCI Mid-Term Revision
Notes", as the target for content and structure.

## What the notes look like (user's decision: layout "B", colour-coded cards)

Keep the existing EduBot card look (pastel tone cycling, Fredoka headings,
rounded cards). Make the content fuller:

- **Chapter headings** when the PDF has chapters/parts (e.g. "Chapter 3:
  Cognitive Models"); one **card per subtopic** under it. With no chapters, cards
  are grouped by theme (rule from the earlier session: follow the PDF's own
  subtopics if it has them, otherwise categorise by related knowledge).
- Inside a card, any mix of:
  - **bullets with a bold lead label** ("Why study it: users expect…");
  - **numbered lists** for steps, stages, procedures;
  - **comparison tables** where the source compares things (2-4 columns);
  - **bold key terms and numbers** inline (`**term**`, rendered as text nodes,
    never as markup).
- A final card, **"Quick memory list"**: the key numbers, counts and one-line
  distinctions a student would memorise.
- Every bullet, list and table carries a **page chip** ("p.6", "pp.6-7"). Clicking
  it shows the original PDF excerpt, as today. **No "+"/"−" glyph on the chip**
  (already removed in `summary-panel.tsx`, uncommitted).
- Notes cover the **entire PDF, start to finish**, however long. The user
  accepted a wait of a minute or two and a long page.

## Goals

1. Coverage: every subtopic in the PDF appears; none merged away or dropped.
2. Grounded: only facts from the PDF; each unit traceable to a source chunk and
   page (spec §9).
3. Readable like the example: structure beats paragraphs; bold leads; tables
   for comparisons.
4. Works for prose chapters and for sparse slide decks.

## Non-goals

Editing notes in place, export or download, reproducing figures or images from
the PDF, live streaming of partial notes, per-chunk progress bar, changing the
quiz pipeline.

## Anti-goals (failure even if it "works")

Invented facts or numbers; a subtopic silently missing; one giant wall of text;
table cells that don't match the source; duplicated cards from overlapping
chunks; a half-finished document presented as complete.

## Constraints

- Stack stays: Next.js (read `node_modules/next/dist/docs/` first, per
  `AGENTS.md`), MongoDB, OpenAI `gpt-4o-mini` (spec §3). **No new dependencies.**
- **Spec deviation, approved by the user:** summary no longer uses top-k
  retrieval (spec §6); it reads all of the document's chunks in order. Quiz
  generation keeps top-k retrieval unchanged. Chunking params unchanged.
- Citations: every unit keeps a `chunkId` + `sourcePage`/`endPage`; the model
  answers with an excerpt *number* (enum-constrained under strict structured
  outputs), mapped back to ids server-side, as in `summarise.ts` today.
- `maxDuration = 300` on the summary route is the ceiling on Vercel; request and
  response bodies stay under 4.5 MB.
- Old summaries already stored (flat `points`) must still render. The Mongo
  validator for `summaries` currently requires `points`; the builder must keep
  old docs valid and decide how new docs satisfy or relax it
  (`src/lib/schema.ts`, `ensureSetup`).
- Accessibility basics: tables get real `<table>`/`<th>` markup, scroll
  horizontally on narrow screens; page chips keep `aria-expanded`.

## Decided by the user

Layout B (cards); whole-document coverage; page chip without plus sign; style
modelled on `notes_example.pdf` (bold-lead bullets, numbered lists, tables,
closing memory list).

## Left to the builder (my suggestions, not decisions)

- **Whole-document strategy:** a single call won't do for long PDFs (output cap,
  quality). Suggested: walk chunks in order, group into batches of roughly 6
  (about 3,000 words), call the model once per batch with limited concurrency
  (about 4), merge results in order, and merge adjacent sections that share a
  chapter and heading across batch boundaries. Then one cheap final call
  produces the memory list from the finished notes; each memory item points at a
  notes unit it came from and inherits its citation.
- **Output schema:** strict JSON schema with sections → blocks, block kinds
  `bullets | steps | table`, each with a `source` enum. Unit tests/mutations as
  in the repo's `*.check.mts` style.
- **Storage shape:** a nested `sections` structure on the summary document is
  fine; new `Summary` type should stay the source of truth in `schema.ts`;
  `getSummaryWithSources` in `queries.ts` must join source text for all
  units; `SummaryPanel` keeps rendering the legacy shape.
- **Overlap handling:** chunks overlap about 12%; tell the model not to repeat
  facts already covered, and drop exact duplicates after merging.
- **Failure policy (my call):** retry a failed batch once; if it still fails,
  fail the whole generation with a clear message. Never store partial notes.
- **Size ceiling (my call):** cap at about 40 batches (roughly 240 chunks, 120
  pages of dense prose); beyond that, return a clear "too long to summarise in
  one go" message rather than time out.
- **Checks:** one runnable `check:summary` script for the pure parts (batching,
  section merging, source-to-chunk mapping, rejecting out-of-range sources),
  wired into `package.json` like the others.
- Tone cycling for cards, table styling, mobile layout, loading copy
  ("Reading section 3 of 8…" is optional).

## Calls made after the builder check (the author's calls, not the user's)

- **Subtopic detection (my call):** the model infers chapter and subtopic
  headings per batch. Adjacent sections are merged when their chapter and heading
  match after normalising case, punctuation and whitespace. Each batch must return
  at least one unit, and every chunk must be covered by some batch, so a whole
  stretch of the PDF can't silently vanish. Upgrade path if headings come out
  inconsistent on real PDFs: a first outline pass that batches then fill in.
- **Memory list citations (my call):** one source per item. An item that can't be
  tied to a single notes unit is dropped.
- **Regenerating (my call):** "Write again" adds a new summary and the newest one
  is shown (as `getLatestSummary` already does); old ones are kept, not deleted.
  The button stays disabled while a run is in progress.
- **Request model (my call):** one long request, no background job or polling.
  Known cost: closing the tab mid-run loses that run and its OpenAI spend. A job
  with polling is the upgrade if that bites.
- **Tables and the extractor (checked):** running the real extractor on
  `notes_example.pdf` shows tables flattened to one text line per row with cells
  separated by single spaces (e.g. "Command line Direct, good for experts and
  repetitive tasks,"). Column boundaries are therefore ambiguous. The prompt must
  allow a `table` block only when the excerpt clearly has a header row and
  consistent rows, and must otherwise fall back to bullets. Never guess cells.

## Success

Uploading the HCI lecture PDF and clicking "Write notes" yields notes that
cover every chapter and subtopic in order, in cards that use bold-lead bullets,
numbered steps and tables like the example, ending in a memory list, with every
unit's page chip opening the right source text.
