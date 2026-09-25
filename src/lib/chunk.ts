/**
 * Recursive, structure-aware text splitter (spec §6).
 *
 * Targets ~500 words per chunk with 10–15% overlap, preferring to break on
 * paragraph → line → sentence boundaries before resorting to a hard word split.
 * Both knobs are tunable because real PDFs vary — dense slides chunk very
 * differently from prose chapters.
 */

/** Text of one PDF page, as produced by extraction. */
export interface PageText {
  page: number;
  text: string;
}

/** A chunk before it gets an embedding and a document id. */
export interface ChunkDraft {
  text: string;
  position: number;
  sourcePage: number;
}

export interface ChunkOptions {
  /** Spec §6: ~500 words (≈400–600 tokens). */
  targetWords?: number;
  /** Spec §6: 10–15% overlap between consecutive chunks. */
  overlapRatio?: number;
}

export const DEFAULT_TARGET_WORDS = 500;
export const DEFAULT_OVERLAP_RATIO = 0.12;

const PARAGRAPH = /\n\s*\n+/;
const LINE = /\n+/;
const SENTENCE = /(?<=[.!?])\s+/;

const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;

/**
 * Strips the formatting noise PDF extraction leaves behind, while preserving
 * blank lines so paragraph structure survives for the splitter.
 */
export function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Words hyphenated across a line break: "exam-\nple" → "example".
    .replace(/(\w)-\n(\w)/g, "$1$2")
    // Collapse runs of spaces/tabs, but not newlines.
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    // 3+ newlines carry no more meaning than a paragraph break.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits one over-long passage, trying successively finer boundaries so a chunk
 * breaks at a natural seam wherever possible.
 */
function splitPassage(text: string, maxWords: number): string[] {
  if (countWords(text) <= maxWords) return [text];

  for (const separator of [PARAGRAPH, LINE, SENTENCE]) {
    const parts = text
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts.flatMap((part) => splitPassage(part, maxWords));
    }
  }

  // No seam to break on — a single enormous sentence. Split on words.
  const words = text.match(/\S+/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    out.push(words.slice(i, i + maxWords).join(" "));
  }
  return out;
}

/** Trailing `count` words of `text`, used to overlap into the next chunk. */
function tailWords(text: string, count: number): string {
  if (count <= 0) return "";
  const words = text.match(/\S+/g) ?? [];
  return words.slice(-count).join(" ");
}

/**
 * Packs page text into overlapping chunks.
 *
 * `sourcePage` is the page the chunk's *new* content starts on — overlap carried
 * from the previous chunk doesn't move the citation, otherwise a chunk would be
 * attributed to the page before the one it's actually about.
 */
export function chunkPages(pages: PageText[], options: ChunkOptions = {}): ChunkDraft[] {
  const targetWords = options.targetWords ?? DEFAULT_TARGET_WORDS;
  const overlapWords = Math.round(targetWords * (options.overlapRatio ?? DEFAULT_OVERLAP_RATIO));

  // Flatten to structure-aware units, each remembering its page.
  const units: { text: string; page: number }[] = [];
  for (const { page, text } of pages) {
    const cleaned = normalise(text);
    if (!cleaned) continue;
    for (const paragraph of cleaned.split(PARAGRAPH).map((p) => p.trim()).filter(Boolean)) {
      for (const passage of splitPassage(paragraph, targetWords)) {
        units.push({ text: passage, page });
      }
    }
  }

  const chunks: ChunkDraft[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;
  let pageOfNewContent: number | null = null;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push({
      text: buffer.join("\n\n"),
      position: chunks.length,
      sourcePage: pageOfNewContent ?? pages[0]?.page ?? 1,
    });
  };

  for (const unit of units) {
    const words = countWords(unit.text);

    if (bufferWords > 0 && bufferWords + words > targetWords) {
      flush();
      const overlap = tailWords(buffer.join(" "), overlapWords);
      buffer = overlap ? [overlap] : [];
      bufferWords = countWords(overlap);
      pageOfNewContent = null;
    }

    buffer.push(unit.text);
    bufferWords += words;
    pageOfNewContent ??= unit.page;
  }

  flush();
  return chunks;
}
