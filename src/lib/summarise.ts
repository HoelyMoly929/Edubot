import OpenAI from "openai";
import {
  batchChunks,
  mergeSections,
  resolveSections,
  type RawSection,
} from "./notes-structure.ts";
import type { Chunk, NoteBlock, NoteSection } from "./schema.ts";

/** Spec §3: gpt-4o-mini for summarisation and MCQ generation. */
export const GENERATION_MODEL = "gpt-4o-mini";

/** Batches in flight at once: fast enough for the 300s limit, gentle on rate limits. */
const CONCURRENCY = 8;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
  // A hung call should fail inside the 300s route limit, not eat it.
  return (client ??= new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 }));
}

const BATCH_PROMPT = `You write concise revision notes from course material, the way a strong student would in their notebook. You are given part of a document as numbered excerpts.

Rules:
- Use ONLY the numbered excerpts. Never add facts from outside them.
- Organise by the material's OWN structure. Every subtopic or section heading in the excerpts becomes its own section, using its own name, in the order the material presents them. Never merge distinct subtopics and never drop one.
- Sections are small. A section holds at most 8 blocks; when a heading's content is longer, or the material moves to a new heading, start a new section. Excerpts that cover many headings must produce many sections (usually 3 to 10 per call), never one big section.
- If the excerpts have no clear subtopics, group related ideas into sections yourself by theme (definitions, types, steps, causes, examples), each with a short heading (2 to 5 words).
- Set "chapter" when the material itself labels chapters or parts (for example a line like "Chapter 3: Cognitive Models"): use that label on every section from that line until the next such line, including sections that come before the label in an excerpt if the label is not visible. If the material has no chapter labels at all, leave "chapter" as an empty string.
- Every heading in the excerpts still gets its own section, even if it ends up with only one or two bullets. Cover every topic, but do not cover every sentence.
- Each section holds blocks, in the order a reader should meet them:
  - kind "bullet": "lead" is a short label ("Why study it") and "text" is the explanation. Use an empty "lead" when a label doesn't fit. One specific point per bullet.
  - kind "steps": a numbered sequence (stages, procedures, cycles). Put a short title in "lead" and each step in "items", each step a few words. Use for real ordered sequences only.
  - kind "table": only when it condenses the material (a comparison of 3 or more items); do not reproduce a table row for row when only the key contrast matters. Use it only when the excerpt clearly has a header row and consistent rows that compare things. Put the header in "columns" and every row in "rows" with exactly as many cells as columns. The text was extracted from a PDF, so column boundaries can be unclear: if you are not sure which words belong to which cell, use bullets instead. Never guess a cell.
- SUMMARISE, do not transcribe. Rewrite each idea in your own shorter words; never copy sentences, paragraphs or whole lists from the excerpts. Aim for about one third of the source's length. Keep what a student must remember: definitions, key numbers, steps, comparisons ("Unlike X, Y ..."), and an example only where it makes an idea clear. Drop repetition, filler, asides and minor examples.
- Wrap key terms and key numbers in **double asterisks** inside "text" and "items".
- Do not create a section called "Quick memory list"; one is added separately.
- The excerpts overlap slightly at their edges. Do not write the same fact twice.
- Set "source" on every block to the number of the excerpt it came from.
- Leave unused fields empty: "" for text, [] for lists.`;

const MEMORY_PROMPT = `You are given a numbered list of revision notes. Write a "quick memory list": the key numbers, counts, and one-line distinctions a student would memorise (for example "**7 ± 2** chunks in short-term memory", "Verification = product right; Validation = right product").
- Use only facts present in the numbered notes.
- 5 to 12 items, one line each, key figures in **double asterisks**.
- Set "unit" to the number of the single note each item comes from.
- Never write the word "unit" or note numbers inside an item's text.`;

/**
 * Built per call so `source` is an enum of the excerpt numbers that exist.
 * Strict structured outputs need every field present, so unused ones come back
 * empty and are cleaned up in `resolveSections`.
 */
function batchSchema(excerptCount: number) {
  const strings = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chapter: { type: "string" },
            heading: { type: "string" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["bullet", "steps", "table"] },
                  lead: { type: "string" },
                  text: { type: "string" },
                  items: strings,
                  columns: strings,
                  rows: { type: "array", items: strings },
                  source: {
                    type: "integer",
                    description: "Number of the excerpt this block came from.",
                    enum: Array.from({ length: excerptCount }, (_, i) => i + 1),
                  },
                },
                required: ["kind", "lead", "text", "items", "columns", "rows", "source"],
                additionalProperties: false,
              },
            },
          },
          required: ["chapter", "heading", "blocks"],
          additionalProperties: false,
        },
      },
    },
    required: ["sections"],
    additionalProperties: false,
  };
}

function memorySchema(unitCount: number) {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            // No enum: strict mode caps enum values per schema and a long PDF has
            // hundreds of units. Out-of-range numbers are dropped in generateNotes.
            unit: { type: "integer", description: `Note number, 1 to ${unitCount}.` },
          },
          required: ["text", "unit"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

async function askModel<T>(system: string, user: string, name: string, schema: Record<string, unknown>): Promise<T> {
  const response = await getClient().chat.completions.create({
    model: GENERATION_MODEL,
    // Low but non-zero: these are factual notes, not creative writing.
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The model returned empty notes.");
  return JSON.parse(content) as T;
}

/** The two model calls, swappable so the pipeline can be checked without the API. */
export interface NotesDeps {
  batch(chunks: Chunk[]): Promise<RawSection[]>;
  memory(units: NoteBlock[]): Promise<{ text: string; unit: number }[]>;
}

const openAiDeps: NotesDeps = {
  async batch(chunks) {
    // No page numbers beside the index: a second number is exactly what the
    // model mistakes for the citation. Pages are attached from the chunk after.
    const excerpts = chunks.map((c, i) => `[${i + 1}]\n${c.text}`).join("\n\n");
    const { sections } = await askModel<{ sections: RawSection[] }>(
      BATCH_PROMPT,
      `Excerpts:\n\n${excerpts}`,
      "revision_notes",
      batchSchema(chunks.length),
    );
    return sections;
  },

  async memory(units) {
    const listing = units.map((u, i) => `[${i + 1}] ${describe(u)}`).join("\n");
    const { items } = await askModel<{ items: { text: string; unit: number }[] }>(
      MEMORY_PROMPT,
      `Notes:\n\n${listing}`,
      "memory_list",
      memorySchema(units.length),
    );
    return items;
  },
};

/** A unit as plain text, for the memory-list prompt. */
function describe(unit: NoteBlock): string {
  if (unit.kind === "bullet") return unit.lead ? `${unit.lead}: ${unit.text}` : unit.text;
  if (unit.kind === "steps") return `${unit.title ?? "Steps"}: ${unit.items.join("; ")}`;
  return `${unit.columns.join(" | ")} — ${unit.rows.map((r) => r.join(" | ")).join(" / ")}`;
}

/** Runs `fn` over `items`, `limit` at a time, returning results in input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/** One retry. A second failure propagates, so a run never ends with a silent gap. */
async function withRetry<R>(fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

/**
 * Writes notes for the whole document.
 *
 * Chunks are read in order, a few at a time, so every part of the PDF is
 * covered (spec §6's top-k retrieval is deliberately not used here). Only the
 * excerpts in a batch go into its prompt — that is what keeps the output
 * grounded (spec §6). The model returns excerpt *numbers*, never ids; ids are
 * mapped back, so a citation can only point at a chunk that was supplied (§9).
 */
export async function generateNotes(
  chunks: Chunk[],
  deps: NotesDeps = openAiDeps,
): Promise<NoteSection[]> {
  const batches = batchChunks(chunks);
  if (batches.length === 0) return [];

  const perBatch = await mapLimit(batches, CONCURRENCY, (batch) =>
    withRetry(async () => {
      const sections = resolveSections(await deps.batch(batch), batch);
      if (sections.length === 0) {
        throw new Error("The model returned no usable notes for part of the document.");
      }
      return sections;
    }),
  );

  const sections = mergeSections(perBatch.flat());

  const units = sections.flatMap((s) => s.blocks);
  // The memory list is an extra card: if it fails, the notes still ship.
  const items = await withRetry(() => deps.memory(units)).catch((err) => {
    console.error("memory list failed", err);
    return [];
  });
  const blocks = items.flatMap<NoteBlock>(({ text, unit }) => {
    const from = units[unit - 1];
    if (!from || !text.trim()) return [];
    return [
      {
        kind: "bullet",
        text: text.trim(),
        chunkId: from.chunkId,
        sourcePage: from.sourcePage,
        endPage: from.endPage,
      },
    ];
  });

  return blocks.length
    ? [...sections, { heading: "Quick memory list", memory: true, blocks }]
    : sections;
}
