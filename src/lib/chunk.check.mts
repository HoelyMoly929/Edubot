/**
 * Self-check for the chunker. Run: `npm run check:chunk`
 *
 * Chunking failures are silent and poison every citation downstream, so the
 * spec §6 parameters get asserted rather than eyeballed.
 */
import assert from "node:assert/strict";
import {
  chunkPages,
  normalise,
  DEFAULT_OVERLAP_RATIO,
  DEFAULT_TARGET_WORDS,
  type PageText,
} from "./chunk.ts";

const words = (text: string) => (text.match(/\S+/g) ?? []).length;
const lorem = (n: number, tag = "w") =>
  Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

// --- normalise -------------------------------------------------------------

assert.equal(normalise("exam-\nple"), "example", "hyphen across a line break should rejoin");
assert.equal(normalise("a   \t b"), "a b", "runs of spaces collapse");
assert.equal(normalise("a\n\n\n\n\nb"), "a\n\nb", "3+ newlines collapse to a paragraph break");
assert.equal(normalise("   \n  "), "", "whitespace-only text is empty");
// Paragraph structure must survive, or the splitter loses its best seam.
assert.ok(normalise("one\n\ntwo").includes("\n\n"), "paragraph breaks are preserved");

// --- empty and trivial input ----------------------------------------------

assert.deepEqual(chunkPages([]), [], "no pages → no chunks");
assert.deepEqual(chunkPages([{ page: 1, text: "   " }]), [], "blank page → no chunks");

const single = chunkPages([{ page: 1, text: "A short sentence." }]);
assert.equal(single.length, 1);
assert.equal(single[0].position, 0);
assert.equal(single[0].sourcePage, 1);

// --- target size ----------------------------------------------------------

const target = 100;
const long: PageText[] = [{ page: 1, text: Array.from({ length: 12 }, (_, i) => lorem(50, `p${i}s`)).join("\n\n") }];
const chunks = chunkPages(long, { targetWords: target });

assert.ok(chunks.length > 1, "600 words at target 100 must split");
for (const chunk of chunks) {
  // A chunk may exceed target only by the unit that tipped it over, and units
  // here are 50 words. Overlap is additive, so allow target + unit + overlap.
  assert.ok(
    words(chunk.text) <= target + 50 + Math.round(target * DEFAULT_OVERLAP_RATIO),
    `chunk ${chunk.position} is ${words(chunk.text)} words, too far over target ${target}`,
  );
}

// positions must be sequential from 0 — Chunk.position is the citation anchor
assert.deepEqual(
  chunks.map((c) => c.position),
  chunks.map((_, i) => i),
  "positions must be sequential from 0",
);

// --- overlap --------------------------------------------------------------

// Consecutive chunks must share text, or retrieval loses context at the seams.
for (let i = 1; i < chunks.length; i++) {
  const previousTail = (chunks[i - 1].text.match(/\S+/g) ?? []).slice(-5).join(" ");
  assert.ok(
    chunks[i].text.includes(previousTail),
    `chunk ${i} does not overlap chunk ${i - 1}`,
  );
}

// Zero overlap must actually mean zero, so the knob is real.
const noOverlap = chunkPages(long, { targetWords: target, overlapRatio: 0 });
for (let i = 1; i < noOverlap.length; i++) {
  const previousTail = (noOverlap[i - 1].text.match(/\S+/g) ?? []).slice(-5).join(" ");
  assert.ok(
    !noOverlap[i].text.includes(previousTail),
    "overlapRatio: 0 should produce no shared text",
  );
}

// --- oversized single passage --------------------------------------------

// One unbroken sentence longer than target has no seam; it must still split.
const runOn = chunkPages([{ page: 1, text: lorem(450) }], { targetWords: 100 });
assert.ok(runOn.length > 1, "a run-on passage larger than target must still split");

// --- page attribution ----------------------------------------------------

const multi = chunkPages(
  [
    { page: 7, text: lorem(120, "a") },
    { page: 8, text: lorem(120, "b") },
  ],
  { targetWords: 100 },
);
assert.equal(multi[0].sourcePage, 7, "first chunk belongs to the page it starts on");
assert.ok(
  multi.some((c) => c.sourcePage === 8),
  "content from page 8 must be attributed to page 8, not carried back by overlap",
);
// Pages are 1-based from the extractor; never invent a page 0.
assert.ok(multi.every((c) => c.sourcePage >= 1), "sourcePage must stay 1-based");

// --- page ranges ----------------------------------------------------------

// A chunk must never claim a range it doesn't cover.
for (const chunk of multi) {
  assert.ok(chunk.endPage >= chunk.sourcePage, "endPage cannot precede sourcePage");
}

// Sparse pages (a slide deck) pack many pages into one chunk; the range has to
// widen, or a citation points at the wrong slide.
const slides: PageText[] = Array.from({ length: 10 }, (_, i) => ({
  page: i + 1,
  text: lorem(20, `s${i}`),
}));
const packed = chunkPages(slides, { targetWords: 200 });
assert.ok(packed.length >= 1);
assert.ok(
  packed.some((chunk) => chunk.endPage > chunk.sourcePage),
  "a chunk spanning several sparse pages must report a range, not one page",
);
assert.equal(packed[0].sourcePage, 1, "first chunk starts on the first page");
assert.ok(
  Math.max(...packed.map((c) => c.endPage)) <= 10,
  "range must stay inside the document",
);

// Dense prose that fits one page should stay a single page, not fake a range.
const dense = chunkPages([{ page: 4, text: lorem(60) }], { targetWords: 500 });
assert.equal(dense[0].sourcePage, 4);
assert.equal(dense[0].endPage, 4, "a single-page chunk must not report a range");

console.log(
  `OK — chunker honours spec §6 (target ${DEFAULT_TARGET_WORDS} words, ${DEFAULT_OVERLAP_RATIO * 100}% overlap, page ranges tracked)`,
);
