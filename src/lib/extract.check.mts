/**
 * Self-check for boilerplate stripping. Run: `npm run check:extract`
 *
 * Pure function, no network or PDF needed. This logic decides whether an
 * image-only PDF gets caught (spec §9) and whether real content survives, so
 * both directions are asserted.
 */
import assert from "node:assert/strict";
import { stripRepeatedLines } from "./extract.ts";

const HEADER = "FEL1443 Course Notes";
const SOURCE = "For Classroom USE ONLY";

// The real failure case: every page carries the same header and nothing else of
// substance, because the actual content is images.
const imageOnly = [1, 2, 3, 4, 5].map((n) => `${HEADER}\n${SOURCE}\nChapter ${n}`);
const strippedImageOnly = stripRepeatedLines(imageOnly);

assert.ok(
  strippedImageOnly.every((page) => !page.includes(HEADER) && !page.includes(SOURCE)),
  "a header on every page must be stripped",
);
assert.deepEqual(
  strippedImageOnly.map((p) => p.trim()),
  ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5"],
  "per-page content must survive stripping",
);

// Real content must not be mistaken for boilerplate.
const withContent = [1, 2, 3, 4].map(
  (n) => `${HEADER}\nSection ${n} covers a distinct topic in detail.`,
);
const strippedContent = stripRepeatedLines(withContent);
assert.ok(
  strippedContent.every((page) => !page.includes(HEADER)),
  "header still stripped when pages also have content",
);
assert.ok(
  strippedContent.every((page, i) => page.includes(`Section ${i + 1}`)),
  "distinct per-page content must be preserved",
);

// A line on only half the pages is not boilerplate — stripping it would eat
// legitimate content from a mixed document.
const halfAndHalf = ["shared line\nalpha", "shared line\nbeta", "gamma", "delta"];
assert.ok(
  stripRepeatedLines(halfAndHalf)[0].includes("shared line"),
  "a line on 50% of pages must be kept",
);

// Too few pages to infer a pattern from.
const twoPages = ["same\none", "same\ntwo"];
assert.deepEqual(stripRepeatedLines(twoPages), twoPages, "under 3 pages, leave text alone");

// Sparse lecture slides are legitimate per spec §9 and must pass through intact.
const slides = ["Mitosis", "Meiosis", "Cytokinesis", "Interphase"];
assert.deepEqual(stripRepeatedLines(slides), slides, "sparse slides must be untouched");

console.log("OK — boilerplate stripped, real content preserved");
