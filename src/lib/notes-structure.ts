import type { Chunk, NoteBlock, NoteSection } from "./schema.ts";

/**
 * Chunks (~500 words each) the model reads per call. Six per call made it
 * compress a dense PDF into a few sections and skip subtopics (seen on the
 * HCI example); two keeps each call small enough to cover everything.
 */
export const BATCH_SIZE = 2;
/** 40 batches ≈ 80 chunks ≈ 40 pages of dense prose; beyond that a run risks the 300s limit. */
export const MAX_BATCHES = 40;

export class NotesTooLongError extends Error {}

/** Splits `items` into consecutive batches, keeping order. Throws past the cap. */
export function batchChunks<T>(
  items: T[],
  size: number = BATCH_SIZE,
  maxBatches: number = MAX_BATCHES,
): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  if (batches.length > maxBatches) {
    throw new NotesTooLongError(`Needs ${batches.length} batches; the limit is ${maxBatches}.`);
  }
  return batches;
}

/** One block as the model returns it: every field present, unused ones empty. */
export interface RawBlock {
  kind: "bullet" | "steps" | "table";
  lead: string;
  text: string;
  items: string[];
  columns: string[];
  rows: string[][];
  /** 1-based number of the excerpt the block came from. */
  source: number;
}

export interface RawSection {
  chapter: string;
  heading: string;
  blocks: RawBlock[];
}

const clean = (s: string) => s.trim() || undefined;

/**
 * Turns the model's output for one batch into stored notes. Excerpt `n` is
 * `batch[n - 1]`; a block citing anything else, or with nothing in it, is
 * dropped rather than guessed at. A table whose rows don't all match its header
 * width is flattened to bullets: PDF extraction squashes tables into text lines,
 * and padding or trimming cells would invent content.
 */
export function resolveSections(raw: RawSection[], batch: Chunk[]): NoteSection[] {
  return raw.flatMap<NoteSection>(({ chapter, heading, blocks }) => {
    const resolved = blocks.flatMap<NoteBlock>((block) => {
      const source = batch[block.source - 1];
      if (!source) return [];
      const cite = {
        chunkId: source._id,
        sourcePage: source.sourcePage,
        endPage: source.endPage,
      };

      if (block.kind === "steps") {
        const items = block.items.map((i) => i.trim()).filter(Boolean);
        return items.length ? [{ kind: "steps", title: clean(block.lead), items, ...cite }] : [];
      }

      if (block.kind === "table") {
        const rows = block.rows.map((r) => r.map((c) => c.trim()));
        const width = block.columns.length;
        if (width >= 2 && rows.length && rows.every((r) => r.length === width)) {
          return [{ kind: "table", columns: block.columns.map((c) => c.trim()), rows, ...cite }];
        }
        return rows
          .filter((r) => r.some(Boolean))
          .map<NoteBlock>(([first, ...rest]) => ({
            kind: "bullet",
            lead: clean(first ?? ""),
            text: rest.filter(Boolean).join("; "),
            ...cite,
          }))
          .filter((b) => b.kind === "bullet" && b.text);
      }

      return block.text.trim()
        ? [{ kind: "bullet", lead: clean(block.lead), text: block.text.trim(), ...cite }]
        : [];
    });

    return resolved.length
      ? [{ chapter: clean(chapter), heading: heading.trim() || "Notes", blocks: resolved }]
      : [];
  });
}

/** Lowercase, letters and digits only, so "The Human" and "the human." match. */
const titleKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Joins adjacent sections with the same chapter and heading: a subtopic that
 * straddles a batch boundary comes back as two sections. The first spelling wins.
 *
 * A section with no chapter inherits the previous one's: each batch only sees
 * its own excerpts, so a batch that starts mid-chapter can't know its name.
 */
export function mergeSections(sections: NoteSection[]): NoteSection[] {
  const out: NoteSection[] = [];
  for (const raw of sections) {
    const section = raw.chapter ? raw : { ...raw, chapter: out.at(-1)?.chapter };
    const last = out.at(-1);
    if (
      last &&
      titleKey(last.chapter ?? "") === titleKey(section.chapter ?? "") &&
      titleKey(last.heading) === titleKey(section.heading)
    ) {
      last.blocks.push(...section.blocks);
    } else {
      out.push({ ...section, blocks: [...section.blocks] });
    }
  }
  return out;
}
