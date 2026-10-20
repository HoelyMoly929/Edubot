import { get } from "@vercel/blob";
import { extractText } from "unpdf";
import { BLOB_ACCESS } from "./blob.ts";
import { blobToken } from "./blob-token.ts";
import type { PageText } from "./chunk.ts";

/**
 * A PDF we can't work with — scanned images, no text layer, corrupt file.
 * Carries a message meant to be shown to the user (spec §11).
 */
export class UnprocessablePdfError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnprocessablePdfError";
  }
}

/**
 * Spec §9 rejects scanned/image-only PDFs. Those still parse fine — they just
 * yield almost no text — so the check is on how much text came out, not on
 * whether parsing succeeded.
 */
const MIN_TOTAL_WORDS = 50;
const MIN_WORDS_PER_PAGE = 5;

const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;

/**
 * Drops lines that repeat on nearly every page — running headers, footers,
 * copyright lines. Two reasons: spec §6 wants formatting noise stripped, and
 * boilerplate otherwise masks image-only PDFs, where the running header is the
 * *only* text and a words-per-page check would wave it through.
 *
 * A word count alone can't separate "sparse lecture slides" (legitimate, per
 * spec §9) from "images plus a header", but uniqueness can.
 */
export function stripRepeatedLines(pages: string[]): string[] {
  if (pages.length < 3) return pages; // too few pages to infer what repeats

  const pagesPerLine = new Map<string, number>();
  for (const page of pages) {
    const distinct = new Set(
      page.split("\n").map((line) => line.trim()).filter(Boolean),
    );
    for (const line of distinct) {
      pagesPerLine.set(line, (pagesPerLine.get(line) ?? 0) + 1);
    }
  }

  const appearsOnMostPages = Math.max(2, Math.ceil(pages.length * 0.8));
  const boilerplate = new Set(
    [...pagesPerLine]
      .filter(([, count]) => count >= appearsOnMostPages)
      .map(([line]) => line),
  );
  if (boilerplate.size === 0) return pages;

  return pages.map((page) =>
    page
      .split("\n")
      .filter((line) => !boilerplate.has(line.trim()))
      .join("\n"),
  );
}

/** Reads a private blob's bytes using the store token. */
export async function downloadPdf(blobUrl: string): Promise<Uint8Array> {
  const result = await get(blobUrl, { access: BLOB_ACCESS, token: blobToken() });
  if (!result) throw new UnprocessablePdfError("The uploaded file is no longer available.");

  const buffer = await new Response(result.stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Extracts per-page text. Pages are kept separate (rather than merged) because
 * every chunk has to cite the page it came from.
 *
 * Consumes `bytes`: PDF.js transfers the underlying ArrayBuffer, leaving it
 * detached and zero-length. Don't read `bytes` after calling this.
 */
export async function extractPdf(
  bytes: Uint8Array,
): Promise<{ pageCount: number; pages: PageText[] }> {
  let totalPages: number;
  let text: string[];

  try {
    ({ totalPages, text } = await extractText(bytes, { mergePages: false }));
  } catch (cause) {
    // Encrypted, truncated or otherwise malformed.
    throw new UnprocessablePdfError(
      "That PDF could not be read. It may be password-protected or damaged.",
      { cause },
    );
  }

  const content = stripRepeatedLines(text);
  const totalWords = content.reduce((sum, page) => sum + countWords(page), 0);

  if (totalWords < MIN_TOTAL_WORDS || totalWords / Math.max(totalPages, 1) < MIN_WORDS_PER_PAGE) {
    throw new UnprocessablePdfError(
      "Almost no selectable text found — this looks like a scanned or image-based PDF " +
        "(its content is pictures, not text). EduBot needs a PDF whose text you can " +
        "select and copy in a PDF reader.",
    );
  }

  return {
    pageCount: totalPages,
    // 1-based page numbers, matching what a reader sees.
    pages: content.map((pageText, index) => ({ page: index + 1, text: pageText })),
  };
}
